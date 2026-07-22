// Shared helpers for the one-time JSON import — docs/DATABASE.md §8.
// Source files are COPIES of the old repo / S3 exports placed in
// scripts/import/data/ (git-ignored). The real final import at cutover runs
// against fresh S3 exports (§8 "Sources").
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export const DATA_DIR = path.join(__dirname, 'data');

export function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, relativePath), 'utf8')) as T;
}

export function dataFileExists(relativePath: string): boolean {
  return fs.existsSync(path.join(DATA_DIR, relativePath));
}

// §8 step 5 — lowercase ASCII slugs.
export function slugify(input: string): string {
  return input
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Media binaries stay on S3; the DB stores bucket-relative keys. The bucket is
// derivable from products.source (catalog → chinas-catalog-media,
// attractivehome → attractive.home.ae), so the key alone is enough.
export function s3KeyFromUrl(url: string): string {
  const match = url.match(/^https?:\/\/s3[.-][^/]+\.amazonaws\.com\/[^/]+\/(.+)$/);
  if (!match) throw new Error(`Not a recognized S3 URL: ${url}`);
  return match[1];
}

// Almost every image lives on S3; the rare not-yet-mirrored one (1 of 17,753
// at plan time) keeps its absolute CDN URL in s3_key — the app treats keys
// starting with http(s) as absolute.
export function mediaKeyFromUrl(url: string): { key: string; external: boolean } {
  const match = url.match(/^https?:\/\/s3[.-][^/]+\.amazonaws\.com\/[^/]+\/(.+)$/);
  if (match) return { key: match[1], external: false };
  if (/^https?:\/\//.test(url)) return { key: url, external: true };
  throw new Error(`Unrecognized media URL: ${url}`);
}

type CreateManyDelegate<Row> = {
  createMany(args: { data: Row[]; skipDuplicates: boolean }): Promise<{ count: number }>;
};

// Bulk insert with client-generated UUID v7 ids (docs/DATABASE.md §2) —
// skipDuplicates makes re-runs no-ops on legacy/natural unique keys.
export async function createManyBatched<Row>(
  delegate: CreateManyDelegate<Row>,
  rows: Row[],
  batchSize = 1000,
): Promise<number> {
  let created = 0;
  for (let i = 0; i < rows.length; i += batchSize) {
    const { count } = await delegate.createMany({
      data: rows.slice(i, i + batchSize),
      skipDuplicates: true,
    });
    created += count;
  }
  return created;
}

export function trimmed(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}
