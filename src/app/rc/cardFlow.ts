import { israeliIdFieldError } from '@/lib/israeliId';
import type { CardDetails, CardPagePreview, CardSubmitResult } from '@/lib/rentalBillingApi';
import { formatDay } from '@/lib/signatureUtils';
import type { CardFieldValues } from '../card-link/CardFields';
import { INVALID_LINK_TEXT, moneyText, serverErrorText } from '../s/signingFlow';

// ---------------------------------------------------------------------------
// The tenant's card page for their standing order (/rc/<token>), pure — so
// cardFlow.test.ts can pin it down without a browser: which screen shows for
// every answer the server can give, when the button unlocks, what is sent,
// and how the charge of the day reads. Where the order and the link stand is
// the server's to say; this only maps each answer to a screen.
// ---------------------------------------------------------------------------

export type CardView =
  | 'loading'
  | 'form'
  | 'success'
  /** Charging is switched off (enabled false, or 503). */
  | 'disabled'
  /** A try is in progress or frozen for the office (409). */
  | 'review'
  /** The link was used — the card is in. */
  | 'used'
  | 'expired'
  | 'cancelled'
  /** A link that no longer takes a card, the server not saying why beyond its words. */
  | 'closed'
  /** The link is fine, but the order takes no card right now (the preview's `error`). */
  | 'blocked'
  | 'invalid'
  /** The page could not be loaded — a retry, not a verdict. */
  | 'unavailable';

export interface CardPageState {
  view: CardView;
  /** What the link is for, as last read. Kept through a refusal. */
  preview: CardPagePreview | null;
  /** The answer to a card that went in. */
  result: CardSubmitResult | null;
  /** What this screen says, in the server's words when it gave any; '' for nothing. */
  message: string;
}

export const INITIAL_CARD_STATE: CardPageState = { view: 'loading', preview: null, result: null, message: '' };

export const DISABLED_TITLE = 'התשלום עדיין לא זמין בקישור — המשרד ייצור איתכם קשר';
export const REVIEW_TITLE = 'התשלום בבדיקה — אל תנסו שוב, המשרד יחזור אליכם';
export const BLOCKED_TITLE = 'אי אפשר להזין כרטיס בקישור הזה כרגע';
export const UNAVAILABLE_TEXT = 'לא הצלחנו לטעון את פרטי התשלום. בדקו את החיבור לאינטרנט ונסו שוב.';
export const NO_ANSWER_TEXT =
  'לא התקבלה תשובה מהשרת, ולכן לא ברור אם הכרטיס נקלט. אל תזינו אותו שוב לפני שבודקים — המתינו רגע ורעננו את העמוד, או פנו למשרד.';
export const SUBMIT_FAILED_TEXT = 'הכרטיס לא נקלט. נסו שוב או פנו למשרד.';
export const SUCCESS_TITLE = 'הוראת הקבע פעילה ✓';

/** What a link that takes no more cards says, above "בקשו מהמשרד קישור חדש" (except a used one, which needs none). */
export const GONE_COPY: Record<'expired' | 'cancelled' | 'closed' | 'used', { title: string; text: string }> = {
  expired: { title: 'תוקף הקישור פג', text: 'הקישור להזנת הכרטיס כבר לא בתוקף.' },
  cancelled: { title: 'הקישור בוטל', text: 'המשרד ביטל את הקישור הזה.' },
  closed: { title: 'הקישור כבר לא פעיל', text: 'אי אפשר להזין כרטיס בקישור הזה.' },
  used: { title: 'הכרטיס כבר נקלט', text: 'הכרטיס נקלט בקישור הזה, ואין צורך להזין אותו שוב.' },
};

