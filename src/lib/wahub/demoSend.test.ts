import { describe, expect, test, vi } from 'vitest';

import type { WahubSimulateResult } from '../wahubApi';
import type { DemoInput } from './demo';
import { DemoSendQueue, demoInputReady, type DemoSendDeps } from './demoSend';
import { makeContact, makeMessage } from './testFixtures';
import type { WahubMessage } from '@/types/wahub';

type Held = { input: DemoInput; resolve: (result: WahubSimulateResult) => void; reject: (error: unknown) => void };

function setup() {
  const held: Held[] = [];
  const log: string[] = [];
  const shown: WahubMessage[] = [];
  const deps: DemoSendDeps = {
    request: (_id, input) =>
      new Promise<WahubSimulateResult>((resolve, reject) => {
        held.push({ input, resolve, reject });
      }),
    show: (_id, bubble) => {
      shown.push(bubble);
      log.push(`show ${bubble.text || bubble.message_type}`);
    },
    settle: (_id, tempId, saved) => log.push(`settle ${shown.find((bubble) => bubble.id === tempId)?.text || 'media'} → ${saved ? saved.id : 'gone'}`),
    reread: vi.fn(),
    onContact: vi.fn(),
    onCustomerStart: (id) => log.push(`start ${id}`),
    onCustomerEnd: (id, stored) => log.push(`end ${id} ${stored}`),
    onDuplicate: vi.fn(),
    onError: vi.fn(),
    now: () => new Date('2026-10-11T12:00:00+03:00'),
  };
  const queue = new DemoSendQueue(deps);
  const kept = (id: number, text: string): WahubSimulateResult => ({
    contact: makeContact(7, { is_demo: true }),
    stored: true,
    stored_message_id: id,
    message: makeMessage(id, { text }),
  });
  const tick = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  return { queue, deps, held, log, shown, kept, tick };
}

const text = (value: string, sender: 'customer' | 'bot' = 'customer'): DemoInput => ({ kind: 'text', text: value, sender });

describe('messages fired one after the other into a demo conversation', () => {
  test('every bubble is on screen at once; the lines reach the server one at a time, in the order typed', async () => {
    const { queue, held, shown, kept, tick, log } = setup();
    const first = queue.send(7, text('היי'));
    const second = queue.send(7, text('יש חוג לבן 5?'));
    const third = queue.send(7, text('בראש העין'));

    // Three bubbles before the server said a word, each "being sent", ids below zero and falling.
    expect(shown.map((bubble) => bubble.text)).toEqual(['היי', 'יש חוג לבן 5?', 'בראש העין']);
    expect(shown.every((bubble) => bubble.id < 0 && bubble.local_state === 'sending' && bubble.direction === 'in')).toBe(true);
    expect(shown[0].id).toBeGreaterThan(shown[1].id);
    expect(shown[1].id).toBeGreaterThan(shown[2].id);

    // Only the first request is out.
    await tick();
    expect(held.map((call) => (call.input as { text: string }).text)).toEqual(['היי']);
    held[0].resolve(kept(101, 'היי'));
    expect(await first).toBe(true);
    await tick();
    expect(held).toHaveLength(2);
    held[1].resolve(kept(102, 'יש חוג לבן 5?'));
    expect(await second).toBe(true);
    await tick();
    held[2].resolve(kept(103, 'בראש העין'));
    expect(await third).toBe(true);

    expect(log.filter((line) => line.startsWith('settle'))).toEqual([
      'settle היי → 101',
      'settle יש חוג לבן 5? → 102',
      'settle בראש העין → 103',
    ]);
  });

  test('the new bot\'s clock is told of every customer message leaving and landing', async () => {
    const { queue, held, kept, tick, log } = setup();
    const sent = queue.send(7, text('היי'));
    await tick();
    held[0].resolve(kept(101, 'היי'));
    await sent;
    expect(log).toEqual(['show היי', 'start 7', 'settle היי → 101', 'end 7 true']);
  });

  test('what is typed as the old bot goes into the conversation and does not wake the new bot', async () => {
    const { queue, held, kept, tick, log, shown } = setup();
    const sent = queue.send(7, text('שיעור ניסיון בחינם', 'bot'));
    expect(shown[0]).toMatchObject({ direction: 'out', sender: 'bot', new_bot: false });
    await tick();
    held[0].resolve(kept(104, 'שיעור ניסיון בחינם'));
    await sent;
    expect(log.some((line) => line.startsWith('start') || line.startsWith('end'))).toBe(false);
  });

  test('a line the server dropped as a repeat: the bubble goes, it is said, and there is nothing to answer', async () => {
    const { queue, deps, held, tick, log } = setup();
    const sent = queue.send(7, text('היי'));
    await tick();
    held[0].resolve({ contact: null, stored: false, stored_message_id: null, message: null });
    expect(await sent).toBe(false);
    expect(deps.onDuplicate).toHaveBeenCalledTimes(1);
    expect(log).toContain('settle היי → gone');
    expect(log).toContain('end 7 false');
  });

  test('a failed send takes its bubble away, says so, and the next line still goes out', async () => {
    const { queue, deps, held, kept, tick, log } = setup();
    const first = queue.send(7, text('ראשונה'));
    const second = queue.send(7, text('שנייה'));
    await tick();
    held[0].reject(new Error('network'));
    expect(await first).toBe(false);
    expect(deps.onError).toHaveBeenCalledTimes(1);
    await tick();
    held[1].resolve(kept(105, 'שנייה'));
    expect(await second).toBe(true);
    expect(log).toContain('settle ראשונה → gone');
    expect(log).toContain('settle שנייה → 105');
  });

  test('a recording and a picture show as their placeholder until the server\'s copy arrives', async () => {
    const { queue, shown } = setup();
    void queue.send(7, { kind: 'voice', file: new Blob(['abc'], { type: 'audio/webm' }), mimeType: 'audio/webm', durationMs: 4000 });
    void queue.send(7, { kind: 'image', file: new File(['abc'], 'pic.jpg', { type: 'image/jpeg' }), caption: 'זה המקום?' });
    expect(shown[0]).toMatchObject({ message_type: 'voice', text: '', has_media: false, sender: 'customer' });
    expect(shown[1]).toMatchObject({ message_type: 'image', text: 'זה המקום?', has_media: false });
  });

  test('an older server that keeps the message without handing it back: the conversation is read again', async () => {
    const { queue, deps, held, tick } = setup();
    const sent = queue.send(7, text('היי'));
    await tick();
    held[0].resolve({ contact: null, stored: true, stored_message_id: 9, message: null });
    expect(await sent).toBe(true);
    expect(deps.reread).toHaveBeenCalledWith(7);
  });

  test('nothing to send is refused before the server: empty words, an empty file', async () => {
    const { queue, shown, held } = setup();
    expect(demoInputReady(text('   '))).toBe(false);
    expect(demoInputReady({ kind: 'voice', file: new Blob([]), mimeType: 'audio/webm', durationMs: 0 })).toBe(false);
    expect(await queue.send(7, text('  '))).toBe(false);
    expect(shown).toHaveLength(0);
    expect(held).toHaveLength(0);
  });
});
