/**
 * קישורי אשראי: what the office reads off one row, which rows the page's
 * shared filters keep, and how the four-word answer — ממתין, הסתיים, דורש
 * טיפול, בוטל — is reached from two tables that do not share a vocabulary.
 */
import { describe, expect, it } from 'vitest';
import type { LinkOverviewRow } from '@/lib/paymentLinksApi';
import type { LedgerFilters } from './types';
import {
  CARD_LINKS_HIDDEN_FIELDS,
  compareLinks,
  linkOutcome,
  linkOutcomeLabel,
  linkSentLabel,
  linkStatusNote,
  matchesLinkFilters,
  matchesLinkSearch,
  summarizeLinks,
} from './CardLinksTab';

function filters(overrides: Partial<LedgerFilters> = {}): LedgerFilters {
  return {
    dateFrom: '2026-08-12',
    dateTo: '2026-09-11',
    business: '',
    cityId: '',
    branchId: '',
    courseTypeId: '',
    ageKey: '',
    instructorId: '',
    search: '',
    ...overrides,
  };
}

function row(overrides: Partial<LinkOverviewRow> = {}): LinkOverviewRow {
  return {
    id: 'l-1',
    source: 'card_link',
    kind: 'standing_order',
    kind_label: 'הוראת קבע',
    mode: '',
    mode_label: '',
    status: 'pending',
    status_label: 'ממתין',
    child_id: 'c-1',
    child_name: 'נועה כהן',
    family_name: 'כהן',
    branch_id: 'b-1',
    branch_name: 'מרכז',
    business_id: null,
    business_name: '',
    amount: null,
    description: 'היפ הופ · יום ב׳',
    created_at: '2026-09-01T08:00:00+03:00',
    created_by_name: 'מיכל',
    sent_at: null,
    sent_via: '',
    first_opened_at: null,
    completed_at: null,
    last_error: '',
    public_url: 'https://crm.example/c/abc',
    ...overrides,
  };
}

describe('linkOutcome', () => {
  it('calls a card link and a card-update link done by their own words', () => {
    expect(linkOutcome(row({ status: 'completed' }))).toBe('done');
    expect(linkOutcome(row({ source: 'card_update', kind: 'card_update', status: 'charged' }))).toBe('done');
    expect(linkOutcome(row({ source: 'card_update', kind: 'card_update', status: 'card_saved' }))).toBe('done');
  });

  it('is waiting while the link is out there and nothing went wrong', () => {
    expect(linkOutcome(row({ status: 'pending' }))).toBe('waiting');
    expect(linkOutcome(row({ status: 'processing' }))).toBe('waiting');
    expect(linkOutcome(row({ source: 'card_update', status: 'created' }))).toBe('waiting');
    expect(linkOutcome(row({ source: 'card_update', status: 'opened' }))).toBe('waiting');
  });

  it('needs somebody when a card was refused or a charge is unresolved', () => {
    expect(linkOutcome(row({ status: 'review' }))).toBe('problem');
    expect(linkOutcome(row({ source: 'card_update', status: 'declined' }))).toBe('problem');
  });

  it('a link still pending after a failed attempt is a problem, not a wait', () => {
    expect(linkOutcome(row({ status: 'pending', last_error: 'הכרטיס נדחה' }))).toBe('problem');
  });

  it('keeps cancelled apart from both — nobody is waiting and nothing went wrong', () => {
    expect(linkOutcome(row({ status: 'cancelled' }))).toBe('cancelled');
    expect(linkOutcomeLabel('cancelled')).toBe('בוטל');
  });
});

describe('linkSentLabel', () => {
  it('says who carried the link, and admits when we do not know', () => {
    expect(linkSentLabel(row({ sent_via: 'whatsapp', sent_at: '2026-09-02T09:00:00+03:00' }))).toBe('וואטסאפ');
    // A send that ManyChat refused: the row exists, the parent never got it.
    expect(linkSentLabel(row({ sent_via: 'whatsapp', sent_at: null }))).toBe('וואטסאפ — לא נשלח');
    // Copied out of the CRM — we never learn when it was pasted.
    expect(linkSentLabel(row({ sent_via: 'copy' }))).toBe('הועתק מהמשרד');
    expect(linkSentLabel(row({ sent_via: '' }))).toBe('טרם נשלח');
  });
});

