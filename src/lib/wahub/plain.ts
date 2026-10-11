import type { WahubKnowledgeKind, WahubKnowledgeProposal, WahubProposalPlain } from '@/types/wahub';
import type { WahubRefineAction, WahubRefineChange } from '@/types/wahubRefine';
import { diffChange, fieldLabel, formatChangeValue, kindLabel } from './bot';

/**
 * A change to the bot's knowledge, in words a person reads
 * (docs/WAHUB-CONTRACT-REFINE.md, ג).
 *
 * The owner looked at the old card — a table of "מפתח: repeated_question /
 * סוג: behavior_rule / מתי לומר…" with a red column of dashes — and could not
 * tell what was going on. So one card, the same in the floating panel, in the
 * review tab and in the small chat of "דיוק": what the bot will do from now
 * on, why, what changes (in a paragraph — or "היה / יהיה" for what really
 * changed), the examples folded, and every code name folded under "פרטים טכניים".
 *
 * The server's own wording (`plain`) is used when it sends it; otherwise the
 * card is worded here from the change itself.
 */

export interface PlainRow {
  key: string;
  label: string;
  before: string;
  after: string;
}

export interface PlainTech {
  key: string;
  label: string;
  /** In Hebrew. */
  value: string;
  /** A code name (`behavior_rule`, `repeated_question`). Shown here and nowhere else. */
  code?: string;
}

export interface PlainChange {
  /** "מעכשיו הבוט…" — or the proposal's own title on an older server. */
  headline: string;
  /** One sentence; '' when there is none to say. */
  why: string;
  action: WahubRefineAction;
  /** A new item: nothing was there before, so nothing is shown as "before". */
  isNew: boolean;
  /** What changes, in one paragraph. */
  rule: string;
  /** An update: only what really changed, "היה" above "יהיה". */
  rows: PlainRow[];
  exampleBad: string;
  exampleGood: string;
  tech: PlainTech[];
}

/** Fields that say how an item is filed, not what it says: they belong under "פרטים טכניים". */
const TECH_FIELDS = new Set([
  'kind',
  'key',
  'when_to_say',
  'priority',
  'scope',
  'scope_level',
  'scope_id',
  'scope_label',
  'is_active',
  'enforced_in_code',
  'verbatim',
  'certainty',
  'source_note',
  'tag',
  'means_kind',
  'valid_from',
  'valid_until',
  'data',
]);

const EXAMPLE_FIELDS = new Set(['example_bad', 'example_good']);

type Side = Record<string, unknown> | string | null | undefined;

interface PlainSource {
  plain?: Partial<WahubProposalPlain> | null;
  /** What the card is headed with when the server sends no headline. */
  title: string;
  /** The knowledge item's own name, when it is not the same thing (a proposal has a title of its own). */
  itemTitle?: string;
  why: string;
  action: WahubRefineAction;
  kind: string;
  kindLabel: string;
  itemId: number | null;
  before: Side;
  after: Side;
}

function fields(side: Side): Record<string, unknown> | null {
  return side && typeof side === 'object' ? side : null;
}

