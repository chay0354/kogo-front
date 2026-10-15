/**
 * The broadcast of the customers list asks what the message is (the owner, 15.10.2026): marketing — not sent to
 * whoever asked "הסר" — or an update / service message, which is. The choice is required, nothing is ticked to
 * begin with, nothing is previewed (and so nothing sent) before it, and the summary says what it did to whoever
 * asked out. Nothing here reaches a server: the run's chunks are answered by a fake one.
 */
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { BroadcastRun, type ChunkReply, type ChunkRequest } from '@/lib/broadcastRun';
import type { BroadcastRow } from '@/lib/whatsappApi';
import BroadcastWhatsAppDialog, { MessageKindChoice } from './BroadcastWhatsAppDialog';

// The components are compiled with the classic JSX runtime here, which looks for React by name.
(globalThis as { React?: typeof React }).React = React;

const noop = () => {};
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
const lineOf = (html: string) => html.match(/<p[^>]*data-opted-out=""[^>]*>(.*?)<\/p>/)?.[1] ?? '';

/** Every element a draw makes, with its props — so a press can be made without a browser. */
function drawn(node: React.ReactElement): Array<{ type: unknown; props: Record<string, unknown> }> {
  const original = React.createElement;
  const seen: Array<{ type: unknown; props: Record<string, unknown> }> = [];
  (React as { createElement: unknown }).createElement = (type: unknown, props: Record<string, unknown> | null, ...children: unknown[]) => {
    if (props) seen.push({ type, props });
    return (original as (...args: unknown[]) => React.ReactElement)(type, props, ...children);
  };
  try {
    renderToStaticMarkup(node);
  } finally {
    (React as { createElement: unknown }).createElement = original;
  }
  return seen;
}

const row = (id: string, status: BroadcastRow['status'], over: Partial<BroadcastRow> = {}): BroadcastRow => ({
  child_id: id, child_name: `ילד ${id}`, parent_name: 'הורה', phone: `97250777${id.padStart(4, '0')}`, status, ...over,
});

/** A run as far as its preview — or, with `send`, to its end — of a message the office said is (or is not) marketing. */
async function runOf(rows: (dry: boolean) => BroadcastRow[], marketing: boolean | null, send = false) {
  const calls: ChunkRequest[] = [];
  const sendChunk = async (req: ChunkRequest): Promise<ChunkReply> => {
    calls.push(req);
    return { results: rows(req.dry_run).filter((r) => req.child_ids.includes(r.child_id)), phones: [] };
  };
  const run = new BroadcastRun({
    ids: rows(true).map((r) => r.child_id),
    names: {},
    automation: { automation_type: 'flow', automation_id: 'x', label: 'הסטודיו סגור מחר' },
    ...(marketing === null ? {} : { marketing }),
    chunkSize: 8,
    sendChunk,
    holdMs: 0,
    wait: async () => {},
  });
  await run.check();
  if (send) await run.start();
  return { run, calls };
}

function dialog(run: BroadcastRun | null, draft = { childIds: ['1', '2'], childNames: {} }) {
  return renderToStaticMarkup(
    <BroadcastWhatsAppDialog
      open
      draft={draft}
      run={run}
      snapshot={run?.snapshot ?? null}
      onClose={noop}
      onMinimize={noop}
      onCheck={noop}
      onBack={noop}
      onCancel={noop}
      onStart={noop}
      onDismiss={noop}
    />,
  );
}

// Not marketing: the server sends to whoever asked out too, and marks their rows.
const SERVICE = (dry: boolean): BroadcastRow[] => [
  row('1', dry ? 'preview' : 'sent'),
  row('2', dry ? 'preview' : 'sent', { opted_out: true }),
  row('3', dry ? 'preview' : 'sent', { opted_out: true, extra_phones: [{ parent_name: 'אבא', phone: '972528880003', status: dry ? 'preview' : 'sent', opted_out: true }] }),
  row('4', 'skipped', { reason: 'duplicate_phone', opted_out: true }),
];
// Marketing: the server skips them.
const MARKETING = (dry: boolean): BroadcastRow[] => [
  row('1', dry ? 'preview' : 'sent'),
  row('2', 'skipped', { reason: 'opted_out', opted_out: true }),
];

