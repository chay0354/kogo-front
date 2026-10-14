'use client';

import { Footprints } from 'lucide-react';
import type { WalkInSummary } from '@/types/customer';
import { walkInLessonLine, walkInNextLine, walkInVisitsLine } from './walkInSummary';

function todayIso(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/**
 * The child card of a walk-in: which lesson it came to, when, who added it,
 * and what happens next (owner, 14.10.2026: "שיהיה רשום באיזה שיעור, איזה תאריך
 * הוא הגיע, שיהיה לנו את האינפורמציה הזאת").
 */
export default function WalkInBlock({ summary }: { summary: WalkInSummary }) {
  if (!summary.lessons.length) return null;
  const next = walkInNextLine(summary, todayIso());
  return (
    <section className="mx-6 mb-5 rounded-2xl border border-violet-200 bg-violet-50/70 px-4 py-3" aria-label="הגיע לשיעור בלי להירשם">
      <div className="flex items-center gap-2 text-[15px] font-bold text-violet-950">
        <Footprints className="h-4 w-4" aria-hidden />
        הגיע לשיעור בלי להירשם
        <span className="text-xs font-medium text-violet-900/70">· נוסף ברשימת הנוכחות</span>
      </div>
      <ul className="mt-2 space-y-2">
        {summary.lessons.map((lesson) => (
          <li key={lesson.lesson_id} className="text-sm leading-6 text-violet-950">
            <div className="font-semibold">{walkInLessonLine(lesson)}</div>
            <div className="text-violet-900/80">
              {[walkInVisitsLine(lesson), lesson.instructor_name ? `מדריך: ${lesson.instructor_name}` : '']
                .filter(Boolean)
                .join(' · ')}
            </div>
          </li>
        ))}
      </ul>
      <div
        className={`mt-2 inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
          summary.phone_missing ? 'bg-orange-100 text-orange-800' : 'bg-emerald-100 text-emerald-800'
        }`}
      >
        {next}
      </div>
    </section>
  );
}
