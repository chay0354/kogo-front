import type {
  WahubBotSub,
  WahubBox,
  WahubContactsQuery,
  WahubLeadsView,
  WahubQueue,
  WahubSharedFilters,
  WahubTab,
} from '@/types/wahub';
import { parseStage } from './leadStage';
import { parseLeadsView } from './leadsV2';

/** One page of a list. The server's own default; its ceiling is 100. */
export const WAHUB_PAGE_SIZE = 40;
export const WAHUB_MAX_PAGE_SIZE = 100;

const SHARED_KEYS: Array<keyof WahubSharedFilters> = [
  'search',
  'tag',
  'branch',
  'outcome',
  'topic',
  'interest',
  'flag',
];

/** The filters both lists and the counts take. Empty ones are left out. */
export function sharedFilterParams(filters: WahubSharedFilters): Record<string, string> {
  const params: Record<string, string> = {};
  for (const key of SHARED_KEYS) {
    const value = String(filters[key] ?? '').trim();
    if (value) params[key] = value;
  }
  return params;
}

/**
 * The query of GET contacts/.
 *
 * A box belongs to the chats view and a queue to the leads view; the other one
 * is never sent, so a value left over from the other tab cannot narrow a list
 * it has nothing to do with. "all" is the server's default and is left out.
 */
export function contactsParams(query: WahubContactsQuery): Record<string, string> {
  const params: Record<string, string> = { view: query.view };
  if (query.view === 'chats') {
    if (query.box && query.box !== 'all') params.box = query.box;
    if (query.liveTest) params.live_test = '1';
  } else {
    if (query.queue && query.queue !== 'all') params.queue = query.queue;
    if (query.showHidden) params.show_hidden = '1';
  }
  // A lead state narrows either list (docs/WAHUB-CONTRACT-LEAD-STAGES.md): one state, or a whole group of them.
  if (query.leadStage) params.lead_stage = query.leadStage;
  if (query.leadGroup) params.lead_group = query.leadGroup;
  Object.assign(params, sharedFilterParams(query));
  if (query.page && query.page > 1) params.page = String(query.page);
  if (query.pageSize) {
    params.page_size = String(Math.min(Math.max(1, query.pageSize), WAHUB_MAX_PAGE_SIZE));
  }
  return params;
}

/** The query of GET contacts/counts/ — the shared filters only. */
export function countsParams(
  filters: WahubSharedFilters,
  options: { showHidden?: boolean } = {},
): Record<string, string> {
  const params = sharedFilterParams(filters);
  if (options.showHidden) params.show_hidden = '1';
  return params;
}

export const WAHUB_TABS: WahubTab[] = ['chats', 'today', 'leads', 'bot', 'settings'];

/** The sub-tabs of "הבוט", in the order they are shown. It opens on the knowledge. */
export const WAHUB_BOT_SUBS: WahubBotSub[] = ['teach', 'knowledge', 'hours', 'try', 'evals', 'shadow', 'review', 'demo'];

export const WAHUB_BOXES: WahubBox[] = ['all', 'waiting', 'needs_human', 'unread', 'human', 'bot', 'open', 'future', 'birthday'];

/**
 * The box the conversations open on when the address names none: "פתוחות" — what waits for a person now (owner,
 * 13.10.2026: "שיהיה פתוחות קודם"). A server that does not count that box shows "הכול" instead, as it always did
 * (lib/wahub/boxes.ts, shownBox). A box the address does name — "הכול" among them — is the one shown.
 */
export const DEFAULT_CHAT_BOX: WahubBox = 'open';

export const WAHUB_QUEUES: WahubQueue[] = [
  'all',
  'due',
  'none',
  'no_answer',
  'answered',
  'later',
  'registered',
  'not_relevant',
];

export function parseTab(value: string | null | undefined): WahubTab {
  return WAHUB_TABS.includes(value as WahubTab) ? (value as WahubTab) : 'chats';
}

export function parseBox(value: string | null | undefined): WahubBox {
  return WAHUB_BOXES.includes(value as WahubBox) ? (value as WahubBox) : DEFAULT_CHAT_BOX;
}