function words(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** What is not the body, an example or a filing detail — a link's address, an alias's meaning — as "label: value" lines. */
function otherContent(after: Record<string, unknown>): string {
  return Object.entries(after)
    .filter(([key, value]) => key !== 'title' && key !== 'body' && !TECH_FIELDS.has(key) && !EXAMPLE_FIELDS.has(key) && value !== null && value !== undefined && value !== '')
    .map(([key, value]) => `${fieldLabel(key)}: ${formatChangeValue(value)}`)
    .join('\n');
}

function plainFrom(source: PlainSource): PlainChange {
  const { plain, action } = source;
  const before = fields(source.before);
  const after = fields(source.after);
  const isNew = plain?.is_new ?? (action === 'create' || (action === 'update' && !before && typeof source.before !== 'string'));
  const itemTitle = words(after?.title) || words(before?.title) || (source.itemTitle ?? '').trim();
  const title = source.title || itemTitle;

  // What changes, in a paragraph: the server's words, else the item's own text.
  let rule = words(plain?.rule);
  if (!rule && action === 'deactivate') {
    const named = itemTitle || title;
    rule = named ? `הרשומה "${named}" כובתה. הבוט כבר לא משתמש בה.` : 'הרשומה כובתה. הבוט כבר לא משתמש בה.';
  }
  if (!rule && typeof source.after === 'string') rule = source.after.trim();
  if (!rule && after) rule = [words(after.body), otherContent(after)].filter(Boolean).join('\n');

  // An update: only what really changed, and only what the item says (how it is filed goes below).
  let rows: PlainRow[] = [];
  if (!isNew && action === 'update') {
    if (typeof source.before === 'string' || typeof source.after === 'string') {
      const was = typeof source.before === 'string' ? source.before.trim() : '';
      const now = typeof source.after === 'string' ? source.after.trim() : '';
      if (was !== now && was) rows = [{ key: 'text', label: 'תוכן', before: was, after: now || '—' }];
    } else {
      rows = diffChange(before, after)
        .filter((row) => row.changed && !TECH_FIELDS.has(row.key) && !EXAMPLE_FIELDS.has(row.key))
        .map((row) => ({ key: row.key, label: row.label, before: row.before, after: row.after }));
    }
  }

  const tech: PlainTech[] = [];
  const kindWords = words(plain?.kind_label) || source.kindLabel || (source.kind ? kindLabel(source.kind as WahubKnowledgeKind) : '');
  if (kindWords || source.kind) tech.push({ key: 'kind', label: 'סוג', value: kindWords, code: source.kind || undefined });
  const key = words(after?.key) || words(before?.key);
  if (key) tech.push({ key: 'key', label: 'מפתח', value: '', code: key });
  const when = after?.when_to_say ?? before?.when_to_say;
  let whenWords = words(plain?.when_label);
  if (!whenWords && when) {
    whenWords = formatChangeValue(when);
    // An update that moved it says what it was.
    const was = !isNew && before?.when_to_say ? formatChangeValue(before.when_to_say) : '';
    if (was && was !== whenWords) whenWords = `${whenWords} (היה: ${was})`;
  }
  if (whenWords) tech.push({ key: 'when_to_say', label: 'מתי לומר', value: whenWords });
  if (isNew ? itemTitle : source.itemId != null) {
    tech.push({
      key: 'item',
      label: isNew ? 'שם הרשומה' : 'רשומה',
      value: isNew ? itemTitle : `#${source.itemId}${itemTitle ? ` · ${itemTitle}` : ''}`,
    });
  }
  // Whatever else says how the item is filed, when the change touches it.
  for (const [name, value] of Object.entries(after ?? {})) {
    if (!TECH_FIELDS.has(name) || name === 'kind' || name === 'key' || name === 'when_to_say') continue;
    if (value === null || value === undefined || value === '') continue;
    const now = formatChangeValue(value);
    const was = before && name in before ? formatChangeValue(before[name]) : '';
    tech.push({ key: name, label: fieldLabel(name), value: was && was !== now ? `${now} (היה: ${was})` : now });
  }

  return {
    headline: words(plain?.headline) || title || 'שינוי בידע של הבוט',
    why: words(plain?.why) || source.why.trim(),
    action,
    isNew,
    rule,
    rows,
    exampleBad: words(plain?.example_bad) || words(after?.example_bad) || words(before?.example_bad),
    exampleGood: words(plain?.example_good) || words(after?.example_good) || words(before?.example_good),
    tech,
  };
}

/** A proposal (the floating panel, the review tab). */
export function plainOfProposal(
  proposal: Pick<WahubKnowledgeProposal, 'title' | 'explanation' | 'change' | 'change_kind_label' | 'plain'>,
): PlainChange {
  const change = proposal.change;
  return plainFrom({
    plain: proposal.plain,
    title: proposal.title,
    why: proposal.explanation ?? '',
    action: change?.action ?? 'update',
    kind: change?.kind ?? '',
    kindLabel: proposal.change_kind_label ?? '',
    itemId: change?.item_id ?? null,
    before: change?.before,
    after: change?.after,
  });
}

/** A change a refinement made (the small chat of "דיוק"). The system's own bubble has already said why. */
export function plainOfChange(change: WahubRefineChange): PlainChange {
  return plainFrom({
    // The reason is not said twice: the system's bubble, right above the card, is the reason.
    plain: change.plain ? { ...change.plain, why: '' } : null,
    title: change.title,
    // A change is named after its item.
    itemTitle: change.title,
    why: '',
    action: change.action,
    kind: change.kind,
    kindLabel: change.kind_label,
    itemId: change.item_id,
    before: change.before,
    after: change.after,
  });
}

/** The heading over "what changes": it will, it did, or it did and was taken back. */
export function changeHeading(stands: 'waiting' | 'applied' | 'undone' | 'rejected'): string {
  if (stands === 'applied') return 'מה השתנה';
  if (stands === 'undone') return 'מה בוטל';
  return stands === 'rejected' ? 'מה הוצע' : 'מה ישתנה';
}
