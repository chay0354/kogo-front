import type {
  WahubBotSub,
  WahubBox,
  WahubContactsQuery,
  WahubQueue,
  WahubSharedFilters,
  WahubTab,
} from '@/types/wahub';

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
  } else {
    if (query.queue && query.queue !== 'all') params.queue = query.queue;
    if (query.showHidden) params.show_hidden = '1';
  }
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
export const WAHUB_BOT_SUBS: WahubBotSub[] = ['knowledge', 'hours', 'try', 'shadow', 'review', 'demo'];

export const WAHUB_BOXES: WahubBox[] = ['all', 'waiting', 'needs_human', 'unread', 'human', 'bot'];

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
  return WAHUB_BOXES.includes(value as WahubBox) ? (value as WahubBox) : 'all';
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
  };
}

/**
 * /wahub?tab=chats&contact=12 — /wahub?tab=bot&sub=hours — /wahub?tab=bot&item=7
 *
 * The tab is always written, so a copied link says where it leads. An open
 * conversation belongs to the chats tab only; a sub-tab and an open knowledge
 * item belong to the bot tab only.
 */
export function buildWahubUrl(state: WahubUrlState, pathname = '/wahub'): string {
  const params = new URLSearchParams();
  params.set('tab', state.tab);
  if (state.tab === 'chats') {
    if (state.box !== 'all') params.set('box', state.box);
    if (state.contact) params.set('contact', String(state.contact));
  }
  if (state.tab === 'leads' && state.queue !== 'all') params.set('queue', state.queue);
  if (state.tab === 'bot') {
    if (state.sub !== 'knowledge') params.set('sub', state.sub);
    if (state.sub === 'knowledge' && state.item) params.set('item', String(state.item));
  }
  return `${pathname}?${params.toString()}`;
}
