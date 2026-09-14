'use client';

import { useEffect, useMemo, useState } from 'react';

import Link from 'next/link';

import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useAuth } from '@/components/AuthProvider';
import LinkedUsersSection from '../LinkedUsersSection';
import PartnersSection from '../PartnersSection';
import CrossFade from '@/components/ui/CrossFade';

type UserRole = 'manager' | 'worker' | 'partner';

type DeletionPreview = {
  name: string;
  email: string;
  role: UserRole | null;
  is_active: boolean;
  refusal: string;
  instructor: { id: string; name: string; active_lessons: number } | null;
  linked_access_granted: number;
  linked_access_received: number;
  history_note: string;
};

type ManagedUser = {
  id: string;
  email: string;
  username?: string;
  first_name: string;
  last_name: string;
  is_active: boolean;
  role_display: UserRole | null;
};

/**
 * A sentence a manager can act on.
 *
 * DRF answers field errors as {field: ["message"]}, which used to be shown
 * through JSON.stringify — so a plain "username already taken" arrived on
 * screen as {"email":["..."]}.
 */
function readableError(e: any): string {
  const data = e?.response?.data;
  if (!data) return 'שמירה נכשלה';
  if (typeof data === 'string') return data;
  if (data.detail) return String(data.detail);
  if (data.error) return String(data.error);
  const messages = Object.values(data)
    .flatMap((v) => (Array.isArray(v) ? v : [v]))
    .map((v) => String(v))
    .filter(Boolean);
  return messages.length ? messages.join(' · ') : 'שמירה נכשלה';
}

function roleLabel(role: UserRole | null | undefined) {
  if (role === 'manager') return 'Manager';
  if (role === 'worker') return 'Worker';
  return '—';
}

