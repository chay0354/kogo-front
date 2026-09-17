/**
 * The broadcast engine is what decides whether a family gets a message once,
 * twice or not at all. These pin the rules it carried over from the dialog and
 * the one it adds: a run cannot be started, resumed or stopped twice.
 */
import { describe, expect, it } from 'vitest';
import type { BroadcastRow } from './whatsappApi';
import {
  BroadcastRun,
  dockSummary,
  runIsBusy,
  runIsHeld,
  type ChunkReply,
  type ChunkRequest,
} from './broadcastRun';

const phoneOf = (id: string) => `+97250000${id.padStart(4, '0')}`;

function row(id: string, status: BroadcastRow['status']): BroadcastRow {
  return { child_id: id, child_name: `ילד ${id}`, parent_name: 'הורה', phone: phoneOf(id), status };
}

/** A fake server: answers every child in the chunk, and records every request. */
function fakeServer(opts: { failOn?: (req: ChunkRequest, call: number) => boolean } = {}) {
  const calls: ChunkRequest[] = [];
  const sendChunk = async (req: ChunkRequest): Promise<ChunkReply> => {
    calls.push({ ...req, child_ids: req.child_ids.slice(), skip_phones: req.skip_phones.slice() });
    if (opts.failOn?.(req, calls.length)) throw new Error('timeout');
    const status = req.dry_run ? 'preview' : 'sent';
    return {
      results: req.child_ids.map((id) => row(id, status)),
      phones: req.child_ids.map(phoneOf),
    };
  };
  return { calls, sendChunk };
}

const ids = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'];

function makeRun(server: ReturnType<typeof fakeServer>, chunkSize = 4) {
  return new BroadcastRun({
    ids,
    names: {},
    automation: { automation_type: 'kind', automation_id: 'x', label: 'בדיקה' },
    chunkSize,
    sendChunk: server.sendChunk,
    holdMs: 0,
    wait: async () => {},
  });
}

describe('BroadcastRun — the dry run', () => {
  it('sends nothing: every chunk is dry_run', async () => {
    const server = fakeServer();
    const run = makeRun(server);
    await run.check();
    expect(server.calls).toHaveLength(3);
    expect(server.calls.every((c) => c.dry_run === true)).toBe(true);
    expect(run.snapshot.phase).toBe('preview');
    expect(run.snapshot.previewRows).toHaveLength(10);
  });

  it('carries used phones forward so siblings across chunks are counted once', async () => {
    const server = fakeServer();
    const run = makeRun(server);
    await run.check();
    expect(server.calls[0].skip_phones).toEqual([]);
    expect(server.calls[1].skip_phones).toEqual(['1', '2', '3', '4'].map(phoneOf));
    expect(server.calls[2].skip_phones).toHaveLength(8);
  });

  it('reports progress after every chunk, counted in children', async () => {
    const server = fakeServer();
    const run = makeRun(server);
    const seen: number[] = [];
    run.subscribe((s) => seen.push(s.previewRows.length));
    await run.check();
    expect(seen.filter((n, i) => seen.indexOf(n) === i)).toEqual([0, 4, 8, 10]);
  });

  it('a failed dry run says why and sends nothing', async () => {
    const server = fakeServer({ failOn: (_req, call) => call === 2 });
    const run = makeRun(server);
    await run.check();
    expect(run.snapshot.phase).toBe('failed');
    expect(run.snapshot.error).toBe('התצוגה המקדימה נכשלה');
    expect(server.calls.some((c) => !c.dry_run)).toBe(false);
  });

  it('uses the server’s own error when it gives one', async () => {
    const run = new BroadcastRun({
      ids,
      names: {},
      automation: { automation_type: 'kind', automation_id: 'x', label: '' },
      chunkSize: 4,
      sendChunk: async () => {
        throw { response: { data: { error: 'ManyChat לא מוגדר' } } };
      },
      wait: async () => {},
    });
    await run.check();
    expect(run.snapshot.error).toBe('ManyChat לא מוגדר');
  });

  it('cannot be run twice', async () => {
    const server = fakeServer();
    const run = makeRun(server);
    await Promise.all([run.check(), run.check()]);
    expect(server.calls).toHaveLength(3);
  });
});

