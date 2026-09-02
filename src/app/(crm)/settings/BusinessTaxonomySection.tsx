'use client';

import { useEffect, useState } from 'react';
import { Briefcase, Plus, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
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
    } catch {
      setError('השמירה נכשלה');
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
                {b.categories.map((c) => (
                  <label
                    key={c.id}
                    className={`text-xs px-2 py-1 rounded-full border flex items-center gap-1 cursor-pointer ${
                      c.is_active ? 'bg-muted' : 'opacity-60 line-through'
                    }`}
                    title={c.is_active ? 'לחיצה משביתה' : 'לחיצה מפעילה'}
                  >
                    <input
                      type="checkbox"
                      className="hidden"
                      checked={c.is_active}
                      disabled={busy}
                      onChange={(e) => run(() => updateBusinessCategory(c.id, { is_active: e.target.checked }))}
                    />
                    {c.name}
                  </label>
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
