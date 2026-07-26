import { NextResponse, type NextRequest } from 'next/server';
import { uuidv7 } from 'uuidv7';
import { requirePermission, AccessDeniedError } from '@/lib/permissions';
import { uploadObject, isS3Configured } from '@/lib/s3';
import { siteMediaUrl } from '@/lib/media';

// Staff image upload → S3. Node runtime (needs Buffer + the AWS SDK).
export const runtime = 'nodejs';

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};
const MAX_BYTES = 12 * 1024 * 1024; // 12 MB

export async function POST(req: NextRequest) {
  try {
    await requirePermission('catalog.write');
  } catch (err) {
    if (err instanceof AccessDeniedError) {
      return NextResponse.json({ error: 'Not authorized.' }, { status: 403 });
    }
    throw err;
  }

  if (!isS3Configured()) {
    return NextResponse.json(
      { error: 'Uploads are not configured. Set S3_MEDIA_BUCKET + AWS credentials.' },
      { status: 501 },
    );
  }

  const form = await req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
  }
  const ext = EXT_BY_TYPE[file.type];
  if (!ext) {
    return NextResponse.json({ error: 'Unsupported image type.' }, { status: 415 });
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'Image is too large (max 12 MB).' }, { status: 413 });
  }

  const key = `product-images/uploads/${uuidv7()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    await uploadObject(key, buffer, file.type);
  } catch {
    return NextResponse.json({ error: 'Upload failed. Try again.' }, { status: 502 });
  }

  return NextResponse.json({ key, url: siteMediaUrl(key) });
}
