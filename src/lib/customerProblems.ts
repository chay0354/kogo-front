/**
 * The red light on the customers list (owner, 6.10.2026): what the server found
 * wrong with a child, and how the list and the child's card read it.
 *
 * The server works the problems out each time from the records (problem_flags.py);
 * nothing is stored. A list row carries the light pair — how many, and their
 * short titles; the card asks for the full text of each: what happened, and what
 * to do. A server that predates this sends neither, and every reader here then
 * answers "nothing to show" rather than "no problems".
 */

/** One problem, as GET /customers/children/{id}/problems/ gives it. */
export interface CustomerProblem {
  code: string;
  /** A few words — the list's tooltip and the card's heading. */
  title: string;
  /** What happened, with sums and dates. */
  what: string;
  /** What to do about it. */
  action: string;
}

/** Another card of the same child on the family (the same name) — hidden from the list. */
export interface DuplicateCard {
  id: string;
  full_name: string;
  status: string;
  status_label: string;
  created_at: string | null;
  payments_count: number;
  completed_total: string;
  standing_orders_count: number;
  documents_count: number;
  /**
   * The card's standing orders, in the shape customers/recurring-payments/
   * gives — sent with the answer so the card never has to ask that route for
   * another card (its every read writes the monthly amounts that came due).
   */
  standing_orders: Array<Record<string, unknown>>;
}

export interface ChildProblemDetail {
  problems: CustomerProblem[];
  duplicateCards: DuplicateCard[];
}

/** The label the card puts on a row that comes from the child's other card. */
export const OTHER_CARD_LABEL = 'מכרטיס נוסף של הילד';

type ProblemFields = { problems_count?: number | null; problem_titles?: string[] | null };

/** How many problems the row carries; 0 when the server did not say. */
export function problemCount(row: ProblemFields): number {
  const count = Number(row.problems_count);
  return Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
}

/** True once any row says how many problems it has — a server that knows the flags. */
export function serverReportsProblems(rows: ReadonlyArray<ProblemFields>): boolean {
  return rows.some((row) => typeof row.problems_count === 'number');
}

function titlesOf(row: ProblemFields): string[] {
  return Array.isArray(row.problem_titles)
    ? row.problem_titles.filter((title): title is string => typeof title === 'string' && title.trim() !== '')
    : [];
}

/**
 * What the light says in words — read by a screen reader and shown on hover,
 * so the colour is never the only sign. '' when there is nothing wrong.
 */
export function problemsSummary(row: ProblemFields): string {
  const count = problemCount(row);
  if (count === 0) return '';
  const head = count === 1 ? 'תקלה אחת' : `${count} תקלות`;
  const titles = titlesOf(row);
  return titles.length ? `${head}: ${titles.join(' · ')}` : head;
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function count(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/** The card's answer, read defensively: a row without a title or a text is dropped. */
export function readProblemDetail(data: unknown): ChildProblemDetail {
  const body = (data ?? {}) as { problems?: unknown; duplicate_cards?: unknown };
  const problems = Array.isArray(body.problems)
    ? body.problems
        .map((row) => {
          const item = (row ?? {}) as Record<string, unknown>;
          return {
            code: text(item.code),
            title: text(item.title),
            what: text(item.what),
            action: text(item.action),
          };
        })
        .filter((item) => item.title && item.what)
    : [];
  const duplicateCards = Array.isArray(body.duplicate_cards)
    ? body.duplicate_cards
        .map((row) => {
          const item = (row ?? {}) as Record<string, unknown>;
          return {
            id: text(item.id),
            full_name: text(item.full_name),
            status: text(item.status),
            status_label: text(item.status_label),
            created_at: text(item.created_at) || null,
            payments_count: count(item.payments_count),
            completed_total: text(item.completed_total) || '0',
            standing_orders_count: count(item.standing_orders_count),
            documents_count: count(item.documents_count),
            standing_orders: Array.isArray(item.standing_orders)
              ? item.standing_orders.filter(
                  (order): order is Record<string, unknown> => Boolean(order) && typeof order === 'object',
                )
              : [],
          };
        })
        .filter((item) => item.id)
    : [];
  return { problems, duplicateCards };
}

/** A row fetched for another card of the child, marked so the card can say whose it is. */
export function fromOtherCard<T extends object>(rows: ReadonlyArray<T>): Array<T & { from_other_card: true }> {
  return rows.map((row) => ({ ...row, from_other_card: true as const }));
}

/**
 * What the refund window learns before anyone confirms
 * (GET /customers/payments/{id}/refund-info/).
 */
export interface RefundInfo {
  refundable: boolean;
  /** Why it cannot be refunded, in Hebrew — a charge Tranzila declined, for one. */
  blockedReason: string;
  declined: boolean;
  /** The live standing orders that will charge the same lesson again next month. */
  standingOrders: Array<{ id: string; amount: number; nextBillingDate: string | null; courseName: string }>;
}

export function readRefundInfo(data: unknown): RefundInfo {
  const body = (data ?? {}) as Record<string, unknown>;
  const blockedReason = text(body.blocked_reason);
  const orders = Array.isArray(body.standing_orders) ? body.standing_orders : [];
  return {
    // Only an explicit false blocks: an answer this code cannot read must not stop a refund.
    refundable: body.refundable !== false,
    blockedReason: body.refundable === false ? blockedReason || 'לא ניתן לזכות את החיוב הזה' : '',
    declined: body.declined === true,
    standingOrders: orders
      .map((row) => {
        const item = (row ?? {}) as Record<string, unknown>;
        return {
          id: text(item.id),
          amount: Number(item.amount) || 0,
          nextBillingDate: text(item.next_billing_date) || null,
          courseName: text(item.course_name),
        };
      })
      .filter((item) => item.id),
  };
}

function shekels(amount: number): string {
  return `₪${amount.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function hebrewDay(iso: string | null): string {
  const match = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${Number(match[3])}.${Number(match[2])}.${match[1]}` : '';
}

/**
 * The line under the "cancel the standing order too" box: what happens when it
 * is left unticked. '' when there is no standing order behind the charge.
 */
export function standingOrderLeftAloneNote(info: Pick<RefundInfo, 'standingOrders'>): string {
  const orders = info.standingOrders;
  if (orders.length === 0) return '';
  const total = orders.reduce((sum, order) => sum + order.amount, 0);
  const dates = orders.map((order) => order.nextBillingDate).filter(Boolean).sort();
  const next = hebrewDay(dates[0] ?? null);
  const when = next ? ` ב־${next}` : ' בחודש הבא';
  return `בלי הסימון הוראת הקבע נשארת פעילה: החיוב הבא (${shekels(total)}) ירד${when}.`;
}

/** The refund request's body: the box adds its field only when it is ticked. */
export function refundRequestBody(
  amount: number | null,
  reason: string,
  cancelStandingOrder = false,
): { amount: number | null; reason: string; cancel_standing_order?: true } {
  return cancelStandingOrder ? { amount, reason, cancel_standing_order: true } : { amount, reason };
}