describe('BroadcastRun — the real send', () => {
  it('does not send before the preview has finished', async () => {
    const server = fakeServer();
    const run = makeRun(server);
    await run.start();
    expect(server.calls).toHaveLength(0);
    expect(run.snapshot.phase).toBe('idle');
  });

  it('sends every chunk once, for real, with its own phone ledger', async () => {
    const server = fakeServer();
    const run = makeRun(server);
    await run.check();
    server.calls.length = 0;
    await run.start();
    expect(server.calls).toHaveLength(3);
    expect(server.calls.every((c) => c.dry_run === false)).toBe(true);
    // The send starts its ledger afresh, as the dialog did.
    expect(server.calls[0].skip_phones).toEqual([]);
    expect(server.calls[2].skip_phones).toHaveLength(8);
    expect(run.snapshot.phase).toBe('done');
    expect(run.snapshot.sentRows).toHaveLength(10);
  });

  it('a double click sends once', async () => {
    const server = fakeServer();
    const run = makeRun(server);
    await run.check();
    server.calls.length = 0;
    await Promise.all([run.start(), run.start(), run.start()]);
    expect(server.calls).toHaveLength(3);
    const sentIds = server.calls.flatMap((c) => c.child_ids);
    expect(new Set(sentIds).size).toBe(sentIds.length);
  });

  it('pauses on a chunk that does not answer and never sends it again', async () => {
    let realCalls = 0;
    const server = fakeServer({ failOn: (req) => !req.dry_run && ++realCalls === 2 });
    const run = makeRun(server);
    await run.check();
    server.calls.length = 0;
    await run.start();
    expect(run.snapshot.phase).toBe('paused');
    expect(run.snapshot.pausedAt).toBe(1);

    await run.resume();
    expect(run.snapshot.phase).toBe('done');
    const chunksSent = server.calls.map((c) => c.child_ids.join(','));
    // chunk 0, chunk 1 (timed out), chunk 2 — chunk 1 exactly once.
    expect(chunksSent).toEqual(['1,2,3,4', '5,6,7,8', '9,10']);
  });

  it('counts the phones of the silent chunk as used when carrying on', async () => {
    let realCalls = 0;
    const server = fakeServer({ failOn: (req) => !req.dry_run && ++realCalls === 2 });
    const run = makeRun(server);
    await run.check();
    server.calls.length = 0;
    await run.start();
    await run.resume();
    const last = server.calls[server.calls.length - 1];
    for (const id of ['5', '6', '7', '8']) expect(last.skip_phones).toContain(phoneOf(id));
  });

  it('resume and stop only act on a paused run, once', async () => {
    let realCalls = 0;
    const server = fakeServer({ failOn: (req) => !req.dry_run && ++realCalls === 1 });
    const run = makeRun(server);
    await run.check();
    await run.resume(); // not paused yet: nothing
    server.calls.length = 0;
    await run.start();
    expect(run.snapshot.phase).toBe('paused');
    await Promise.all([run.resume(), run.resume()]);
    expect(server.calls.map((c) => c.child_ids.join(','))).toEqual(['1,2,3,4', '5,6,7,8', '9,10']);
    run.stop(); // already done: nothing
    expect(run.snapshot.phase).toBe('done');
  });

  it('stopping a paused run ends it without sending the rest', async () => {
    let realCalls = 0;
    const server = fakeServer({ failOn: (req) => !req.dry_run && ++realCalls === 1 });
    const run = makeRun(server);
    await run.check();
    server.calls.length = 0;
    await run.start();
    run.stop();
    expect(run.snapshot.phase).toBe('done');
    expect(server.calls).toHaveLength(1);
    await run.resume();
    expect(server.calls).toHaveLength(1);
  });

  it('keeps its own copy of the selection', async () => {
    const selection = ['1', '2', '3'];
    const server = fakeServer();
    const run = new BroadcastRun({
      ids: selection,
      names: {},
      automation: { automation_type: 'flow', automation_id: 'f', label: '' },
      chunkSize: 8,
      sendChunk: server.sendChunk,
      wait: async () => {},
    });
    selection.length = 0; // the page clears its selection
    await run.check();
    expect(run.snapshot.previewRows).toHaveLength(3);
  });
});

describe('dock summary', () => {
  it('shows a real percentage while checking and sending', async () => {
    const server = fakeServer();
    const run = makeRun(server);
    const seen: ReturnType<typeof dockSummary>[] = [];
    run.subscribe((s) => seen.push(dockSummary(s)));
    await run.check();
    const midCheck = seen.find((d) => d.tone === 'check' && d.done === 4);
    expect(midCheck?.detail).toBe('4/10');
    expect(midCheck?.showPercent).toBe(true);
    expect(dockSummary(run.snapshot).tone).toBe('ready');
    await run.start();
    expect(seen.some((d) => d.tone === 'send' && d.done === 8)).toBe(true);
    expect(dockSummary(run.snapshot)).toMatchObject({ tone: 'done', finished: true, detail: 'נשלחו 10' });
  });

  it('asks for a decision when paused', () => {
    const d = dockSummary({ phase: 'paused', total: 10, previewRows: [], sentRows: [], pausedAt: 1, error: '' });
    expect(d.tone).toBe('warn');
  });

  it('knows which phases are busy and which hold the dock', () => {
    expect(runIsBusy('checking')).toBe(true);
    expect(runIsBusy('sending')).toBe(true);
    expect(runIsBusy('paused')).toBe(false);
    expect(runIsHeld('paused')).toBe(true);
    expect(runIsHeld('preview')).toBe(false);
    expect(runIsHeld('done')).toBe(false);
  });
});
