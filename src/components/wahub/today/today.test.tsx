import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import type { WahubSummary } from '@/types/wahub';
import { wahubKeys } from '../hooks/useWahubQueries';
import { leadsKeys } from '../leads/v2/useLeads';
import TodayTab from '../TodayTab';
import s from '../wahub.module.css';

// The day's tab reads through the API client; here it must never be reached.
vi.mock('@/lib/wahubApi', async (original) => ({
  ...(await original<typeof import('@/lib/wahubApi')>()),
  fetchWahubSummary: vi.fn(() => Promise.reject(new Error('the test must not reach the server'))),
  fetchWahubContacts: vi.fn(() => Promise.reject(new Error('the test must not reach the server'))),
  fetchWahubUnregisteredLeads: vi.fn(() => Promise.reject(new Error('the test must not reach the server'))),
}));

// The components are compiled with the classic JSX runtime here, which looks for React by name.
(globalThis as { React?: typeof React }).React = React;

/**
 * The day's tab (docs/WAHUB-CONTRACT-LEAD-STAGES.md, ב; docs/WAHUB-CONTRACT-LAYOUT.md, ג):
 * "דורש טיפול" stands where "שאלו ולא נרשמו" stood on a server that knows the
 * lead states, and nowhere else; the tiles wait as tiles; a summary that
 * failed says so in its own area and leaves the lists under it alone.
 */

const noop = () => {};

const SUMMARY: WahubSummary = {
  waiting: 3,
  needs_human: 1,
  unread: 4,
  due_followups: 2,
  new_contacts_today: 5,
  new_contacts_7d: 31,
  inbound_today: 42,
  outbound_today: 38,
  oldest_waiting_since: null,
  by_day: [],
  unregistered_leads: { total: 14, hot: 5, oldest_days: 22 },
};

const LEAD_ACT = {
  total: 6,
  stages: [
    { key: 'needs_reply', label: 'שאל ולא קיבל תשובה', count: 2 },
    { key: 'answered_silent', label: 'קיבל תשובה ולא נרשם', count: 4 },
  ],
};

function today(client: QueryClient): string {
  return renderToStaticMarkup(
    <QueryClientProvider client={client}>
      <TodayTab status={undefined} onGo={noop} onOpenChat={noop} />
    </QueryClientProvider>,
  );
}

function withSummary(summary: WahubSummary): QueryClient {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(wahubKeys.summary, summary);
  // A server from before the leads of version 2: `leads/` answered 404. (What a server that has it shows
  // in this card's place is tested beside the new screen, in leads/v2.)
  client.setQueryData(leadsKeys.glance, null);
  return client;
}

describe('the day\'s tab and the lead states', () => {
  it('on a server that sends `lead_act`: "דורש טיפול" with its states, in place of "שאלו ולא נרשמו"', () => {
    const html = today(withSummary({ ...SUMMARY, lead_act: LEAD_ACT }));
    expect(html).toContain('aria-label="דורש טיפול"');
    expect(html).toContain('שאל ולא קיבל תשובה');
    expect(html).toContain('קיבל תשובה ולא נרשם');
    expect(html).not.toContain('שאלו ולא נרשמו');
  });

  it('on a server that does not: "שאלו ולא נרשמו" stays exactly where it was', () => {
    const html = today(withSummary(SUMMARY));
    expect(html).toContain('aria-label="שאלו ולא נרשמו"');
    expect(html).toContain('>14<');
    expect(html).not.toContain('aria-label="דורש טיפול"');
  });

  it('the four tiles are there either way, with their numbers', () => {
    for (const client of [withSummary(SUMMARY), withSummary({ ...SUMMARY, lead_act: LEAD_ACT })]) {
      const html = today(client);
      for (const label of ['מחכים לתשובה', 'מבקשים נציג', 'לחזור אליהם היום', 'פניות חדשות היום']) expect(html).toContain(label);
      expect(html).toContain(s.tiles);
    }
  });
});

describe('the day\'s tab: waiting and failing', () => {
  it('before the summary has answered: tiles and a card of their own shape — no dashes, no empty page', () => {
    const html = today(new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    expect(html.match(new RegExp(s.skTile, 'g'))).toHaveLength(4);
    expect(html).toContain(s.skRow);
    expect(html).not.toContain('>–<');
    // The two lists under it wait as rows of their own.
    expect(html).toContain('מחכים הכי הרבה זמן');
    expect(html).toContain('לחזור אליהם היום');
  });

  it('a summary that failed says so with "נסה שוב" in its own area; the two lists under it are still there', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, retryOnMount: false } } });
    client.getQueryCache().build(client, { queryKey: wahubKeys.summary }).setState({ status: 'error', error: new Error('boom'), fetchStatus: 'idle' });
    const html = today(client);
    expect(html).toContain('role="alert"');
    expect(html).toContain('לא הצלחנו לטעון את נתוני היום');
    expect(html).toContain('נסה שוב');
    expect(html).not.toContain(s.skTile);
    expect(html).toContain('מחכים הכי הרבה זמן');
    expect(html).toContain('לחזור אליהם היום');
  });
});
