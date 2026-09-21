'use client';

/**
 * The morning brief.
 *
 * Built overnight on the server and read here, so it opens at once. It is a
 * screen to be read in ten seconds: what needs an answer today, what is worth
 * knowing, and what was checked and found well.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ChevronDown, Info, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { readableError } from '@/lib/apiError';
import {
  fetchDailyBrief,
  groupBySeverity,
  refreshDailyBrief,
  type BriefItem,
  type DailyBrief,
} from '@/lib/dailyBriefApi';
import styles from './brief.module.css';

const TONE = {
  red: { className: styles.red, Icon: AlertTriangle, label: 'דורש טיפול היום' },
  yellow: { className: styles.yellow, Icon: Info, label: 'כדאי לדעת' },
  green: { className: styles.green, Icon: CheckCircle2, label: 'נבדק ותקין' },
} as const;

function timeText(iso: string | null) {
  if (!iso) return '';
  const when = new Date(iso);
  return when.toLocaleString('he-IL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function ItemCard({ item, open }: { item: BriefItem; open: boolean }) {
  const [expanded, setExpanded] = useState(open);
  const tone = TONE[item.severity];
  const hasRows = item.rows.length > 0;

  return (
    <div className={`${styles.item} ${tone.className}`}>
      <button
        type="button"
        className={styles.itemHead}
        onClick={() => hasRows && setExpanded((v) => !v)}
        aria-expanded={hasRows ? expanded : undefined}
        disabled={!hasRows}
      >
        <tone.Icon className={styles.itemIcon} size={18} aria-hidden />
        <span className={styles.itemText}>
          <span className={styles.itemTitle}>
            {item.title}
            {item.count > 0 && <span className={styles.badge}>{item.count}</span>}
          </span>
          <span className={styles.itemSummary}>{item.summary}</span>
        </span>
        {hasRows && (
          <ChevronDown className={`${styles.chevron} ${expanded ? styles.chevronOpen : ''}`} size={18} aria-hidden />
        )}
      </button>

      {expanded && hasRows && (
        <div className={styles.rows}>
          {item.rows.map((row, index) => (
            <div key={`${row.label}-${index}`} className={styles.row}>
              <span className={styles.rowLabel}>
                {row.href ? (
                  <Link href={row.href} className={styles.rowLink}>{row.label}</Link>
                ) : (
                  row.label
                )}
              </span>
              <span className={styles.rowDetail}>{row.detail}</span>
            </div>
          ))}
          {item.action && <p className={styles.action}>{item.action}</p>}
        </div>
      )}
    </div>
  );
}

export default function DailyBriefPage() {
  const [brief, setBrief] = useState<DailyBrief | null>(null);
  const [storedAt, setStoredAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await fetchDailyBrief();
      setBrief(data.brief);
      setStoredAt(data.stored_at);
    } catch (err) {
      setError(readableError(err, 'טעינת הבריף נכשלה'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * Ask for a fresh brief.
   *
   * The server finishes and stores it whether or not this request is still
   * listening, so the answer is taken from whichever arrives first: the reply,
   * or a newly stored brief the screen notices while waiting. Walking away from
   * the page no longer throws the work away.
   */
  const refresh = async (includeExternal: boolean) => {
    setRefreshing(true);
    setError('');
    const before = storedAt;
    let settled = false;

    const poll = window.setInterval(async () => {
      try {
        const data = await fetchDailyBrief();
        if (!settled && data.stored_at && data.stored_at !== before) {
          settled = true;
          setBrief(data.brief);
          setStoredAt(data.stored_at);
          setRefreshing(false);
          window.clearInterval(poll);
          toast.success('הבריף עודכן');
        }
      } catch {
        // The waiting is what matters; a single failed poll is not news.
      }
    }, 4000);

    try {
      const data = await refreshDailyBrief(includeExternal);
      if (!settled) {
        settled = true;
        setBrief(data.brief);
        setStoredAt(data.stored_at);
        toast.success('הבריף עודכן');
      }
    } catch (err) {
      if (!settled) {
        setError(
          `${readableError(err, 'בניית הבריף לא הספיקה להסתיים')} — הבדיקה ממשיכה בשרת. אפשר לרענן את הדף בעוד דקה.`,
        );
      }
    } finally {
      window.clearInterval(poll);
      if (!settled) setRefreshing(false);
      settled = true;
    }
  };

  if (loading) {
    return (
      <div className="space-y-3" aria-busy="true">
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
        <Skeleton className="h-16 rounded-xl" />
      </div>
    );
  }

  const groups = brief ? groupBySeverity(brief.items) : { red: [], yellow: [], green: [] };
  const calm = brief && brief.red_count === 0;

  return (
    <div className="space-y-6">
      <div className={`${styles.headline} ${calm ? styles.headlineCalm : styles.headlineAlert}`}>
        <div>
          <h2 className={styles.headlineTitle}>{brief ? brief.headline : 'עוד לא נבנה בריף'}</h2>
          <p className={styles.headlineSub}>
            {brief
              ? `${brief.yellow_count} נושאים לבדיקה · עודכן ${timeText(storedAt)}`
              : 'הבריף נבנה כל בוקר אוטומטית. אפשר לבנות אחד עכשיו.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={() => void refresh(false)} disabled={refreshing}>
            <RefreshCw className={`h-4 w-4 ml-1 ${refreshing ? styles.spin : ''}`} />
            {refreshing ? 'בודק…' : 'בדוק עכשיו'}
          </Button>
          {/* The slow half: it waits on Tranzila and on ManyChat. */}
          <Button type="button" variant="ghost" onClick={() => void refresh(true)} disabled={refreshing}>
            בדיקה מלאה, כולל טרנזילה
          </Button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {refreshing && (
        <p className="text-sm text-muted-foreground">
          הבדיקה רצה בשרת. אפשר להישאר כאן או לעבור לדף אחר — היא תסתיים בכל מקרה, והתוצאה תופיע כאן.
        </p>
      )}

      {brief && (
        <>
          {groups.red.length > 0 && (
            <section className="space-y-2">
              <h3 className={styles.sectionTitle}>דורש טיפול היום</h3>
              {groups.red.map((item) => <ItemCard key={item.key} item={item} open />)}
            </section>
          )}

          {groups.yellow.length > 0 && (
            <section className="space-y-2">
              <h3 className={styles.sectionTitle}>כדאי לדעת</h3>
              {groups.yellow.map((item) => <ItemCard key={item.key} item={item} open={false} />)}
            </section>
          )}

          {groups.green.length > 0 && (
            <section className="space-y-2">
              <h3 className={styles.sectionTitle}>נבדק ותקין</h3>
              <div className={styles.greenGrid}>
                {groups.green.map((item) => (
                  <div key={item.key} className={styles.greenChip}>
                    <CheckCircle2 size={15} aria-hidden />
                    <span>{item.title}</span>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
