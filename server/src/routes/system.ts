import { Router } from 'express';
import { prisma } from '../index';
import { requireAuth } from '../middleware/auth';
import { streamManager } from '../services/streamManager';
import os from 'os';
import multer from 'multer';
import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const router = Router();
router.use(requireAuth);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.zip', '.tar.gz', '.tgz', '.bin', ''];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext) || file.originalname.includes('shoutcast')) {
      cb(null, true);
    } else {
      cb(new Error('Only SHOUTcast DNAS archive files are accepted'));
    }
  }
});

router.get('/info', async (_req, res) => {
  try {
    const [stationCount, mediaCount, listenerCount, userCount] = await Promise.all([
      prisma.station.count(),
      prisma.media.count(),
      prisma.listener.count({ where: { disconnectedAt: null } }),
      prisma.user.count()
    ]);

    res.json({
      info: {
        name: 'BNTcast',
        version: '1.0.0',
        hostname: os.hostname(),
        platform: os.platform(),
        uptime: os.uptime(),
        memory: {
          total: os.totalmem(),
          free: os.freemem(),
          used: os.totalmem() - os.freemem()
        },
        cpus: os.cpus().length,
        loadAvg: os.loadavg(),
        counts: { stations: stationCount, media: mediaCount, listeners: listenerCount, users: userCount }
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/stream-engines', (_req, res) => {
  res.json({
    engines: streamManager.getAvailableEngines()
  });
});

router.get('/shoutcast/status', (_req, res) => {
  try {
    const installed = fs.existsSync('/usr/local/bin/sc_serv');
    let version = '';
    if (installed) {
      try {
        version = execSync('/usr/local/bin/sc_serv --version 2>&1 || true', { timeout: 5000 }).toString().trim();
      } catch {}
    }
    res.json({ installed, version });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/shoutcast/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded' });
      return;
    }

    const tmpDir = `/tmp/sc_upload_${Date.now()}`;
    fs.mkdirSync(tmpDir, { recursive: true });

    const zipPath = path.join(tmpDir, req.file.originalname);
    fs.writeFileSync(zipPath, req.file.buffer);

    const ext = path.extname(req.file.originalname).toLowerCase();

    if (ext === '.zip') {
      execSync(`unzip -o "${zipPath}" -d "${tmpDir}"`, { timeout: 30000 });
    } else if (ext === '.gz' || ext === '.tgz') {
      execSync(`tar xzf "${zipPath}" -C "${tmpDir}"`, { timeout: 30000 });
    }

    const findResult = execSync(`find "${tmpDir}" -name "sc_serv" -type f 2>/dev/null`, { timeout: 10000 }).toString().trim();
    const scServPath = findResult.split('\n')[0];

    if (!scServPath || !fs.existsSync(scServPath)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      res.status(400).json({ error: 'sc_serv binary not found in the uploaded archive' });
      return;
    }

    execSync(`cp "${scServPath}" /usr/local/bin/sc_serv && chmod +x /usr/local/bin/sc_serv`, { timeout: 10000 });
    fs.rmSync(tmpDir, { recursive: true, force: true });

    let version = '';
    try {
      version = execSync('/usr/local/bin/sc_serv --version 2>&1 || true', { timeout: 5000 }).toString().trim();
    } catch {}

    res.json({ message: 'SHOUTcast DNAS installed successfully', version });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/shoutcast/download', async (_req, res) => {
  try {
    const tmpDir = `/tmp/sc_download_${Date.now()}`;
    fs.mkdirSync(tmpDir, { recursive: true });
    const tarPath = path.join(tmpDir, 'sc_serv2.tar.gz');

    const urls = [
      'https://download.nullsoft.com/shoutcast/tools/sc_serv2_linux_x64-latest.tar.gz',
      'http://download.nullsoft.com/shoutcast/tools/sc_serv2_linux_x64-latest.tar.gz'
    ];

    let downloaded = false;
    for (const url of urls) {
      try {
        execSync(`curl -fsSL --connect-timeout 15 --max-time 60 -o "${tarPath}" "${url}"`, { timeout: 75000 });
        if (fs.existsSync(tarPath) && fs.statSync(tarPath).size > 1000) {
          downloaded = true;
          break;
        }
      } catch {}
    }

    if (!downloaded) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      res.status(500).json({ error: 'Failed to download SHOUTcast DNAS from Nullsoft. Try uploading the file manually.' });
      return;
    }

    execSync(`tar xzf "${tarPath}" -C "${tmpDir}"`, { timeout: 30000 });

    const findResult = execSync(`find "${tmpDir}" -name "sc_serv" -type f 2>/dev/null`, { timeout: 10000 }).toString().trim();
    const scServPath = findResult.split('\n')[0];

    if (!scServPath || !fs.existsSync(scServPath)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      res.status(400).json({ error: 'sc_serv binary not found in downloaded archive' });
      return;
    }

    execSync(`cp "${scServPath}" /usr/local/bin/sc_serv && chmod +x /usr/local/bin/sc_serv`, { timeout: 10000 });
    fs.rmSync(tmpDir, { recursive: true, force: true });

    let version = '';
    try {
      version = execSync('/usr/local/bin/sc_serv --version 2>&1 || true', { timeout: 5000 }).toString().trim();
    } catch {}

    res.json({ message: 'SHOUTcast DNAS downloaded and installed successfully', version });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/restart', async (_req, res) => {
  try {
    res.json({ message: 'Server is restarting...' });
    setTimeout(() => {
      process.exit(0);
    }, 500);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export { router as systemRouter };
