import { Router } from 'express';
import { prisma } from '../index';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { shoutcastManager } from '../services/shoutcast';
import { v4 as uuid } from 'uuid';

const router = Router();

router.use(requireAuth);

router.get('/', async (req: AuthRequest, res) => {
  try {
    const stations = await prisma.station.findMany({
      where: { ownerId: req.userId },
      include: { _count: { select: { media: true, listeners: true } } }
    });
    res.json({ stations });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req: AuthRequest, res) => {
  try {
    const station = await prisma.station.findFirst({
      where: { id: req.params.id, ownerId: req.userId },
      include: {
        _count: { select: { media: true, listeners: true } },
        playlists: true
      }
    });
    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }
    const status = shoutcastManager.getStationStatus(station.id);
    res.json({ station, status });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req: AuthRequest, res) => {
  try {
    const { name, description, shortcode, genre, website, bitrate, samplerate, channels, streamEngine } = req.body;
    if (!name || !shortcode) {
      res.status(400).json({ error: 'Name and shortcode are required' });
      return;
    }
    const existing = await prisma.station.findUnique({ where: { shortcode } });
    if (existing) {
      res.status(409).json({ error: 'Shortcode already in use' });
      return;
    }
    const existingStations = await prisma.station.findMany({ where: { ownerId: req.userId } });
    const listenPort = 8001 + existingStations.length;
    const adminPassword = uuid().replace(/-/g, '').substring(0, 16);
    const sourcePassword = uuid().replace(/-/g, '').substring(0, 16);

    const station = await prisma.station.create({
      data: {
        name,
        description,
        shortcode,
        listenPort,
        genre: genre || 'Various',
        website,
        bitrate: bitrate || 128,
        samplerate: samplerate || 44100,
        channels: channels || 2,
        streamEngine: streamEngine || 'shoutcast',
        adminPassword,
        sourcePassword,
        ownerId: req.userId!
      }
    });

    await prisma.playlist.create({
      data: { name: 'Default', isDefault: true, stationId: station.id }
    });

    shoutcastManager.initStation(station);
    res.json({ station });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id', async (req: AuthRequest, res) => {
  try {
    const { name, description, genre, website, bitrate, samplerate, channels, enabled } = req.body;
    const station = await prisma.station.findFirst({
      where: { id: req.params.id, ownerId: req.userId }
    });
    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }
    const updated = await prisma.station.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(description !== undefined && { description }),
        ...(genre && { genre }),
        ...(website !== undefined && { website }),
        ...(bitrate && { bitrate }),
        ...(samplerate && { samplerate }),
        ...(channels && { channels }),
        ...(enabled !== undefined && { enabled })
      }
    });
    res.json({ station: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:id', async (req: AuthRequest, res) => {
  try {
    const station = await prisma.station.findFirst({
      where: { id: req.params.id, ownerId: req.userId }
    });
    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }
    shoutcastManager.stopStation(station.id);
    await prisma.station.delete({ where: { id: req.params.id } });
    res.json({ message: 'Station deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/start', async (req: AuthRequest, res) => {
  try {
    const station = await prisma.station.findFirst({
      where: { id: req.params.id, ownerId: req.userId }
    });
    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }
    await shoutcastManager.startStation(station);
    await prisma.station.update({ where: { id: station.id }, data: { enabled: true } });
    res.json({ message: 'Station started' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:id/stop', async (req: AuthRequest, res) => {
  try {
    const station = await prisma.station.findFirst({
      where: { id: req.params.id, ownerId: req.userId }
    });
    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }
    shoutcastManager.stopStation(station.id);
    await prisma.station.update({ where: { id: station.id }, data: { enabled: false } });
    res.json({ message: 'Station stopped' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id/status', async (req: AuthRequest, res) => {
  try {
    const status = shoutcastManager.getStationStatus(req.params.id);
    res.json({ status });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export { router as stationRouter };
