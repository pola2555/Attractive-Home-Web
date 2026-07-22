// §8 step 9 (sample rooms) — visualizer preset rooms. Source: the public
// manifest at chinas-catalog-media/Default-virtualizer-images/images.json,
// fetched once into data/sample-rooms.json. Skips gracefully if absent.
import { uuidv7 } from 'uuidv7';
import { prisma, readJson, dataFileExists } from './lib';

export type SampleRoomsReport = { rooms: number; skipped: boolean };

export async function importSampleRooms(): Promise<SampleRoomsReport> {
  if (!dataFileExists('sample-rooms.json')) {
    console.warn('04-sample-rooms: data/sample-rooms.json missing — skipped');
    return { rooms: 0, skipped: true };
  }
  const names = readJson<string[]>('sample-rooms.json');

  let ensured = 0;
  for (const [index, raw] of names.entries()) {
    const name = (raw ?? '').trim();
    if (!name) continue;
    if (/^https?:/i.test(name)) {
      console.warn(`04-sample-rooms: skipping absolute URL entry "${name}"`);
      continue;
    }
    const imageKey = `Default-virtualizer-images/${name}`;
    // sample_rooms has no natural unique key — emulate an upsert.
    const existing = await prisma.sampleRoom.findFirst({ where: { imageKey } });
    if (!existing) {
      await prisma.sampleRoom.create({ data: { id: uuidv7(), imageKey, sortOrder: index } });
    }
    ensured += 1;
  }
  console.log(`04-sample-rooms: ${ensured} rooms ensured`);
  return { rooms: ensured, skipped: false };
}
