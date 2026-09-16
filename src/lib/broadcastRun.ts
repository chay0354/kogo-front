/**
 * One WhatsApp broadcast, from the dry run to the last chunk sent.
 *
 * It used to live inside the dialog, and so inside the customers page: leave
 * the page and nothing was left showing the run, and reopening the dialog reset
 * every field — the chunk state a send in progress was still reading included —
 * onto a fresh "choose an automation" screen, from which the same children
 * could be sent to a second time.
 *
 * Kept here, outside React, a run can be minimised to the corner and followed
 * from any screen while the office carries on working. The rules are the
 * dialog's, carried over unchanged, and they are what keeps a message from
 * going out twice:
 *
 *  - every dry-run chunk says dry_run: true; a real send is always explicit;
 *  - skip_phones accumulates across chunks, so siblings sharing a phone get one
 *    message even when they land in different chunks;
 *  - a chunk that does not answer is never retried by itself — it may well have
 *    gone out on the server — and the phones it held count as used, so carrying
 *    on past it does not message those families again.
 *
 * What is new is only that a run can be started, resumed or stopped once: a
 * double click, or a second screen holding the same run, cannot send it twice.
 */
import type { BroadcastRow } from './whatsappApi';

export type RunPhase = 'idle' | 'checking' | 'preview' | 'sending' | 'paused' | 'done' | 'failed';

export interface ChunkRequest {
  child_ids: string[];
  dry_run: boolean;
  skip_phones: string[];
}

export interface ChunkReply {
  results: BroadcastRow[];
  phones: string[];
}

export interface RunAutomation {
  automation_type: 'kind' | 'flow';
  automation_id: string;
  label: string;
}

export interface RunSnapshot {
  phase: RunPhase;
  /** Children in the run. */
  total: number;
  /** Dry-run rows so far; complete once the phase is past checking. */
  previewRows: BroadcastRow[];
  /** Rows the real send has come back with. */
  sentRows: BroadcastRow[];
  /** The chunk that did not answer, while the run waits for the office to decide. */
  pausedAt: number | null;
  /** Why the dry run failed. */
  error: string;
}

export interface BroadcastRunOptions {
  ids: string[];
  names: Record<string, string>;
  automation: RunAutomation;
  chunkSize: number;
  sendChunk: (req: ChunkRequest) => Promise<ChunkReply>;
  /** How long the finished ring is held before the preview replaces it. */
  holdMs?: number;
  wait?: (ms: number) => Promise<void>;
}

const defaultWait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function dryRunError(err: unknown) {
  return (
    (err as { response?: { data?: { error?: string } } })?.response?.data?.error || 'התצוגה המקדימה נכשלה'
  );
}

export class BroadcastRun {
  readonly ids: string[];
  readonly names: Record<string, string>;
  readonly automation: RunAutomation;
  readonly chunks: string[][];
  private readonly sendChunk: BroadcastRunOptions['sendChunk'];
  private readonly holdMs: number;
  private readonly wait: (ms: number) => Promise<void>;
  private skipPhones: string[] = [];
  private listeners = new Set<(snapshot: RunSnapshot) => void>();
  private current: RunSnapshot;

  constructor(opts: BroadcastRunOptions) {
    // Snapshotted: the page clears its selection once the send starts.
    this.ids = opts.ids.slice();
    this.names = { ...opts.names };
    this.automation = opts.automation;
    const size = Math.max(1, opts.chunkSize);
    this.chunks = [];
    for (let i = 0; i < this.ids.length; i += size) this.chunks.push(this.ids.slice(i, i + size));
    this.sendChunk = opts.sendChunk;
    this.holdMs = opts.holdMs ?? 450;
    this.wait = opts.wait ?? defaultWait;
    this.current = {
      phase: 'idle',
      total: this.ids.length,
      previewRows: [],
      sentRows: [],
      pausedAt: null,
      error: '',
    };
  }

  get snapshot(): RunSnapshot {
    return this.current;
  }

