import { israeliIdFieldError, sanitizeIsraeliIdInput } from '@/lib/israeliId';
import { formatShekels } from '@/lib/paymentLinksApi';
import type { SignaturePayload, SignatureResult, SigningContract } from '@/lib/rentalSigningApi';
import { formatDay, formatSignedDate, formatSignedTime } from '@/lib/signatureUtils';

// ---------------------------------------------------------------------------
// The tenant's signing page (/s/<token>), pure — so signingFlow.test.ts can pin
// it down without a browser: which screen shows for every answer the server
// can give, when "חתימה ואישור" unlocks, what is sent, and how the money and
// the dates read. Nothing here imports the CRM: the page is public and light.
// ---------------------------------------------------------------------------

export type SigningView = 'loading' | 'open' | 'signed' | 'expired' | 'cancelled' | 'invalid' | 'unavailable';

export interface SigningPageState {
  view: SigningView;
  /** The version as last read. Kept through a refusal, so the office's phone is still at hand. */
  contract: SigningContract | null;
  /** What this screen says, in the server's words when it gave any; '' for nothing. */
  message: string;
}

export const INITIAL_SIGNING_STATE: SigningPageState = { view: 'loading', contract: null, message: '' };

export const INVALID_LINK_TEXT = 'בדקו שהקישור הועתק במלואו, או בקשו מהמשרד קישור חדש.';
export const UNAVAILABLE_TEXT = 'לא הצלחנו לטעון את החוזה. בדקו את החיבור לאינטרנט ונסו שוב.';
export const NO_ANSWER_TEXT =
  'לא התקבלה תשובה מהשרת, ולכן לא ברור אם החתימה נקלטה. אם החוזה לא מופיע כחתום, נסו לחתום שוב.';
export const SUBMIT_FAILED_TEXT = 'החתימה לא נשמרה. נסו שוב בעוד רגע.';

/** What an expired or cancelled link says above "בקשו מהמשרד קישור חדש". */
export const GONE_COPY: Record<'expired' | 'cancelled', { title: string; text: string }> = {
  expired: { title: 'תוקף הקישור פג', text: 'הקישור לחתימה על החוזה כבר לא בתוקף.' },
  cancelled: { title: 'הקישור בוטל', text: 'המשרד ביטל את הקישור הזה לחתימה.' },
};

export type SigningEvent =
  /** The address carries no token at all. */
  | { type: 'noToken' }
  /** "נסו שוב" after the contract could not be loaded. */
  | { type: 'reload' }
  /** The contract was read. `keepMessage` keeps a refusal on screen while the form stays open (after a 409). */
  | { type: 'loaded'; contract: SigningContract; keepMessage?: boolean }
  /** The contract could not be read. `recheck` when it was read again after a failed signing. */
  | { type: 'loadFailed'; error: unknown; recheck?: boolean }
  | { type: 'submitStarted' }
  | { type: 'signed'; result: SignatureResult; signerName: string }
  | { type: 'submitFailed'; error: unknown };

function httpStatus(error: unknown): number {
  const status = (error as { response?: { status?: unknown } } | null)?.response?.status;
  return typeof status === 'number' ? status : 0;
}

