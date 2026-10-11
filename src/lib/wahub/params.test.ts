import { describe, expect, test } from 'vitest';

import {
  buildWahubUrl,
  contactsParams,
  countsParams,
  parseBotSub,
  parseBox,
  parseContactId,
  parseQueue,
  parseTab,
  parseWahubUrl,
  sharedFilterParams,
} from './params';

describe('contactsParams', () => {
  test('the conversations list with nothing chosen asks for the view alone', () => {
    expect(contactsParams({ view: 'chats' })).toEqual({ view: 'chats' });
  });

  test('"all" is the default and is not sent', () => {
    expect(contactsParams({ view: 'chats', box: 'all' })).toEqual({ view: 'chats' });
    expect(contactsParams({ view: 'leads', queue: 'all' })).toEqual({ view: 'leads' });
  });

  test('a box goes with the conversations view', () => {
    expect(contactsParams({ view: 'chats', box: 'needs_human', search: 'דנה' })).toEqual({
      view: 'chats',
      box: 'needs_human',
      search: 'דנה',
    });
  });

  test('a queue and the hidden switch go with the leads view', () => {
    expect(contactsParams({ view: 'leads', queue: 'due', showHidden: true })).toEqual({
      view: 'leads',
      queue: 'due',
      show_hidden: '1',
    });
  });

  test('a value left over from the other tab is never sent', () => {
    expect(contactsParams({ view: 'chats', queue: 'due', showHidden: true })).toEqual({ view: 'chats' });
    expect(contactsParams({ view: 'leads', box: 'waiting' })).toEqual({ view: 'leads' });
  });

  test('every shared filter is sent under the contract name, and empty ones are left out', () => {
    expect(
      contactsParams({
        view: 'leads',
        search: '  050  ',
        tag: '4',
        branch: '3',
        outcome: 'trial_only',
        topic: 'trial',
        interest: '',
        flag: 'price',
      }),
    ).toEqual({
      view: 'leads',
      search: '050',
      tag: '4',
      branch: '3',
      outcome: 'trial_only',
      topic: 'trial',
      flag: 'price',
    });
  });

  test('a lead state narrows the list: one state, or a whole group of them', () => {
    expect(contactsParams({ view: 'chats', leadStage: 'needs_reply' })).toEqual({ view: 'chats', lead_stage: 'needs_reply' });
    expect(contactsParams({ view: 'chats', leadGroup: 'act', search: 'דנה' })).toEqual({
      view: 'chats',
      lead_group: 'act',
      search: 'דנה',
    });
    // Nothing is sent for a state that was not asked for.
    expect(contactsParams({ view: 'chats', leadStage: '' })).toEqual({ view: 'chats' });
  });

  test('the first page is the default; later ones are named', () => {
    expect(contactsParams({ view: 'chats', page: 1 })).toEqual({ view: 'chats' });
    expect(contactsParams({ view: 'chats', page: 3 })).toEqual({ view: 'chats', page: '3' });
  });

  test('the page size is kept within what the server allows', () => {
    expect(contactsParams({ view: 'chats', pageSize: 40 }).page_size).toBe('40');
    expect(contactsParams({ view: 'chats', pageSize: 500 }).page_size).toBe('100');
  });
});

describe('countsParams', () => {
  test('takes the shared filters only', () => {
    expect(countsParams({ search: 'נועה', topic: 'info', branch: '' })).toEqual({ search: 'נועה', topic: 'info' });
    expect(countsParams({})).toEqual({});
  });

  test('says when the hidden contacts are on screen too', () => {
    expect(countsParams({ tag: '2' }, { showHidden: true })).toEqual({ tag: '2', show_hidden: '1' });
  });
});

describe('sharedFilterParams', () => {
  test('drops whitespace-only values', () => {
    expect(sharedFilterParams({ search: '   ', tag: '7' })).toEqual({ tag: '7' });
  });
});

