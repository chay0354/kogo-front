import { describe, expect, test } from 'vitest';

import {
  buildWahubUrl,
  contactsParams,
  countsParams,
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
    });
  });

  test('opens on the conversations tab when the address says nothing', () => {
    expect(parseWahubUrl(new URLSearchParams(''))).toEqual({ tab: 'chats', contact: null, box: 'all', queue: 'all' });
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

  test('writes a link that opens the same conversation', () => {
    expect(buildWahubUrl({ tab: 'chats', contact: 12, box: 'all', queue: 'all' })).toBe('/wahub?tab=chats&contact=12');
  });

  test('a box and a queue are written only when one is chosen, each on its own tab', () => {
    expect(buildWahubUrl({ tab: 'chats', contact: null, box: 'waiting', queue: 'due' })).toBe(
      '/wahub?tab=chats&box=waiting',
    );
    expect(buildWahubUrl({ tab: 'leads', contact: 12, box: 'waiting', queue: 'due' })).toBe('/wahub?tab=leads&queue=due');
    expect(buildWahubUrl({ tab: 'today', contact: 12, box: 'waiting', queue: 'due' })).toBe('/wahub?tab=today');
  });

  test('what is written is what is read back', () => {
    const state = { tab: 'chats' as const, contact: 44, box: 'unread' as const, queue: 'all' as const };
    const url = buildWahubUrl(state);
    expect(parseWahubUrl(new URLSearchParams(url.split('?')[1]))).toEqual(state);
  });
});