function messagesIn(data: unknown): string {
  if (typeof data === 'string') {
    const text = data.trim();
    // An HTML error page from the server itself says nothing the tenant can act on.
    return text.startsWith('<') ? '' : text;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return '';
  const body = data as Record<string, unknown>;
  for (const key of ['error', 'detail']) {
    const value = body[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  // DRF's field errors — { signer_id_number: ['…'] } — each already a sentence.
  const found: string[] = [];
  Object.values(body).forEach((value) => {
    (Array.isArray(value) ? value : [value]).forEach((item) => {
      if (typeof item === 'string' && item.trim()) found.push(item.trim());
    });
  });
  return [...new Set(found)].join('\n');
}

/** The server's own words for a failed request, else the fallback. */
export function serverErrorText(error: unknown, fallback: string): string {
  return messagesIn((error as { response?: { data?: unknown } } | null)?.response?.data) || fallback;
}

/** 410 says which: the body's `state` names a cancelled link; anything else reads as expired. */
function goneView(error: unknown): 'expired' | 'cancelled' {
  const data = (error as { response?: { data?: unknown } } | null)?.response?.data;
  const state = data && typeof data === 'object' ? (data as { state?: unknown }).state : undefined;
  return state === 'cancelled' ? 'cancelled' : 'expired';
}

/** The screen for the state the server gave. One this build does not know is a link that cannot be used. */
export function viewOfContractState(state: string): SigningView {
  return state === 'open' || state === 'signed' || state === 'expired' || state === 'cancelled' ? state : 'invalid';
}

/**
 * The page's state machine. The server decides where the contract stands; this
 * only maps each answer to a screen, keeping the version already read when a
 * refusal arrives without one.
 */
export function signingReducer(state: SigningPageState, event: SigningEvent): SigningPageState {
  switch (event.type) {
    case 'noToken':
      return { view: 'invalid', contract: null, message: INVALID_LINK_TEXT };

    case 'reload':
      return INITIAL_SIGNING_STATE;

    case 'loaded': {
      const view = viewOfContractState(event.contract.state);
      if (view === 'invalid') return { view, contract: null, message: INVALID_LINK_TEXT };
      return { view, contract: event.contract, message: event.keepMessage && view === 'open' ? state.message : '' };
    }

    case 'loadFailed': {
      const status = httpStatus(event.error);
      if (status === 404) {
        return { view: 'invalid', contract: null, message: serverErrorText(event.error, INVALID_LINK_TEXT) };
      }
      if (status === 410) {
        return { view: goneView(event.error), contract: state.contract, message: serverErrorText(event.error, '') };
      }
      // A check after a failed signing that could not get through: the form and what it says stay.
      if (event.recheck && state.contract) return state;
      return { view: 'unavailable', contract: state.contract, message: serverErrorText(event.error, UNAVAILABLE_TEXT) };
    }

    case 'submitStarted':
      return state.message ? { ...state, message: '' } : state;

    case 'signed': {
      const contract = state.contract
        ? {
            ...state.contract,
            state: 'signed',
            signed_at: event.result.signed_at ?? state.contract.signed_at,
            signer_name: event.signerName.trim() || state.contract.signer_name,
          }
        : null;
      return { view: 'signed', contract, message: '' };
    }

    case 'submitFailed': {
      const status = httpStatus(event.error);
      if (status === 404) {
        return { view: 'invalid', contract: null, message: serverErrorText(event.error, INVALID_LINK_TEXT) };
      }
      if (status === 410) {
        return { view: goneView(event.error), contract: state.contract, message: serverErrorText(event.error, '') };
      }
      if (!status) return { ...state, message: NO_ANSWER_TEXT };
      // 400 bad input, 409 signed already or changed, 5xx: the form stays, with the server's words.
      return { ...state, message: serverErrorText(event.error, SUBMIT_FAILED_TEXT) };
    }

    default:
      return state;
  }
}

/**
 * After a failed signing, whether the page reads the contract again: a lost
 * answer or a server error may hide a signature that went through, and a 409
 * means it was signed already or the version changed — either way the screen
 * should show what the server holds now.
 */
export function shouldRecheckAfterSubmit(error: unknown): boolean {
  const status = httpStatus(error);
  return status === 0 || status === 409 || status >= 500;
}

// ---- the form ----

export interface SignatureDraft {
  signerName: string;
  signerId: string;
  /** The drawn signature as a data URL; null while the pad is empty. */
  signature: string | null;
  /** The contract's text was scrolled to its end. */
  readToEnd: boolean;
  accepted: boolean;
}

const MIN_NAME_LENGTH = 2;
const PNG_DATA_URL = /^data:image\/png;base64,[A-Za-z0-9+/=]+$/;

/** The form's first values: the tenant's name and ID as the office entered them. The tenant may change both. */
export function initialSigner(contract: Pick<SigningContract, 'tenant'> | null | undefined): { name: string; id: string } {
  return {
    name: contract?.tenant.name ?? '',
    id: sanitizeIsraeliIdInput(contract?.tenant.id_number ?? ''),
  };
}

/**
 * What still stands between the tenant and "חתימה ואישור", in the order the
 * page asks it. [] when nothing does. The checkbox counts only once the text
 * was read to its end — the page keeps it locked until then.
 */
export function missingForSignature(draft: SignatureDraft): string[] {
  const missing: string[] = [];
  if (!draft.readToEnd) missing.push('קריאת החוזה עד הסוף');
  if (Array.from(draft.signerName.trim()).length < MIN_NAME_LENGTH) missing.push('שם מלא');
  if (israeliIdFieldError(draft.signerId)) missing.push('תעודת זהות תקינה');
  if (!draft.signature || !PNG_DATA_URL.test(draft.signature)) missing.push('חתימה');
  if (!(draft.readToEnd && draft.accepted)) missing.push('סימון האישור');
  return missing;
}

export function canSubmitSignature(
  draft: SignatureDraft,
  { view, submitting }: { view: SigningView; submitting: boolean },
): boolean {
  return view === 'open' && !submitting && missingForSignature(draft).length === 0;
}

/** "כדי לחתום חסר: חתימה · סימון האישור"; '' when nothing is. */
export function missingLine(missing: readonly string[]): string {
  return missing.length ? `כדי לחתום חסר: ${missing.join(' · ')}` : '';
}

export function signaturePayload(draft: SignatureDraft): SignaturePayload {
  return {
    signer_name: draft.signerName.trim().replace(/\s+/g, ' '),
    signer_id_number: draft.signerId.replace(/\D/g, ''),
    signature: draft.signature ?? '',
    accept: true,
  };
}

// ---- how it reads ----

/** 'גרסה 3 · רמת גן' — the header's line under the title. */
export function versionLine(contract: Pick<SigningContract, 'version' | 'branch_name'> | null | undefined): string {
  if (!contract) return '';
  return [contract.version > 0 ? `גרסה ${contract.version}` : '', contract.branch_name].filter(Boolean).join(' · ');
}

/** A decimal string as shekels; '—' when there is none to show. */
export function moneyText(value: string | null | undefined): string {
  const text = String(value ?? '').trim();
  return text && Number.isFinite(Number(text)) ? formatShekels(text) : '—';
}

/** '0.18' or '18' → '18%'. '' when the rate cannot be read. */
export function vatPercentLabel(rate: string | number | null | undefined): string {
  if (rate === null || rate === undefined || String(rate).trim() === '') return '';
  const n = Number(rate);
  if (!Number.isFinite(n) || n < 0) return '';
  const percent = Math.round((n <= 1 ? n * 100 : n) * 100) / 100;
  return `${percent}%`;
}

/** 'ב־1 לכל חודש'; '—' without a day. */
export function billingDayText(day: number | null | undefined): string {
  return day && Number.isInteger(day) && day > 0 ? `ב־${day} לכל חודש` : '—';
}

/** '1.10.2026 – 30.9.2027', or the one end there is. */
export function periodText(start: string | null | undefined, end: string | null | undefined): string {
  const from = start ? formatDay(start) : '';
  const to = end ? formatDay(end) : '';
  if (from && to) return `${from} – ${to}`;
  if (from) return `מ־${from}`;
  if (to) return `עד ${to}`;
  return '—';
}

/** '11.09.2026 בשעה 18:05', on Israel's clock. '' when there is no readable time. */
export function signedAtText(iso: string | null | undefined): string {
  const date = formatSignedDate(iso);
  return date ? `${date} בשעה ${formatSignedTime(iso)}` : '';
}

/** A tel: link for the office's phone; '' when it is not a number a phone can dial. */
export function telHref(phone: string | null | undefined): string {
  const raw = String(phone ?? '').trim();
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) return '';
  return `tel:${raw.startsWith('+') ? '+' : ''}${digits}`;
}