export type CardEvent =
  /** The address carries no token at all. */
  | { type: 'noToken' }
  /** "נסו שוב" after the page could not be loaded. */
  | { type: 'reload' }
  /** The link was read. `keepMessage` keeps a refusal on screen while the form stays open (after a lost answer). */
  | { type: 'loaded'; preview: CardPagePreview; keepMessage?: boolean }
  /** The link could not be read. `recheck` when it was read again after a failed submit. */
  | { type: 'loadFailed'; error: unknown; recheck?: boolean }
  | { type: 'submitStarted' }
  | { type: 'submitted'; result: CardSubmitResult }
  | { type: 'submitFailed'; error: unknown };

interface RefusalBody {
  error?: unknown;
  processing?: unknown;
  already_done?: unknown;
  disabled?: unknown;
  state?: unknown;
}

function httpStatus(error: unknown): number {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
  return typeof status === 'number' ? status : 0;
}

function refusalBody(error: unknown): RefusalBody {
  const data = (error as { response?: { data?: unknown } } | null)?.response?.data;
  return data && typeof data === 'object' && !Array.isArray(data) ? (data as RefusalBody) : {};
}

/** The server's own `error` — only from its JSON, never a proxy's page or plain text. */
function jsonErrorText(error: unknown): string {
  const value = refusalBody(error).error;
  return typeof value === 'string' ? value.trim() : '';
}

/**
 * A refusal that names its own screen, whether it came to a load or to a
 * submit: an unknown link, charging off, a try in flight or in review, a used
 * link, and — when the server says which — an expired or cancelled one.
 */
function namedView(error: unknown): CardView | null {
  const status = httpStatus(error);
  const body = refusalBody(error);
  if (status === 404) return 'invalid';
  if (status === 503 || body.disabled === true) return 'disabled';
  if (status === 409 || body.processing === true) return 'review';
  if (body.already_done === true) return 'used';
  if (body.state === 'expired' || body.state === 'cancelled') return body.state;
  return null;
}

/** What a named screen says under its title. Off needs no words of the server's: its are for the office. */
function namedMessage(view: CardView, error: unknown): string {
  if (view === 'invalid') return serverErrorText(error, INVALID_LINK_TEXT);
  if (view === 'disabled') return '';
  return serverErrorText(error, '');
}

/**
 * The page's state machine. The server decides where the order and the link
 * stand; this maps each answer to a screen, keeping what was already read when
 * a refusal arrives without it.
 */
export function cardReducer(state: CardPageState, event: CardEvent): CardPageState {
  switch (event.type) {
    case 'noToken':
      return { ...INITIAL_CARD_STATE, view: 'invalid', message: INVALID_LINK_TEXT };

    case 'reload':
      return INITIAL_CARD_STATE;

    case 'loaded': {
      const { preview } = event;
      // Off first: while it is off the server refuses any card, whatever else is true.
      if (!preview.enabled) return { view: 'disabled', preview, result: null, message: '' };
      if (preview.error) return { view: 'blocked', preview, result: null, message: preview.error };
      return {
        view: 'form',
        preview,
        result: null,
        message: event.keepMessage && state.view === 'form' ? state.message : '',
      };
    }

    case 'loadFailed': {
      const named = namedView(event.error);
      if (named) return { view: named, preview: state.preview, result: null, message: namedMessage(named, event.error) };
      const status = httpStatus(event.error);
      // Used, cancelled, expired, tried too often: a link that takes no card, in the server's words.
      if (status === 400 || status === 410) {
        return { view: 'closed', preview: state.preview, result: null, message: serverErrorText(event.error, '') };
      }
      // A check after a failed submit that could not get through: the form and what it says stay.
      if (event.recheck && state.view === 'form') return state;
      return {
        view: 'unavailable',
        preview: state.preview,
        result: null,
        message: status >= 500 ? jsonErrorText(event.error) || UNAVAILABLE_TEXT : serverErrorText(event.error, UNAVAILABLE_TEXT),
      };
    }

    case 'submitStarted':
      return state.message ? { ...state, message: '' } : state;

    case 'submitted':
      if (event.result.success) return { view: 'success', preview: state.preview, result: event.result, message: '' };
      return { ...state, message: SUBMIT_FAILED_TEXT };

    case 'submitFailed': {
      const named = namedView(event.error);
      if (named) return { view: named, preview: state.preview, result: null, message: namedMessage(named, event.error) };
      const status = httpStatus(event.error);
      if (!status) return { ...state, message: NO_ANSWER_TEXT };
      // A server that broke mid-way may have charged: say so, unless it said something of its own.
      if (status >= 500) return { ...state, message: jsonErrorText(event.error) || NO_ANSWER_TEXT };
      // 400 a declined or mistyped card, 429 too many tries: the form stays, with the server's words.
      return { ...state, message: serverErrorText(event.error, SUBMIT_FAILED_TEXT) };
    }

    default:
      return state;
  }
}

