import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

import { REPLY_DELAY_MS } from './demo';
import { DemoReplyRunner, type DemoReplyReason, type DemoReplyState } from './demoReply';

/** A runner whose call to the server is held open until the test lets it finish. */
function setup() {
  const calls: DemoReplyReason[] = [];
  const states: DemoReplyState[] = [];
  let finish: (() => void) | null = null;
  const runner = new DemoReplyRunner({
    delayMs: REPLY_DELAY_MS,
    onChange: (state) => states.push(state),
    run: (reason) => {
      calls.push(reason);
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    },
  });
  /** The server answered. */
  const land = async () => {
    finish?.();
    finish = null;
    await vi.advanceTimersByTimeAsync(0);
  };
  return { runner, calls, states, land };
}

describe('when the new bot answers a demo conversation', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  test('the delay is three seconds', () => {
    expect(REPLY_DELAY_MS).toBe(3000);
  });

  test('a burst of messages is answered once, three seconds after the last of them', async () => {
    const { runner, calls } = setup();
    runner.noteCustomerMessage();
    await vi.advanceTimersByTimeAsync(2000);
    runner.noteCustomerMessage();
    await vi.advanceTimersByTimeAsync(2000);
    runner.noteCustomerMessage();
    // Six seconds since the first, never three since the last: nothing yet.
    await vi.advanceTimersByTimeAsync(2999);
    expect(calls).toEqual([]);
    expect(runner.state).toEqual({ armed: true, inFlight: false });
    await vi.advanceTimersByTimeAsync(1);
    expect(calls).toEqual(['auto']);
    expect(runner.state).toEqual({ armed: false, inFlight: true });
  });

  test('"ענה עכשיו" answers at once, and the clock that was running does not answer again', async () => {
    const { runner, calls, land } = setup();
    runner.noteCustomerMessage();
    runner.replyNow();
    expect(calls).toEqual(['manual']);
    await land();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls).toEqual(['manual']);
    expect(runner.state).toEqual({ armed: false, inFlight: false });
  });

  test('while an answer is on its way nothing fires a second call — not the button, not a new message', async () => {
    const { runner, calls, land } = setup();
    runner.replyNow();
    expect(runner.state.inFlight).toBe(true);
    runner.replyNow();
    runner.replyNow();
    runner.noteCustomerMessage();
    await vi.advanceTimersByTimeAsync(50_000);
    expect(calls).toEqual(['manual']);

    // The answer lands: the message that came meanwhile gets its own, three seconds later.
    await land();
    expect(runner.state).toEqual({ armed: true, inFlight: false });
    await vi.advanceTimersByTimeAsync(REPLY_DELAY_MS);
    expect(calls).toEqual(['manual', 'auto']);
  });

  test('a recording still uploading holds the clock; it starts when the file has landed', async () => {
    const { runner, calls } = setup();
    runner.noteCustomerMessage();
    runner.sendStarted();
    expect(runner.state.armed).toBe(false);
    // A slow upload: well past three seconds, and still nothing.
    await vi.advanceTimersByTimeAsync(20_000);
    expect(calls).toEqual([]);
    runner.sendEnded(true);
    expect(runner.state.armed).toBe(true);
    await vi.advanceTimersByTimeAsync(REPLY_DELAY_MS);
    expect(calls).toEqual(['auto']);
  });

  test('a message the server refused is nothing to answer', async () => {
    const { runner, calls } = setup();
    runner.sendStarted();
    runner.sendEnded(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls).toEqual([]);
    expect(runner.state).toEqual({ armed: false, inFlight: false });
  });

  test('the switch off: no answer by itself, the button still works; back on, the burst left behind is answered', async () => {
    const { runner, calls, land } = setup();
    runner.setAuto(false);
    expect(runner.autoOn).toBe(false);
    runner.noteCustomerMessage();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls).toEqual([]);

    runner.setAuto(true);
    await vi.advanceTimersByTimeAsync(REPLY_DELAY_MS);
    expect(calls).toEqual(['auto']);
    await land();

    runner.setAuto(false);
    runner.replyNow();
    expect(calls).toEqual(['auto', 'manual']);
  });

  test('turning the switch off drops a clock that was already running', async () => {
    const { runner, calls } = setup();
    runner.noteCustomerMessage();
    runner.setAuto(false);
    expect(runner.state.armed).toBe(false);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(calls).toEqual([]);
  });

  test('a call that failed is over: the button works again, and nothing retries by itself', async () => {
    const calls: DemoReplyReason[] = [];
    const runner = new DemoReplyRunner({
      delayMs: REPLY_DELAY_MS,
      run: async (reason) => {
        calls.push(reason);
        throw new Error('timeout');
      },
    });
    runner.replyNow();
    await vi.advanceTimersByTimeAsync(0);
    expect(runner.state).toEqual({ armed: false, inFlight: false });
    await vi.advanceTimersByTimeAsync(60_000);
    expect(calls).toEqual(['manual']);
    runner.replyNow();
    expect(calls).toEqual(['manual', 'manual']);
  });

  test('leaving the page stops the clock', async () => {
    const { runner, calls } = setup();
    runner.noteCustomerMessage();
    runner.dispose();
    await vi.advanceTimersByTimeAsync(10_000);
    runner.replyNow();
    expect(calls).toEqual([]);
  });

  test('the screen is told when the clock starts, when the call goes out and when it is back', async () => {
    const { runner, states, land } = setup();
    runner.noteCustomerMessage();
    await vi.advanceTimersByTimeAsync(REPLY_DELAY_MS);
    await land();
    expect(states).toEqual([
      { armed: true, inFlight: false },
      { armed: false, inFlight: true },
      { armed: false, inFlight: false },
    ]);
  });
});
