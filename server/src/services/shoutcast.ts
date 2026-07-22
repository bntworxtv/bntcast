import { Station } from '@prisma/client';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { wsManager } from './websocket';
import { prisma } from '../index';

interface ShoutcastInstance {
  process: ChildProcess | null;
  configPath: string;
  logPath: string;
  port: number;
  startedAt: Date;
  nowPlaying: { title: string; artist?: string; genre?: string };
  listeners: Map<string, { ip: string; userAgent: string; connectedAt: Date; duration: number }>;
}

class ShoutcastManager {
  private instances: Map<string, ShoutcastInstance> = new Map();

  async initStation(station: Station): Promise<void> {
    const configDir = path.join(__dirname, '..', '..', 'config', 'shoutcast', station.id);
    fs.mkdirSync(configDir, { recursive: true });

    const config = this.generateConfig(station, configDir);
    const configPath = path.join(configDir, 'sc_serv.conf');
    fs.writeFileSync(configPath, config);
  }

  private generateConfig(station: Station, configDir: string): string {
    const logPath = path.join(configDir, 'sc_serv.log');
    const streamPath = path.join(configDir, 'streams');
    fs.mkdirSync(streamPath, { recursive: true });

    return `
#!/etc/shoutcast/sc_serv.conf
sc_addr=0.0.0.0
portbase=${station.listenPort}
password=${station.sourcePassword}
adminpassword=${station.adminPassword}
maxuser=100
streamid=1
streampath=/stream
log=1
logFile=${logPath}
streamroot=${streamPath}
streamminurl=/stream
streammaxurl=/stream.
uvoxcipherkey=
titleformat=[BNTcast] %s
genre=${station.genre || 'Various'}
url=${station.website || 'http://localhost'}
public=1
tscan=0
metaint=16000
streamtype=${station.codec}
bitrate=${station.bitrate}
samplerate=${station.samplerate}
channels=${station.channels === 2 ? 2 : 1}
samplebits=16
`.trim();
  }

  async startStation(station: Station): Promise<void> {
    if (this.instances.has(station.id)) {
      this.stopStation(station.id);
    }

    await this.initStation(station);
    const configDir = path.join(__dirname, '..', '..', 'config', 'shoutcast', station.id);
    const configPath = path.join(configDir, 'sc_serv.conf');

    const instance: ShoutcastInstance = {
      process: null,
      configPath,
      logPath: path.join(configDir, 'sc_serv.log'),
      port: station.listenPort,
      startedAt: new Date(),
      nowPlaying: { title: 'Unknown', genre: station.genre || undefined },
      listeners: new Map()
    };

    try {
      instance.process = spawn('sc_serv', [configPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, LD_LIBRARY_PATH: '/usr/local/lib' }
      });

      instance.process.stdout?.on('data', (data) => {
        this.parseOutput(station.id, data.toString());
      });

      instance.process.stderr?.on('data', (data) => {
        this.parseOutput(station.id, data.toString());
      });

      instance.process.on('exit', (code) => {
        console.log(`SHOUTcast process for ${station.name} exited with code ${code}`);
        this.instances.delete(station.id);
        wsManager.broadcast(station.id, 'station:stopped', { stationId: station.id });
      });

      this.instances.set(station.id, instance);
      console.log(`SHOUTcast started for ${station.name} on port ${station.listenPort}`);
      wsManager.broadcast(station.id, 'station:started', { stationId: station.id });
    } catch (err: any) {
      console.error(`Failed to start SHOUTcast for ${station.name}:`, err.message);
      throw err;
    }
  }

  stopStation(stationId: string): void {
    const instance = this.instances.get(stationId);
    if (instance?.process) {
      instance.process.kill('SIGTERM');
      this.instances.delete(stationId);
      console.log(`SHOUTcast stopped for station ${stationId}`);
    }
  }

  getStationStatus(stationId: string): { online: boolean; port: number; uptime?: number } {
    const instance = this.instances.get(stationId);
    if (!instance) return { online: false, port: 0 };
    return {
      online: true,
      port: instance.port,
      uptime: Math.floor((Date.now() - instance.startedAt.getTime()) / 1000)
    };
  }

  async getStatus(station: Station): Promise<{
    engine: 'shoutcast';
    online: boolean;
    listeners: number;
    currentSong?: string;
    genre?: string;
    bitrate?: number;
    sampleRate?: number;
  }> {
    const instance = this.instances.get(station.id);
    return {
      engine: 'shoutcast',
      online: !!instance?.process,
      listeners: instance?.listeners.size || 0,
      currentSong: instance?.nowPlaying.title,
      genre: station.genre || undefined,
      bitrate: station.bitrate,
      sampleRate: station.samplerate
    };
  }

  getNowPlaying(station: Station): { title: string; artist?: string; genre?: string } {
    const instance = this.instances.get(station.id);
    return instance?.nowPlaying || { title: 'Unknown', genre: station.genre || undefined };
  }

  getListeners(station: Station): { ip: string; userAgent: string; connected: boolean; duration: number }[] {
    const instance = this.instances.get(station.id);
    if (!instance) return [];
    return Array.from(instance.listeners.values()).map(l => ({
      ip: l.ip,
      userAgent: l.userAgent,
      connected: true,
      duration: Math.floor((Date.now() - l.connectedAt.getTime()) / 1000)
    }));
  }

  private parseOutput(stationId: string, output: string): void {
    const instance = this.instances.get(stationId);
    if (!instance) return;

    const songMatch = output.match(/Stream Title:\s*(.*)/i);
    if (songMatch) {
      instance.nowPlaying.title = songMatch[1].trim();
      wsManager.broadcast(stationId, 'song:changed', {
        title: instance.nowPlaying.title,
        artist: instance.nowPlaying.artist
      });
    }

    const listenMatch = output.match(/listener.*?(\d+\.\d+\.\d+\.\d+)/i);
    if (listenMatch) {
      const ip = listenMatch[1];
      if (!instance.listeners.has(ip)) {
        instance.listeners.set(ip, {
          ip,
          userAgent: 'Unknown',
          connectedAt: new Date(),
          duration: 0
        });
      }
    }
  }
}

export const shoutcastManager = new ShoutcastManager();