/**
 * After a failed submit, whether the page reads the link again: no answer, or
 * a server that broke on the way, may hide a card that went through — the
 * screen should show what the server holds now rather than invite a second
 * try. (409 and 503 already name their screens.)
 */
export function shouldRecheckAfterCardSubmit(error: unknown): boolean {
  const status = httpStatus(error);
  return status === 0 || (status >= 500 && status !== 503);
}

// ---- the form ----

export type CardDraft = CardFieldValues;

export const EMPTY_CARD_DRAFT: CardDraft = { cardNumber: '', expiryMonth: '', expiryYear: '', cvv: '', cardHolderId: '' };

function digitsOf(value: string | null | undefined): string {
  return String(value ?? '').replace(/\D/g, '');
}

/** The card number's check digit, as the server checks it before anything reaches Tranzila. */
export function luhnValid(number: string): boolean {
  const digits = digitsOf(number);
  if (!digits) return false;
  let total = 0;
  Array.from(digits)
    .reverse()
    .forEach((char, index) => {
      let value = Number(char);
      if (index % 2 === 1) {
        value *= 2;
        if (value > 9) value -= 9;
      }
      total += value;
    });
  return total % 10 === 0;
}

/** '28' or '2028' → 2028. Null for anything else. */
export function expiryYearOf(value: string): number | null {
  const raw = String(value ?? '').trim();
  if (!/^\d{2}$|^\d{4}$/.test(raw)) return null;
  const year = Number(raw);
  return year < 100 ? 2000 + year : year;
}

function expiryOk(draft: CardDraft, today: Date): boolean {
  const monthText = String(draft.expiryMonth ?? '').trim();
  if (!/^\d{1,2}$/.test(monthText)) return false;
  const month = Number(monthText);
  const year = expiryYearOf(draft.expiryYear);
  if (month < 1 || month > 12 || year === null) return false;
  const thisYear = today.getFullYear();
  if (year < thisYear || year > thisYear + 20) return false;
  return year > thisYear || month >= today.getMonth() + 1;
}

/**
 * What still stands between the tenant and the button, in the order the form
 * asks it; [] when nothing does. The same checks the server makes before a
 * card goes anywhere — it stays the judge, but a typo should cost the tenant
 * a glance, not one of the link's tries.
 */
export function cardProblems(draft: CardDraft, today: Date = new Date()): string[] {
  const problems: string[] = [];
  const number = digitsOf(draft.cardNumber);
  if (number.length < 12 || number.length > 19 || !luhnValid(number)) problems.push('מספר כרטיס תקין');
  if (!expiryOk(draft, today)) problems.push('תוקף תקין');
  if (!/^\d{3,4}$/.test(String(draft.cvv ?? '').trim())) problems.push('CVV');
  if (israeliIdFieldError(draft.cardHolderId)) problems.push('תעודת זהות תקינה של בעל הכרטיס');
  return problems;
}

/** Nothing goes out twice: not while one submit is out, and only from the form. */
export function canSubmitCard(
  draft: CardDraft,
  { view, submitting }: { view: CardView; submitting: boolean },
  today: Date = new Date(),
): boolean {
  return view === 'form' && !submitting && cardProblems(draft, today).length === 0;
}

