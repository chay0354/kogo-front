'use client';

import { useEffect, useState } from 'react';


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

}
