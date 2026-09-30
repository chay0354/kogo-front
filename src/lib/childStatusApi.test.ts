/**
 * A status changed by hand says why, and the card shows every change. The
 * dialog's lock, the history row as read aloud, and the two routes against the
 * contract. The HTTP client is a stand-in; nothing leaves the test.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('./api', () => ({ default: { get: vi.fn(), patch: vi.fn() } }));

import api from './api';
import { serverErrorMessage } from '@/components/dialogs/NewDocumentDialog/utils';
import {
  canSaveStatusChange,
  fetchChildStatusHistory,
  readStatusHistory,
  statusHistoryLine,
  updateChildStatus,
  type StatusHistoryEntry,
} from './childStatusApi';

const get = vi.mocked(api.get);
const patch = vi.mocked(api.patch);

beforeEach(() => {
  get.mockReset();
  patch.mockReset();
});

const entry = (overrides: Partial<StatusHistoryEntry> = {}): StatusHistoryEntry => ({
  id: 'h-1',
  changed_at: '2026-09-30T11:05:00Z',
  previous_status: 'active',
  previous_label: 'פעיל',
  new_status: 'inactive',
  new_label: 'לא פעיל',
  reason: 'ההורים ביקשו להפסיק',
  changed_by_name: 'דורית כהן',
  ...overrides,
});

describe('canSaveStatusChange', () => {
  it('saves a different status with a reason of two characters or more', () => {
    expect(canSaveStatusChange('active', 'inactive', 'עבר')).toBe(true);
    expect(canSaveStatusChange('active', 'inactive', 'לא')).toBe(true);
  });

  it('stays locked while the status is the one the child already has', () => {
    expect(canSaveStatusChange('active', 'active', 'סיבה ארוכה מספיק')).toBe(false);
  });

  it('stays locked without a reason, or with one character', () => {
    expect(canSaveStatusChange('active', 'inactive', '')).toBe(false);
    expect(canSaveStatusChange('active', 'inactive', 'א')).toBe(false);
    expect(canSaveStatusChange('active', 'inactive', null)).toBe(false);
  });

  it('counts the reason after the spaces are trimmed', () => {
    expect(canSaveStatusChange('active', 'inactive', '   ')).toBe(false);
    expect(canSaveStatusChange('active', 'inactive', ' א \n')).toBe(false);
    expect(canSaveStatusChange('active', 'inactive', '  אב  ')).toBe(true);
  });

  it('stays locked with no status chosen', () => {
    expect(canSaveStatusChange('active', '', 'סיבה')).toBe(false);
  });

  it('lets a child with no status get one', () => {
    expect(canSaveStatusChange(null, 'pending', 'נרשם בטלפון')).toBe(true);
    expect(canSaveStatusChange(undefined, 'pending', 'נרשם בטלפון')).toBe(true);
  });
});

describe('statusHistoryLine', () => {
  it('reads a change by hand: when on Israel’s clock, from and to by label, why and who', () => {
    expect(statusHistoryLine(entry())).toEqual({
      key: 'h-1',
      when: '30.09.2026 · 14:05',
      change: 'מ־פעיל ל־לא פעיל',
      reason: 'ההורים ביקשו להפסיק',
      by: 'דורית כהן',
      automatic: false,
    });
  });

  it('says אוטומטי when no one’s name is on the change', () => {
    expect(statusHistoryLine(entry({ changed_by_name: null }))).toMatchObject({ by: 'אוטומטי', automatic: true });
    expect(statusHistoryLine(entry({ changed_by_name: '  ' }))).toMatchObject({ by: 'אוטומטי', automatic: true });
  });

  it('moves a UTC moment across midnight into Israel’s date', () => {
    expect(statusHistoryLine(entry({ changed_at: '2026-09-29T22:30:00Z' })).when).toBe('30.09.2026 · 01:30');
  });

  it('falls back to the list’s own words when the server sent no label', () => {
    const line = statusHistoryLine(entry({ previous_label: '', new_label: '', new_status: 'payment_problem' }));
    expect(line.change).toBe('מ־פעיל ל־בעיה באשראי');
  });

  it('shows a status it does not know as it came', () => {
    expect(statusHistoryLine(entry({ new_label: '', new_status: 'frozen' })).change).toBe('מ־פעיל ל־frozen');
  });

  it('says only where it went when there was no status before', () => {
    expect(statusHistoryLine(entry({ previous_status: '', previous_label: '' })).change).toBe('ל־לא פעיל');
  });

  it('shows a dash for a missing reason or an unreadable time', () => {
    const line = statusHistoryLine(entry({ reason: ' ', changed_at: 'not a date' }));
    expect(line.reason).toBe('—');
    expect(line.when).toBe('—');
  });

  it('keys a row without an id by its time and place', () => {
    expect(statusHistoryLine(entry({ id: '' }), 3).key).toBe('2026-09-30T11:05:00Z-3');
  });
});

describe('readStatusHistory', () => {
  it('keeps the server’s order, newest first', () => {
    const rows = readStatusHistory([entry({ id: 'new' }), entry({ id: 'old' })]);
    expect(rows.map((row) => row.id)).toEqual(['new', 'old']);
  });

  it('reads a page of results as well as a bare list', () => {
    expect(readStatusHistory({ results: [entry()] })).toHaveLength(1);
  });

  it('reads anything else as no history', () => {
    expect(readStatusHistory(null)).toEqual([]);
    expect(readStatusHistory({ detail: 'x' })).toEqual([]);
    expect(readStatusHistory([null, 'x'])).toEqual([]);
  });

  it('turns an empty name into no name', () => {
    expect(readStatusHistory([{ ...entry(), changed_by_name: '' }])[0].changed_by_name).toBeNull();
  });
});

describe('fetchChildStatusHistory', () => {
  it('asks the child’s status-history route', async () => {
    get.mockResolvedValue({ data: [entry()] } as never);
    const rows = await fetchChildStatusHistory('child-1');
    expect(get).toHaveBeenCalledWith('/customers/children/child-1/status-history/');
    expect(rows[0].reason).toBe('ההורים ביקשו להפסיק');
  });

  it('lets a failure reach the card, which says so quietly', async () => {
    get.mockRejectedValue(new Error('Network Error'));
    await expect(fetchChildStatusHistory('child-1')).rejects.toThrow('Network Error');
  });
});

describe('updateChildStatus', () => {
  it('sends the status with the reason, trimmed', async () => {
    patch.mockResolvedValue({ data: { id: 'child-1', status: 'inactive' } } as never);
    await updateChildStatus('child-1', 'inactive', '  ההורים ביקשו  ');
    expect(patch).toHaveBeenCalledWith('/customers/children/child-1/', {
      status: 'inactive',
      status_reason: 'ההורים ביקשו',
    });
  });

  it('lets the server’s refusal reach the dialog', async () => {
    const refusal = { response: { status: 400, data: { status_reason: ['חובה לכתוב למה הסטטוס משתנה.'] } } };
    patch.mockRejectedValue(refusal);
    await expect(updateChildStatus('child-1', 'inactive', 'אב')).rejects.toBe(refusal);
    // …where the dialog reads it out in the server's words.
    expect(serverErrorMessage(refusal, 'שגיאה בעדכון הסטטוס')).toBe('חובה לכתוב למה הסטטוס משתנה.');
  });
});
