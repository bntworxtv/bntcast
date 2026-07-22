import { spawn, ChildProcess } from 'child_process';
import { prisma } from '../index';
import { wsManager } from './websocket';
import path from 'path';

interface AutoDJInstance {
  ffmpeg: ChildProcess | null;
  stationId: string;
  currentIndex: number;
  queue: string[];
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
      stationId,
      currentIndex: 0,
      queue
    };

    console.log(`AutoDJ: Starting for station ${stationId} with ${queue.length} files`);
    this.instances.set(stationId, instance);
    this.playNext(instance, port, password, codec, bitrate, samplerate, channels, mount, engine);
  }

  stop(stationId: string): void {
    const instance = this.instances.get(stationId);
    if (instance?.ffmpeg) {
      instance.ffmpeg.kill('SIGTERM');
      instance.ffmpeg = null;
    }
    this.instances.delete(stationId);
  }

  stopAll(): void {
    for (const [stationId] of this.instances) {
      this.stop(stationId);
    }
  }

  async addMedia(stationId: string, filePath: string): Promise<void> {
    const instance = this.instances.get(stationId);
    if (instance) {
      instance.queue.push(filePath);
    }
  }

  removeMedia(stationId: string, filePath: string): void {
    const instance = this.instances.get(stationId);
    if (instance) {
      instance.queue = instance.queue.filter(p => p !== filePath);
    }
  }

  private playNext(instance: AutoDJInstance, port: number, password: string, codec: string, bitrate: number, samplerate: number, channels: number, mount: string, engine: 'shoutcast' | 'icecast'): void {
    if (instance.queue.length === 0) {
      console.log(`AutoDJ: No more files for station ${instance.stationId}`);
      return;
    }

    const filePath = instance.queue[instance.currentIndex];
    instance.currentIndex = (instance.currentIndex + 1) % instance.queue.length;

    const filename = path.basename(filePath);
    console.log(`AutoDJ: Playing ${filename} on station ${instance.stationId}`);

    this.streamFile(instance, filePath, port, password, codec, bitrate, samplerate, channels, mount, engine);
  }

  private streamFile(instance: AutoDJInstance, filePath: string, port: number, password: string, codec: string, bitrate: number, samplerate: number, channels: number, mount: string, engine: 'shoutcast' | 'icecast'): void {
    const codecMap: Record<string, string> = {
      mp3: 'libmp3lame',
      ogg: 'libvorbis',
      aac: 'aac',
      opus: 'libopus',
      flac: 'flac',
      wav: 'pcm_s16le',
      m4a: 'aac'
    };
    const encoder = codecMap[codec] || 'libmp3lame';
    const contentType = codec === 'ogg' ? 'audio/ogg' : `audio/${codec}`;
    const formatFlag = codec === 'ogg' ? 'ogg' : 'mp3';

    let ffmpegArgs: string[];

    if (engine === 'icecast') {
      const auth = `source:${password}`;
      const url = `http://localhost:${port}${mount}`;
      ffmpegArgs = [
        '-re',
        '-i', filePath,
        '-map_metadata', '-1',
        '-f', formatFlag,
        '-acodec', encoder,
        '-ab', `${bitrate}k`,
        '-ar', `${samplerate}`,
        '-ac', `${channels}`,
        '-content_type', contentType,
        '-ice_name', `BNTcast AutoDJ`,
        '-ice_genre', 'Various',
        '-ice_public', '1',
        '-password', password,
        url
      ];
    } else {
      ffmpegArgs = [
        '-re',
        '-i', filePath,
        '-map_metadata', '-1',
        '-f', formatFlag,
        '-acodec', encoder,
        '-ab', `${bitrate}k`,
        '-ar', `${samplerate}`,
        '-ac', `${channels}`,
        '-content_type', contentType
      ];
    }

    const ffmpeg = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    });
    instance.ffmpeg = ffmpeg;

    if (engine === 'shoutcast') {
      const net = require('net');
      const base64Auth = Buffer.from(`:${password}`).toString('base64');

      const tcpClient = net.createConnection(port, 'localhost', () => {
        const headers = [
          `POST /stream HTTP/1.1`,
          `Host: localhost:${port}`,
          `Authorization: Basic ${base64Auth}`,
          `Content-Type: ${contentType}`,
          `icy-name: BNTcast AutoDJ`,
          `icy-genre: Various`,
          `icy-public: 1`,
          `icy-br: ${bitrate}`,
          `icy-sr: ${samplerate}`,
          `icy-channels: ${channels}`,
          `User-Agent: BNTcast-AutoDJ/1.0`,
          '',
          ''
        ].join('\r\n');
        tcpClient.write(headers);
        ffmpeg.stdout?.pipe(tcpClient);
      });

      tcpClient.on('error', (err: any) => {
        console.error(`AutoDJ TCP error for station ${instance.stationId}:`, err.message);
      });

      ffmpeg.stderr?.on('data', () => {});
    } else {
      ffmpeg.stdout?.on('data', () => {});
    }

    ffmpeg.on('exit', (code) => {
      console.log(`AutoDJ: FFmpeg exited with code ${code} for station ${instance.stationId}`);
      const songName = path.basename(filePath, path.extname(filePath));
      wsManager.broadcast(instance.stationId, 'song:changed', {
        title: songName,
        artist: undefined
      });

      setTimeout(() => {
        this.playNext(instance, port, password, codec, bitrate, samplerate, channels, mount, engine);
      }, 500);
    });

    ffmpeg.on('error', (err) => {
      console.error(`AutoDJ FFmpeg error for station ${instance.stationId}:`, err.message);
      setTimeout(() => {
        this.playNext(instance, port, password, codec, bitrate, samplerate, channels, mount, engine);
      }, 2000);
    });
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
