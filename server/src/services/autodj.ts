import { spawn, ChildProcess } from 'child_process';
import { prisma } from '../index';
import { wsManager } from './websocket';
import path from 'path';
import net from 'net';

interface AutoDJInstance {
  ffmpeg: ChildProcess | null;
  tcpClient: net.Socket | null;
  stationId: string;
  currentIndex: number;
  queue: string[];
  port: number;
  password: string;
  codec: string;
  bitrate: number;
  samplerate: number;
  channels: number;
  mount: string;
  engine: 'shoutcast' | 'icecast';
}

class AutoDJ {
  private instances: Map<string, AutoDJInstance> = new Map();

  async start(stationId: string, port: number, password: string, codec: string, bitrate: number, samplerate: number, channels: number, mount: string, engine: 'shoutcast' | 'icecast'): Promise<void> {
    this.stop(stationId);

    const media = await prisma.media.findMany({
      where: { stationId },
      orderBy: { createdAt: 'asc' }
    });

    if (media.length === 0) {
      console.log(`AutoDJ: No media files for station ${stationId}, skipping`);
      return;
    }

    const queue = media.map(m => m.path);
    const instance: AutoDJInstance = {
      ffmpeg: null,
      tcpClient: null,
      stationId,
      currentIndex: 0,
      queue,
      port,
      password,
      codec,
      bitrate,
      samplerate,
      channels,
      mount,
      engine
    };

    console.log(`AutoDJ: Starting for station ${stationId} with ${queue.length} files`);
    this.instances.set(stationId, instance);

    setTimeout(() => {
      this.playNext(instance);
    }, 3000);
  }

  stop(stationId: string): void {
    const instance = this.instances.get(stationId);
    if (instance) {
      if (instance.ffmpeg) {
        instance.ffmpeg.kill('SIGTERM');
        instance.ffmpeg = null;
      }
      if (instance.tcpClient) {
        instance.tcpClient.destroy();
        instance.tcpClient = null;
      }
    }
    this.instances.delete(stationId);
  }

  stopAll(): void {
    for (const [stationId] of this.instances) {
      this.stop(stationId);
    }
  }

  private playNext(instance: AutoDJInstance): void {
    if (instance.queue.length === 0) {
      console.log(`AutoDJ: No more files for station ${instance.stationId}`);
      return;
    }

    if (!this.instances.has(instance.stationId)) {
      return;
    }

    const filePath = instance.queue[instance.currentIndex];
    instance.currentIndex = (instance.currentIndex + 1) % instance.queue.length;

    const filename = path.basename(filePath);
    console.log(`AutoDJ: Playing ${filename} on station ${instance.stationId}`);

    this.streamFile(instance, filePath);
  }

  private streamFile(instance: AutoDJInstance, filePath: string): void {
    const codecMap: Record<string, string> = {
      mp3: 'libmp3lame',
      ogg: 'libvorbis',
      aac: 'aac',
      opus: 'libopus',
      flac: 'flac',
      wav: 'pcm_s16le',
      m4a: 'aac'
    };
    const encoder = codecMap[instance.codec] || 'libmp3lame';
    const contentType = instance.codec === 'ogg' ? 'audio/ogg' : `audio/${instance.codec}`;
    const formatFlag = instance.codec === 'ogg' ? 'ogg' : 'mp3';

    const ffmpegArgs = [
      '-re',
      '-i', filePath,
      '-map_metadata', '-1',
      '-f', formatFlag,
      '-acodec', encoder,
      '-ab', `${instance.bitrate}k`,
      '-ar', `${instance.samplerate}`,
      '-ac', `${instance.channels}`,
      '-content_type', contentType,
      '-'
    ];

    console.log(`AutoDJ: FFmpeg args: ${ffmpegArgs.join(' ')}`);

    const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    instance.ffmpeg = ffmpeg;

    ffmpeg.stderr?.on('data', (data) => {
      const msg = data.toString();
      if (msg.includes('Error') || msg.includes('error') || msg.includes('Invalid')) {
        console.error(`AutoDJ FFmpeg stderr: ${msg.trim()}`);
      }
    });

    ffmpeg.on('error', (err) => {
      console.error(`AutoDJ FFmpeg spawn error for station ${instance.stationId}:`, err.message);
      setTimeout(() => this.playNext(instance), 3000);
    });

    ffmpeg.on('exit', (code) => {
      console.log(`AutoDJ: FFmpeg exited with code ${code} for station ${instance.stationId}`);
      instance.ffmpeg = null;

      const songName = path.basename(filePath, path.extname(filePath));
      wsManager.broadcast(instance.stationId, 'song:changed', {
        title: songName,
        artist: undefined
      });

      if (this.instances.has(instance.stationId)) {
        setTimeout(() => this.playNext(instance), 500);
      }
    });

    if (instance.engine === 'icecast') {
      this.connectIcecast(instance, ffmpeg, contentType);
    } else {
      this.connectShoutcast(instance, ffmpeg, contentType);
    }
  }

