import { Router } from 'express';
import { prisma } from '../index';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
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
    const events = await prisma.scheduleEvent.findMany({
      where: { stationId: station.id },
      orderBy: { startTime: 'asc' }
    });
    res.json({ events });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:stationId', async (req: AuthRequest, res) => {
  try {
    const station = await prisma.station.findFirst({
      where: { id: req.params.stationId, ownerId: req.userId }
    });
    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }
    const { title, description, startTime, endTime } = req.body;
    if (!title || !startTime || !endTime) {
      res.status(400).json({ error: 'Title, startTime, and endTime are required' });
      return;
    }
    const event = await prisma.scheduleEvent.create({
      data: {
        title,
        description,
        startTime: new Date(startTime),
        endTime: new Date(endTime),
        stationId: station.id
      }
    });
    res.json({ event });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:stationId/:eventId', async (req: AuthRequest, res) => {
  try {
    const station = await prisma.station.findFirst({
      where: { id: req.params.stationId, ownerId: req.userId }
    });
    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }
    await prisma.scheduleEvent.delete({
      where: { id: req.params.eventId }
    });
    res.json({ message: 'Event deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export { router as scheduleRouter };
