import type { ContractStatus, RentalContract, TenancyContractSummary } from '@/lib/rentalsApi';
import type { StatusTone } from './tenancyUtils';

// ---------------------------------------------------------------------------
// The contract on the tenants screen — pure, so contractUtils.test.ts can pin
// it down: what the contract column shows, what the office is asked before a
// new version replaces one, what the tenancy dialog says after a save, how
// the history reads, and what a saved PDF is called.
//
// Where a version stands is the server's to say — its status, and is_stale on
// the version a row carries. Nothing here works either out from the terms.
// ---------------------------------------------------------------------------

/** Our words for each status, for when the server sends no status_label. */
export const CONTRACT_STATUS_OPTIONS: ReadonlyArray<{ value: ContractStatus; label: string }> = [
  { value: 'draft', label: 'טיוטה' },
  { value: 'sent', label: 'נשלח לחתימה' },
  { value: 'viewed', label: 'נצפה' },
  { value: 'signed', label: 'נחתם' },
  { value: 'void', label: 'בוטל' },
];

/** What every rule below needs of a version: where it stands, and its number. */
interface VersionLike {
  status: string;
  version: number;
}

type MaybeStale = VersionLike & { is_stale?: boolean };

/** The server's label when it sent one — it is the source of the wording — else ours. */
export function contractStatusLabel(status: string, serverLabel?: string | null): string {
  const label = (serverLabel ?? '').trim();
  if (label) return label;
  return CONTRACT_STATUS_OPTIONS.find((option) => option.value === status)?.label ?? (status || '—');
}

/**
 * A version's chip in the tenancy chips' colours: out with the tenant and not
 * back yet, signed, void (as a cancelled tenancy is), or still in the office.
 */
export function contractStatusTone(status: string): StatusTone {
  switch (status) {
    case 'sent':
    case 'viewed':
      return 'progress';
    case 'signed':
      return 'signed';
    case 'void':
      return 'bad';
    default:
      return 'off';
  }
}

/**
 * Issued, and neither signed nor void: the server may still void it, and a
 * new version replaces it. A status this screen does not know counts as
 * unsigned — the server has the last word, and says so if it refuses.
 */
export function isUnsignedContract(contract: { status: string } | null | undefined): boolean {
  if (!contract) return false;
  return contract.status !== 'signed' && contract.status !== 'void';
}

/** 'גרסה 3'. */
export function contractVersionLabel(version: number | null | undefined): string {
  const n = Number(version);
  return Number.isInteger(n) && n > 0 ? `גרסה ${n}` : 'גרסה';
}

/** The "לא תואם להסכם" chip's explanation. '' while the version still matches the agreement. */
export function staleContractTitle(current: MaybeStale | null | undefined): string {
  if (!current?.is_stale) return '';
  const changed = `ההסכם השתנה אחרי ש${contractVersionLabel(current.version)} הופקה, והחוזה לא מתעדכן מעצמו.`;
  // A signed version cannot be replaced (the server refuses), so there is nothing to tell the office to do.
  return current.status === 'signed'
    ? `${changed} החוזה החתום נשאר כפי שנחתם.`
    : `${changed} כדי שיתאים להסכם, הפיקו גרסה חדשה.`;
}

/** What the contract column shows for a tenancy. */
export type ContractCell =
  | { state: 'none' }
  | {
      state: 'draft' | 'sent' | 'viewed' | 'signed' | 'other';
      contractId: string;
      version: number;
      versionLabel: string;
      statusLabel: string;
      tone: StatusTone;
      /** The agreement changed after this version was issued. */
      stale: boolean;
      /** The stale chip's title; '' while the version still matches. */
      staleTitle: string;
      /** Not signed, so a new version may replace it — once the office confirms. */
      replaceable: boolean;
    };

const CELL_STATES = ['draft', 'sent', 'viewed', 'signed'] as const;

/**
 * The version a row carries, as its contract column shows it: nothing yet (the
 * way to issue one), or the version with where it stands and whether it still
 * matches the agreement.
 */
export function contractCell(current: TenancyContractSummary | null | undefined): ContractCell {
  // The row names its newest version that is not void; a void one here would mean none is in force.
  if (!current || current.status === 'void') return { state: 'none' };
  return {
    state: CELL_STATES.find((state) => state === current.status) ?? 'other',
    contractId: current.id,
    version: current.version,
    versionLabel: contractVersionLabel(current.version),
    statusLabel: contractStatusLabel(current.status, current.status_label),
    tone: contractStatusTone(current.status),
    stale: Boolean(current.is_stale),
    staleTitle: staleContractTitle(current),
    replaceable: isUnsignedContract(current),
  };
}

/**
 * What the office is asked before a version is issued: the unsigned version it
 * will replace, which the server voids in the same step. '' when nothing would
 * be replaced — the first version, or once the last was voided — and the
 * version is issued without asking.
 */
export function issueConfirmMessage(current: VersionLike | null | undefined): string {
  if (!current || !isUnsignedContract(current)) return '';
  return `גרסה חדשה תחליף את ${contractVersionLabel(current.version)} שעדיין לא נחתמה`;
}

/** The toast once a version is issued, naming the unsigned one it replaced. */
export function issuedMessage(
  issued: { version: number } | null | undefined,
  replaced: VersionLike | null | undefined,
): string {
  const n = Number(issued?.version);
  if (!(Number.isInteger(n) && n > 0)) return 'החוזה הופק';
  if (replaced && isUnsignedContract(replaced) && Number(replaced.version) !== n) {
    return `${contractVersionLabel(n)} הופקה, ו${contractVersionLabel(replaced.version)} בוטלה`;
  }
  return `החוזה הופק — ${contractVersionLabel(n)}`;
}

