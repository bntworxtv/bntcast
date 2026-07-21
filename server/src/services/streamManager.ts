import { Station } from '@prisma/client';
import { shoutcastManager } from './shoutcast';
import { icecastManager } from './icecast';
import http from 'http';

export interface StreamInfo {
  engine: 'shoutcast' | 'icecast';
  url: string;
  mount: string;
  port: number;
  streamType: string;
}

export interface StreamStatus {
  engine: 'shoutcast' | 'icecast';
  online: boolean;
  listeners: number;
  currentSong?: string;
  genre?: string;
  bitrate?: number;
  sampleRate?: number;
}

export interface ListenerInfo {
  ip: string;
  userAgent: string;
  connected: boolean;
  duration: number;
}

class StreamManager {
  getEngine(station: Station): 'shoutcast' | 'icecast' {
    return (station as any).streamEngine || 'shoutcast';
  }

  getStreamUrl(station: Station): string {
    if (this.getEngine(station) === 'icecast') {
      return `http://localhost:${station.listenPort}${station.streamMount}`;
    }
    return `http://localhost:${station.listenPort}/stream`;
  }

  getStreamInfo(station: Station): StreamInfo {
    const engine = this.getEngine(station);
    return {
      engine,
      url: this.getStreamUrl(station),
      mount: engine === 'icecast' ? station.streamMount : '/stream',
      port: station.listenPort,
      streamType: `audio/${station.codec}`
    };
  }

  async getStreamStatus(station: Station): Promise<StreamStatus> {
    const engine = this.getEngine(station);
    if (engine === 'icecast') {
      return icecastManager.getStatus(station);
    }
    return shoutcastManager.getStatus(station);
  }

  getListeners(station: Station): ListenerInfo[] {
    const engine = this.getEngine(station);
    if (engine === 'icecast') {
      return icecastManager.getListeners(station);
    }
    return shoutcastManager.getListeners(station);
  }

  getNowPlaying(station: Station): { title: string; artist?: string; genre?: string } {
    return shoutcastManager.getNowPlaying(station);
  }

  async testConnection(station: Station): Promise<{ success: boolean; message: string }> {
    const engine = this.getEngine(station);
    try {
      const url = this.getStreamUrl(station);
      return new Promise((resolve) => {
        const req = http.get(url, { timeout: 5000 }, (res) => {
          if (res.statusCode === 200) {
            resolve({ success: true, message: `${engine.toUpperCase()} stream is reachable at ${url}` });
          } else {
            resolve({ success: false, message: `Server returned status ${res.statusCode}` });
          }
          res.destroy();
        });
        req.on('error', (err) => {
          resolve({ success: false, message: `Connection failed: ${err.message}` });
        });
        req.on('timeout', () => {
          req.destroy();
          resolve({ success: false, message: 'Connection timed out' });
        });
      });
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  }

  getAvailableEngines(): { name: string; version: string; available: boolean }[] {
    return [
      { name: 'SHOUTcast', version: 'v2', available: true },
      { name: 'Icecast', version: '2.4.x', available: true }
    ];
  }
}

export const streamManager = new StreamManager();
