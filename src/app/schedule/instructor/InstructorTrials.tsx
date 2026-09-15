'use client';

import { useEffect, useMemo, useState } from 'react';
import { PhoneCall, Sparkles } from 'lucide-react';
import ContactSheet from '@/components/ContactSheet';
import { fetchInstructorTrials, type InstructorTrial } from '@/lib/scheduleUtils';
import styles from './InstructorTrials.module.css';

const DAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

/**
 * The order the chips appear in, and the only place the five states are listed.
 *
 * It is deliberately not alphabetical and not the server's order: it runs from
 * the rows that still need a phone call to the ones that are already settled.
 * A trial still to come and a child who did not turn up are what an instructor
 * opens this for; "נרשם בסוף" is the happy ending and sits at the end.
 */
const OUTCOMES = ['upcoming', 'no_show', 'unmarked', 'attended', 'registered'] as const;

type Outcome = (typeof OUTCOMES)[number];

const INITIAL_VISIBLE = 6;

function formatTrialDate(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}.${m}.${y.slice(2)}`;
}

type Props = {
  /** Same filters the rest of the sheet is showing, so the two never disagree. */
  branchId: string;
  asUser?: string;
};

/**
 * Every trial student on this instructor's lessons, with what became of each.
 *
 * It carries its own date window rather than the sheet's range picker: that
 * picker drives a trend chart and ends today, which would hide the trials
 * already booked for next week — the rows most worth a phone call. The server's
 * default window looks back three months and forward two, so nothing booked is
 * out of reach.
 */
export default function InstructorTrials({ branchId, asUser }: Props) {
  const [trials, setTrials] = useState<InstructorTrial[] | null>(null);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Outcome | 'all'>('all');
  const [expanded, setExpanded] = useState(false);
  const [contact, setContact] = useState<{ name: string; phone: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setError('');
    fetchInstructorTrials({ branch_id: branchId, as_user: asUser })
      .then((res) => {
        if (cancelled) return;
        setTrials(res.trials);
        setCounts(res.counts);
        setLabels(res.labels);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setError('שגיאה בטעינת תלמידי הניסיון');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [branchId, asUser]);

  // A filter that survives a branch change would leave the list empty with no
  // explanation, so it resets with the data.
  useEffect(() => {
    setFilter('all');
    setExpanded(false);
  }, [branchId, asUser]);

  const total = trials?.length ?? 0;
  const shown = useMemo(
    () => (filter === 'all' ? trials ?? [] : (trials ?? []).filter((t) => t.outcome === filter)),
    [trials, filter],
  );
  const visible = expanded ? shown : shown.slice(0, INITIAL_VISIBLE);

  if (isLoading) {
    return <div className={styles.skeleton} aria-busy="true" aria-label="טוען תלמידי ניסיון" />;
  }
  if (error) return <div className={styles.error}>{error}</div>;
  if (!trials || total === 0) return null;

  return (
    <section className={styles.card}>
      <div className={styles.title}>
        <Sparkles size={16} /> תלמידי ניסיון
        <span className={styles.badge}>{total}</span>
      </div>
      <p className={styles.note}>לחצו על שם כדי להתקשר או לשלוח וואטסאפ</p>

      <div className={styles.chips} role="tablist" aria-label="סינון לפי מצב">
        <button
          type="button"
          role="tab"
          aria-selected={filter === 'all'}
          className={`${styles.chip} ${filter === 'all' ? styles.chipOn : ''}`}
          onClick={() => setFilter('all')}
        >
          <b>{total}</b> הכל
        </button>
        {/* Only the states that actually happened. A zero chip is a control
            that leads to an empty list, which is worse than not being there. */}
        {OUTCOMES.filter((key) => (counts[key] ?? 0) > 0).map((key) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={filter === key}
            className={`${styles.chip} ${styles[key]} ${filter === key ? styles.chipOn : ''}`}
            onClick={() => setFilter(filter === key ? 'all' : key)}
          >
            <b>{counts[key]}</b> {labels[key] ?? key}
          </button>
        ))}
      </div>

      <div className={styles.list}>
        {visible.map((t) => {
          const meta = [
            t.course_name,
            // A hard space: bidi wrapping would otherwise leave "יום" at the
            // end of one line and its day letter stranded at the start of the next.
            `יום\u00a0${DAY_LETTERS[t.day_of_week] ?? '—'} ${t.start_time}`,
            formatTrialDate(t.trial_date),
          ]
            .filter(Boolean)
            .join(' · ');
          return (
            <div className={styles.row} key={t.enrollment_id}>
              <div className={styles.identity}>
                <div className={styles.name}>
                  {t.child_name}
                  <span className={`${styles.tag} ${styles[t.outcome]}`}>{t.outcome_label}</span>
                  {(t.trial_number ?? 1) > 1 && (
                    <span className={styles.repeat} title="הילד כבר היה בניסיון">
                      ניסיון {t.trial_number}
                    </span>
                  )}
                </div>
                <small className={styles.meta}>{meta}</small>
              </div>
              {t.phone ? (
                <button
                  type="button"
                  className={styles.callBtn}
                  onClick={() => setContact({ name: t.child_name, phone: t.phone })}
                  aria-label={`יצירת קשר עם ${t.child_name}`}
                >
                  <PhoneCall size={17} strokeWidth={2.3} />
                </button>
              ) : (
                <span className={styles.noPhone} title="אין מספר טלפון">
                  —
                </span>
              )}
            </div>
          );
        })}
      </div>

      {shown.length > visible.length && (
        <button type="button" className={styles.more} onClick={() => setExpanded(true)}>
          עוד {shown.length - visible.length}
        </button>
      )}

      {contact && (
        <ContactSheet name={contact.name} phone={contact.phone} onClose={() => setContact(null)} />
      )}
    </section>
  );
}
