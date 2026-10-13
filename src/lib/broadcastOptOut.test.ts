/**
 * A broadcast skips whoever asked out ("הסר") — the server does that. The screen says how many, apart from
 * every other reason for a skip, and leaves the run itself exactly as it was.
 */
import { describe, expect, it } from 'vitest';
import { optedOutCounts, optedOutLine, previewCounts, sentCounts } from './broadcastRun';
import type { BroadcastRow } from './whatsappApi';

function row(id: string, status: BroadcastRow['status'], over: Partial<BroadcastRow> = {}): BroadcastRow {
  return { child_id: id, child_name: `ילד ${id}`, parent_name: 'הורה', phone: `97250000${id.padStart(4, '0')}`, status, ...over };
}

const ROWS: BroadcastRow[] = [
  row('1', 'preview'),
  row('2', 'skipped', { reason: 'opted_out' }),
  row('3', 'skipped', { reason: 'duplicate_phone' }),
  row('4', 'preview', { extra_phones: [{ parent_name: 'אבא', phone: '972520000004', status: 'skipped', reason: 'opted_out' }] }),
  row('5', 'skipped', { reason: 'opted_out', extra_phones: [{ parent_name: 'אבא', phone: '972520000005', status: 'preview' }] }),
];

describe('"N לא יקבלו: ביקשו הסר"', () => {
  it('counts the parents who asked out, and the families\' extra phones that did — apart', () => {
    expect(optedOutCounts(ROWS)).toEqual({ own: 2, extra: 1, total: 3 });
  });

  it('the other numbers of the screen are what they were: who asked out is inside "ידולגו"', () => {
    expect(previewCounts(ROWS)).toEqual({ willSend: 2, skipped: 3, extraWillSend: 1, messages: 3 });
    const sent = ROWS.map((r) => (r.status === 'preview' ? { ...r, status: 'sent' as const } : r));
    expect(sentCounts(sent)).toMatchObject({ sent: 2, skipped: 3, failed: 0 });
    expect(optedOutCounts(sent).total).toBe(3);
  });

  it('the line: nothing when nobody asked out; one; many', () => {
    expect(optedOutLine(0)).toBe('');
    expect(optedOutLine(1)).toBe('אחד לא יקבל: ביקש הסר');
    expect(optedOutLine(3)).toBe('3 לא יקבלו: ביקשו הסר');
  });

  it('a server built before the list sends no such reason: the count is 0, and the screen says nothing new', () => {
    const old = [row('1', 'preview'), row('2', 'skipped', { reason: 'duplicate_phone' }), row('3', 'skipped', { reason: 'no_parent_phone' })];
    expect(optedOutCounts(old).total).toBe(0);
    expect(optedOutLine(optedOutCounts(old).total)).toBe('');
  });

  it('a row that failed, or went out, is never counted — only one the server skipped for this reason', () => {
    expect(optedOutCounts([row('1', 'failed', { reason: 'opted_out' as never }), row('2', 'sent')]).total).toBe(0);
  });
});
