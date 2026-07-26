import { NextResponse, type NextRequest } from 'next/server';
import { uuidv7 } from 'uuidv7';
import { requirePermission, AccessDeniedError } from '@/lib/permissions';
import { uploadObject, isS3Configured } from '@/lib/s3';
import { siteMediaUrl } from '@/lib/media';

// Staff image upload → S3. Node runtime (needs Buffer + the AWS SDK).
export const runtime = 'nodejs';

// Upload target per `kind`: which permission gates it and which key prefix it
// lands under. Product and project media both live in the site bucket, so
// siteMediaUrl() resolves either. Unknown kinds fall back to product.
const KINDS: Record<string, { permission: string; prefix: string }> = {
  product: { permission: 'catalog.write', prefix: 'product-images/uploads' },
  project: { permission: 'portfolio.write', prefix: 'projects/uploads' },
  service: { permission: 'content.write', prefix: 'Services/uploads' },
};

const EXT_BY_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/gif': 'gif',
};
const MAX_BYTES = 12 * 1024 * 1024; // 12 MB

export async function POST(req: NextRequest) {
  const form = await req.formData();
  const kind = KINDS[String(form.get('kind') ?? 'product')] ?? KINDS.product;

  try {
    await requirePermission(kind.permission);
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

  const key = `${kind.prefix}/${uuidv7()}.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  try {
    await uploadObject(key, buffer, file.type);
  } catch {
    return NextResponse.json({ error: 'Upload failed. Try again.' }, { status: 502 });
  }

  return NextResponse.json({ key, url: siteMediaUrl(key) });
}
