'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Check, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogCloseButton,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import type { BranchOption } from '@/lib/scopedFilters';
import {
  RANGE_PRESETS,
  buildReportUrl,
  isoDay,
  presetRange,
  reportRequestProblem,
} from '@/lib/studentsReport';
import type { DateRange } from './GlobalDateFilter';
import css from './StudentsReportDialog.module.css';

type Branch = BranchOption & { is_external?: boolean };

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The dashboard's period — where the dialog starts. */
  globalDateRange: DateRange;
  /** The branches this user may see (useScopedBranches). */
  branches: Branch[];
}

/**
 * "דוח PDF" on the students tab: pick the period and the branches, and the
 * report opens in a tab of its own, laid out for A4.
 *
 * Municipality branches are left out: their children are not paying students,
 * so every figure there would read zero.
 */
export default function StudentsReportDialog({ open, onOpenChange, globalDateRange, branches }: Props) {
  const router = useRouter();
  const choosable = useMemo(
    () => branches.filter((b) => !b.is_external).sort((a, b) => a.name.localeCompare(b.name, 'he')),
    [branches],
  );
  const today = isoDay(new Date());
  const [from, setFrom] = useState(isoDay(globalDateRange.date_from));
  const [to, setTo] = useState(isoDay(globalDateRange.date_to));
  const [picked, setPicked] = useState<Set<string>>(new Set());

  // Each time it opens: the dashboard's period, every branch.
  useEffect(() => {
    if (!open) return;
    setFrom(isoDay(globalDateRange.date_from));
    setTo(isoDay(globalDateRange.date_to));
    setPicked(new Set(choosable.map((b) => b.id)));
  }, [open, globalDateRange, choosable]);

  const allPicked = choosable.length > 0 && picked.size === choosable.length;
  const problem = reportRequestProblem({ from, to, branchCount: picked.size, today });

  const toggle = (id: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const produce = () => {
    if (problem) return;
    const url = buildReportUrl({
      from,
      to,
      branchIds: choosable.filter((b) => picked.has(b.id)).map((b) => b.id),
      allBranches: allPicked,
    });
    // A tab of its own, so the dashboard stays where it was. A blocked popup
    // opens it here instead. (No 'noopener': with it the call always returns
    // null and the report would open twice. The page is our own.)
    const tab = window.open(url, '_blank');
    if (!tab) router.push(url);
    onOpenChange(false);
  };

  const activePreset = RANGE_PRESETS.find((p) => {
    const r = presetRange(p.key, new Date());
    return r.from === from && r.to === to;
  })?.key;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]" dir="rtl">
        <DialogHeader className="px-5 pt-5 sm:px-6 sm:pt-6">
          <div className={css.head}>
            <span className={css.icon} aria-hidden>
              <FileText className="h-5 w-5" />
            </span>
            <div className={css.headText}>
              <DialogTitle className="text-xl">דוח תלמידים</DialogTitle>
              <DialogDescription>
                גרף לאורך התקופה, ימים, מדריכים וקבוצות מול הקיבולת. נפתח בלשונית חדשה, מוכן להורדה כ־PDF.
              </DialogDescription>
            </div>
            <DialogCloseButton label="סגירה" />
          </div>
        </DialogHeader>

        <div className={css.body}>
          <section>
            <div className={css.label}>תקופה</div>
            <div className={css.presets} role="group" aria-label="תקופה מוכנה">
              {RANGE_PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  className={`${css.preset} ${activePreset === p.key ? css.presetOn : ''}`}
                  aria-pressed={activePreset === p.key}
                  onClick={() => {
                    const r = presetRange(p.key, new Date());
                    setFrom(r.from);
                    setTo(r.to);
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            <div className={css.dates}>
              <label className={css.date}>
                <span>מתאריך</span>
                <input type="date" value={from} max={today} onChange={(e) => setFrom(e.target.value)} />
              </label>
              <label className={css.date}>
                <span>עד תאריך</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
              </label>
            </div>
            {to > today && !problem && <p className={css.hint}>הדוח יגיע עד היום — {today.split('-').reverse().join('.')}.</p>}
          </section>

          <section>
            <div className={css.labelRow}>
              <div className={css.label}>סניפים</div>
              <button
                type="button"
                className={css.allToggle}
                onClick={() => setPicked(allPicked ? new Set() : new Set(choosable.map((b) => b.id)))}
              >
                {allPicked ? 'נקה הכול' : 'בחר הכול'}
              </button>
            </div>
            <div className={css.chips}>
              {choosable.map((b) => {
                const on = picked.has(b.id);
                return (
                  <button
                    key={b.id}
                    type="button"
                    className={`${css.chip} ${on ? css.chipOn : ''}`}
                    aria-pressed={on}
                    onClick={() => toggle(b.id)}
                  >
                    <span className={css.tick} aria-hidden>
                      {on && <Check className="h-3.5 w-3.5" />}
                    </span>
                    {b.name}
                  </button>
                );
              })}
            </div>
            <p className={css.hint}>
              {picked.size === 0
                ? 'לא נבחר סניף'
                : allPicked
                  ? `כל ${choosable.length} הסניפים · עמוד סיכום ועמוד לכל סניף`
                  : `${picked.size} סניפים · עמוד סיכום ועמוד לכל סניף`}
            </p>
          </section>
        </div>

        <div className={css.foot}>
          {problem ? <span className={css.problem}>{problem}</span> : <span />}
          <Button onClick={produce} disabled={!!problem} className="gap-2 px-5">
            <FileText className="h-4 w-4" />
            הפק דוח
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
