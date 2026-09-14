/**
 * What the card-link popup does with a unit the child already has a standing
 * order on. Kept apart from the dialog so the money-facing decisions — which of
 * the three things an option offers, and what a renewal will charge — are plain
 * functions with tests, not something only a rendered dialog can answer.
 */
import type { CardLinkOption, OptionStandingOrder } from '@/lib/paymentLinksApi';

/** What "הוראת קבע לחוג" means for one unit. */
export type OptionAction =
  /** No standing order on it: today's flow — a link that opens one. */
  | 'new'
  /** A standing order with months that were never collected: renew. */
  | 'renew'
  /** A standing order with nothing outstanding: only the card can be changed. */
  | 'card_only'
  /** Priced wrong, or no price at all — nothing can be sent. */
  | 'blocked';

export function optionAction(option: CardLinkOption): OptionAction {
  const sto = option.standing_order;
  if (sto) return sto.can_renew ? 'renew' : 'card_only';
  if (!option.quote || option.quote_error) return 'blocked';
  return 'new';
}

/** A unit can be picked unless there is nothing the office could do with it. */
export function isSelectable(option: CardLinkOption) {
  return optionAction(option) !== 'blocked';
}

/** Only a unit with no standing order goes down the create-a-CardLink path. */
export function opensNewStandingOrder(option: CardLinkOption) {
  return optionAction(option) === 'new';
}

export type StandingOrderRow = {
  option: CardLinkOption;
  standingOrder: OptionStandingOrder;
};

/**
 * The child's standing orders, one row each, for the "שינוי פרטי אשראי" list.
 * A track and its days can both point at the same order; it is listed once.
 */
export function standingOrderRows(options: CardLinkOption[] | null): StandingOrderRow[] {
  const seen = new Set<string>();
  const rows: StandingOrderRow[] = [];
  for (const option of options ?? []) {
    const standingOrder = option.standing_order;
    if (!standingOrder || seen.has(standingOrder.id)) continue;
    seen.add(standingOrder.id);
    rows.push({ option, standingOrder });
  }
  return rows;
}

const MAX_AMOUNT = 50000;

/** An office override is money about to leave a real card: it must be a real figure. */
export function renewAmountError(raw: string): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return 'יש להזין סכום';
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return 'סכום לא תקין';
  if (n < 1) return 'הסכום חייב להיות לפחות ₪1';
  if (n > MAX_AMOUNT) return `הסכום גבוה מ-₪${MAX_AMOUNT.toLocaleString('he-IL')}`;
  return '';
}

/** The figure sent to the server: two decimals, or nothing when it is unchanged. */
export function renewAmountToSend(standingOrder: OptionStandingOrder, raw: string): string | undefined {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  if (!Number.isFinite(n)) return undefined;
  const asSent = n.toFixed(2);
  return asSent === Number(standingOrder.renew_amount).toFixed(2) ? undefined : asSent;
}

export function isOverridden(standingOrder: OptionStandingOrder, raw: string) {
  return renewAmountToSend(standingOrder, raw) !== undefined;
}

/** 'חודשיים שלא נגבו · ספטמבר, אוקטובר' — what the office reads before it creates the link. */
export function monthsSummary(standingOrder: OptionStandingOrder): string {
  const count = standingOrder.months.length;
  if (count === 0) return 'אין חודשים שלא נגבו';
  const head = count === 1 ? 'חודש אחד שלא נגבה' : count === 2 ? 'חודשיים שלא נגבו' : `${count} חודשים שלא נגבו`;
  return standingOrder.months_label ? `${head} · ${standingOrder.months_label}` : head;
}

const STATUS_LABELS: Record<string, string> = {
  active: 'פעילה',
  paused: 'מושהית',
  failed: 'נעצרה',
  expired: 'פג תוקף',
};

export function standingOrderStatusLabel(status: string) {
  return STATUS_LABELS[status] ?? status;
}

/** 'https://crm…' and '/update-card/…', so the part that is the link carries the weight. */
export function splitUrl(url: string) {
  try {
    const parsed = new URL(url);
    return { host: `${parsed.protocol}//${parsed.host}`, path: `${parsed.pathname}${parsed.search}` };
  } catch {
    return { host: '', path: url };
  }
}
