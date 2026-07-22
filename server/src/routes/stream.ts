import { Router } from 'express';
import { prisma } from '../index';
import { requireAuth, AuthRequest } from '../middleware/auth';
import { streamManager } from '../services/streamManager';
import http from 'http';

const router = Router();

router.get('/live/:shortcode', async (req, res) => {
  try {
    const station = await prisma.station.findUnique({
      where: { shortcode: req.params.shortcode }
    });
    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }
    const info = streamManager.getStreamInfo(station);
    res.json({ info });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/status/:shortcode', async (req, res) => {
  try {
    const station = await prisma.station.findUnique({
      where: { shortcode: req.params.shortcode }
    });
    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }
    const status = await streamManager.getStreamStatus(station);
    res.json({ status });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/playlist.m3u/:shortcode', async (req, res) => {
  try {
    const station = await prisma.station.findUnique({
      where: { shortcode: req.params.shortcode }
    });
    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }
    const url = streamManager.getStreamUrl(station);
    const m3u = `#EXTM3U
#EXTINF:-1,${station.name}
${url}`;
    res.set('Content-Type', 'audio/x-mpegurl');
    res.send(m3u);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/nowplaying/:shortcode', async (req, res) => {
  try {
    const station = await prisma.station.findUnique({
      where: { shortcode: req.params.shortcode }
    });
    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }
    const nowPlaying = streamManager.getNowPlaying(station);
    res.json({ nowPlaying });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/proxy/:shortcode', async (req, res) => {
  try {
    const station = await prisma.station.findUnique({
      where: { shortcode: req.params.shortcode }
    });
    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }
    const streamUrl = streamManager.getStreamUrl(station);
    const proxyReq = http.get(streamUrl, { timeout: 10000 }, (proxyRes) => {
      res.writeHead(proxyRes.statusCode || 502, {
        'Content-Type': proxyRes.headers['content-type'] || 'audio/mpeg',
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*'
      });
      proxyRes.pipe(res);
    });
    proxyReq.on('error', () => {
      res.status(502).json({ error: 'Stream not available' });
    });
    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      res.status(504).json({ error: 'Stream timeout' });
    });
    req.on('close', () => {
      proxyReq.destroy();
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

router.use(requireAuth);

router.post('/:stationId/test-stream', async (req: AuthRequest, res) => {
  try {
    const station = await prisma.station.findFirst({
      where: { id: req.params.stationId, ownerId: req.userId }
    });
    if (!station) {
      res.status(404).json({ error: 'Station not found' });
      return;
    }
    const result = await streamManager.testConnection(station);
    res.json({ result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export { router as streamRouter };
