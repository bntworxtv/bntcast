import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const email = 'admin@bntcast.local';
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log('Admin user already exists, skipping seed.');
    return;
  }

  const password = await bcrypt.hash('admin', 12);
  const user = await prisma.user.create({
    data: {
      email,
      password,
      name: 'BNTcast Admin',
      role: 'admin'
    }
  });
  console.log(`Created admin user: ${user.email}`);

  const station = await prisma.station.create({
    data: {
      name: 'BNTcast Default',
      description: 'The default BNTcast radio station',
      shortcode: 'default',
      listenPort: 8001,
      streamMount: '/stream',
      genre: 'Various',
      bitrate: 128,
      samplerate: 44100,
      channels: 2,
      adminPassword: 'admin123',
      sourcePassword: 'source123',
      ownerId: user.id
    }
  });
  console.log(`Created default station: ${station.name} (shortcode: ${station.shortcode})`);

  await prisma.playlist.create({
    data: {
      name: 'Default Playlist',
      isDefault: true,
      shuffle: true,
      repeat: true,
      stationId: station.id
    }
  });
  console.log('Created default playlist.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
