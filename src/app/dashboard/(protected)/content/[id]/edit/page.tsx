import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { getContentBlockForEdit } from '@/lib/contentAdmin';
import ContentBlockForm from '../../ContentBlockForm';
import { updateContentBlock } from '../../actions';

export default async function EditContentBlockPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('content.write')) redirect('/dashboard/content');

  const block = await getContentBlockForEdit(id);
  if (!block) notFound();

  return (
    <div>
      <Link href="/dashboard/content" className="text-sm text-accent hover:underline">
        ← Content
      </Link>
      <h1 className="text-2xl font-bold text-heading mt-2 mb-1">Edit content</h1>
      <p className="text-muted font-mono text-xs mb-8">{block.key}</p>
      <ContentBlockForm action={updateContentBlock.bind(null, id)} initial={block} />
    </div>
  );
}
