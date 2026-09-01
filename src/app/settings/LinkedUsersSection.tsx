'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ListSkeleton } from '@/components/ui/skeleton';
import api, {
  fetchLinkedUsers,
  fetchMyBranches,
  unlinkUserAccount,
  type LinkedUser,
} from '@/lib/api';

interface ManagedUser {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
}

interface Branch {
  id: string;
  name: string;
}

/** A link, plus the branch it was limited to. Empty branch means all of them. */
type LinkedRow = LinkedUser & {
  branch_id?: string | null;
  branch_name?: string | null;
};

interface Props {
  /** The account being given access. Null while creating a new user. */
  user: ManagedUser | null;
  /** Everyone who could be linked to them. */
  allUsers: ManagedUser[];
}

const displayName = (u: ManagedUser) =>
  `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.email;

/**
 * Which colleagues this account may switch to, edited inside the user dialog.
 *
 * A linked account can open that colleague's registers and mark attendance for
 * them — it is how one instructor covers another. It gives no access to
 * salaries, customers or management screens, and the linked person gets nothing
 * in return: the link only runs one way.
 *
 * A colleague who works in several branches can be handed over one branch at a
 * time. Each name appears once here, so a row reads as a single rule: either a
 * branch, or everything.
 *
 * Links are saved as they are made, not with the rest of the form, so a new
 * user has to be created first before any can be added.
 */
export default function LinkedUsersSection({ user, allUsers }: Props) {
  const [linked, setLinked] = useState<LinkedRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [toAdd, setToAdd] = useState('');
  const [toAddBranch, setToAddBranch] = useState('');

  useEffect(() => {
    if (!user) {
      setLinked([]);
      return;
    }
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

  useEffect(() => {
    let cancelled = false;
    // A manager gets every branch from this endpoint; it is the same list the
    // branch switcher is built from, so the names read the same everywhere.
    fetchMyBranches()
      .then((res) => {
        if (!cancelled) setBranches(res);
      })
      .catch(() => {
        if (!cancelled) setBranches([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!user) {
    return (
      <div className="rounded-lg border border-dashed px-4 py-3 text-sm text-muted-foreground">
        משתמשים מקושרים אפשר להוסיף אחרי שמירת המשתמש.
      </div>
    );
  }

  const linkedIds = new Set(linked.map((l) => l.id));
  const candidates = allUsers.filter((u) => u.id !== user.id && !linkedIds.has(u.id));

  const add = async () => {
    if (!toAdd) return;
    setBusyId(toAdd);
    setError('');
    try {
      await api.post('/core/auth/linked-users/', {
        user_id: user.id,
        linked_user_id: toAdd,
        // Left out entirely when no branch was picked, which is what keeps the
        // link covering the colleague's whole timetable.
        ...(toAddBranch ? { branch_id: toAddBranch } : {}),
      });
      const res = await fetchLinkedUsers(user.id);
      setLinked(res.linked_users ?? []);
      setToAdd('');
      setToAddBranch('');
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
    <div className="rounded-lg border p-4 space-y-3">
      <div>
        <div className="text-sm font-medium">משתמשים נוספים</div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
          המשתמשים שתוסיפו כאן יופיעו אצל {displayName(user)} ככפתור החלפת מדריך במסך הנוכחות
          ובדשבורד. הוא יוכל לראות את השיעורים שלהם ולסמן להם נוכחות. הקישור חד־כיווני ואינו נותן
          גישה לשכר, ללקוחות או למסכי ניהול. אפשר להגביל קישור לסניף אחד; בלי בחירת סניף הוא כולל
          את כל השיעורים של אותו משתמש.
        </p>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error}
        </div>
      )}

      {loading ? (
        <ListSkeleton rows={2} label="טוען משתמשים מקושרים" />
      ) : (
        <>
          <div className="space-y-2">
            {linked.length === 0 && (
              <p className="text-sm text-muted-foreground">אין משתמשים מקושרים</p>
            )}
            {linked.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between gap-3 rounded-lg border bg-white px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{l.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {l.email || l.username}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {l.branch_name ? `${l.branch_name} בלבד` : 'כל הסניפים'}
                  </div>
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

          <div className="flex flex-wrap items-center gap-2">
            <select
              className="h-9 min-w-[10rem] flex-1 rounded-lg border border-gray-200 bg-white px-3 text-sm"
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
            <select
              className="h-9 min-w-[10rem] flex-1 rounded-lg border border-gray-200 bg-white px-3 text-sm"
              value={toAddBranch}
              onChange={(e) => setToAddBranch(e.target.value)}
              aria-label="הגבלת הקישור לסניף"
            >
              <option value="">כל הסניפים</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <Button onClick={add} disabled={!toAdd || busyId === toAdd}>
              הוסף
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
