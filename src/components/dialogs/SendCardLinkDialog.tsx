'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import {
  AlertTriangle,
  CalendarDays,
  Check,
  CheckCheck,
  ChevronDown,
  Copy,
  History,
  Link2,
  Loader2,
  Lock,
  MapPin,
  Plus,
  Receipt,
  RefreshCw,
  Repeat,
  Search,
  Send,
  User,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogCloseButton } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import api, { fetchBranchesList, fetchBusinesses, type Business } from '@/lib/api';
import type { ChildWithDetails } from '@/types/customer';
import {
  cardLinkAction,
  createCardLink,
  fetchCardLinkOptions,
  fetchCardLinks,
  formatShekels,
  type CardLink,
  type CardLinkInput,
  type CardLinkKind,
  type CardLinkOption,
  type CardLinkQuote,
} from '@/lib/paymentLinksApi';
import styles from './SendCardLinkDialog.module.css';

interface SendCardLinkDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  child: ChildWithDetails;
}

type LessonRow = {
  id: string;
  course_name?: string;
  day_of_week: number;
  start_time?: string | null;
  end_time?: string | null;
  instructor_name?: string | null;
  course?: string;
};

type BranchRow = { id: string; name: string };

const DAYS = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

const STATUS_LABEL: Record<CardLink['status'], string> = {
  pending: 'ממתין להורה',
  processing: 'בעיבוד',
  completed: 'מומש',
  review: 'לבדיקה',
  cancelled: 'בוטל',
};

const STATUS_CLASS: Record<CardLink['status'], string> = {
  pending: styles.statusPending,
  processing: styles.statusProcessing,
  completed: styles.statusCompleted,
  review: styles.statusReview,
  cancelled: styles.statusCancelled,
};

const REASON_LABELS: Record<string, string> = {
  no_parent_phone: 'אין טלפון להורה',
  manychat_not_configured: 'ManyChat לא מוגדר',
  no_token: 'הכרטיס לא נשמר (אין טוקן) — לטיפול המשרד',
  no_standing_order: 'הוראת הקבע לא נפתחה — לטיפול המשרד',
  gateway_uncertain: 'הסליקה לא ענתה בוודאות — לבדוק מול Tranzila',
  record_failed: 'החיוב עבר אך הרישום נכשל — לטיפול המשרד',
  stale_processing: 'חיוב שלא הסתיים — לבדוק מול Tranzila',
  // What ManyChat answers when a WhatsApp send does not go out (manychat_service.notify_registration).
  lookup_failed: 'איתור ההורה ב-ManyChat נכשל',
  no_subscriber_id: 'ההורה לא נמצא ב-ManyChat',
  send_flow_failed: 'שליחת תבנית ה-WhatsApp נכשלה',
  send_text_failed: 'שליחת הודעת ה-WhatsApp נכשלה',
};

/** How many earlier links show before "show all" — the list is history, not the task. */
const LINKS_PREVIEW = 4;

function reasonLabel(raw: string) {
  const key = raw.split(':')[0];
  if (REASON_LABELS[key]) return REASON_LABELS[key];
  return /[\u0590-\u05ff]/.test(raw) ? raw : 'שגיאת סליקה (פרטים ביומן)';
}

/**
 * Why a WhatsApp send did not go out. The known reason wins over `error`,
 * which is ManyChat's own English text and no use to the office.
 */
function whatsappFailure(result: CardLink['whatsapp']) {
  const known = result?.reason ? REASON_LABELS[result.reason] : undefined;
  if (known) return known;
  const raw = result?.error || result?.reason || '';
  if (!raw) return 'ManyChat לא מוגדר';
  return /[\u0590-\u05ff]/.test(raw) ? raw : 'השליחה נכשלה (פרטים ביומן)';
}

function whatsappOutcome(result: NonNullable<CardLink['whatsapp']>) {
  if (result.sent) return result.method === 'text' ? 'נשלח כהודעת טקסט (ללא תבנית)' : 'נשלח ב-WhatsApp';
  return `לא נשלח: ${whatsappFailure(result)}`;
}

function lessonLabel(l: LessonRow) {
  const time = [l.start_time, l.end_time].filter(Boolean).map((t) => String(t).slice(0, 5)).join('–');
  return [l.course_name, DAYS[l.day_of_week], time, l.instructor_name].filter(Boolean).join(' · ');
}

function formatDay(iso?: string | null) {
  if (!iso) return '';
  return new Date(`${iso}T00:00:00`).toLocaleDateString('he-IL');
}

function formatStamp(iso: string) {
  return new Date(iso).toLocaleDateString('he-IL');
}

function errorMessage(err: unknown, fallback: string) {
  return (err as { response?: { data?: { error?: string } } })?.response?.data?.error || fallback;
}

/**
 * Only a priced unit with no standing order on it can become a link the parent
 * can pay: the server refuses the one, and the parent's page cannot charge the other.
 */
function isSelectable(option: CardLinkOption) {
  return !option.has_standing_order && Boolean(option.quote) && !option.quote_error;
}

