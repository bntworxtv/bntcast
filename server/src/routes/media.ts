import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs/promises';
import { prisma } from '../index';
import { requireAuth, AuthRequest } from '../middleware/auth';

const router = Router();
router.use(requireAuth);

const mediaDir = process.env.MEDIA_DIR || path.join(__dirname, '..', '..', 'media');

const storage = multer.diskStorage({
  destination: async (_req, file, cb) => {
    const stationId = _req.params.stationId || _req.body.stationId;
    const dir = path.join(mediaDir, stationId);
    await fs.mkdir(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const uniqueName = `${Date.now()}-${Math.random().toString(36).substring(7)}${path.extname(file.originalname)}`;
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['.mp3', '.ogg', '.wav', '.aac', '.flac', '.m4a', '.opus'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowed.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error('File type not supported'));
    }
  }
});

router.get('/:stationId', async (req: AuthRequest, res) => {
  try {
    const station = await prisma.station.findFirst({
      where: { id: req.params.stationId, ownerId: req.userId }
    });
    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }
    const media = await prisma.media.findMany({
      where: { stationId: station.id },
      orderBy: { createdAt: 'desc' }
    });
    res.json({ media });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/:stationId/upload', upload.array('files', 50), async (req: AuthRequest, res) => {
  try {
    const station = await prisma.station.findFirst({
      where: { id: req.params.stationId, ownerId: req.userId }
    });
    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }
    const files = req.files as Express.Multer.File[];
    if (!files || files.length === 0) {
      res.status(400).json({ error: 'No files uploaded' });
      return;
    }

    const created = await Promise.all(
      files.map(file => {
        const title = path.parse(file.originalname).name;
        return prisma.media.create({
          data: {
            title,
            filename: file.filename,
            path: file.path,
            filesize: file.size,
            mimeType: file.mimetype || 'audio/mpeg',
            stationId: station.id
          }
        });
      })
    );

    res.json({ media: created, count: created.length });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/:stationId/:mediaId', async (req: AuthRequest, res) => {
  try {
    const station = await prisma.station.findFirst({
      where: { id: req.params.stationId, ownerId: req.userId }
    });
    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }
    const item = await prisma.media.findFirst({
      where: { id: req.params.mediaId, stationId: station.id }
    });
    if (!item) {
      res.status(404).json({ error: 'Media not found' });
      return;
    }
    try {
      await fs.unlink(item.path);
    } catch {}
    await prisma.media.delete({ where: { id: item.id } });
    res.json({ message: 'Media deleted' });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export { router as mediaRouter };
