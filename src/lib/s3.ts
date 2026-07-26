import 'server-only';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// Server-side S3 upload for dashboard media. Binaries live on S3 (the DB stores
// bucket-relative keys — docs/DATABASE.md §5); this puts a new object and hands
// the key back for the DB. Credentials/bucket come from env; if unset, uploads
// are cleanly disabled (the dashboard falls back to manual key entry).
const BUCKET = process.env.S3_MEDIA_BUCKET;
const REGION = process.env.S3_REGION ?? process.env.AWS_REGION ?? 'ap-south-1';

let client: S3Client | null = null;
function getClient(): S3Client {
  if (!client) client = new S3Client({ region: REGION });
  return client;
}

export function isS3Configured(): boolean {
  // Bucket + a credential source (static keys or a profile/role).
  return Boolean(
    BUCKET &&
      (process.env.AWS_ACCESS_KEY_ID || process.env.AWS_PROFILE || process.env.AWS_ROLE_ARN),
  );
}

export async function uploadObject(key: string, body: Buffer, contentType: string): Promise<void> {
  if (!BUCKET) throw new Error('S3_MEDIA_BUCKET is not set');
  await getClient().send(
    new PutObjectCommand({
      Bucket: BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );
}
