/**
 * The copy from ManyChat (the owner, 14.10.2026: "תתחבר ותעלה את השיחות האלה שיהיו פה במערכת"): only ManyChat's own
 * window is listened to, only conversations by ManyChat's number cross, and the counts say the point first.
 */
import { describe, expect, it } from 'vitest';
import { BATCH_SIZE, BRIDGE, MANYCHAT_ORIGIN, NO_COUNTS, addCounts, progressLines, readBridgeMessage, readCounts } from './historyBridge';

describe('a message from ManyChat\'s window', () => {
  it('is read only from ManyChat\'s address, and only when it is ours', () => {
    expect(readBridgeMessage('https://evil.example', { bridge: BRIDGE, kind: 'ready' })).toBeNull();
    expect(readBridgeMessage(MANYCHAT_ORIGIN, { bridge: 'other', kind: 'ready' })).toBeNull();
    expect(readBridgeMessage(MANYCHAT_ORIGIN, 'ready')).toBeNull();
    expect(readBridgeMessage(MANYCHAT_ORIGIN, { bridge: BRIDGE, kind: 'ready' })).toEqual({ kind: 'ready' });
    expect(readBridgeMessage(MANYCHAT_ORIGIN, { bridge: BRIDGE, kind: 'done', read: 12, failed: -3 })).toEqual({ kind: 'done', read: 12, failed: 0 });
  });

  it('a batch keeps only conversations with ManyChat\'s number and their lines, at most a server call\'s worth', () => {
    const one = { subscriber_id: '123', messages: [{ id: 'a' }] };
    const read = readBridgeMessage(MANYCHAT_ORIGIN, {
      bridge: BRIDGE,
      kind: 'batch',
      seq: 4,
      conversations: [one, { subscriber_id: 'abc', messages: [] }, { subscriber_id: '9', messages: 'x' }, null, ...Array(30).fill(one)],
    });
    expect(read?.kind).toBe('batch');
    if (read?.kind !== 'batch') return;
    expect(read.seq).toBe(4);
    expect(read.conversations).toHaveLength(BATCH_SIZE);
    expect(read.conversations[0]).toEqual(one);
    expect(readBridgeMessage(MANYCHAT_ORIGIN, { bridge: BRIDGE, kind: 'batch', conversations: [] })).toBeNull();
  });
});

describe('the counts', () => {
  it('add up, and read nothing strange as a number', () => {
    const one = readCounts({ conversations: 2, contacts: 2, lines: 30, already_kept: 5, unknown: 0, bad: 'x' });
    expect(one.bad).toBe(0);
    expect(addCounts(addCounts(NO_COUNTS, one), one).lines).toBe(60);
  });

  it('say the point first, and what was here already only when there was some', () => {
    const lines = progressLines({ ...NO_COUNTS, lines: 1240, contacts: 310, already_kept: 0, unknown: 3 }, 1000);
    expect(lines.main).toBe('הועתקו 1,240 הודעות ב-310 מתוך 1,000 שיחות');
    expect(lines.more).toBe('3 שיחות של מי שלא כתב ל-Kogo');
    expect(progressLines(NO_COUNTS, 0).more).toBe('');
  });
});
