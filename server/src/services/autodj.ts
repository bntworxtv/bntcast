import { spawn, ChildProcess } from 'child_process';
import { prisma } from '../index';
import { wsManager } from './websocket';
import path from 'path';
import net from 'net';

interface AutoDJInstance {
  ffmpeg: ChildProcess | null;
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
  genre: string;
}

class AutoDJ {
  private instances: Map<string, AutoDJInstance> = new Map();

  async start(stationId: string, port: number, password: string, codec: string, bitrate: number, samplerate: number, channels: number, mount: string, engine: 'shoutcast' | 'icecast', genre: string = 'Various'): Promise<void> {
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
      queue,
      port,
      password,
      codec,
      bitrate,
      samplerate,
      channels,
      mount,
      engine,
      genre
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
    const formatFlag = instance.codec === 'ogg' ? 'ogg' : 'mp3';

    if (instance.engine === 'icecast') {
      const contentType = instance.codec === 'ogg' ? 'audio/ogg' : `audio/${instance.codec}`;
      const base64Auth = Buffer.from(`source:${instance.password}`).toString('base64');
      const mountPath = instance.mount || '/stream';

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
        '-headers', `Authorization: Basic ${base64Auth}\r\nice-name: BNTcast\r\nice-public: 1\r\nice-br: ${instance.bitrate}\r\n`,
        `http://127.0.0.1:${instance.port}${mountPath}`
      ];

      console.log(`AutoDJ: FFmpeg args: ${ffmpegArgs.join(' ')}`);

      const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
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
        wsManager.broadcast(instance.stationId, 'song:changed', { title: songName });
        if (this.instances.has(instance.stationId)) {
          setTimeout(() => this.playNext(instance), 500);
        }
      });
    } else {
      this.streamToShoutcast(instance, filePath, encoder, formatFlag);
    }
  }

  private streamToShoutcast(instance: AutoDJInstance, filePath: string, encoder: string, formatFlag: string): void {
    const ffmpegArgs = [
      '-re',
      '-i', filePath,
      '-map_metadata', '-1',
      '-f', formatFlag,
      '-acodec', encoder,
      '-ab', `${instance.bitrate}k`,
      '-ar', `${instance.samplerate}`,
      '-ac', `${instance.channels}`,
      '-content_type', 'audio/mpeg',
      '-'
    ];

    console.log(`AutoDJ: FFmpeg args: ${ffmpegArgs.join(' ')}`);

    const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: ['pipe', 'pipe', 'pipe'] });
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
      wsManager.broadcast(instance.stationId, 'song:changed', { title: songName });
      if (this.instances.has(instance.stationId)) {
        setTimeout(() => this.playNext(instance), 500);
      }
    });

    const tcpClient = net.createConnection({ port: instance.port, host: '127.0.0.1' }, () => {
      console.log(`AutoDJ: TCP connected to SHOUTcast on 127.0.0.1:${instance.port}`);
      tcpClient.write(`${instance.password}\r\n`);

      let responseBuf = Buffer.alloc(0);
      let responseComplete = false;

      const finishResponse = () => {
        if (responseComplete) return;
        responseComplete = true;
        tcpClient.removeAllListeners('data');
        const rest = responseBuf.length > 0 ? responseBuf : Buffer.alloc(0);
        if (rest.length > 0) {
          console.log(`AutoDJ: Discarding ${rest.length} bytes of leftover response data`);
        }
        console.log(`AutoDJ: Starting audio pipe to SHOUTcast`);
        ffmpeg.stdout?.on('data', (chunk) => {
          if (tcpClient.writable && !tcpClient.destroyed) {
            tcpClient.write(chunk);
          }
        });
      };

      tcpClient.on('data', (chunk) => {
        responseBuf = Buffer.concat([responseBuf, chunk]);
        const headerEnd = responseBuf.indexOf('\r\n\r\n');
        if (headerEnd !== -1) {
          const response = responseBuf.slice(0, headerEnd + 4).toString().trim();
          console.log(`AutoDJ: SHOUTcast response:\n${response.split('\r\n').join('\n')}`);
          finishResponse();
        }
      });

      setTimeout(finishResponse, 3000);
    });

    tcpClient.on('error', (err) => {
      console.error(`AutoDJ SHOUTcast TCP error: ${err.message}`);
      if (instance.ffmpeg) {
        instance.ffmpeg.kill('SIGTERM');
      }
      setTimeout(() => this.playNext(instance), 5000);
    });

    tcpClient.on('close', () => {
      console.log(`AutoDJ: SHOUTcast TCP closed for station ${instance.stationId}`);
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
