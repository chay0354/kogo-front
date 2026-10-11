/**
 * When the new bot answers a demo conversation (docs/WAHUB-CONTRACT-REAL-DEMO.md, ג):
 * three seconds after the customer's last message of a burst, or at once on
 * "ענה עכשיו" — and never twice at the same time. The server keeps no lock
 * (הבהרה 9), so this is where a second call is held back.
 *
 * Plain state, no React: the hook around it is thin, and this is testable with
 * fake timers.
 */

export type DemoReplyReason = 'auto' | 'manual';

export interface DemoReplyState {
  /** The timer is running: the bot will answer in a moment. */
  armed: boolean;
  /** A call is out: "הבוט כותב…". */
  inFlight: boolean;
}

interface Options {
  delayMs: number;
  /** The call to the server. Resolves when the answer is in (or the failure was said). */
  run: (reason: DemoReplyReason) => Promise<void>;
  onChange?: (state: DemoReplyState) => void;
}

export class DemoReplyRunner {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private inFlight = false;
  /** A customer message is in the conversation and no call has gone out since. */
  private due = false;
  /** Messages still on their way to the server: the clock waits for the last of them. */
  private sending = 0;
  private auto = true;
  private disposed = false;

  constructor(private readonly options: Options) {}

  get state(): DemoReplyState {
    return { armed: this.timer !== null, inFlight: this.inFlight };
  }

  /** Whether a burst is answered by itself ("הבוט החדש עונה בשיחה"). */
  get autoOn(): boolean {
    return this.auto;
  }

  /**
   * Off, the timer is dropped; "ענה עכשיו" still works. Back on, a burst that
   * was left unanswered meanwhile is answered.
   */
  setAuto(on: boolean): void {
    this.auto = on;
    if (on) this.settle();
    else this.disarm();
  }

  /** A message of the customer's left for the server (an upload can take a while): the clock waits for it. */
  sendStarted(): void {
    if (this.disposed) return;
    this.sending += 1;
    this.disarm();
  }

  /** It landed — or was refused, and then there is nothing new to answer. */
  sendEnded(stored: boolean): void {
    if (this.disposed) return;
    this.sending = Math.max(0, this.sending - 1);
    if (stored) this.due = true;
    this.settle();
  }

  /** A customer message is in the conversation: the clock starts again from now. */
  noteCustomerMessage(): void {
    if (this.disposed) return;
    this.due = true;
    this.settle();
  }

  /** "ענה עכשיו". Ignored while a call is out — one answer per burst. */
  replyNow(): void {
    if (this.disposed || this.inFlight) return;
    this.disarm();
    void this.fire('manual');
  }

  dispose(): void {
    this.disposed = true;
    this.disarm();
  }

  /** Start the clock when there is something to answer and nothing is in the way. */
  private settle(): void {
    if (this.disposed || !this.due || !this.auto || this.inFlight || this.sending > 0) return;
    this.arm();
  }

  private arm(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.fire('auto');
    }, this.options.delayMs);
    this.emit();
  }

  private disarm(): void {
    if (this.timer === null) return;
    clearTimeout(this.timer);
    this.timer = null;
    this.emit();
  }

  private async fire(reason: DemoReplyReason): Promise<void> {
    if (this.inFlight || this.disposed) return;
    this.inFlight = true;
    // Whatever is in the conversation now is this call's to answer.
    this.due = false;
    this.emit();
    try {
      await this.options.run(reason);
    } catch {
      // The caller says its own failures; a call that threw is over all the same.
    } finally {
      this.inFlight = false;
      this.emit();
      // A message that came while the call was out gets its own answer.
      this.settle();
    }
  }

  private emit(): void {
    if (this.disposed) return;
    this.options.onChange?.(this.state);
  }
}
