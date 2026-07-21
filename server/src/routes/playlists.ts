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
    const playlists = await prisma.playlist.findMany({
      where: { stationId: station.id },
      include: { media: { include: { media: true }, orderBy: { order: 'asc' } } }
    });
    res.json({ playlists });
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
    const { name, shuffle, repeat } = req.body;
    if (!name) {
      res.status(400).json({ error: 'Name is required' });
      return;
    }
    const playlist = await prisma.playlist.create({
      data: {
        name,
        shuffle: shuffle ?? true,
        repeat: repeat ?? true,
        stationId: station.id
      }
    });
    res.json({ playlist });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:stationId/:playlistId/add', async (req: AuthRequest, res) => {
  try {
    const station = await prisma.station.findFirst({
      where: { id: req.params.stationId, ownerId: req.userId }
    });
    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }
    const { mediaIds } = req.body;
    if (!mediaIds || !Array.isArray(mediaIds)) {
      res.status(400).json({ error: 'mediaIds array is required' });
      return;
    }
    const playlist = await prisma.playlist.findFirst({
      where: { id: req.params.playlistId, stationId: station.id }
    });
    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }
    const existing = await prisma.playlistMedia.findMany({
      where: { playlistId: playlist.id },
      orderBy: { order: 'desc' },
      take: 1
    });
    const nextOrder = existing.length > 0 ? existing[0].order + 1 : 0;

    const items = await Promise.all(
      mediaIds.map((mediaId: string, i: number) =>
        prisma.playlistMedia.create({
          data: {
            playlistId: playlist.id,
            mediaId,
            order: nextOrder + i
          }
        })
      )
    );
    res.json({ items });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:stationId/:playlistId', async (req: AuthRequest, res) => {
  try {
    const station = await prisma.station.findFirst({
      where: { id: req.params.stationId, ownerId: req.userId }
    });
    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }
    const playlist = await prisma.playlist.findFirst({
      where: { id: req.params.playlistId, stationId: station.id }
    });
    if (!playlist) {
      res.status(404).json({ error: 'Playlist not found' });
      return;
    }
    if (playlist.isDefault) {
      res.status(400).json({ error: 'Cannot delete default playlist' });
      return;
    }
    await prisma.playlist.delete({ where: { id: playlist.id } });
    res.json({ message: 'Playlist deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export { router as playlistRouter };