/**
 * The options are quoted with the registration fee in, so an unticked box takes
 * it off here. A paid trial's credit is capped at the charge on the server, so
 * the honest floor is zero; the ticket then shows the server's own figure.
 */
function firstChargeFor(quote: CardLinkQuote, includeFee: boolean) {
  const first = Number(quote.first_charge);
  if (includeFee || !Number.isFinite(first)) return first;
  return Math.max(0, Math.round((first - Number(quote.registration_fee || 0)) * 100) / 100);
}

/** 'https://crm…' and '/c/Xa9kQ2mP7z', so the part that is the link can carry the weight. */
function splitUrl(url: string) {
  try {
    const parsed = new URL(url);
    return { host: `${parsed.protocol}//${parsed.host}`, path: `${parsed.pathname}${parsed.search}` };
  } catch {
    return { host: '', path: url };
  }
}

function enrolledWord(gender: ChildWithDetails['gender']) {
  if (gender === 'male') return 'רשום';
  if (gender === 'female') return 'רשומה';
  return 'רשום/ה';
}

function instructorsOf(option: CardLinkOption) {
  return Array.from(new Set(option.sessions.map((s) => s.instructor_name).filter(Boolean))).join(' · ');
}

function optionSummary(option: CardLinkOption) {
  return option.sessions.length > 1 ? `${option.course_name} · ${option.frequency_label}` : option.label || option.course_name;
}

/**
 * One unit the office can bill — a lesson, or a whole twice-a-week track — as a
 * radio card. The price stub leads (the right edge, in RTL), the way the
 * parent's page leads with the amount.
 */
function OptionCard({
  option,
  checked,
  focusable,
  includeFee,
  enrolledLabel,
  buttonRef,
  onSelect,
  onKeyDown,
}: {
  option: CardLinkOption;
  checked: boolean;
  focusable: boolean;
  includeFee: boolean;
  enrolledLabel: string;
  buttonRef: (el: HTMLButtonElement | null) => void;
  onSelect: () => void;
  onKeyDown: (e: KeyboardEvent<HTMLButtonElement>) => void;
}) {
  const selectable = isSelectable(option);
  const track = option.sessions.length > 1;
  const instructors = instructorsOf(option);
  const quote = option.quote && !option.quote_error ? option.quote : null;
  const priceText = option.has_standing_order
    ? 'כבר יש הוראת קבע'
    : quote
      ? `${formatShekels(quote.monthly_amount)} לחודש, ${formatShekels(firstChargeFor(quote, includeFee))} לחיוב עכשיו`
      : option.quote_error || 'אין מחיר';

  return (
    <button
      ref={buttonRef}
      type="button"
      role="radio"
      aria-checked={checked}
      aria-label={[option.label, option.branch_name, option.enrolled ? enrolledLabel : '', option.is_trial ? 'ניסיון' : '', priceText]
        .filter(Boolean)
        .join(' · ')}
      disabled={!selectable}
      tabIndex={focusable ? 0 : -1}
      className={styles.option}
      onClick={onSelect}
      onKeyDown={onKeyDown}
    >
      {option.has_standing_order ? (
        <span className={`${styles.stub} ${styles.stubBlocked}`}>
          <Lock className="h-4 w-4" aria-hidden />
          כבר יש הוראת קבע
        </span>
      ) : quote ? (
        <span className={styles.stub}>
          <span className={styles.stubAmount}>{formatShekels(quote.monthly_amount)}</span>
          <span className={styles.stubPer}>לחודש</span>
          <span className={styles.stubNow}>
            <b>{formatShekels(firstChargeFor(quote, includeFee))}</b> לחיוב עכשיו
          </span>
        </span>
      ) : (
        <span className={`${styles.stub} ${styles.stubError}`}>
          <AlertTriangle className="h-4 w-4" aria-hidden />
          אין מחיר לשליחה
        </span>
      )}

      <span className={styles.details}>
        <span className={styles.optionHead}>
          <span className={styles.course}>{option.course_name}</span>
          <span className={`${styles.pill} ${track ? styles.pillTrack : styles.pillFreq}`}>
            {track ? <Repeat className="h-3 w-3" aria-hidden /> : null}
            {option.frequency_label}
          </span>
          {option.enrolled ? <span className={`${styles.pill} ${styles.pillEnrolled}`}>{enrolledLabel}</span> : null}
          {option.is_trial ? <span className={`${styles.pill} ${styles.pillTrial}`}>ניסיון</span> : null}
        </span>

        {option.sessions.length > 0 ? (
          <span className={styles.chips}>
            {option.sessions.map((s) => (
              <span
                key={s.lesson_id}
                className={styles.chip}
                title={[`${s.day_name} ${s.start_time}${s.end_time ? `–${s.end_time}` : ''}`, s.instructor_name].filter(Boolean).join(' · ')}
              >
                {s.day_name} {s.start_time}
              </span>
            ))}
          </span>
        ) : null}

        {option.branch_name || instructors ? (
          <span className={styles.meta}>
            {option.branch_name ? (
              <span className={styles.metaItem}>
                <MapPin className="h-3.5 w-3.5" aria-hidden />
                {option.branch_name}
              </span>
            ) : null}
            {instructors ? (
              <span className={styles.metaItem}>
                <User className="h-3.5 w-3.5" aria-hidden />
                {instructors}
              </span>
            ) : null}
          </span>
        ) : null}

        {option.has_standing_order ? (
          <span className={styles.optionNote}>כבר מחויב בהוראת קבע פעילה — קישור חדש יידחה.</span>
        ) : option.quote_error ? (
          <span className={`${styles.optionNote} ${styles.optionNoteError}`}>{option.quote_error}</span>
        ) : null}
      </span>

      <span className={styles.check} aria-hidden>
        <Check className="h-3.5 w-3.5" strokeWidth={3} />
      </span>
    </button>
  );
}