/**
 * What the tenancy dialog says after a save, read off the row as the server
 * returned it: an unsigned version the save left behind does not follow the
 * agreement by itself. '' when there is nothing to say — no version, one that
 * still matches, or a signed one, which no new version can replace.
 */
export function contractNoticeAfterSave(current: MaybeStale | null | undefined): string {
  if (!current?.is_stale || !isUnsignedContract(current)) return '';
  return `החוזה הנוכחי (${contractVersionLabel(current.version)}) לא מתעדכן מעצמו — הפיקו גרסה חדשה`;
}

// ---- the history ----

let israelTime: Intl.DateTimeFormat | null | undefined;

/** Built on first use, so a browser without the time zone's data costs a fallback rather than the page. */
function israelTimeFormat(): Intl.DateTimeFormat | null {
  if (israelTime === undefined) {
    try {
      israelTime = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Jerusalem',
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23',
      });
    } catch {
      israelTime = null;
    }
  }
  return israelTime;
}

/**
 * '2026-09-11T14:05:00+03:00' → '11.9.2026, 14:05': the date the way formatDay
 * writes one, and the time in Israel whatever the browser's clock says — the
 * office's day, not the laptop's. '' when there is no readable time.
 */
export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const format = israelTimeFormat();
  if (!format) {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getDate()}.${date.getMonth() + 1}.${date.getFullYear()}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }
  const parts: Record<string, string> = {};
  format.formatToParts(date).forEach(({ type, value }) => {
    parts[type] = value;
  });
  return `${Number(parts.day)}.${Number(parts.month)}.${parts.year}, ${parts.hour}:${parts.minute}`;
}

/** One version as the history dialog lists it. */
export interface ContractHistoryRow {
  id: string;
  /** 'גרסה 3' */
  title: string;
  statusLabel: string;
  tone: StatusTone;
  /** 'הופקה ב־11.9.2026, 14:05'; '' without a time. */
  issued: string;
  /** 'על ידי דנה כהן'; '' when the server has no name. */
  issuedBy: string;
  /** 'בוטלה ב־12.9.2026, 10:00', or 'בוטלה' without a time; '' unless void. */
  voided: string;
  /** Why it was voided, in the words it was given; '' without one. */
  voidReason: string;
  isVoid: boolean;
  /** Neither signed nor void, so "בטל" is offered. */
  canVoid: boolean;
}

export function contractHistoryRow(contract: RentalContract): ContractHistoryRow {
  const isVoid = contract.status === 'void';
  const issuedAt = formatDateTime(contract.created_at);
  const voidedAt = formatDateTime(contract.voided_at);
  const by = (contract.created_by_name ?? '').trim();
  return {
    id: contract.id,
    title: contractVersionLabel(contract.version),
    statusLabel: contractStatusLabel(contract.status, contract.status_label),
    tone: contractStatusTone(contract.status),
    issued: issuedAt ? `הופקה ב־${issuedAt}` : '',
    issuedBy: by ? `על ידי ${by}` : '',
    voided: isVoid ? (voidedAt ? `בוטלה ב־${voidedAt}` : 'בוטלה') : '',
    voidReason: isVoid ? (contract.void_reason ?? '').trim() : '',
    isVoid,
    canVoid: isUnsignedContract(contract),
  };
}

/** Newest version first — the order the server sends, kept even if it did not. */
export function sortContracts<T extends { version: number; created_at?: string | null }>(list: readonly T[]): T[] {
  return [...list].sort(
    (a, b) => (Number(b.version) || 0) - (Number(a.version) || 0) || (b.created_at ?? '').localeCompare(a.created_at ?? ''),
  );
}

/** The version in force: the newest that is not void — the one a row's current_contract names. */
export function currentContractOf<T extends { status: string; version: number; created_at?: string | null }>(
  list: readonly T[],
): T | null {
  return sortContracts(list).find((contract) => contract.status !== 'void') ?? null;
}

// ---- the saved file ----

/**
 * What no file name may hold on Windows or macOS, and the direction marks that
 * could make a name read as something it is not (a customer's name is typed
 * by hand, and ends up in a file on the office's disk).
 */
// eslint-disable-next-line no-control-regex
const UNSAFE_IN_FILE_NAME = /[\\/:*?"<>|\x00-\x1f\x7f\u200e\u200f\u202a-\u202e\u2066-\u2069]+/g;

/** Long enough for any business name; short enough that the whole name stays well inside a file system's limit. */
const MAX_NAME_IN_FILE = 80;

/**
 * 'חוזה שכירות - דנה לוי - גרסה 2.pdf'. A void version says so in its name,
 * so a copy saved from the history is never taken for the one in force.
 */
export function contractFileName({
  tenantName,
  version,
  voided = false,
}: {
  tenantName?: string | null;
  version: number | null | undefined;
  voided?: boolean;
}): string {
  const cleaned = (tenantName ?? '')
    .replace(UNSAFE_IN_FILE_NAME, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '');
  // Cut by characters rather than UTF-16 units, so the cut never splits one in two.
  const name = Array.from(cleaned).slice(0, MAX_NAME_IN_FILE).join('').trim();
  const base = ['חוזה שכירות', name, contractVersionLabel(version)].filter(Boolean).join(' - ');
  return `${base}${voided ? ' (מבוטלת)' : ''}.pdf`;
}