export function parseQueue(value: string | null | undefined): WahubQueue {
  return WAHUB_QUEUES.includes(value as WahubQueue) ? (value as WahubQueue) : 'all';
}

export function parseContactId(value: string | null | undefined): number | null {
  if (!value || !/^\d+$/.test(value)) return null;
  const id = Number(value);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function parseBotSub(value: string | null | undefined): WahubBotSub {
  // "מה הבוט לא ידע השבוע" stands at the head of "ללמד", not in a sub-tab of its own: the address the server
  // writes for it (`sub=unknowns`, docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ט.3.4) opens "ללמד".
  if (value === 'unknowns') return 'teach';
  return WAHUB_BOT_SUBS.includes(value as WahubBotSub) ? (value as WahubBotSub) : 'knowledge';
}

/** What the address of the page holds, so a link opens the same thing. */
export interface WahubUrlState {
  tab: WahubTab;
  contact: number | null;
  box: WahubBox;
  queue: WahubQueue;
  /** The sub-tab of "הבוט". */
  sub: WahubBotSub;
  /** A knowledge item to open, on the knowledge sub-tab. */
  item: number | null;
  /** The lead state the leads tab is open on (the board), or filtered by (the list). Null: none. */
  stage?: string | null;
  /** Which list of the leads tab is in front: waiting for the office (the default), the bot's, or the closed ones. */
  owner?: WahubLeadsView;
  /** The lead whose details are open, on the leads tab. */
  lead?: number | null;
  /** The full waiting list stands in place of the leads' lists (`list=waiting`), on the leads tab. */
  waiting?: boolean;
}

interface ParamReader {
  get(name: string): string | null;
}

export function parseWahubUrl(params: ParamReader | null | undefined): WahubUrlState {
  return {
    tab: parseTab(params?.get('tab')),
    contact: parseContactId(params?.get('contact')),
    box: parseBox(params?.get('box')),
    queue: parseQueue(params?.get('queue')),
    sub: parseBotSub(params?.get('sub')),
    item: parseContactId(params?.get('item')),
    stage: parseStage(params?.get('stage')),
    owner: parseLeadsView(params?.get('owner')),
    lead: parseContactId(params?.get('lead')),
    // Said only when it is so: an address that does not name it is the leads' own lists.
    ...(params?.get('list') === 'waiting' ? { waiting: true } : {}),
  };
}

/**
 * /wahub?tab=chats&contact=12 — /wahub?tab=chats&box=all — /wahub?tab=bot&sub=hours — /wahub?tab=bot&item=7 —
 * /wahub?tab=leads&stage=needs_reply — /wahub?tab=leads&owner=bot&lead=12 — /wahub?tab=leads&list=waiting
 *
 * The tab is always written, so a copied link says where it leads. An open
 * conversation belongs to the chats tab only; a sub-tab and an open knowledge
 * item belong to the bot tab only; a list of leads and an open lead belong to
 * the leads tab only.
 */
export function buildWahubUrl(state: WahubUrlState, pathname = '/wahub'): string {
  const params = new URLSearchParams();
  params.set('tab', state.tab);
  if (state.tab === 'chats') {
    // The box the tab opens on by itself is not written; every other — "הכול" too — is, so a link keeps it.
    if (state.box !== DEFAULT_CHAT_BOX) params.set('box', state.box);
    if (state.contact) params.set('contact', String(state.contact));
  }
  if (state.tab === 'leads') {
    if (state.queue !== 'all') params.set('queue', state.queue);
    const owner = parseLeadsView(state.owner);
    if (owner !== 'office') params.set('owner', owner);
    const stage = parseStage(state.stage);
    if (stage) params.set('stage', stage);
    if (state.lead) params.set('lead', String(state.lead));
    if (state.waiting) params.set('list', 'waiting');
  }
  if (state.tab === 'bot') {
    if (state.sub !== 'knowledge') params.set('sub', state.sub);
    if (state.sub === 'knowledge' && state.item) params.set('item', String(state.item));
  }
  return `${pathname}?${params.toString()}`;
}
