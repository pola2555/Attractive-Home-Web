// One-off data repair: 8 portfolio projects point at OLD, deleted S3 ids (their
// media 403s), while the live old-site manifest has them under NEW ids with the
// media present. This repoints each project's cover + gallery to the correct
// new-id paths from the old site's per-project metadata.json on S3.
//
// Keyed by slug (stable on both the dev DB and the box, which was restocked from
// dev), so the same script fixes both. Safe to re-run (replaces each project's
// media each time). Run: node scripts/resync-broken-project-media.mjs
import { PrismaClient } from '@prisma/client';
import { uuidv7 } from 'uuidv7';

const BASE = (process.env.NEXT_PUBLIC_MEDIA_BASE ?? 'https://s3.ap-south-1.amazonaws.com/attractive.home.ae').replace(/\/$/, '');
const prisma = new PrismaClient();

// slug -> current manifest location (verified: cover + gallery all HTTP 200).
const MAP = {
  'mr-ibrahim-el-hashmy-s-villa': { category: 'interior', id: 'project-1785224307147' },
  'mr-el-hashmy-s-villa': { category: 'interior', id: 'project-1785226307734' },
  'mr-mohamed-el-maktom-s-villa': { category: 'interior', id: 'project-1785226744769' },
  'mr-wafi-s-villa': { category: 'interior', id: 'project-1785311507543' },
  'el-sarh-office': { category: 'interior', id: 'project-1785227903874' },
  'mr-baloushi-s-villa': { category: 'interior', id: 'project-1785233442998' },
  'villa-112': { category: 'interior', id: 'project-1784712209838' },
  'mr-khalid-s-villa': { category: 'architectural', id: 'project-1785226072508' },
};

const inferType = (src) => {
  const s = (src || '').toLowerCase().split(/[?#]/)[0];
  if (s.endsWith('.m3u8')) return 'video';
  if (/\.(webp|jpe?g|png|gif|bmp|avif)$/.test(s)) return 'image';
  return 'image';
};
const stem = (src) => src.split('/').pop().replace(/\.[^.]+$/, '');

async function run() {
  for (const [slug, loc] of Object.entries(MAP)) {
    const project = await prisma.project.findUnique({ where: { slug }, select: { id: true } });
    if (!project) {
      console.log(`SKIP ${slug}: not in DB`);
      continue;
    }
    const metaUrl = `${BASE}/projects/${loc.category}/${loc.id}/metadata.json`;
    const res = await fetch(metaUrl, { cache: 'no-cache' });
    if (!res.ok) {
      console.log(`SKIP ${slug}: metadata ${res.status}`);
      continue;
    }
    const md = await res.json();
    const coverKey = md.cover || `projects/${loc.category}/${loc.id}/media/cover/cover/master.m3u8`;

    // Build the gallery rows, de-duping by baseKey (unique per project).
    const seen = new Set();
    const rows = [];
    for (const item of md.media || []) {
      if (!item?.src) continue;
      const baseKey = stem(item.src);
      if (seen.has(baseKey)) continue;
      seen.add(baseKey);
      rows.push({
        id: uuidv7(),
        projectId: project.id,
        sectionId: null,
        mediaType: inferType(item.src),
        baseKey,
        s3Key: item.src,
        sortOrder: rows.length,
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.project.update({ where: { id: project.id }, data: { coverKey, coverType: 'video' } });
      await tx.projectMedia.deleteMany({ where: { projectId: project.id } });
      if (rows.length) await tx.projectMedia.createMany({ data: rows });
    });
    console.log(`FIXED ${slug}: cover -> ${loc.id}, media rows = ${rows.length}`);
  }
  await prisma.$disconnect();
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