/** "כדי להמשיך חסר: CVV · תוקף תקין"; '' when nothing is. */
export function cardMissingLine(problems: readonly string[]): string {
  return problems.length ? `כדי להמשיך חסר: ${problems.join(' · ')}` : '';
}

export function cardPayload(draft: CardDraft): CardDetails {
  return {
    card_number: digitsOf(draft.cardNumber),
    expiry_month: Number(String(draft.expiryMonth).trim()),
    expiry_year: expiryYearOf(draft.expiryYear) ?? 0,
    cvv: String(draft.cvv).trim(),
    card_holder_id: digitsOf(draft.cardHolderId),
  };
}

// ---- how it reads ----

const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];

/** A billing month, '2026-09-01' → 'ספטמבר 2026'. '' when it cannot be read. Shared with the office's charges. */
export function billingMonthLabel(period: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})/.exec(String(period ?? '').trim());
  if (!match) return '';
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? `${HEBREW_MONTHS[month - 1]} ${match[1]}` : '';
}

/** '2026-10-01' → '1.10.2026'; '' without a date. */
function dayText(iso: string | null | undefined): string {
  return iso ? formatDay(iso) : '';
}

/** 'דנה לוי · רמת גן' — the header's line under the title. */
export function cardHeaderNote(preview: Pick<CardPagePreview, 'tenant_name' | 'branch_name'> | null | undefined): string {
  if (!preview) return '';
  return [preview.tenant_name, preview.branch_name].filter(Boolean).join(' · ');
}

export interface ChargePlanText {
  /** Money moves today. */
  chargesToday: boolean;
  title: string;
  /** Today's sum; '' when nothing is charged today. */
  amount: string;
  note: string;
}

/**
 * What today's card does, as the server planned it: charges `charge_amount`
 * for `charge_period` now, or only checks the card, the first charge being
 * `next_charge_date`.
 */
export function chargePlanText(
  preview: Pick<CardPagePreview, 'charge_now' | 'charge_amount' | 'charge_period' | 'next_charge_date'>,
): ChargePlanText {
  const next = dayText(preview.next_charge_date);
  if (preview.charge_now) {
    const month = billingMonthLabel(preview.charge_period);
    return {
      chargesToday: true,
      title: 'לחיוב היום',
      amount: moneyText(preview.charge_amount),
      note: [
        `היום ירד התשלום${month ? ` על ${month}` : ''}, והכרטיס יישמר להוראת הקבע.`,
        next ? `החיוב הבא: ${next}.` : '',
      ]
        .filter(Boolean)
        .join(' '),
    };
  }
  return {
    chargesToday: false,
    title: 'היום לא יורד חיוב',
    amount: '',
    note: ['הכרטיס רק יאומת ויישמר להוראת הקבע.', next ? `החיוב הראשון: ${next}.` : ''].filter(Boolean).join(' '),
  };
}

/** "אישור ותשלום" when money moves today, "אימות כרטיס" when the card is only checked. */
export function submitLabel(preview: Pick<CardPagePreview, 'charge_now'> | null | undefined, submitting: boolean): string {
  if (submitting) return 'מעבד…';
  return preview?.charge_now ? 'אישור ותשלום' : 'אימות כרטיס';
}

/** The success screen's lines: the title, what was charged today, and when the next charge comes. */
export function successLines(result: Pick<CardSubmitResult, 'charged' | 'amount' | 'next_charge_date'> | null | undefined): {
  title: string;
  charged: string;
  next: string;
} {
  const amount = Number(result?.amount);
  const next = dayText(result?.next_charge_date);
  return {
    title: SUCCESS_TITLE,
    charged:
      result?.charged && Number.isFinite(amount) && amount > 0
        ? `חויב היום ${moneyText(result.amount)}`
        : 'הכרטיס אומת ונשמר — היום לא חויב סכום',
    next: next ? `החיוב הבא: ${next}` : '',
  };
}