  subscribe(listener: (snapshot: RunSnapshot) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private update(patch: Partial<RunSnapshot>) {
    this.current = { ...this.current, ...patch };
    this.listeners.forEach((listener) => listener(this.current));
  }

  /** The dry run over every chunk. Nothing is sent. Runs once. */
  async check(): Promise<void> {
    if (this.current.phase !== 'idle') return;
    this.update({ phase: 'checking', previewRows: [], error: '' });
    const rows: BroadcastRow[] = [];
    let skipPhones: string[] = [];
    try {
      for (const chunk of this.chunks) {
        const res = await this.sendChunk({ child_ids: chunk, dry_run: true, skip_phones: skipPhones });
        rows.push(...res.results);
        skipPhones = skipPhones.concat(res.phones);
        this.update({ previewRows: rows.slice() });
      }
      // Hold the finished ring for a beat, so 100% is seen rather than skipped.
      await this.wait(this.holdMs);
      this.update({ phase: 'preview' });
    } catch (err) {
      this.update({ phase: 'failed', error: dryRunError(err) });
    }
  }

  /** The real send. Only from a finished preview, and only once. */
  start(): Promise<void> {
    if (this.current.phase !== 'preview') return Promise.resolve();
    this.skipPhones = [];
    this.update({ sentRows: [] });
    return this.sendFrom(0);
  }

  /** Carry on past the chunk that did not answer. That chunk is not sent again. */
  resume(): Promise<void> {
    const at = this.current.pausedAt;
    if (this.current.phase !== 'paused' || at === null) return Promise.resolve();
    return this.sendFrom(at + 1);
  }

  /** End a paused run where it stands. */
  stop() {
    if (this.current.phase !== 'paused') return;
    this.update({ phase: 'done' });
  }

  private async sendFrom(startIndex: number): Promise<void> {
    this.update({ phase: 'sending', pausedAt: null });
    for (let i = startIndex; i < this.chunks.length; i += 1) {
      try {
        const res = await this.sendChunk({
          child_ids: this.chunks[i],
          dry_run: false,
          skip_phones: this.skipPhones,
        });
        this.skipPhones = this.skipPhones.concat(res.phones);
        this.update({ sentRows: this.current.sentRows.concat(res.results) });
      } catch {
        // A timed-out chunk may well have gone out on the server (the client
        // timeout is longer than the function's). Never retry it by itself,
        // and treat its phones as used so a sibling in a later chunk does not
        // get a second message when the office continues.
        const chunk = new Set(this.chunks[i]);
        const usedPhones = this.current.previewRows
          .filter((r) => chunk.has(r.child_id) && r.status === 'preview' && r.phone)
          .map((r) => r.phone);
        this.skipPhones = this.skipPhones.concat(usedPhones);
        this.update({ phase: 'paused', pausedAt: i });
        return;
      }
    }
    this.update({ phase: 'done' });
  }
}

/** True while requests are going out — the states a reload would cut short. */
export function runIsBusy(phase: RunPhase) {
  return phase === 'checking' || phase === 'sending';
}

/** True while the run must not be replaced by a new selection. */
export function runIsHeld(phase: RunPhase) {
  return runIsBusy(phase) || phase === 'paused';
}

export function previewCounts(rows: BroadcastRow[]) {
  const willSend = rows.filter((r) => r.status === 'preview').length;
  return { willSend, skipped: rows.length - willSend };
}

export function sentCounts(rows: BroadcastRow[]) {
  return {
    sent: rows.filter((r) => r.status === 'sent').length,
    failed: rows.filter((r) => r.status === 'failed').length,
    skipped: rows.filter((r) => r.status === 'skipped').length,
  };
}

export type DockTone = 'check' | 'send' | 'ready' | 'warn' | 'done' | 'error';

/**
 * What the minimised button says. Its percentage is the same real count the
 * full screen shows: children handled, not chunks and never a timer.
 */
export function dockSummary(s: RunSnapshot): {
  tone: DockTone;
  label: string;
  detail: string;
  done: number;
  finished: boolean;
  showPercent: boolean;
} {
  switch (s.phase) {
    case 'idle':
    case 'checking':
      return {
        tone: 'check',
        label: 'בודק נמענים',
        detail: `${Math.min(s.previewRows.length, s.total)}/${s.total}`,
        done: s.previewRows.length,
        finished: false,
        showPercent: true,
      };
    case 'preview': {
      const { willSend } = previewCounts(s.previewRows);
      return {
        tone: 'ready',
        label: 'הבדיקה הסתיימה',
        detail: `${willSend} יישלחו · לחצו לאישור`,
        done: s.total,
        finished: true,
        showPercent: false,
      };
    }
    case 'sending':
      return {
        tone: 'send',
        label: 'שולח הודעות',
        detail: `${Math.min(s.sentRows.length, s.total)}/${s.total}`,
        done: s.sentRows.length,
        finished: false,
        showPercent: true,
      };
    case 'paused':
      return {
        tone: 'warn',
        label: 'השליחה נעצרה',
        detail: 'נדרשת החלטה · לחצו לפתיחה',
        done: s.sentRows.length,
        finished: false,
        showPercent: false,
      };
    case 'done': {
      const { sent, failed } = sentCounts(s.sentRows);
      return {
        tone: 'done',
        label: 'השליחה הסתיימה',
        detail: failed ? `נשלחו ${sent} · נכשלו ${failed}` : `נשלחו ${sent}`,
        done: s.total,
        finished: true,
        showPercent: false,
      };
    }
    case 'failed':
    default:
      return {
        tone: 'error',
        label: 'הבדיקה נכשלה',
        detail: 'לחצו לפרטים',
        done: s.previewRows.length,
        finished: false,
        showPercent: false,
      };
  }
}
