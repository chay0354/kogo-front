/**
 * A broadcast skips whoever asked out ("הסר") — the server does that. The screen says how many, apart from
 * every other reason for a skip, and leaves the run itself exactly as it was.
 */
import { describe, expect, it } from 'vitest';
import {
  includedOptedOutCounts,
  messageKindLabel,
  optedOutCounts,
  optedOutKindLine,
  optedOutLine,
  previewBlocked,
  previewCounts,
  sentCounts,
} from './broadcastRun';
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

describe('marketing or not — the customers list says which, and the line says what it did to whoever asked out (15.10.2026)', () => {
  // A message that is not marketing: the server sends to whoever asked out too, and marks their rows.
  const SERVICE: BroadcastRow[] = [
    row('1', 'preview'),
    row('2', 'preview', { opted_out: true }),
    row('3', 'skipped', { reason: 'duplicate_phone', opted_out: true }),
    row('4', 'preview', { extra_phones: [{ parent_name: 'אבא', phone: '972520000004', status: 'preview', opted_out: true }] }),
    row('5', 'failed', { opted_out: true }),
  ];

  it('who got it although they asked out: only a row that went out, or will — never a duplicate or a failure', () => {
    expect(includedOptedOutCounts(SERVICE)).toEqual({ own: 1, extra: 1, total: 2 });
    // After the send: the same two, now sent.
    const sent = SERVICE.map((r) => ({
      ...r,
      status: r.status === 'preview' ? ('sent' as const) : r.status,
      extra_phones: r.extra_phones?.map((phone) => ({ ...phone, status: 'sent' as const })),
    }));
    expect(includedOptedOutCounts(sent)).toEqual({ own: 1, extra: 1, total: 2 });
    // A marketing run marks nobody as reached: whoever asked out was skipped.
    expect(includedOptedOutCounts(ROWS).total).toBe(0);
    expect(optedOutCounts(SERVICE).total).toBe(0);
  });

  it('marketing: who asked out will not get it, and did not', () => {
    expect(optedOutKindLine({ held: 3, included: 0 }, { marketing: true, done: false })).toBe('3 שביקשו הסר לא יקבלו (הודעה שיווקית)');
    expect(optedOutKindLine({ held: 3, included: 0 }, { marketing: true, done: true })).toBe('3 שביקשו הסר לא קיבלו (הודעה שיווקית)');
    expect(optedOutKindLine({ held: 1, included: 0 }, { marketing: true, done: false })).toBe('אחד שביקש הסר לא יקבל (הודעה שיווקית)');
    expect(optedOutKindLine({ held: 1, included: 0 }, { marketing: true, done: true })).toBe('אחד שביקש הסר לא קיבל (הודעה שיווקית)');
  });

  it('not marketing: who asked out gets it too, and the line says so', () => {
    expect(optedOutKindLine({ held: 0, included: 3 }, { marketing: false, done: false })).toBe('3 שביקשו הסר יקבלו (הודעה לא שיווקית)');
    expect(optedOutKindLine({ held: 0, included: 3 }, { marketing: false, done: true })).toBe('3 שביקשו הסר קיבלו (הודעה לא שיווקית)');
    expect(optedOutKindLine({ held: 0, included: 1 }, { marketing: false, done: true })).toBe('אחד שביקש הסר קיבל (הודעה לא שיווקית)');
  });

  it('nobody asked out: no line, whatever the kind', () => {
    for (const marketing of [true, false, null]) {
      expect(optedOutKindLine({ held: 0, included: 0 }, { marketing, done: false })).toBe('');
    }
  });

  it('a run nobody chose for is the server\'s marketing; a server that does not know the choice skipped them all the same', () => {
    expect(optedOutKindLine({ held: 2, included: 0 }, { marketing: null, done: false })).toBe('2 שביקשו הסר לא יקבלו (הודעה שיווקית)');
    // "Not marketing" was asked, and they were skipped anyway: said as it is, without a kind it did not keep to.
    expect(optedOutKindLine({ held: 2, included: 0 }, { marketing: false, done: true })).toBe('2 שביקשו הסר לא קיבלו');
  });

  it('the preview cannot begin before the office said what the message is — nothing is chosen for it', () => {
    expect(previewBlocked(false, null)).toBe('בחרו אוטומציה');
    expect(previewBlocked(true, null)).toBe('בחרו אם ההודעה שיווקית או לא');
    expect(previewBlocked(true, 'marketing')).toBe('');
    expect(previewBlocked(true, 'service')).toBe('');
    expect([messageKindLabel(true), messageKindLabel(false), messageKindLabel(null)]).toEqual([
      'הודעה שיווקית', 'הודעה לא שיווקית (עדכון / שירות)', '',
    ]);
  });

  it('the settings page\'s own line is what it was', () => {
    expect(optedOutLine(3)).toBe('3 לא יקבלו: ביקשו הסר');
  });
});