describe('"סוג ההודעה" — required, and nothing chosen for the office', () => {
  it('the first step asks it: two choices, neither ticked, and the one line of what each does', () => {
    const html = dialog(null);
    expect(html).toContain('data-message-kind=""');
    expect(text(html)).toContain('סוג ההודעה');
    expect(text(html)).toContain('הודעה שיווקית');
    expect(text(html)).toContain('הודעה לא שיווקית (עדכון / שירות)');
    expect(text(html)).toContain('שיווקית לא נשלחת למי שביקש הסר. לא שיווקית נשלחת גם להם.');
    expect((html.match(/type="radio"/g) ?? []).length).toBe(2);
    expect(html).not.toContain('checked=""');
    // Nothing to go on with yet.
    const next = html.match(/<button[^>]*>המשך לתצוגה מקדימה<\/button>/)?.[0] ?? '';
    expect(next).toContain('disabled=""');
  });

  it('a press on a choice says which, and that choice is the one drawn ticked', () => {
    const chosen = vi.fn();
    const radios = drawn(<MessageKindChoice value={null} onChange={chosen} />).filter(
      (element) => element.type === 'input' && element.props.type === 'radio',
    );
    expect(radios.map((radio) => [radio.props.value, radio.props.checked])).toEqual([['marketing', false], ['service', false]]);
    (radios[1].props.onChange as () => void)();
    expect(chosen).toHaveBeenCalledWith('service');
    const html = renderToStaticMarkup(<MessageKindChoice value="service" onChange={noop} />);
    expect((html.match(/checked=""/g) ?? []).length).toBe(1);
    expect(html).toMatch(/checked="" value="service"/);
  });
});

describe('the preview and the summary say the kind, and what it did to whoever asked out', () => {
  it('not marketing: the head says so, the line says who asked out will get it, and each such row says so', async () => {
    const { run, calls } = await runOf(SERVICE, false);
    expect(calls.every((call) => call.marketing === false)).toBe(true);
    const html = dialog(run);
    expect(text(html)).toContain('2. תצוגה מקדימה — הסטודיו סגור מחר · הודעה לא שיווקית (עדכון / שירות)');
    expect(lineOf(html)).toBe('3 שביקשו הסר יקבלו (הודעה לא שיווקית)');
    expect((text(html).match(/יישלח · ביקש הסר/g) ?? []).length).toBe(3);
    expect(html).not.toContain('opted_out');
  });

  it('…and after the send: "קיבלו"', async () => {
    const { run, calls } = await runOf(SERVICE, false, true);
    expect(calls.filter((call) => !call.dry_run).every((call) => call.marketing === false)).toBe(true);
    const html = dialog(run);
    expect(lineOf(html)).toBe('3 שביקשו הסר קיבלו (הודעה לא שיווקית)');
    expect(text(html)).toContain('נשלח (טקסט חופשי) · ביקש הסר');
  });

  it('marketing: who asked out will not get it, and did not', async () => {
    const preview = dialog((await runOf(MARKETING, true)).run);
    expect(text(preview)).toContain('· הודעה שיווקית');
    expect(lineOf(preview)).toBe('אחד שביקש הסר לא יקבל (הודעה שיווקית)');
    expect(text(preview)).toContain('ידולג · ביקש הסר');
    expect(lineOf(dialog((await runOf(MARKETING, true, true)).run))).toBe('אחד שביקש הסר לא קיבל (הודעה שיווקית)');
  });

  it('a run nobody chose for cannot be sent: the send stays locked', async () => {
    const { run } = await runOf(MARKETING, null);
    const html = dialog(run);
    expect(html).not.toContain('data-kind-shown');
    const send = html.match(/<button[^>]*>(?:(?!<\/button>).)*שליחה ל-(?:(?!<\/button>).)*<\/button>/)?.[0] ?? '';
    expect(send).toContain('disabled=""');
  });
});