export default function SettingsUsersPage() {
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);

  const [formEmail, setFormEmail] = useState('');
  const [formFirst, setFormFirst] = useState('');
  const [formLast, setFormLast] = useState('');
  const [formRole, setFormRole] = useState<UserRole>('worker');
  const [formActive, setFormActive] = useState(true);
  const [formPassword, setFormPassword] = useState('');
  const [saving, setSaving] = useState(false);

  const isManager = user?.role === 'manager';

  const loadUsers = async () => {
    setError(null);
    setLoading(true);
    try {
      // The endpoint paginates at 20. Reading only the first page hid every
      // user past the twentieth — they looked absent here while still blocking
      // their own username at creation, and they could not be linked either.
      const all: ManagedUser[] = [];
      let page = 1;
      for (;;) {
        const res = await api.get(`/core/users/?page=${page}`);
        if (Array.isArray(res.data)) {
          all.push(...(res.data as ManagedUser[]));
          break;
        }
        all.push(...((res.data?.results || []) as ManagedUser[]));
        if (!res.data?.next) break;
        page += 1;
        if (page > 50) break; // a guard, not an expected limit
      }
      setUsers(all);
    } catch (e: any) {
      setError(e?.response?.data?.detail || 'שגיאה בטעינת משתמשים');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!isManager) return;
    loadUsers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager]);

  // Deletion asks the server what it costs before it offers the button, so the
  // dialog can name the consequence instead of asking "are you sure?".
  const [deleting, setDeleting] = useState<ManagedUser | null>(null);
  const [preview, setPreview] = useState<DeletionPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const openDelete = async (u: ManagedUser) => {
    setDeleting(u);
    setPreview(null);
    setPreviewLoading(true);
    setError(null);
    try {
      const res = await api.get(`/core/users/${u.id}/deletion-preview/`);
      setPreview(res.data as DeletionPreview);
    } catch (e: any) {
      setError(readableError(e));
      setDeleting(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting || preview?.refusal) return;
    setDeleteBusy(true);
    setError(null);
    try {
      await api.delete(`/core/users/${deleting.id}/`);
      setDeleting(null);
      setPreview(null);
      await loadUsers();
    } catch (e: any) {
      setError(readableError(e));
    } finally {
      setDeleteBusy(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setFormEmail('');
    setFormFirst('');
    setFormLast('');
    setFormRole('worker');
    setFormActive(true);
    setFormPassword('');
    setDialogOpen(true);
  };

  const openEdit = (u: ManagedUser) => {
    setEditing(u);
    setFormEmail(u.email || '');
    setFormFirst(u.first_name || '');
    setFormLast(u.last_name || '');
    setFormRole((u.role_display as UserRole) || 'worker');
    setFormActive(Boolean(u.is_active));
    setFormPassword('');
    setDialogOpen(true);
  };

  const saveUser = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload: any = {
        email: formEmail.trim(),
        first_name: formFirst,
        last_name: formLast,
        is_active: formActive,
        role: formRole,
      };
      if (formPassword.trim()) payload.password = formPassword;

      if (editing) {
        await api.patch(`/core/users/${editing.id}/`, payload);
      } else {
        await api.post('/core/users/', payload);
      }
      setDialogOpen(false);
      await loadUsers();
    } catch (e: any) {
      setError(readableError(e));
    } finally {
      setSaving(false);
    }
  };


  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter((u) =>
      [u.email, u.username, u.first_name, u.last_name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    );
  }, [users, search]);

  return (
    <>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">משתמשים</h2>
          <p className="text-sm text-muted-foreground">כניסות למערכת ותפקידים — מנהל בלבד</p>
        </div>
        {isManager && (
          <Button variant="gradient" onClick={openCreate}>
            משתמש חדש
          </Button>
        )}
      </div>

      <CrossFade swapKey={!isManager ? 'denied' : loading ? 'loading' : 'ready'} className="card">
        {!isManager ? (
          <p className="text-muted-foreground">אין הרשאה</p>
        ) : loading ? (
          <TableSkeleton columns={5} rows={6} tableClassName="min-w-full text-sm" label="טוען משתמשים" />
        ) : (
          <>
            {error && (
              <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div className="mb-3 flex items-center gap-3">
              <input
                type="search"
                className="h-9 w-full max-w-xs rounded-lg border border-gray-200 bg-white px-3 text-sm"
                placeholder="חיפוש לפי שם או שם משתמש"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                aria-label="חיפוש משתמשים"
              />
              <span className="text-xs text-muted-foreground">
                {search ? `${shown.length} מתוך ${users.length}` : `${users.length} משתמשים`}
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-right py-2">שם משתמש</th>
                    <th className="text-right py-2">שם</th>
                    <th className="text-right py-2">תפקיד</th>
                    <th className="text-right py-2">סטטוס</th>
                    <th className="text-left py-2">פעולות</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((u) => (
                    <tr key={u.id} className="border-b">
                      <td className="py-2">{u.email || u.username || '—'}</td>
                      <td className="py-2">{`${u.first_name || ''} ${u.last_name || ''}`.trim() || '—'}</td>
                      <td className="py-2">{roleLabel(u.role_display)}</td>
                      <td className="py-2">{u.is_active ? 'פעיל' : 'מושבת'}</td>
                      <td className="py-2 text-left">
                        <div className="flex gap-2 justify-end">
                          <Button variant="outline" size="sm" onClick={() => openEdit(u)}>
                            ערוך
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-600 hover:bg-red-50"
                            onClick={() => void openDelete(u)}
                          >
                            מחק
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {shown.length === 0 && (
                    <tr>
                      <td className="py-4 text-muted-foreground" colSpan={5}>
                        אין משתמשים להצגה
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </CrossFade>

      {isManager && <PartnersSection />}

      <Dialog open={Boolean(deleting)} onOpenChange={(o) => { if (!o) { setDeleting(null); setPreview(null); } }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle className="text-lg">מחיקת משתמש</DialogTitle>
                <DialogDescription>
                  {deleting?.email || deleting?.username}
                </DialogDescription>
              </div>
              <DialogCloseButton />
            </div>
          </DialogHeader>

          {previewLoading && <p className="text-sm text-muted-foreground py-4">בודק מה המחיקה משפיעה עליו...</p>}

          {!previewLoading && preview && (
            <div className="space-y-3 text-sm">
              {preview.refusal ? (
                <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-800">
                  {preview.refusal}
                </div>
              ) : (
                <>
                  <div className="rounded-lg border bg-muted/40 p-3">{preview.history_note}</div>

                  <div>
                    <p className="font-medium mb-1">מה נמחק:</p>
                    <ul className="list-disc pr-5 space-y-0.5 text-muted-foreground">
                      <li>החשבון עצמו, ההרשאה שלו והאפשרות להתחבר</li>
                      {preview.linked_access_granted > 0 && (
                        <li>{preview.linked_access_granted} הרשאות צפייה שהוא העניק לאחרים</li>
                      )}
                      {preview.linked_access_received > 0 && (
                        <li>{preview.linked_access_received} הרשאות צפייה שניתנו לו</li>
                      )}
                    </ul>
                  </div>

                  {preview.instructor && (
                    <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-900">
                      <p className="font-medium">זהו חשבון של מדריך — {preview.instructor.name}</p>
                      <p>
                        כרטיס המדריך יישאר במערכת, אבל הוא יאבד את היכולת להתחבר
                        {preview.instructor.active_lessons > 0
                          ? ` — ויש לו ${preview.instructor.active_lessons} חוגים פעילים.`
                          : '.'}
                      </p>
                    </div>
                  )}

                  {preview.is_active && (
                    <p className="text-muted-foreground">
                      אם המטרה היא רק לחסום כניסה — עדיף להשבית אותו בעריכה. זה הפיך, והשם נשאר על מה שהוא עשה.
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => { setDeleting(null); setPreview(null); }}>
              ביטול
            </Button>
            {!preview?.refusal && (
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                disabled={deleteBusy || previewLoading || !preview}
                onClick={() => void confirmDelete()}
              >
                {deleteBusy ? 'מוחק...' : 'מחק לצמיתות'}
              </Button>
            )}
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-start justify-between gap-4">
              <div>
                <DialogTitle className="text-lg">{editing ? 'עריכת משתמש' : 'יצירת משתמש'}</DialogTitle>
                <DialogDescription>רק מנהל יכול לנהל משתמשים והרשאות.</DialogDescription>
              </div>
              <DialogCloseButton />
            </div>
          </DialogHeader>

          <div className="px-6 pb-6 pt-4 space-y-4">
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            <div>
              <label className="block text-sm font-medium mb-1">שם משתמש / אימייל</label>
              <input
                type="text"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 bg-white"
                value={formEmail}
                onChange={(e) => setFormEmail(e.target.value)}
                required
                autoComplete="username"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">שם פרטי</label>
                <input
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 bg-white"
                  value={formFirst}
                  onChange={(e) => setFormFirst(e.target.value)}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">שם משפחה</label>
                <input
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 bg-white"
                  value={formLast}
                  onChange={(e) => setFormLast(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">תפקיד</label>
                <select
                  className="w-full rounded-lg border border-gray-200 px-3 py-2 bg-white"
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value as UserRole)}
                >
                  <option value="manager">Manager</option>
                  <option value="worker">Worker</option>
                </select>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={formActive}
                    onChange={(e) => setFormActive(e.target.checked)}
                  />
                  פעיל
                </label>
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                סיסמה {editing ? '(אופציונלי)' : '(נדרש)'}
              </label>
              <input
                type="password"
                className="w-full rounded-lg border border-gray-200 px-3 py-2 bg-white"
                value={formPassword}
                onChange={(e) => setFormPassword(e.target.value)}
                placeholder={editing ? 'השאר ריק כדי לא לשנות' : ''}
              />
            </div>

            <LinkedUsersSection user={editing} allUsers={users} />

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setDialogOpen(false)} disabled={saving}>
                ביטול
              </Button>
              <Button variant="gradient" onClick={saveUser} disabled={saving}>
                {saving ? 'שומר...' : 'שמור'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