/** Two cards in the options' own shape, so nothing jumps when they land. */
function OptionsSkeleton() {
  return (
    <div className={styles.group} aria-busy="true" aria-label="טוען חוגים">
      {[0, 1].map((i) => (
        <div key={i} className={styles.skeletonCard}>
          <div className={styles.skeletonStub}>
            <Skeleton className="h-6 w-20" />
            <Skeleton className="h-3 w-14" />
          </div>
          <div className={styles.skeletonDetails}>
            <Skeleton className="h-4 w-1/2" />
            <div className="flex gap-2">
              <Skeleton className="h-6 w-20 rounded-lg" />
              <Skeleton className="h-6 w-20 rounded-lg" />
            </div>
            <Skeleton className="h-3 w-1/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The link once it exists: what it bills, the short URL big enough to read
 * off the screen, and below the tear line what the parent will be charged.
 */
function Ticket({ link, childName, copied, onCopy }: { link: CardLink; childName: string; copied: boolean; onCopy: () => void }) {
  const sto = link.kind === 'standing_order';
  const { host, path } = splitUrl(link.public_url);
  const quote = link.quote;

  return (
    <section className={styles.ticket} aria-label="הקישור שנוצר">
      <div className={styles.ticketTop}>
        <span className={styles.ticketEyebrow}>
          <CheckCheck className="h-4 w-4" aria-hidden />
          הקישור מוכן
        </span>
        <p className={styles.ticketTitle}>{sto ? link.lesson_label || 'הוראת קבע' : link.description}</p>
        <p className={styles.ticketSub}>
          {childName} · {sto ? 'הוראת קבע חודשית' : 'חיוב חד-פעמי'}
        </p>
      </div>

      <div className={styles.linkWrap}>
        <p className={styles.linkLabel}>הקישור שההורה יקבל</p>
        <div className={styles.linkPill} dir="ltr">
          <a className={styles.linkUrl} href={link.public_url} target="_blank" rel="noopener noreferrer" title="פתיחת העמוד שההורה יראה">
            {host ? <span className={styles.urlHost}>{host}</span> : null}
            {/* On a narrow screen the line breaks here, never inside the token. */}
            <wbr />
            <span className={styles.urlPath}>{path}</span>
          </a>
          <button
            type="button"
            className={styles.copyBtn}
            data-copied={copied}
            onClick={onCopy}
            aria-label={copied ? 'הקישור הועתק' : 'העתק קישור'}
            title="העתק קישור"
          >
            {copied ? <Check className="h-5 w-5" aria-hidden /> : <Copy className="h-5 w-5" aria-hidden />}
          </button>
        </div>
      </div>

      <div className={styles.perforation} aria-hidden />

      {sto ? (
        quote ? (
          <div className={styles.ticketStub}>
            <div className={`${styles.tile} ${styles.tileHero}`}>
              <span className={styles.tileLabel}>לחיוב עכשיו</span>
              <span className={styles.tileValue}>{formatShekels(quote.first_charge)}</span>
            </div>
            <div className={styles.tile}>
              <span className={styles.tileLabel}>חודשי</span>
              <span className={styles.tileValue}>{formatShekels(quote.monthly_amount)}</span>
            </div>
            <div className={styles.tile}>
              <span className={styles.tileLabel}>דמי רישום</span>
              <span className={styles.tileValue}>{formatShekels(quote.registration_fee)}</span>
            </div>
            <div className={styles.tile}>
              <span className={styles.tileLabel}>החיוב הבא</span>
              <span className={styles.tileValue}>{formatDay(quote.next_billing_date)}</span>
            </div>
          </div>
        ) : null
      ) : (
        <div className={`${styles.ticketStub} ${styles.ticketStubSingle}`}>
          <div className={`${styles.tile} ${styles.tileHero}`}>
            <span className={styles.tileLabel}>לתשלום</span>
            <span className={styles.tileValue}>{formatShekels(link.amount || 0)}</span>
          </div>
          <p className={styles.ticketNote}>חיוב חד-פעמי. הכרטיס לא יישמר.</p>
        </div>
      )}

      {link.quote_error ? <p className={`${styles.errorBox} ${styles.ticketInset}`}>{link.quote_error}</p> : null}

      {link.whatsapp ? (
        <p className={`${styles.sendState} ${link.whatsapp.sent ? styles.sendOk : styles.sendFail}`} role="status">
          {link.whatsapp.sent ? <CheckCheck className="h-4 w-4" aria-hidden /> : <AlertTriangle className="h-4 w-4" aria-hidden />}
          {whatsappOutcome(link.whatsapp)}
        </p>
      ) : null}
    </section>
  );
}

function LinkRow({
  link,
  isNew,
  busy,
  onCopy,
  onSend,
  onCancel,
}: {
  link: CardLink;
  isNew: boolean;
  busy: boolean;
  onCopy: () => void;
  onSend: () => void;
  onCancel: () => void;
}) {
  const sto = link.kind === 'standing_order';
  const title = sto ? link.lesson_label : `${link.description} · ${formatShekels(link.amount || 0)}`;
  const problems = [link.last_error, link.review_reason].filter(Boolean).map(reasonLabel);

  return (
    <li className={`${styles.linkRow} ${isNew ? styles.linkRowNew : ''}`}>
      <span className={`${styles.rowIcon} ${sto ? '' : styles.rowIconOneTime}`} aria-hidden>
        {sto ? <Repeat className="h-4 w-4" /> : <Receipt className="h-4 w-4" />}
      </span>
      <div className={styles.rowMain}>
        <p className={styles.rowTitle} title={title}>
          <span className={styles.rowKind}>{sto ? 'הוראת קבע' : 'חד-פעמי'}</span>
          {title ? ` · ${title}` : ''}
        </p>
        <p className={styles.rowMeta}>
          {formatStamp(link.created_at)}
          {link.sent_at ? ` · נשלח ${formatStamp(link.sent_at)}` : ''}
          {problems.length > 0 ? <span className={styles.rowWarn}> · {problems.join(' · ')}</span> : null}
        </p>
      </div>
      <span className={`${styles.status} ${STATUS_CLASS[link.status]}`}>{STATUS_LABEL[link.status]}</span>
      {link.status === 'pending' ? (
        <div className={styles.rowActions}>
          <button type="button" className={styles.iconBtn} onClick={onCopy} disabled={!link.public_url} aria-label="העתק קישור" title="העתק קישור">
            <Copy className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" className={styles.iconBtn} onClick={onSend} disabled={busy} aria-label="שלח ב-WhatsApp" title="שלח ב-WhatsApp">
            <Send className="h-4 w-4" aria-hidden />
          </button>
          <button type="button" className={`${styles.iconBtn} ${styles.iconBtnDanger}`} onClick={onCancel} aria-label="בטל קישור" title="בטל קישור">
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>
      ) : null}
    </li>
  );
}

/**
 * The office sends the parent a link to enter a card: either to open a
 * standing order (priced like a signup) or to take a one-time charge.
 *
 * A standing order is picked from what the child can actually be billed for —
 * the tracks and lessons they are on (a twice-a-week track as one unit, at its
 * combined price), then the tracks their courses offer — each already priced.
 * Any other lesson stays one fold away. Creating shows the short link as a
 * ticket; sending it is a separate, confirmed click.
 */
export default function SendCardLinkDialog({ open, onOpenChange, child }: SendCardLinkDialogProps) {
  const [kind, setKind] = useState<CardLinkKind>('standing_order');
  // null while loading; [] with optionsFailed when the request did not come back.
  const [options, setOptions] = useState<CardLinkOption[] | null>(null);
  const [optionsFailed, setOptionsFailed] = useState(false);
  const [selectedKey, setSelectedKey] = useState('');
  const [otherOpen, setOtherOpen] = useState(false);
  const [lessons, setLessons] = useState<LessonRow[] | null>(null);
  const [otherLessonId, setOtherLessonId] = useState('');
  const [includeFee, setIncludeFee] = useState(true);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [branchId, setBranchId] = useState('');
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [businessId, setBusinessId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [links, setLinks] = useState<CardLink[]>([]);
  const [showAllLinks, setShowAllLinks] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<CardLink | null>(null);
  const [copiedUrl, setCopiedUrl] = useState('');

  const optionsRequest = useRef(0);
  const lessonsRequested = useRef(false);
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const copiedTimer = useRef<number | null>(null);

  const loadLinks = useCallback(async () => {
    try {
      setLinks(await fetchCardLinks(child.id));
    } catch {
      /* the list is informational */
    }
  }, [child.id]);

  const loadOptions = useCallback(async () => {
    // A reopen, or a move to a sibling, can overtake a slow answer; only the latest may land.
    const request = ++optionsRequest.current;
    setOptions(null);
    setOptionsFailed(false);
    try {
      const rows = await fetchCardLinkOptions(child.id);
      if (request !== optionsRequest.current) return;
      setOptions(rows);
      // What the child is on today and can still be billed for — never an upgrade by default.
      setSelectedKey(rows.find((o) => o.enrolled && isSelectable(o))?.key ?? '');
      // Nothing to offer: the only way forward is another lesson, so open that fold.
      if (rows.length === 0) setOtherOpen(true);
    } catch {
      if (request !== optionsRequest.current) return;
      setOptions([]);
      setOptionsFailed(true);
    }
  }, [child.id]);

  // Every lesson in the system is a heavy list the common case never needs;
  // it is fetched only once the "another course" fold is opened.
  const ensureLessons = useCallback(async () => {
    if (lessonsRequested.current) return;
    lessonsRequested.current = true;
    try {
      const res = await api.get('/courses/lessons/');
      setLessons((res.data?.results ?? res.data ?? []) as LessonRow[]);
    } catch {
      lessonsRequested.current = false;
      setLessons([]);
      toast.error('שגיאה בטעינת שיעורים');
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setError('');
    setCreated(null);
    setAmount('');
    setDescription('');
    setKind('standing_order');
    setIncludeFee(true);
    setSelectedKey('');
    setOtherOpen(false);
    setOtherLessonId('');
    setShowAllLinks(false);
    setBranchId('');
    setBusinessId('');
    setCategoryId('');
    lessonsRequested.current = false;
    setLessons(null);
    void loadLinks();
    void loadOptions();
    (async () => {
      try {
        const [bizRows, branchRows] = await Promise.all([fetchBusinesses(), fetchBranchesList()]);
        setBusinesses(bizRows.filter((b) => b.is_active));
        setBranches((branchRows as BranchRow[]) ?? []);
      } catch {
        toast.error('שגיאה בטעינת עסקים וסניפים');
      }
    })();
  }, [open, child.id, loadLinks, loadOptions]);

  useEffect(() => {
    if (open && kind === 'standing_order' && otherOpen) void ensureLessons();
  }, [open, kind, otherOpen, ensureLessons]);

  useEffect(
    () => () => {
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
    },
    [],
  );

  const categories = useMemo(
    () => businesses.find((b) => b.id === businessId)?.categories.filter((c) => c.is_active) ?? [],
    [businesses, businessId],
  );

  const enrolledIds = useMemo(
    () => new Set((child.enrollments || []).map((e) => e.lesson_id).filter(Boolean) as string[]),
    [child.enrollments],
  );
  const sortedLessons = useMemo(
    () => [...(lessons ?? [])].sort((a, b) => Number(enrolledIds.has(b.id)) - Number(enrolledIds.has(a.id))),
    [lessons, enrolledIds],
  );

  const enrolledLabel = enrolledWord(child.gender);
  // The server already orders them: what the child is on first, upgrades after.
  const groups = useMemo(
    () =>
      [
        { id: 'enrolled', title: `${enrolledLabel} כרגע`, rows: (options ?? []).filter((o) => o.enrolled) },
        { id: 'more', title: 'מסלולים נוספים בחוג', rows: (options ?? []).filter((o) => !o.enrolled) },
      ].filter((group) => group.rows.length > 0),
    [options, enrolledLabel],
  );
  // Arrow keys walk the cards in the order they are drawn, past the ones that cannot be sent.
  const selectableKeys = useMemo(
    () => groups.flatMap((group) => group.rows).filter(isSelectable).map((o) => o.key),
    [groups],
  );
  const selectedOption = options?.find((o) => o.key === selectedKey) ?? null;
  const otherLesson = otherLessonId ? sortedLessons.find((l) => l.id === otherLessonId) ?? null : null;
  const tabStop = selectableKeys.includes(selectedKey) ? selectedKey : selectableKeys[0] ?? '';
  const parentPhone = child.parent_phone || child.family_phone;
  const visibleLinks = showAllLinks ? links : links.slice(0, LINKS_PREVIEW);

  const chooseOption = (key: string) => {
    setSelectedKey(key);
    setOtherLessonId('');
    setError('');
  };

  const chooseOtherLesson = (id: string) => {
    setOtherLessonId(id);
    if (id) setSelectedKey('');
    setError('');
  };

  const onCardKeyDown = (e: KeyboardEvent<HTMLButtonElement>, key: string) => {
    const count = selectableKeys.length;
    if (!count) return;
    const at = selectableKeys.indexOf(key);
    let next: number;
    // RTL: the next card along is to the left.
    if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') next = (at + 1) % count;
    else if (e.key === 'ArrowUp' || e.key === 'ArrowRight') next = (at - 1 + count) % count;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = count - 1;
    else return;
    e.preventDefault();
    const target = selectableKeys[next];
    chooseOption(target);
    cardRefs.current.get(target)?.focus();
  };

  const switchKind = (next: CardLinkKind) => {
    setKind(next);
    setCreated(null);
    setError('');
  };

  const create = async () => {
    setError('');
    let input: CardLinkInput;
    if (kind === 'standing_order') {
      if (otherLessonId) {
        input = { kind: 'standing_order', child_id: child.id, lesson_id: otherLessonId, include_registration_fee: includeFee };
      } else if (selectedOption && isSelectable(selectedOption)) {
        // A track goes by its bundle: the server hangs it on the first day and bills the combined price.
        input =
          selectedOption.kind === 'bundle' && selectedOption.bundle_id
            ? { kind: 'standing_order', child_id: child.id, bundle_id: selectedOption.bundle_id, include_registration_fee: includeFee }
            : { kind: 'standing_order', child_id: child.id, lesson_id: selectedOption.lesson_id, include_registration_fee: includeFee };
      } else {
        setError('יש לבחור חוג או מסלול');
        return;
      }
    } else {
      const n = Number(amount);
      if (!Number.isFinite(n) || n < 1) {
        setError('סכום לא תקין');
        return;
      }
      if (description.trim().length < 2) {
        setError('יש להזין תיאור לחיוב');
        return;
      }
      input = {
        kind: 'one_time',
        child_id: child.id,
        amount: n.toFixed(2),
        description: description.trim(),
        branch_id: branchId || null,
        business_id: businessId || null,
        business_category_id: categoryId || null,
      };
    }
    setBusy(true);
    try {
      const saved = await createCardLink(input);
      setCreated(saved);
      await loadLinks();
      toast.success('הקישור נוצר');
    } catch (err: unknown) {
      setError(errorMessage(err, 'יצירת הקישור נכשלה'));
    } finally {
      setBusy(false);
    }
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('הקישור הועתק');
      setCopiedUrl(url);
      if (copiedTimer.current) window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopiedUrl(''), 1800);
    } catch {
      toast.error('ההעתקה נכשלה');
    }
  };

  const send = async (link: CardLink) => {
    if (!window.confirm(`לשלוח את הקישור ב-WhatsApp להורה של ${child.full_name}?`)) return;
    setBusy(true);
    try {
      const updated = await cardLinkAction(link.id, 'send');
      if (updated.whatsapp?.sent) toast.success('נשלח ב-WhatsApp');
      else toast.error(`לא נשלח: ${whatsappFailure(updated.whatsapp)}`);
      // The send answer carries no quote; keep what the create answer showed.
      setCreated((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
      await loadLinks();
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'השליחה נכשלה'));
    } finally {
      setBusy(false);
    }
  };

  const cancel = async (link: CardLink) => {
    if (!window.confirm('לבטל את הקישור? ההורה לא יוכל להשתמש בו יותר.')) return;
    try {
      await cardLinkAction(link.id, 'cancel');
      if (created?.id === link.id) setCreated(null);
      await loadLinks();
    } catch (err: unknown) {
      toast.error(errorMessage(err, 'הביטול נכשל'));
    }
  };

  const summary = (() => {
    if (kind === 'one_time') {
      const n = Number(amount);
      return amount.trim() && Number.isFinite(n) && n >= 1 ? (
        <span className={styles.summaryValue}>
          <b>{formatShekels(n)}</b>
          {description.trim() ? ` · ${description.trim()}` : ''}
        </span>
      ) : (
        <span className={`${styles.summaryValue} ${styles.summaryEmpty}`}>הזינו סכום ותיאור</span>
      );
    }
    if (otherLesson) return <span className={styles.summaryValue}>{lessonLabel(otherLesson)}</span>;
    if (selectedOption?.quote) {
      return (
        <span className={styles.summaryValue}>
          {optionSummary(selectedOption)} · <b>{formatShekels(firstChargeFor(selectedOption.quote, includeFee))}</b> עכשיו
        </span>
      );
    }
    return <span className={`${styles.summaryValue} ${styles.summaryEmpty}`}>בחרו חוג או מסלול</span>;
  })();

  return (
    <Dialog open={open} onOpenChange={(next) => !busy && onOpenChange(next)}>
      {/* The panel only frames; .body inside is what scrolls, between a fixed header and footer.
          min-w-0: the panel is a flex item of the overlay, and without it the one-line texts
          inside (row titles, the summary) would push it wider than a phone screen. */}
      <DialogContent className="max-w-2xl min-w-0 max-h-[90vh] flex flex-col !overflow-hidden sm:!rounded-[18px]" dir="rtl">
        <div className={styles.shell}>
          <header className={styles.header}>
            <div className={styles.headerRow}>
              <span className={styles.badge} aria-hidden>
                <Link2 className="h-5 w-5" />
              </span>
              <div className={styles.headerText}>
                <p className={styles.eyebrow}>קישור להזנת כרטיס</p>
                <h2 className={styles.title}>{child.full_name}</h2>
                {child.parent_name || parentPhone ? (
                  <p className={styles.parent}>
                    {child.parent_name ? `הורה: ${child.parent_name}` : 'הורה'}
                    {parentPhone ? (
                      <>
                        {' · '}
                        <bdi dir="ltr">{parentPhone}</bdi>
                      </>
                    ) : null}
                  </p>
                ) : null}
              </div>
              <div className={styles.close}>
                <DialogCloseButton />
              </div>
            </div>

            <div className={styles.switch} role="radiogroup" aria-label="סוג הקישור">
              {(['standing_order', 'one_time'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  className={styles.switchOption}
                  onClick={() => switchKind(k)}
                >
                  {k === 'standing_order' ? <Repeat className="h-4 w-4" aria-hidden /> : <Receipt className="h-4 w-4" aria-hidden />}
                  {k === 'standing_order' ? 'הוראת קבע לחוג' : 'חיוב חד-פעמי'}
                </button>
              ))}
            </div>
          </header>

          <div className={styles.body}>
            {created ? (
              <Ticket
                link={created}
                childName={child.full_name}
                copied={copiedUrl === created.public_url}
                onCopy={() => void copy(created.public_url)}
              />
            ) : kind === 'standing_order' ? (
              <div className={`${styles.section} ${styles.rise}`}>
                <div className={styles.sectionHead}>
                  <h3 className={styles.sectionTitle}>על מה תיפתח הוראת הקבע</h3>
                  <p className={styles.sectionHint}>המחיר מחושב כמו בהרשמה רגילה</p>
                </div>

                {options === null ? (
                  <OptionsSkeleton />
                ) : optionsFailed ? (
                  <div className={styles.empty} role="alert">
                    <span className={`${styles.emptyIcon} ${styles.emptyIconError}`}>
                      <AlertTriangle className="h-5 w-5" aria-hidden />
                    </span>
                    <p className={styles.emptyTitle}>החוגים של {child.first_name} לא נטענו</p>
                    <p className={styles.emptyText}>אפשר לנסות שוב, או לבחור חוג אחר מהרשימה המלאה.</p>
                    <button type="button" className={styles.retry} onClick={() => void loadOptions()}>
                      <RefreshCw className="h-4 w-4" aria-hidden />
                      נסו שוב
                    </button>
                  </div>
                ) : options.length === 0 ? (
                  <div className={styles.empty}>
                    <span className={styles.emptyIcon}>
                      <CalendarDays className="h-5 w-5" aria-hidden />
                    </span>
                    <p className={styles.emptyTitle}>אין חוגים פעילים — בחרו חוג אחר</p>
                    <p className={styles.emptyText}>
                      {child.first_name} לא {enrolledLabel} כרגע לאף שיעור. אפשר לשלוח קישור לכל שיעור מהרשימה המלאה.
                    </p>
                  </div>
                ) : (
                  <div className={styles.group} role="radiogroup" aria-label="חוג או מסלול להוראת הקבע">
                    {groups.map((group) => (
                      <div
                        key={group.id}
                        className={styles.group}
                        role={groups.length > 1 ? 'group' : undefined}
                        aria-labelledby={groups.length > 1 ? `cl-group-${group.id}` : undefined}
                      >
                        {/* Headings only earn their place when there is something to tell apart. */}
                        {groups.length > 1 ? (
                          <p id={`cl-group-${group.id}`} className={styles.groupTitle}>
                            {group.title}
                          </p>
                        ) : null}
                        {group.rows.map((option) => (
                          <OptionCard
                            key={option.key}
                            option={option}
                            checked={!otherLessonId && option.key === selectedKey}
                            focusable={option.key === tabStop}
                            includeFee={includeFee}
                            enrolledLabel={enrolledLabel}
                            buttonRef={(el) => {
                              if (el) cardRefs.current.set(option.key, el);
                              else cardRefs.current.delete(option.key);
                            }}
                            onSelect={() => chooseOption(option.key)}
                            onKeyDown={(e) => onCardKeyDown(e, option.key)}
                          />
                        ))}
                      </div>
                    ))}
                  </div>
                )}

                {options !== null ? (
                  <div className={`${styles.other} ${otherLessonId ? styles.otherActive : ''}`}>
                    <button
                      type="button"
                      className={styles.otherToggle}
                      aria-expanded={otherOpen}
                      aria-controls="cl-other"
                      onClick={() => setOtherOpen((value) => !value)}
                    >
                      <Search className={`h-4 w-4 ${styles.otherIcon}`} aria-hidden />
                      <span>חוג אחר…</span>
                      <span className={`${styles.otherHint} ${otherLesson ? styles.otherHintChosen : ''}`}>
                        {otherLesson ? lessonLabel(otherLesson) : 'כל שיעור במערכת, גם כזה שהילד לא רשום אליו'}
                      </span>
                      <ChevronDown className={`h-4 w-4 ${styles.chevron}`} aria-hidden />
                    </button>
                    <div id="cl-other" className={styles.otherBody} hidden={!otherOpen}>
                      <label className={styles.label} htmlFor="cl-lesson">שיעור</label>
                      <select
                        id="cl-lesson"
                        className={styles.input}
                        value={otherLessonId}
                        onChange={(e) => chooseOtherLesson(e.target.value)}
                        disabled={lessons === null}
                      >
                        <option value="" disabled>
                          {lessons === null ? 'טוען שיעורים…' : 'בחרו שיעור'}
                        </option>
                        {sortedLessons.map((l) => (
                          <option key={l.id} value={l.id}>
                            {enrolledIds.has(l.id) ? '★ ' : ''}
                            {lessonLabel(l)}
                          </option>
                        ))}
                      </select>
                      <p className={styles.otherNote}>
                        ★ = הילד רשום לשיעור. אם כבר יש לו הוראת קבע לשיעור — השרת ידחה. המחיר מחושב כמו בהרשמה רגילה: יחסי לחודש + דמי רישום אם עוד לא שולמו.
                      </p>
                    </div>
                  </div>
                ) : null}

                <label className={styles.fee}>
                  <input type="checkbox" checked={includeFee} onChange={(e) => setIncludeFee(e.target.checked)} />
                  <span className={styles.feeText}>לגבות דמי רישום (אם עוד לא שולמו לילד)</span>
                  {!otherLessonId && selectedOption?.quote && Number(selectedOption.quote.registration_fee) > 0 ? (
                    <span className={styles.feeAmount}>{formatShekels(selectedOption.quote.registration_fee)}</span>
                  ) : null}
                </label>
              </div>
            ) : (
              <div className={`${styles.formCard} ${styles.rise}`}>
                <div className={styles.grid2}>
                  <div>
                    <label className={styles.label} htmlFor="cl-amount">סכום (₪)</label>
                    <div className={styles.money}>
                      <span className={styles.moneySign} aria-hidden>₪</span>
                      <input
                        id="cl-amount"
                        className={styles.input}
                        inputMode="decimal"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                      />
                    </div>
                  </div>
                  <div>
                    <label className={styles.label} htmlFor="cl-desc">עבור מה</label>
                    <input
                      id="cl-desc"
                      className={styles.input}
                      placeholder="לדוגמה: חולצת קבוצה"
                      value={description}
                      onChange={(e) => setDescription(e.target.value)}
                    />
                  </div>
                </div>
                <div className={styles.grid3}>
                  <div>
                    <label className={styles.label} htmlFor="cl-branch">סניף</label>
                    <select id="cl-branch" className={styles.input} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                      <option value="">סניף המשפחה</option>
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={styles.label} htmlFor="cl-business">עסק</label>
                    <select
                      id="cl-business"
                      className={styles.input}
                      value={businessId}
                      onChange={(e) => {
                        setBusinessId(e.target.value);
                        setCategoryId('');
                      }}
                    >
                      <option value="">ללא (סניף)</option>
                      {businesses.map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={styles.label} htmlFor="cl-category">קטגוריה</label>
                    <select
                      id="cl-category"
                      className={styles.input}
                      value={categoryId}
                      onChange={(e) => setCategoryId(e.target.value)}
                      disabled={!businessId || categories.length === 0}
                    >
                      <option value="">{categories.length ? 'ללא קטגוריה' : '—'}</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <p className={styles.formNote}>חיוב חד-פעמי. הכרטיס לא יישמר.</p>
              </div>
            )}

            {links.length > 0 ? (
              <section className={styles.section} aria-labelledby="cl-links-title">
                <div className={styles.sectionHead}>
                  <h3 id="cl-links-title" className={styles.sectionTitle}>
                    <History className="h-4 w-4" aria-hidden />
                    קישורים קודמים של הילד
                  </h3>
                </div>
                <ul className={styles.linkList}>
                  {visibleLinks.map((l) => (
                    <LinkRow
                      key={l.id}
                      link={l}
                      isNew={l.id === created?.id}
                      busy={busy}
                      onCopy={() => void copy(l.public_url)}
                      onSend={() => void send(l)}
                      onCancel={() => void cancel(l)}
                    />
                  ))}
                </ul>
                {links.length > LINKS_PREVIEW ? (
                  <button type="button" className={styles.moreBtn} aria-expanded={showAllLinks} onClick={() => setShowAllLinks((value) => !value)}>
                    {showAllLinks ? 'הצג פחות' : `הצג את כל ${links.length} הקישורים`}
                  </button>
                ) : null}
              </section>
            ) : null}
          </div>

          <footer className={styles.footer}>
            {error ? (
              <p className={styles.errorBox} role="alert">
                {error}
              </p>
            ) : null}
            {created ? (
              <div className={styles.actions}>
                <button
                  type="button"
                  className={styles.ghost}
                  onClick={() => {
                    setCreated(null);
                    setError('');
                  }}
                  disabled={busy}
                >
                  <Plus className="h-4 w-4" aria-hidden />
                  קישור נוסף
                </button>
                <button type="button" className={styles.secondary} onClick={() => void copy(created.public_url)}>
                  <Copy className="h-4 w-4" aria-hidden />
                  העתק קישור
                </button>
                <button type="button" className={styles.primary} onClick={() => void send(created)} disabled={busy}>
                  {busy ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> : <Send className="h-4 w-4" aria-hidden />}
                  שלח ב-WhatsApp
                </button>
              </div>
            ) : (
              <div className={styles.footerRow}>
                <div className={styles.summary} aria-live="polite">
                  <span className={styles.summaryLabel}>{kind === 'standing_order' ? 'נבחר' : 'לחיוב'}</span>
                  {summary}
                </div>
                <div className={styles.actions}>
                  <button type="button" className={styles.primary} onClick={() => void create()} disabled={busy}>
                    {busy ? <Loader2 className="h-4 w-4 motion-safe:animate-spin" aria-hidden /> : <Link2 className="h-4 w-4" aria-hidden />}
                    {busy ? 'יוצר…' : 'צור קישור'}
                  </button>
                </div>
              </div>
            )}
          </footer>
        </div>
      </DialogContent>
    </Dialog>
  );
}
