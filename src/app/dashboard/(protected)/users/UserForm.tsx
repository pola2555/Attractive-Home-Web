'use client';

import UnsavedChangesGuard from '../UnsavedChangesGuard';

import { useActionState } from 'react';
import type { RoleOption, PermissionOption, UserFormInitial } from '@/lib/usersAdmin';
import type { FormState } from './actions';

const inputCls =
  'w-full px-3 py-2 bg-surface text-ink rounded-lg border border-line-strong focus:outline-none focus:ring-2 focus:ring-accent';
const labelCls = 'block text-sm text-muted mb-1';

type ServerAction = (prev: FormState, formData: FormData) => Promise<FormState>;

export default function UserForm({
  action,
  mode,
  roles,
  permissions,
  initial,
  isSelf = false,
  submitLabel,
}: {
  action: ServerAction;
  mode: 'create' | 'edit';
  roles: RoleOption[];
  permissions: PermissionOption[];
  initial?: UserFormInitial;
  isSelf?: boolean;
  submitLabel: string;
}) {
  const [state, formAction, isPending] = useActionState<FormState, FormData>(action, {});
  const modules = Array.from(new Set(permissions.map((p) => p.module)));

  return (
    <form action={formAction} className="max-w-3xl space-y-8">
      <UnsavedChangesGuard />
      {state.error && (
        <p className="px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/40 text-red-200 text-sm">
          {state.error}
        </p>
      )}

      {isSelf && mode === 'edit' && (
        <p className="px-4 py-3 rounded-lg bg-amber-500/10 border border-amber-500/40 text-amber-200 text-sm">
          This is your own account — you can change your name, email and password, but another
          administrator must change your roles or status.
        </p>
      )}

      <section className="grid grid-cols-2 gap-4">
        <label className="block">
          <span className={labelCls}>
            Email <span className="text-accent">*</span>
          </span>
          <input name="email" type="email" defaultValue={initial?.email} required className={inputCls} />
        </label>
        <label className="block">
          <span className={labelCls}>
            Name <span className="text-accent">*</span>
          </span>
          <input name="name" defaultValue={initial?.name} required className={inputCls} />
        </label>
        <label className="block">
          <span className={labelCls}>
            {mode === 'create' ? 'Password' : 'New password'} {mode === 'create' && <span className="text-accent">*</span>}
          </span>
          <input
            name="password"
            type="password"
            required={mode === 'create'}
            autoComplete="new-password"
            placeholder={mode === 'edit' ? 'Leave blank to keep current' : 'At least 8 characters'}
            className={inputCls}
          />
        </label>
        {!isSelf && (
          <label className="flex items-end gap-2 text-sm text-ink pb-2">
            <input type="checkbox" name="isActive" defaultChecked={initial?.isActive ?? true} /> Active (can sign in)
          </label>
        )}
      </section>

      {!isSelf && (
        <section className="space-y-3">
          <h2 className="text-lg font-semibold text-heading">Roles</h2>
          <div className="flex flex-wrap gap-x-6 gap-y-2">
            {roles.map((r) => (
              <label key={r.id} className="flex items-center gap-2 text-sm text-ink" title={r.description ?? ''}>
                <input type="checkbox" name="roleIds" value={r.id} defaultChecked={initial?.roleIds.includes(r.id)} />
                {r.name}
              </label>
            ))}
          </div>
        </section>
      )}

      {!isSelf && mode === 'edit' && (
        <section className="space-y-4">
          <h2 className="text-lg font-semibold text-heading">Permission overrides</h2>
          <p className="text-muted text-xs">
            Inherit uses the role grants. Allow adds a permission; Deny removes it even if a role grants it.
          </p>
          {modules.map((module) => (
            <div key={module}>
              <p className="text-sm font-medium text-heading capitalize mb-1">{module}</p>
              <div className="space-y-1">
                {permissions
                  .filter((p) => p.module === module)
                  .map((p) => {
                    const current = initial?.overrides[p.id] ?? '';
                    return (
                      <div key={p.id} className="flex items-center justify-between gap-4 text-sm">
                        <span className="text-ink" title={p.description ?? ''}>
                          <span className="font-mono text-xs text-muted">{p.slug}</span>
                        </span>
                        <div className="flex items-center gap-3 shrink-0">
                          {(['', 'allow', 'deny'] as const).map((val) => (
                            <label key={val} className="flex items-center gap-1 text-xs text-muted">
                              <input type="radio" name={`override_${p.id}`} value={val} defaultChecked={current === val} />
                              {val === '' ? 'Inherit' : val === 'allow' ? 'Allow' : 'Deny'}
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          ))}
        </section>
      )}

      <button
        disabled={isPending}
        className="px-6 py-2.5 rounded-lg bg-brand-brown hover:bg-brand-brown-hover text-white disabled:opacity-60"
      >
        {isPending ? 'Saving…' : submitLabel}
      </button>
    </form>
  );
}
