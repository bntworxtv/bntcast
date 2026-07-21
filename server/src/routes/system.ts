import { Router } from 'express';
import { prisma } from '../index';
import { requireAuth } from '../middleware/auth';
import { streamManager } from '../services/streamManager';
import os from 'os';

const router = Router();
router.use(requireAuth);

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

export { router as systemRouter };
