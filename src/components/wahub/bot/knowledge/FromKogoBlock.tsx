'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown, Database, ExternalLink } from 'lucide-react';
import type { WahubFromKogo } from '@/types/wahub';
import { useWahubFromKogo } from '../../hooks/useBotQueries';
import { ErrorState, Pill, Spinner } from '../../shared/bits';
import { cx } from '../../shared/tones';
import s from '../../wahub.module.css';

const MISSING_LABEL: Record<string, string> = {
  address: 'כתובת',
  phone: 'טלפון',
  directions: 'הוראות הגעה',
  city: 'עיר',
  manager: 'מנהל סניף',
  description: 'תיאור',
  trial_bring_note: 'מה להביא',
  price: 'מחיר',
  trial_lesson_price: 'מחיר שיעור ניסיון',
  external_link: 'קישור הרשמה חיצוני',
};

function missingLabel(key: string): string {
  return MISSING_LABEL[key] ?? key;
}

/** The read-only part of the knowledge: what Kogo already knows, with every hole marked. */
export function FromKogoBody({ data }: { data: WahubFromKogo }) {
  const holes = data.branches.reduce((sum, branch) => sum + (branch.missing?.length ?? 0), 0);
  const pricing = data.pricing_summary;
  const [showCourses, setShowCourses] = useState(false);
  return (
    <div className="flex flex-col gap-4">
      <p className={cx(s.t2, 'm-0 !text-[13px] leading-relaxed')}>
        {data.note || 'מחיר, הנחה, ניסיון, דמי רישום, כתובת, סניף חיצוני ומערכת שעות נקראים מ-Kogo.'} הבוט לא יודע מה שלא כתוב בכרטיס – מה שמסומן{' '}
        <Pill tone="warning">חסר</Pill> משלימים שם.
      </p>

      <section aria-label="סניפים">
        <h4 className={cx(s.sectTitle, 'mb-1.5')}>
          סניפים ({data.branches.length}){holes > 0 ? ` · ${holes} פרטים חסרים` : ''}
        </h4>
        {data.branches.length === 0 ? (
          <p className={cx(s.t2, 'm-0')}>לא הוחזרו סניפים.</p>
        ) : (
          <ul className={cx(s.rows, 'm-0 list-none p-0')}>
            {data.branches.map((branch) => (
              <li key={String(branch.id)} className="flex flex-wrap items-start gap-x-3 gap-y-1.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className={cx(s.t1, 'm-0 flex flex-wrap items-center gap-1.5')}>
                    {branch.name}
                    {branch.city && <span className={cx(s.t2, 'font-semibold')}>· {branch.city}</span>}
                    {branch.is_external ? <Pill tone="muted">חיצוני – “לבדוק מול העירייה”</Pill> : <Pill tone="success">שלנו</Pill>}
                  </p>
                  <p className={cx(s.t2, 'm-0 mt-0.5 !text-[12.5px]')} dir="auto">
                    {[branch.address, branch.phone, branch.manager_name, branch.directions, branch.external_link].filter(Boolean).join(' · ') || 'אין פרטים'}
                  </p>
                  {branch.missing?.length > 0 && (
                    <p className="m-0 mt-1 flex flex-wrap gap-1">
                      {branch.missing.map((key) => (
                        <Pill key={key} tone="warning">
                          חסר: {missingLabel(key)}
                        </Pill>
                      ))}
                    </p>
                  )}
                </div>
                <Link href={`/branches/${encodeURIComponent(String(branch.id))}`} className={cx(s.btn, s.btnSm)}>
                  <ExternalLink aria-hidden="true" />
                  ערוך בכרטיס
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="תחומים">
        <h4 className={cx(s.sectTitle, 'mb-1.5')}>תחומים ({data.course_types.length})</h4>
        {data.course_types.length === 0 ? (
          <p className={cx(s.t2, 'm-0')}>לא הוחזרו תחומים.</p>
        ) : (
          <ul className={cx(s.rows, 'm-0 list-none p-0')}>
            {data.course_types.map((type) => {
              const missing = type.missing ?? (type.trial_bring_note ? [] : ['trial_bring_note']);
              return (
                <li key={String(type.id)} className="flex flex-wrap items-start gap-x-3 gap-y-1.5 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className={cx(s.t1, 'm-0')}>{type.name}</p>
                    <p className={cx(s.t2, 'm-0 mt-0.5 !text-[12.5px]')} dir="auto">
                      {type.description || 'אין תיאור'}
                      {type.trial_bring_note ? ` · להביא: ${type.trial_bring_note}` : ''}
                    </p>
                    {missing.length > 0 && (
                      <p className="m-0 mt-1 flex flex-wrap gap-1">
                        {missing.map((key) => (
                          <Pill key={key} tone="warning">
                            חסר: {missingLabel(key)}
                          </Pill>
                        ))}
                      </p>
                    )}
                  </div>
                  <Link href={type.edit_path || '/courses'} className={cx(s.btn, s.btnSm)}>
                    <ExternalLink aria-hidden="true" />
                    לחוגים
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-label="מחירים">
        <h4 className={cx(s.sectTitle, 'mb-1.5')}>מחירים וניסיון</h4>
        <p className="m-0 flex flex-wrap items-center gap-1.5 text-[13.5px]">
          <strong className="font-extrabold">{pricing.courses_total.toLocaleString('he-IL')}</strong> חוגים פעילים
          {pricing.courses_without_price > 0 ? <Pill tone="warning">חסר מחיר ב-{pricing.courses_without_price}</Pill> : <Pill tone="success">לכולם יש מחיר</Pill>}
          <Pill tone="neutral">{pricing.paid_trials} עם ניסיון בתשלום</Pill>
          <span className={cx(s.t2, 'font-semibold')}>· דמי רישום {data.registration_fee == null || data.registration_fee === '' ? '—' : `₪${data.registration_fee}`}</span>
        </p>
        {pricing.courses.length > 0 && (
          <>
            <button type="button" aria-expanded={showCourses} onClick={() => setShowCourses((value) => !value)} className={cx(s.link, 'mt-1.5 text-[12.5px]')}>
              {showCourses ? 'הסתר את רשימת החוגים' : 'הצג את כל החוגים'}
            </button>
            {showCourses && (
              <ul className={cx(s.rows, 'm-0 mt-1 list-none p-0')}>
                {pricing.courses.map((course) => (
                  <li key={course.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5 text-[13px]">
                    <span className="min-w-0 flex-1 truncate" dir="auto">
                      <strong className="font-bold">{course.name}</strong>
                      <span className={s.t2}>
                        {' '}· {course.branch}
                        {course.course_type ? ` · ${course.course_type}` : ''}
                      </span>
                    </span>
                    <span className={cx(s.num, 'font-bold')}>{course.price ? `₪${course.price}` : '—'}</span>
                    <span className={s.t2}>{course.trial_is_paid ? `ניסיון ₪${course.trial_price ?? '?'}` : 'ניסיון חינם'}</span>
                    {course.missing.map((key) => (
                      <Pill key={key} tone="warning">
                        חסר: {missingLabel(key)}
                      </Pill>
                    ))}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <section aria-label="הנחות">
          <h4 className={cx(s.sectTitle, 'mb-1.5')}>הנחות</h4>
          {data.discounts.length === 0 ? (
            <p className={cx(s.t2, 'm-0')}>אין הנחות.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
              {data.discounts.map((discount) => (
                <li key={discount.id} className="flex flex-wrap items-center gap-1.5">
                  <strong className="font-bold">{discount.name}</strong>
                  <span className={s.t2}>
                    {discount.type_label} · {discount.value}
                    {discount.start_date || discount.end_date ? ` · ${discount.start_date ?? ''}–${discount.end_date ?? ''}` : ''}
                  </span>
                  {!discount.configured && <Pill tone="warning">לא הוגדרה (0)</Pill>}
                  {!discount.is_active && <Pill tone="muted">לא פעילה</Pill>}
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label="תאריכים חסומים">
          <h4 className={cx(s.sectTitle, 'mb-1.5')}>תאריכים חסומים לניסיון</h4>
          {data.blocked_dates.length === 0 ? (
            <p className={cx(s.t2, 'm-0')}>אין תאריכים חסומים.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-1 p-0 text-[13px]">
              {data.blocked_dates.map((row) => (
                <li key={row.date} className={cx('flex flex-wrap items-center gap-1.5', row.is_past && s.muted)}>
                  <span className={cx(s.num, 'font-bold')}>{row.date}</span>
                  {row.reason && <span className={s.t2}>{row.reason}</span>}
                  {row.is_past && <span className={cx(s.t2, '!text-[11px]')}>עבר</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

/** The folded card. Read from the server only when it is opened. */
export default function FromKogoBlock({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const query = useWahubFromKogo(open);
  return (
    <section className={s.card} aria-label="מגיע מ-Kogo" id="wahub-from-kogo">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="flex w-full items-center gap-3 border-0 bg-transparent p-0 text-start"
      >
        <span aria-hidden="true" className={s.iconBox}>
          <Database className="h-[18px] w-[18px]" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-extrabold">מגיע מ-Kogo</span>
          <span className={cx(s.t2, 'block !text-[12.5px]')}>סניפים, תחומים, מחירים, הנחות ותאריכים – לקריאה בלבד, עם סימון מה חסר</span>
        </span>
        <ChevronDown className={cx('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <div className="mt-4">
          {query.isLoading ? (
            <p className={cx(s.muted, 'm-0 flex items-center gap-2')}>
              <Spinner /> קורא מ-Kogo…
            </p>
          ) : query.isError ? (
            <ErrorState title="לא הצלחנו לקרוא מ-Kogo" onRetry={() => void query.refetch()} tight />
          ) : query.data ? (
            <FromKogoBody data={query.data} />
          ) : null}
        </div>
      )}
    </section>
  );
}
