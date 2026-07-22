import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { prisma } from '../index';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();

router.get('/:stationId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const station = await prisma.station.findFirst({
      where: { id: req.params.stationId, ownerId: req.userId }
    });
    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }
    const encoders = await prisma.encoder.findMany({
      where: { stationId: req.params.stationId },
      select: { id: true, username: true, displayName: true, description: true, isActive: true, isLive: true, createdAt: true }
    });
    res.json({ encoders });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:stationId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const station = await prisma.station.findFirst({
      where: { id: req.params.stationId, ownerId: req.userId }
    });
    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }
    const { username, password, displayName, description } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }
    const existing = await prisma.encoder.findUnique({
      where: { stationId_username: { stationId: req.params.stationId, username } }
    });
    if (existing) {
      res.status(409).json({ error: 'Username already exists for this station' });
      return;
    }
    const hashedPassword = await bcrypt.hash(password, 12);
    const encoder = await prisma.encoder.create({
      data: {
        username,
        password: hashedPassword,
        displayName: displayName || username,
        description,
        stationId: req.params.stationId
      },
      select: { id: true, username: true, displayName: true, description: true, isActive: true, isLive: true, createdAt: true }
    });
    res.json({ encoder });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:stationId/:encoderId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const station = await prisma.station.findFirst({
      where: { id: req.params.stationId, ownerId: req.userId }
    });
    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }
    const { displayName, description, isActive, password } = req.body;
    const data: any = {};
    if (displayName !== undefined) data.displayName = displayName;
    if (description !== undefined) data.description = description;
    if (isActive !== undefined) data.isActive = isActive;
    if (password) data.password = await bcrypt.hash(password, 12);
    const encoder = await prisma.encoder.update({
      where: { id: req.params.encoderId },
      data,
      select: { id: true, username: true, displayName: true, description: true, isActive: true, isLive: true, createdAt: true }
    });
    res.json({ encoder });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:stationId/:encoderId', requireAuth, async (req: AuthRequest, res) => {
  try {
    const station = await prisma.station.findFirst({
      where: { id: req.params.stationId, ownerId: req.userId }
    });
    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }
    await prisma.encoder.delete({ where: { id: req.params.encoderId } });
    res.json({ message: 'Encoder deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:stationId/verify', async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      res.status(400).json({ error: 'Username and password are required' });
      return;
    }
    const station = await prisma.station.findUnique({
      where: { shortcode: req.params.stationId }
    });
    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }
    const encoder = await prisma.encoder.findUnique({
      where: { stationId_username: { stationId: station.id, username } }
    });
    if (!encoder || !encoder.isActive) {
      res.status(401).json({ error: 'Invalid credentials or encoder disabled' });
      return;
    }
    const valid = await bcrypt.compare(password, encoder.password);
    if (!valid) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }
    const streamUrl = `http://localhost:${station.listenPort}/stream`;
    const m3u = `#EXTM3U
#EXTINF:-1,${station.name} - ${encoder.displayName || encoder.username}
${streamUrl}`;
    res.json({
      encoder: { id: encoder.id, username: encoder.username, displayName: encoder.displayName },
      station: { name: station.name, shortcode: station.shortcode },
      stream: { url: streamUrl, mount: station.streamMount, port: station.listenPort },
      m3u
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export { router as encoderRouter };