  private connectShoutcast(instance: AutoDJInstance, ffmpeg: ChildProcess, contentType: string): void {
    const tcpClient = net.createConnection(instance.port, 'localhost');

    tcpClient.on('connect', () => {
      console.log(`AutoDJ: Connected to SHOUTcast source on port ${instance.port}`);

      const authHeader = `${instance.password}\r\n`;
      tcpClient.write(authHeader);
      ffmpeg.stdout?.pipe(tcpClient, { end: false });
    });

    tcpClient.on('error', (err) => {
      console.error(`AutoDJ SHOUTcast TCP error for station ${instance.stationId}:`, err.message);
      if (instance.ffmpeg) {
        instance.ffmpeg.kill('SIGTERM');
      }
      setTimeout(() => this.playNext(instance), 5000);
    });

    tcpClient.on('close', () => {
      console.log(`AutoDJ: SHOUTcast connection closed for station ${instance.stationId}`);
      instance.tcpClient = null;
    });

    instance.tcpClient = tcpClient;
  }

  private connectIcecast(instance: AutoDJInstance, ffmpeg: ChildProcess, contentType: string): void {
    const mountPath = instance.mount || '/stream';
    const base64Auth = Buffer.from(`source:${instance.password}`).toString('base64');

    const tcpClient = net.createConnection(instance.port, 'localhost');

    tcpClient.on('connect', () => {
      console.log(`AutoDJ: Connected to Icecast source on port ${instance.port} mount ${mountPath}`);

      const headers = [
        `SOURCE ${mountPath} HTTP/1.1`,
        `Host: localhost:${instance.port}`,
        `Authorization: Basic ${base64Auth}`,
        `Content-Type: ${contentType}`,
        'ice-name: BNTcast AutoDJ',
        'ice-genre: Various',
        'ice-public: 1',
        `ice-br: ${instance.bitrate}`,
        `ice-sr: ${instance.samplerate}`,
        `ice-channels: ${instance.channels}`,
        'User-Agent: BNTcast-AutoDJ/1.0',
        'Transfer-Encoding: chunked',
        '',
        ''
      ].join('\r\n');

      tcpClient.write(headers);
      ffmpeg.stdout?.pipe(tcpClient, { end: false });
    });

    tcpClient.on('error', (err) => {
      console.error(`AutoDJ Icecast TCP error for station ${instance.stationId}:`, err.message);
      if (instance.ffmpeg) {
        instance.ffmpeg.kill('SIGTERM');
      }
    });

    tcpClient.on('close', () => {
      console.log(`AutoDJ: Icecast connection closed for station ${instance.stationId}`);
      instance.tcpClient = null;
    });

    instance.tcpClient = tcpClient;
  }

  getInstance(stationId: string): { playing: boolean; queueLength: number; currentIndex: number } | null {
    const instance = this.instances.get(stationId);
    if (!instance) return null;
    return {
      playing: !!instance.ffmpeg,
      queueLength: instance.queue.length,
      currentIndex: instance.currentIndex
    };
  }
}

export const autoDJ = new AutoDJ();
