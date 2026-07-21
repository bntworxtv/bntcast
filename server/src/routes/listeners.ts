import { Router } from 'express';
import { prisma } from '../index';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { streamManager } from '../services/streamManager';

const router = Router();

router.get('/live/:stationId', async (req, res) => {
  try {
    const station = await prisma.station.findUnique({
      where: { id: req.params.stationId }
    });
    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }
    const listeners = streamManager.getListeners(station);
    res.json({ listeners, count: listeners.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.use(requireAuth);

router.get('/:stationId', async (req: AuthRequest, res) => {
  try {
    const station = await prisma.station.findFirst({
      where: { id: req.params.stationId, ownerId: req.userId }
    });
    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }
    const listeners = await prisma.listener.findMany({
      where: { stationId: station.id },
      orderBy: { connectedAt: 'desc' },
      take: 100
    });
    const active = listeners.filter(l => !l.disconnectedAt);
    const total = listeners.length;
    res.json({ listeners, active: active.length, total });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:stationId/stats', async (req: AuthRequest, res) => {
  try {
    const station = await prisma.station.findFirst({
      where: { id: req.params.stationId, ownerId: req.userId }
    });
    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }
    const now = new Date();
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    const last7d = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const [unique24h, unique7d, totalConnections, avgDuration] = await Promise.all([
      prisma.listener.groupMany({
        by: ['ip'],
        where: { stationId: station.id, connectedAt: { gte: last24h } }
      }),
      prisma.listener.groupMany({
        by: ['ip'],
        where: { stationId: station.id, connectedAt: { gte: last7d } }
      }),
      prisma.listener.count({
        where: { stationId: station.id }
      }),
      prisma.listener.aggregate({
        where: { stationId: station.id, duration: { not: null } },
        _avg: { duration: true }
      })
    ]);

    res.json({
      stats: {
        uniqueListeners24h: unique24h.length,
        uniqueListeners7d: unique7d.length,
        totalConnections,
        averageDuration: avgDuration._avg.duration || 0
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export { router as listenerRouter };
