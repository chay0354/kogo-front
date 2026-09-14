'use client';

import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Briefcase, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { readableError } from '@/lib/apiError';
import {
  createBusiness,
  createBusinessCategory,
  fetchBusinesses,
  updateBusiness,
  updateBusinessCategory,
  type Business,
} from '@/lib/api';

/**
 * עסקים וקטגוריות — המילון שאליו משויכות הכנסות (ובהמשך הוצאות).
 * לקוח עסקי, חוג ומסמך מצביעים על עסק וקטגוריה מכאן.
 */
export default function BusinessTaxonomySection() {
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newBusiness, setNewBusiness] = useState('');
  const [newCategory, setNewCategory] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const queryClient = useQueryClient();

  async function load() {
    setLoading(true);
    try {
      setBusinesses(await fetchBusinesses());
      setError('');
    } catch {
      setError('טעינת העסקים נכשלה');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    try {
      await action();
      await load();
      // The document wizard, the ledger filters and the card-link dialog all read
      // the same list. Without this, a category added here stays invisible there
      // for as long as their copy is still fresh.
      queryClient.invalidateQueries({ queryKey: ['businesses'] });
    } catch (e) {
      setError(readableError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Briefcase className="h-5 w-5" />
          עסקים וקטגוריות
        </h2>
      </div>
      <p className="text-sm text-muted-foreground mb-4">
        כל הכנסה משויכת לעסק ולקטגוריה בתוכו — דרך הלקוח העסקי, החוג או המסמך. הדשבורד והדוח התקופתי מקבצים לפי זה.
      </p>

      {error ? <p className="text-sm text-red-600 mb-3">{error}</p> : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> טוען…
        </div>
      ) : (
        <div className="space-y-4">
          {businesses.map((b) => (
            <div key={b.id} className={`rounded-lg border p-3 ${b.is_active ? '' : 'opacity-60'}`}>
              <div className="flex items-center justify-between gap-3">
                <span className="font-medium">{b.name}</span>
                <label className="text-xs flex items-center gap-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={b.is_active}
                    disabled={busy}
                    onChange={(e) => run(() => updateBusiness(b.id, { is_active: e.target.checked }))}
                  />
                  פעיל
                </label>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {/*
                  The whole chip used to be the switch, so clicking a category you
                  had just added quietly switched it off — and a category that is off
                  is gone from the document wizard. The switch is its own button now.
                */}
                {b.categories.map((c) => (
                  <span
                    key={c.id}
                    className={`text-xs px-2 py-1 rounded-full border flex items-center gap-2 ${
                      c.is_active ? 'bg-muted' : 'opacity-70'
                    }`}
                  >
                    <span className={c.is_active ? '' : 'line-through'}>{c.name}</span>
                    {c.is_active ? null : <span className="text-muted-foreground">כבויה</span>}
                    <button
                      type="button"
                      className="underline text-muted-foreground hover:text-foreground disabled:opacity-50"
                      disabled={busy}
                      onClick={() => run(() => updateBusinessCategory(c.id, { is_active: !c.is_active }))}
                      title={c.is_active ? 'קטגוריה כבויה לא תופיע בבחירת קטגוריה' : 'תחזור לבחירת הקטגוריה'}
                    >
                      {c.is_active ? 'כבה' : 'הפעל'}
                    </button>
                  </span>
                ))}
                {b.categories.length === 0 ? (
                  <span className="text-xs text-muted-foreground">אין קטגוריות עדיין</span>
                ) : null}
              </div>
              <form
                className="mt-2 flex items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  const name = (newCategory[b.id] ?? '').trim();
                  if (!name) return;
                  run(() => createBusinessCategory({ business: b.id, name })).then(() =>
                    setNewCategory((prev) => ({ ...prev, [b.id]: '' })),
                  );
                }}
              >
                <input
                  className="text-sm border rounded px-2 py-1 flex-1"
                  placeholder="קטגוריה חדשה"
                  value={newCategory[b.id] ?? ''}
                  onChange={(e) => setNewCategory((prev) => ({ ...prev, [b.id]: e.target.value }))}
                  disabled={busy}
                />
                <Button type="submit" size="sm" variant="outline" disabled={busy || !(newCategory[b.id] ?? '').trim()}>
                  <Plus className="h-4 w-4" />
                </Button>
              </form>
            </div>
          ))}

          <form
            className="flex items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const name = newBusiness.trim();
              if (!name) return;
              run(() => createBusiness({ name, sort_order: businesses.length })).then(() => setNewBusiness(''));
            }}
          >
            <input
              className="text-sm border rounded px-2 py-1 flex-1"
              placeholder="עסק חדש"
              value={newBusiness}
              onChange={(e) => setNewBusiness(e.target.value)}
              disabled={busy}
            />
            <Button type="submit" size="sm" disabled={busy || !newBusiness.trim()}>
              <Plus className="h-4 w-4" /> הוסף עסק
            </Button>
          </form>
        </div>
      )}
    </div>
  );
}
