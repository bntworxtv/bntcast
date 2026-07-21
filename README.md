# BNTcast

**Free, open-source radio station management platform with SHOUTcast & Icecast support.**

A self-hosted alternative to AzuraCast for managing internet radio stations, built with Node.js, React, and SHOUTcast/Icecast streaming engines.

---

## Features

- **Dual Streaming Engine** — Choose between SHOUTcast v2 and Icecast 2
- **Web Dashboard** — Modern React-based admin panel
- **Station Management** — Create and manage multiple radio stations
- **Media Library** — Upload, organize, and manage audio files
- **Playlist Support** — Create playlists with shuffle and repeat
- **Live Listeners** — See who's listening in real-time
- **Now Playing** — Real-time song info via WebSocket
- **Schedule** — Program events for each station
- **Stream URLs** — Auto-generated M3U playlists
- **Multi-format** — MP3, OGG, WAV, AAC, FLAC, M4A, OPUS
- **REST API** — Full API access for integrations

## Quick Start

### Option 1: Ubuntu Install Script (Recommended)

```bash
sudo git clone https://github.com/bntworxtv/bntcast.git
cd bntcast
sudo bash scripts/install.sh
```

Access at `http://your-server-ip:3001`

### Option 2: Docker

```bash
git clone https://github.com/bntworxtv/bntcast.git
cd bntcast
docker-compose up -d
```

Access at `http://localhost`

### Option 3: Manual Install

```bash
# Install dependencies
cd server && npm install && npx prisma generate && npx prisma db push
cd ../client && npm install && npm run build

# Seed database
cd ../server && npm run db:seed

# Build & run
npm run build
npm start
```

## Default Credentials

| Field | Value |
|-------|-------|
| Email | `admin@bntcast.local` |
| Password | `admin` |

**Change these immediately in production!**

## Streaming with SHOUTcast

1. Create a station in the dashboard
2. Open **OBS**, **Mixxx**, or any SHOUTcast-compatible source
3. Use the stream URL and source password from the station settings
4. Start streaming!

### Source Settings (OBS)
- Server: `http://your-server:PORT/stream`
- Stream Key: (source password from station settings)
- Format: `MP3` or `AAC`

## Streaming with Icecast

1. Select "Icecast" as the engine when creating a station
2. Connect using Icecast-compatible sources
3. Mount point will be `/stream`

## Project Structure

```
bntcast/
├── server/                  # Backend (Node.js + Express + TypeScript)
│   ├── src/
│   │   ├── index.ts         # Entry point
│   │   ├── routes/          # API routes
│   │   ├── services/        # SHOUTcast, Icecast, WebSocket managers
│   │   └── middleware/       # Auth middleware
│   └── prisma/schema.prisma # Database schema
├── client/                  # Frontend (React + TypeScript + TailwindCSS)
│   └── src/
│       ├── pages/           # Dashboard, Station, Login pages
│       ├── components/      # UI components
│       └── lib/             # API client, WebSocket hook
├── docker/                  # Docker files
├── icecast/                 # Icecast config templates
├── scripts/                 # Install scripts
└── docker-compose.yml
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3001` | Server port |
| `DATABASE_URL` | `file:./dev.db` | SQLite database path |
| `JWT_SECRET` | (random) | JWT signing secret |
| `MEDIA_DIR` | `./media` | Media files directory |

## Requirements

- Ubuntu 20.04+ / Debian 11+
- Node.js 20+
- SHOUTcast DNAS v2 (optional)
- Icecast 2.4+ (optional)
- FFmpeg (for audio processing)

## License

MIT License — Free to use, modify, and distribute.
