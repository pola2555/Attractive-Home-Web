import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { getProjectForEdit, categoryOptions } from '@/lib/portfolioAdmin';
import DeleteButton from '../../../../products/DeleteButton';
import ProjectForm from '../../ProjectForm';
import { updateProject, deleteProject } from '../../../actions';

export default async function EditProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('portfolio.write')) redirect('/dashboard/portfolio/projects');

  const [project, categories] = await Promise.all([getProjectForEdit(id), categoryOptions()]);
  if (!project) notFound();

  return (
    <div>
      <Link href="/dashboard/portfolio/projects" className="text-sm text-accent hover:underline">
        ← Projects
      </Link>
      <div className="flex items-start justify-between mt-2 mb-8 gap-4">
        <h1 className="text-2xl font-bold text-heading">Edit project</h1>
        <DeleteButton action={deleteProject.bind(null, id)} confirmText={`Delete "${project.slug}"?`} />
      </div>
      <ProjectForm action={updateProject.bind(null, id)} categories={categories} initial={project} submitLabel="Save changes" />
    </div>
  );
}
