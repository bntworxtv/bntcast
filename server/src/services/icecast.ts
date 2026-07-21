import { Station } from '@prisma/client';
import { spawn, ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';
import http from 'http';
import { wsManager } from './websocket';

interface IcecastInstance {
  process: ChildProcess | null;
  configFile: string;
  logDir: string;
  pidFile: string;
  startedAt: Date;
}

class IcecastManager {
  private instances: Map<string, IcecastInstance> = new Map();

  private getConfigDir(stationId: string): string {
    return path.join(__dirname, '..', '..', 'config', 'icecast', stationId);
  }

  async initStation(station: Station): Promise<void> {
    const configDir = this.getConfigDir(station.id);
    fs.mkdirSync(configDir, { recursive: true });
    fs.mkdirSync(path.join(configDir, 'logs'), { recursive: true });

    const config = this.generateConfig(station, configDir);
    const configPath = path.join(configDir, 'icecast.xml');
    fs.writeFileSync(configPath, config);
  }

  private generateConfig(station: Station, configDir: string): string {
    const logDir = path.join(configDir, 'logs');
    return `<?xml version="1.0"?>
<icecast>
    <location>BNTcast</location>
    <admin>admin@bntcast</admin>

    <limits>
        <clients>100</clients>
        <sources>5</sources>
        <queue-size>524288</queue-size>
        <client-timeout>30</client-timeout>
        <header-timeout>15</header-timeout>
        <source-timeout>10</source-timeout>
        <burst-on-connect>1</burst-on-connect>
        <burst-size>65535</burst-size>
    </limits>

    <authentication>
        <source-password>${station.sourcePassword}</source-password>
        <relay-password>${station.adminPassword}</relay-password>
        <admin-user>admin</admin-user>
        <admin-password>${station.adminPassword}</admin-password>
    </authentication>

    <hostname>localhost</hostname>

    <listen-socket>
        <bind-address>0.0.0.0</bind-address>
        <port>${station.listenPort}</port>
    </listen-socket>

    <mount type="normal">
        <mount-name>${station.streamMount}</mount-name>
        <fallback-mount>/autodj</fallback-mount>
        <fallback-override>1</fallback-override>
        <fallback-seconds>3</fallback-seconds>
        <hidden>0</hidden>
        <public>1</public>
    </mount>

    <mount type="normal">
        <mount-name>/autodj</mount-name>
        <hidden>1</hidden>
        <public>0</public>
    </mount>

    <fileserve>1</fileserve>

    <paths>
        <basedir>/usr/share/icecast2</basedir>
        <logdir>${logDir}</logdir>
        <webroot>/usr/share/icecast2/web</webroot>
        <adminroot>/usr/share/icecast2/admin</adminroot>
        <alias source="/" destination="/status.xsl"/>
    </paths>

    <logging>
        <accesslog>access.log</accesslog>
        <errorlog>error.log</errorlog>
        <loglevel>3</loglevel>
        <logsize>10000</logsize>
    </logging>

    <security>
        <chroot>0</chroot>
    </security>
</icecast>`;
  }

  async startStation(station: Station): Promise<void> {
    if (this.instances.has(station.id)) {
      this.stopStation(station.id);
    }

    await this.initStation(station);
    const configDir = this.getConfigDir(station.id);
    const configFile = path.join(configDir, 'icecast.xml');
    const pidFile = path.join(configDir, 'icecast.pid');

    const instance: IcecastInstance = {
      process: null,
      configFile,
      logDir: path.join(configDir, 'logs'),
      pidFile,
      startedAt: new Date()
    };

    try {
      instance.process = spawn('icecast2', ['-c', configFile, '-b'], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env }
      });

      instance.process.stdout?.on('data', (data) => {
        const output = data.toString();
        if (output.includes('Connection from')) {
          const match = output.match(/(\d+\.\d+\.\d+\.\d+)/);
          if (match) {
            wsManager.broadcast(station.id, 'listener:connected', { ip: match[1] });
          }
        }
      });

      instance.process.stderr?.on('data', (data) => {
        console.error(`Icecast stderr: ${data.toString()}`);
      });

      instance.process.on('exit', (code) => {
        console.log(`Icecast process for ${station.name} exited with code ${code}`);
        this.instances.delete(station.id);
        wsManager.broadcast(station.id, 'station:stopped', { stationId: station.id });
      });

      this.instances.set(station.id, instance);
      console.log(`Icecast started for ${station.name} on port ${station.listenPort}`);
      wsManager.broadcast(station.id, 'station:started', { stationId: station.id });
    } catch (err: any) {
      console.error(`Failed to start Icecast for ${station.name}:`, err.message);
      throw err;
    }
  }

  stopStation(stationId: string): void {
    const instance = this.instances.get(stationId);
    if (instance?.process) {
      instance.process.kill('SIGTERM');
      this.instances.delete(stationId);
      console.log(`Icecast stopped for station ${stationId}`);
    }
  }

  async getStatus(station: Station): Promise<{
    engine: 'icecast';
    online: boolean;
    listeners: number;
    currentSong?: string;
    genre?: string;
    bitrate?: number;
    sampleRate?: number;
  }> {
    const instance = this.instances.get(station.id);
    let listeners = 0;
    let currentSong: string | undefined;

    try {
      const status = await this.fetchAdminStats(station);
      listeners = status.listeners;
      currentSong = status.currentSong;
    } catch {}

    return {
      engine: 'icecast',
      online: !!instance?.process,
      listeners,
      currentSong,
      genre: station.genre || undefined,
      bitrate: station.bitrate,
      sampleRate: station.samplerate
    };
  }

  getListeners(station: Station): { ip: string; userAgent: string; connected: boolean; duration: number }[] {
    const instance = this.instances.get(station.id);
    if (!instance) return [];
    return [];
  }

  private fetchAdminStats(station: Station): Promise<{ listeners: number; currentSong?: string }> {
    return new Promise((resolve) => {
      const auth = Buffer.from(`admin:${station.adminPassword}`).toString('base64');
      const req = http.get(
        `http://localhost:${station.listenPort}/admin/stats.xml`,
        {
          headers: { Authorization: `Basic ${auth}` },
          timeout: 3000
        },
        (res) => {
          let data = '';
          res.on('data', (chunk) => { data += chunk; });
          res.on('end', () => {
            const listenersMatch = data.match(/<listeners>(\d+)<\/listeners>/);
            const titleMatch = data.match(/<title>(.*?)<\/title>/);
            resolve({
              listeners: listenersMatch ? parseInt(listenersMatch[1]) : 0,
              currentSong: titleMatch?.[1]
            });
          });
        }
      );
      req.on('error', () => resolve({ listeners: 0 }));
      req.on('timeout', () => { req.destroy(); resolve({ listeners: 0 }); });
    });
  }
}

export const icecastManager = new IcecastManager();