describe('the address of the page', () => {
  test('reads the tab and the open conversation', () => {
    expect(parseWahubUrl(new URLSearchParams('tab=chats&contact=12'))).toEqual({
      tab: 'chats',
      contact: 12,
      box: 'all',
      queue: 'all',
      sub: 'knowledge',
      item: null,
      stage: null,
      owner: 'office',
      lead: null,
    });
  });

  test('opens on the conversations tab when the address says nothing', () => {
    expect(parseWahubUrl(new URLSearchParams(''))).toEqual({
      tab: 'chats',
      contact: null,
      box: 'all',
      queue: 'all',
      sub: 'knowledge',
      item: null,
      stage: null,
      owner: 'office',
      lead: null,
    });
    expect(parseWahubUrl(null).tab).toBe('chats');
  });

  test('anything it does not know falls back rather than breaking the page', () => {
    expect(parseTab('nonsense')).toBe('chats');
    expect(parseBox('nonsense')).toBe('all');
    expect(parseQueue('waiting')).toBe('all');
    expect(parseContactId('abc')).toBeNull();
    expect(parseContactId('-3')).toBeNull();
    expect(parseContactId('0')).toBeNull();
    expect(parseContactId('12')).toBe(12);
  });

  const base = { contact: null, box: 'all', queue: 'all', sub: 'knowledge', item: null, stage: null, owner: 'office', lead: null } as const;

  test('writes a link that opens the same conversation', () => {
    expect(buildWahubUrl({ ...base, tab: 'chats', contact: 12 })).toBe('/wahub?tab=chats&contact=12');
  });

  test('a box and a queue are written only when one is chosen, each on its own tab', () => {
    expect(buildWahubUrl({ ...base, tab: 'chats', box: 'waiting', queue: 'due' })).toBe('/wahub?tab=chats&box=waiting');
    expect(buildWahubUrl({ ...base, tab: 'leads', contact: 12, box: 'waiting', queue: 'due' })).toBe('/wahub?tab=leads&queue=due');
    expect(buildWahubUrl({ ...base, tab: 'today', contact: 12, box: 'waiting', queue: 'due' })).toBe('/wahub?tab=today');
  });

  test('the bot tab writes its sub-tab, and an open knowledge item on the knowledge sub-tab only', () => {
    expect(buildWahubUrl({ ...base, tab: 'bot' })).toBe('/wahub?tab=bot');
    expect(buildWahubUrl({ ...base, tab: 'bot', sub: 'hours' })).toBe('/wahub?tab=bot&sub=hours');
    expect(buildWahubUrl({ ...base, tab: 'bot', item: 7 })).toBe('/wahub?tab=bot&item=7');
    expect(buildWahubUrl({ ...base, tab: 'bot', sub: 'shadow', item: 7 })).toBe('/wahub?tab=bot&sub=shadow');
    // A sub-tab left over from the bot tab is never written on another tab.
    expect(buildWahubUrl({ ...base, tab: 'chats', sub: 'review', item: 7 })).toBe('/wahub?tab=chats');
  });

  test('an unknown sub-tab opens the knowledge', () => {
    expect(parseBotSub('nonsense')).toBe('knowledge');
    expect(parseBotSub('review')).toBe('review');
    expect(parseBotSub('demo')).toBe('demo');
    expect(parseWahubUrl(new URLSearchParams('tab=bot&sub=try')).sub).toBe('try');
    expect(parseWahubUrl(new URLSearchParams('tab=bot&item=9')).item).toBe(9);
  });

  test('the leads tab writes the lead state it is open on, and no other tab does', () => {
    expect(buildWahubUrl({ ...base, tab: 'leads', stage: 'needs_reply' })).toBe('/wahub?tab=leads&stage=needs_reply');
    expect(buildWahubUrl({ ...base, tab: 'leads' })).toBe('/wahub?tab=leads');
    expect(buildWahubUrl({ ...base, tab: 'chats', stage: 'needs_reply' })).toBe('/wahub?tab=chats');
    expect(parseWahubUrl(new URLSearchParams('tab=leads&stage=trial_done')).stage).toBe('trial_done');
    // Anything that is not a plain key is dropped rather than sent on to the server.
    expect(parseWahubUrl(new URLSearchParams('tab=leads&stage=Trial Done')).stage).toBeNull();
    expect(buildWahubUrl({ ...base, tab: 'leads', stage: '<script>' })).toBe('/wahub?tab=leads');
  });

  test('the leads tab writes which list is in front and the lead that is open, and no other tab does', () => {
    expect(buildWahubUrl({ ...base, tab: 'leads', owner: 'bot' })).toBe('/wahub?tab=leads&owner=bot');
    // "מחכים לך" is where the tab opens: it is not written.
    expect(buildWahubUrl({ ...base, tab: 'leads', owner: 'office', lead: 12 })).toBe('/wahub?tab=leads&lead=12');
    expect(buildWahubUrl({ ...base, tab: 'leads', owner: 'closed', stage: 'deleted', lead: 7 })).toBe(
      '/wahub?tab=leads&owner=closed&stage=deleted&lead=7',
    );
    expect(buildWahubUrl({ ...base, tab: 'chats', owner: 'bot', lead: 12 })).toBe('/wahub?tab=chats');
    expect(parseWahubUrl(new URLSearchParams('tab=leads&owner=bot&lead=12'))).toMatchObject({ owner: 'bot', lead: 12 });
    // Anything it does not know opens the list that waits for the office, with no lead open.
    expect(parseWahubUrl(new URLSearchParams('tab=leads&owner=everyone&lead=abc'))).toMatchObject({ owner: 'office', lead: null });
  });

  test('a link written before the lead states (no stage at all) still builds', () => {
    expect(buildWahubUrl({ tab: 'chats', contact: 12, box: 'all', queue: 'all', sub: 'knowledge', item: null })).toBe(
      '/wahub?tab=chats&contact=12',
    );
  });

  test('what is written is what is read back', () => {
    const state = { ...base, tab: 'chats' as const, contact: 44, box: 'unread' as const };
    const url = buildWahubUrl(state);
    expect(parseWahubUrl(new URLSearchParams(url.split('?')[1]))).toEqual(state);
    const bot = { ...base, tab: 'bot' as const, sub: 'hours' as const };
    expect(parseWahubUrl(new URLSearchParams(buildWahubUrl(bot).split('?')[1]))).toEqual(bot);
    const leads = { ...base, tab: 'leads' as const, stage: 'answered_silent' };
    expect(parseWahubUrl(new URLSearchParams(buildWahubUrl(leads).split('?')[1]))).toEqual(leads);
    const open = { ...base, tab: 'leads' as const, owner: 'bot' as const, stage: 'link_sent', lead: 31 };
    expect(parseWahubUrl(new URLSearchParams(buildWahubUrl(open).split('?')[1]))).toEqual(open);
  });
});
