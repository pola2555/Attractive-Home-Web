import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireUser, effectivePermissions } from '@/lib/permissions';
import { categoryOptions } from '@/lib/portfolioAdmin';
import ProjectForm from '../ProjectForm';
import { createProject } from '../../actions';

export default async function NewProjectPage() {
  const user = await requireUser();
  if (!user) redirect('/dashboard/login');
  const permissions = await effectivePermissions(user.id);
  if (!permissions.has('portfolio.write')) redirect('/dashboard/portfolio/projects');

  const categories = await categoryOptions();
  if (categories.length === 0) {
    return (
      <div>
        <Link href="/dashboard/portfolio" className="text-sm text-accent hover:underline">
          ← Portfolio
        </Link>
        <p className="mt-6 text-muted">Create a category first before adding projects.</p>
      </div>
    );
  }

  return (
    <div>
      <Link href="/dashboard/portfolio/projects" className="text-sm text-accent hover:underline">
        ← Projects
      </Link>
      <h1 className="text-2xl font-bold text-heading mt-2 mb-8">New project</h1>
      <ProjectForm action={createProject} categories={categories} submitLabel="Create project" />
    </div>
  );
}
