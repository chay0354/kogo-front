'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { fetchLinkedUsers, linkUserAccount, unlinkUserAccount, type LinkedUser } from '@/lib/api';

interface ManagedUser {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
}

interface Props {
  /** The account being given access. */
  user: ManagedUser | null;
  /** Everyone who could be linked to them. */
  allUsers: ManagedUser[];
  onClose: () => void;
}

const displayName = (u: ManagedUser) =>
  `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email;

/**
 * Which colleagues an account may switch to.
 *
 * A linked account can open that colleague's registers and mark attendance for
 * them — it is how one instructor covers another. It gives no access to
 * salaries, customers or management screens, and the linked person does not get
 * anything in return: the link only runs one way.
 */
export default function LinkedUsersDialog({ user, allUsers, onClose }: Props) {
  const [linked, setLinked] = useState<LinkedUser[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [toAdd, setToAdd] = useState('');

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setLoading(true);
    setError('');
    fetchLinkedUsers(user.id)
      .then((res) => {
        if (!cancelled) setLinked(res.linked_users ?? []);
      })
      .catch(() => {
        if (!cancelled) setError('שגיאה בטעינת המשתמשים המקושרים');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  if (!user) return null;

  const linkedIds = new Set(linked.map((l) => l.id));
  const candidates = allUsers.filter((u) => u.id !== user.id && !linkedIds.has(u.id));

  const add = async () => {
    if (!toAdd) return;
    setBusyId(toAdd);
    setError('');
    try {
      await linkUserAccount(user.id, toAdd);
      const res = await fetchLinkedUsers(user.id);
      setLinked(res.linked_users ?? []);
      setToAdd('');
    } catch {
      setError('לא הצלחנו לקשר את המשתמש');
    } finally {
      setBusyId('');
    }
  };

  const remove = async (linkedId: string) => {
    setBusyId(linkedId);
    setError('');
    try {
      await unlinkUserAccount(user.id, linkedId);
      setLinked((prev) => prev.filter((l) => l.id !== linkedId));
    } catch {
      setError('לא הצלחנו להסיר את הקישור');
    } finally {
      setBusyId('');
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>משתמשים מקושרים — {displayName(user)}</DialogTitle>
          <DialogDescription>
            המשתמשים שנבחרו כאן יופיעו אצל {displayName(user)} כאפשרות מעבר במסך הנוכחות ובדשבורד.
            הוא יוכל לראות את השיעורים שלהם ולסמן להם נוכחות. הקישור חד־כיווני ואינו נותן גישה
            לשכר, ללקוחות או למסכי ניהול.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
            {error}
          </div>
        )}

        {loading ? (
          <p className="text-muted-foreground text-sm">טוען...</p>
        ) : (
          <>
            <div className="space-y-2">
              {linked.length === 0 && (
                <p className="text-muted-foreground text-sm">אין משתמשים מקושרים</p>
              )}
              {linked.map((l) => (
                <div
                  key={l.id}
                  className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{l.name}</div>
                    <div className="truncate text-xs text-muted-foreground">{l.email || l.username}</div>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busyId === l.id}
                    onClick={() => remove(l.id)}
                  >
                    הסר
                  </Button>
                </div>
              ))}
            </div>

            <div className="flex items-center gap-2 pt-2">
              <select
                className="h-9 flex-1 rounded-md border bg-background px-3 text-sm"
                value={toAdd}
                onChange={(e) => setToAdd(e.target.value)}
                aria-label="בחירת משתמש לקישור"
              >
                <option value="">בחרו משתמש להוספה…</option>
                {candidates.map((u) => (
                  <option key={u.id} value={u.id}>
                    {displayName(u)}
                  </option>
                ))}
              </select>
              <Button onClick={add} disabled={!toAdd || busyId === toAdd}>
                קשר
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
