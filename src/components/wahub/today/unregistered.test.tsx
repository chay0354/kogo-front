import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

import type { WahubUnregisteredLead, WahubUnregisteredLeads } from '@/types/wahub';
import { wahubKeys } from '../hooks/useWahubQueries';
import s from '../wahub.module.css';
import UnregisteredCard from './UnregisteredCard';

// The list is read through the API client; here it must never be reached.
vi.mock('@/lib/wahubApi', () => ({
  fetchWahubUnregisteredLeads: vi.fn(() => Promise.reject(new Error('the test must not reach the server'))),
  fetchWahubSummary: vi.fn(),
  fetchWahubStatus: vi.fn(),
  fetchWahubTags: vi.fn(),
  fetchWahubQuickReplies: vi.fn(),
}));

(globalThis as { React?: typeof React }).React = React;

const noop = () => {};

function client(): QueryClient {
  return new QueryClient({ defaultOptions: { queries: { retry: false } } });
}

function render(node: React.ReactElement, queryClient = client()): string {
  return renderToStaticMarkup(<QueryClientProvider client={queryClient}>{node}</QueryClientProvider>);
}

function lead(id: number, overrides: Partial<WahubUnregisteredLead> = {}): WahubUnregisteredLead {
  return {
    id,
    name: `ליד ${id}`,
    phone: `05000000${String(id).padStart(2, '0')}`,
    is_demo: false,
    first_inbound_at: '2026-10-01T10:00:00+03:00',
    last_inbound_at: '2026-10-05T10:00:00+03:00',
    days_since_first: 9,
    days_since_last: 5,
    asked: 'כמה עולה קפוארה לבן 6?',
    known_interest: 'warm',
    known_interest_label: 'מתעניין',
    known_city: 'ראש העין',
    known_branch_name: 'פסגות אפק',
    known_course_type: 'קפוארה',
    kogo_outcome: 'not_found',
    kogo_outcome_label: 'לא נמצא במערכת',
    kogo_detail: '',
    followup_status: '',
    followup_status_label: '',
    followup_due: null,
    hot: false,
    handled_by: 'bot',
    needs_human: false,
    ...overrides,
  };
}

const COUNTS = { total: 12, hot: 4, oldest_days: 23 };

describe('the "שאלו ולא נרשמו" card, closed', () => {
  const html = render(<UnregisteredCard counts={COUNTS} open={false} onToggle={noop} onOpenChat={noop} />);

  it('is the title, the number and the two short lines — nothing more', () => {
    expect(html).toContain('שאלו ולא נרשמו');
    expect(html).toContain('>12<');
    expect(html).toContain('מתוכם חמים 4');
    expect(html).toContain('הוותיק ביותר: לפני 23 ימים');
    expect(html).toContain('aria-expanded="false"');
    // The list, its filters and its loading shape are not there.
    expect(html).not.toContain('רק חמים');
    expect(html).not.toContain('ימים</button>');
    expect(html).not.toContain('aria-busy');
  });

  it('shows a dash while the summary has not answered, and no lines', () => {
    const waiting = render(<UnregisteredCard counts={undefined} open={false} onToggle={noop} onOpenChat={noop} />);
    expect(waiting).toContain('>–<');
    expect(waiting).not.toContain('מתוכם חמים');
  });

  it('a zero reads as zero, with no lines under it', () => {
    const none = render(
      <UnregisteredCard counts={{ total: 0, hot: 0, oldest_days: null }} open={false} onToggle={noop} onOpenChat={noop} />,
    );
    expect(none).toContain('>0<');
    expect(none).not.toContain('הוותיק ביותר');
  });
});

describe('the "שאלו ולא נרשמו" card, open', () => {
  const page: WahubUnregisteredLeads = {
    days: 30,
    counts: { total: 3, hot: 1, oldest_days: 23 },
    leads: [
      lead(1, { name: 'דנה כהן', hot: true, kogo_outcome: 'signup_declined', kogo_outcome_label: 'ניסה להירשם והחיוב נכשל', days_since_last: 2 }),
      lead(2, { name: 'רונית לב', is_demo: true, followup_status: 'no_answer', followup_status_label: 'לא ענה', days_since_last: 23 }),
      lead(3, { name: '', asked: '', needs_human: true, days_since_last: 0 }),
    ],
  };

  function seeded(data: WahubUnregisteredLeads): QueryClient {
    const queryClient = client();
    queryClient.setQueryData(wahubKeys.unregistered(30, false), data);
    return queryClient;
  }

  it('shows the filters: "רק חמים" and 7 / 30 / 90 days, opening on 30', () => {
    const html = render(<UnregisteredCard counts={COUNTS} open onToggle={noop} onOpenChat={noop} />, seeded(page));
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('רק חמים');
    for (const range of ['7 ימים', '30 ימים', '90 ימים']) expect(html).toContain(range);
    // One range is pressed (30), and "רק חמים" is not.
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    const pressed = html.indexOf('aria-pressed="true"');
    expect(html.slice(pressed, html.indexOf('</button>', pressed))).toContain('30 ימים');
  });

  it('a row: the name (or the phone), what he asked, how long ago, the Kogo outcome, the mark, and "חם"', () => {
    const html = render(<UnregisteredCard counts={COUNTS} open onToggle={noop} onOpenChat={noop} />, seeded(page));
    expect(html).toContain('דנה כהן');
    expect(html).toContain('כמה עולה קפוארה לבן 6?');
    expect(html).toContain('לפני יומיים');
    expect(html).toContain('ניסה להירשם והחיוב נכשל');
    expect(html).toContain('לא נמצא במערכת');
    expect(html).toContain('לא ענה');
    expect(html).toContain('>חם<');
    // The demo contact is marked, the one without a name shows his phone, and
    // the one who asked for a person carries the red dot.
    expect(html).toContain('רונית לב');
    expect(html).toContain('דמו');
    expect(html).toContain('0500000003');
    expect(html).toContain('לא נשמר מה שאל');
    expect(html).toContain('aria-label="מבקש נציג"');
    expect(html).toContain('לפני 23 ימים');
    expect(html).toContain('>היום<');
    // The whole row is a button into the conversation, and the counts line reads off the list.
    expect(html.match(new RegExp(`class="${s.listRow}`, 'g'))).toHaveLength(3);
    expect(html).toContain('3 בטווח · 1 חמים');
  });

  it('with nobody on the list says so, and what the list leaves out', () => {
    const html = render(
      <UnregisteredCard counts={COUNTS} open onToggle={noop} onOpenChat={noop} />,
      seeded({ days: 30, counts: { total: 0, hot: 0, oldest_days: null }, leads: [] }),
    );
    expect(html).toContain('אין מי ששאל ולא נרשם בטווח הזה');
    expect(html).toContain('30 הימים האחרונים');
  });

  it('before the list has answered it shows the loading rows, not an empty list', () => {
    const html = render(<UnregisteredCard counts={COUNTS} open onToggle={noop} onOpenChat={noop} />);
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('אין מי ששאל');
  });
});
