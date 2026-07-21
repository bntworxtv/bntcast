import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { PrismaClient } from '@prisma/client';
import { authRouter } from './routes/auth';
import { stationRouter } from './routes/stations';
import { mediaRouter } from './routes/media';
import { playlistRouter } from './routes/playlists';
import { streamRouter } from './routes/stream';
import { listenerRouter } from './routes/listeners';
import { scheduleRouter } from './routes/schedule';
import { systemRouter } from './routes/system';
import { wsManager } from './services/websocket';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const app = express();
const PORT = parseInt(process.env.PORT || '3001');
export const prisma = new PrismaClient();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

const mediaDir = process.env.MEDIA_DIR || path.join(__dirname, '..', 'media');
app.use('/media', express.static(mediaDir));
app.use('/api/auth', authRouter);
app.use('/api/stations', stationRouter);
app.use('/api/media', mediaRouter);
app.use('/api/playlists', playlistRouter);
app.use('/api/stream', streamRouter);
app.use('/api/listeners', listenerRouter);
app.use('/api/schedule', scheduleRouter);
app.use('/api/system', systemRouter);

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', version: '1.0.0', name: 'BNTcast' });
});

const server = app.listen(PORT, () => {
  console.log(`BNTcast Server running on port ${PORT}`);
});

wsManager.init(server);

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  server.close();
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  server.close();
});