describe('linkStatusNote', () => {
  it('puts the error first, because that is what the office is calling about', () => {
    const note = linkStatusNote(row({
      last_error: 'הכרטיס נדחה',
      completed_at: '2026-09-03T09:00:00+03:00',
      first_opened_at: '2026-09-02T09:00:00+03:00',
    }));
    expect(note).toBe('הכרטיס נדחה');
  });

  it('then how it ended, then that it was at least opened, then that it was sent', () => {
    expect(linkStatusNote(row({ completed_at: '2026-09-03T09:00:00+03:00' }))).toBe('הסתיים ב-3.9.2026');
    expect(linkStatusNote(row({ first_opened_at: '2026-09-02T09:00:00+03:00' }))).toBe('נפתח ב-2.9.2026');
    expect(linkStatusNote(row({ sent_at: '2026-09-01T09:00:00+03:00' }))).toBe('נשלח ב-1.9.2026');
    expect(linkStatusNote(row())).toBe('');
  });
});

describe('matchesLinkFilters', () => {
  it('keeps the links of the chosen branch and drops the rest', () => {
    expect(matchesLinkFilters(row(), filters({ business: 'branches', branchId: 'b-1' }))).toBe(true);
    expect(matchesLinkFilters(row(), filters({ business: 'branches', branchId: 'b-2' }))).toBe(false);
  });

  it('a one-time link tagged to a business is not branch income', () => {
    const shirt = row({ kind: 'one_time', business_id: 'biz-1', description: 'חולצה' });
    expect(matchesLinkFilters(shirt, filters({ business: 'branches' }))).toBe(false);
    expect(matchesLinkFilters(shirt, filters({ business: 'biz-1' }))).toBe(true);
  });

  it('narrows on when the link was created, so the range on screen means something', () => {
    expect(matchesLinkFilters(row(), filters({ dateFrom: '2026-09-02' }))).toBe(false);
    expect(matchesLinkFilters(row(), filters({ dateTo: '2026-08-31' }))).toBe(false);
    expect(matchesLinkFilters(row(), filters())).toBe(true);
  });

  it('hides no shared field, so nothing is filtered on off screen', () => {
    expect([...CARD_LINKS_HIDDEN_FIELDS]).toEqual([]);
  });
});

describe('matchesLinkSearch', () => {
  it('finds a link by the child, the family, what it is for, and who made it', () => {
    expect(matchesLinkSearch(row(), 'נועה')).toBe(true);
    expect(matchesLinkSearch(row(), 'כהן')).toBe(true);
    expect(matchesLinkSearch(row(), 'היפ הופ')).toBe(true);
    expect(matchesLinkSearch(row(), 'מיכל')).toBe(true);
    expect(matchesLinkSearch(row(), 'מרכז')).toBe(true);
    expect(matchesLinkSearch(row(), 'דנה')).toBe(false);
  });

  it('an empty search keeps everything', () => {
    expect(matchesLinkSearch(row(), '   ')).toBe(true);
  });
});

describe('compareLinks', () => {
  it('puts the newest link first, whichever table it came from', () => {
    const older = row({ id: 'a', created_at: '2026-09-01T08:00:00+03:00' });
    const newer = row({ id: 'b', source: 'card_update', created_at: '2026-09-05T08:00:00+03:00' });
    expect([older, newer].sort(compareLinks).map((link) => link.id)).toEqual(['b', 'a']);
  });
});

describe('summarizeLinks', () => {
  it('counts what is out there, what is finished, what is stuck, and what is fresh', () => {
    const summary = summarizeLinks(
      [
        row({ id: '1', status: 'pending', created_at: '2026-09-10T08:00:00+03:00' }),
        row({ id: '2', status: 'completed', created_at: '2026-09-09T08:00:00+03:00' }),
        row({ id: '3', status: 'review', created_at: '2026-08-20T08:00:00+03:00' }),
        row({ id: '4', status: 'cancelled', created_at: '2026-08-19T08:00:00+03:00' }),
        row({ id: '5', source: 'card_update', status: 'declined', created_at: '2026-09-08T08:00:00+03:00' }),
      ],
      '2026-09-05',
    );

    expect(summary).toEqual({ total: 5, waiting: 1, done: 1, problem: 2, recent: 3 });
  });

  it('is all zeros over nothing', () => {
    expect(summarizeLinks([], '2026-09-05')).toEqual({ total: 0, waiting: 0, done: 0, problem: 0, recent: 0 });
  });
});
