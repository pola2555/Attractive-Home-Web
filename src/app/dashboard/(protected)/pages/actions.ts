'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requirePermission } from '@/lib/permissions';
import { writeAudit } from '@/lib/audit';
import {
  savePageFlags,
  savePageTranslations,
  savePageContent,
  type AuditDiff,
} from '@/lib/sitePagesAdmin';
import { LOCALES } from '@/i18n/config';
import { pageDef, SitePageError } from '@/lib/sitePages';

export type FormState = { error?: string; ok?: boolean };
export type ToggleResult = { ok: boolean; error?: string; value?: boolean };

const FLAGS = ['isPublished', 'showInNav', 'showInFooter'] as const;
type Flag = (typeof FLAGS)[number];

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === 'string' ? v : '';
}

// Bust every public page (nav, footer, visibility and SEO all read the DB in
// the locale layout), the sitemap (its own ISR cache, so a hidden page leaves
// it promptly), and the dashboard views.
function revalidatePublic(): void {
  revalidatePath('/', 'layout');
  revalidatePath('/sitemap.xml');
  revalidatePath('/dashboard/pages');
}

// Flip one visibility flag from the list/editor switches. Returns a result the
// client reflects, instead of redirecting — so a toggle never loses the page.
export async function setPageFlag(key: string, flag: Flag, value: boolean): Promise<ToggleResult> {
  const user = await requirePermission('pages.write');
  if (!FLAGS.includes(flag)) return { ok: false, error: 'Unknown setting.' };
  if (!pageDef(key)) return { ok: false, error: 'Unknown page.' };

  try {
    const diff = await savePageFlags(key, { [flag]: value });
    if (Object.keys(diff).length > 0) {
      await writeAudit({
        userId: user.id,
        entityType: 'site_page',
        entityId: key,
        action: 'update',
        diff,
      });
    }
    revalidatePublic();
    return { ok: true, value };
  } catch (err) {
    if (err instanceof SitePageError) return { ok: false, error: err.message };
    throw err;
  }
}

// Save the editor: per-locale menu label + SEO, and the page's body-text blocks.
export async function savePageDetails(
  key: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const user = await requirePermission('pages.write');
  const def = pageDef(key);
  if (!def) return { error: 'Unknown page.' };

  // Per-locale label + meta.
  const perLocale: Record<string, { navLabel: string; metaTitle: string; metaDescription: string }> = {};
  for (const loc of LOCALES) {
    perLocale[loc] = {
      navLabel: str(formData, `nav_${loc}`),
      metaTitle: str(formData, `metaTitle_${loc}`),
      metaDescription: str(formData, `metaDescription_${loc}`),
    };
  }

  // Content-block bodies: field name "content:<blockId>:<locale>".
  const contentEdits: Record<string, string> = {};
  for (const [name, value] of formData.entries()) {
    if (name.startsWith('content:') && typeof value === 'string') {
      contentEdits[name.slice('content:'.length)] = value;
    }
  }

  try {
    const diff: AuditDiff = {
      ...(await savePageTranslations(key, perLocale)),
      ...(await savePageContent(key, contentEdits)),
    };
    if (Object.keys(diff).length > 0) {
      await writeAudit({
        userId: user.id,
        entityType: 'site_page',
        entityId: key,
        action: 'update',
        diff,
      });
    }
  } catch (err) {
    if (err instanceof SitePageError) return { error: err.message };
    if (err instanceof Error && 'issues' in err) return { error: 'Some fields were too long — please shorten them.' };
    throw err;
  }

  revalidatePublic();
  revalidatePath(`/dashboard/pages/${key}/edit`);
  redirect(`/dashboard/pages/${key}/edit?saved=1`);
}
