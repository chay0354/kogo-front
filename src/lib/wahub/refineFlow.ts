import { readableError } from '../apiError';
import {
  REFINE_TEXT,
  changeKey,
  undoPlan,
  type RefineAction,
  type RefineChatState,
} from './refine';
import {
  fetchWahubRefineThread,
  isNotBuiltYet,
  isUnanswered,
  sayWahubRefine,
  startWahubRefine,
  undoWahubProposal,
  undoWahubRefine,
  wantsWordsFirst,
} from './refineApi';

/**
 * What the small chat of "דיוק" does with the server, step by step. It holds
 * no state of its own: it reads where the chat stands, says what happened, and
 * the screen draws it. So it runs the same under a hook and under a test.
 */

export interface RefineFlowContext {
  getState: () => RefineChatState;
  dispatch: (action: RefineAction) => void;
  /** The knowledge or the proposals may have moved: whoever lists them reads again. */
  onChanged?: () => void;
}

export interface RefineSendTarget {
  /** The conversation the marked messages are of; null for a thread on a proposal. */
  contactId: number | null;
  messageIds: ReadonlyArray<number>;
  /** "לתקן" was pressed on this shadow reply. */
  shadowId?: number | null;
  /** "דיוק" was pressed on this proposal: the thread is about it, not about messages. */
  proposalId?: number | null;
}

/**
 * `sent`: the server answered. `unavailable`: it has no refine/ yet. `unknown`:
 * no answer came — the refinement may or may not have been kept. `failed`: it
 * refused, and said why. In the last three the text belongs back in the box.
 */
export type RefineSendResult = 'sent' | 'failed' | 'unavailable' | 'unknown';

/**
 * A line typed in the small chat. The first one opens the thread on the marked
 * messages (POST refine/); every one after it continues the thread
 * (POST refine/{id}/say/). While the server is thinking nothing else is sent.
 */
export async function sendRefine(ctx: RefineFlowContext, target: RefineSendTarget, text: string): Promise<RefineSendResult> {
  const clean = text.trim();
  const state = ctx.getState();
  if (!clean || state.phase !== 'idle') return 'failed';
  const opening = state.threadId == null;
  // Nothing to open a thread on: neither a proposal nor a conversation.
  if (opening && target.proposalId == null && target.contactId == null) return 'failed';
  ctx.dispatch({ type: 'sending', text: clean });
  try {
    const thread = !opening
      ? await sayWahubRefine(state.threadId as number, clean)
      : target.proposalId != null
        ? await startWahubRefine({ proposal: target.proposalId, text: clean })
        : await startWahubRefine({
            contact: target.contactId as number,
            message_ids: target.messageIds.slice(),
            text: clean,
            shadow_ids: target.shadowId != null ? [target.shadowId] : undefined,
          });
    ctx.dispatch({ type: 'answered', thread });
    ctx.onChanged?.();
    return 'sent';
  } catch (error) {
    // Only the door itself missing means "not built"; a thread the server no longer finds is an ordinary refusal.
    if (opening && isNotBuiltYet(error)) {
      ctx.dispatch({ type: 'unavailable' });
      return 'unavailable';
    }
    if (isUnanswered(error)) {
      ctx.dispatch({ type: 'failed', error: REFINE_TEXT.unknown });
      ctx.onChanged?.();
      return 'unknown';
    }
    ctx.dispatch({ type: 'failed', error: readableError(error, REFINE_TEXT.failed) });
    return 'failed';
  }
}

/**
 * `summarized`: the system spoke first. `skipped`: an older server wants her
 * words first — the box waits, as it always did. `unavailable`: no refine/ at
 * all. `failed`: no summary came, and the box says so and waits.
 */
export type RefineSummaryResult = 'summarized' | 'skipped' | 'unavailable' | 'failed';

/**
 * "המשך" on marked messages: the thread is opened with no words of hers
 * (POST refine/ with `text: ""`) and the system speaks first — a smart summary
 * of the piece and "מה לא היה טוב כאן?". Nothing is changed at this step; what
 * she writes next goes to the same thread (POST refine/{id}/say/).
 *
 * Whatever goes wrong, the chat is left ready to write in: a summary is a
 * help, never a gate.
 */
export async function startRefineSummary(ctx: RefineFlowContext, target: RefineSendTarget): Promise<RefineSummaryResult> {
  const state = ctx.getState();
  if (state.phase !== 'idle' || state.threadId != null) return 'failed';
  // The summary is of marked messages of a conversation.
  if (target.contactId == null || target.proposalId != null || !target.messageIds.length) return 'failed';
  ctx.dispatch({ type: 'summarizing' });
  try {
    const thread = await startWahubRefine({
      contact: target.contactId,
      message_ids: target.messageIds.slice(),
      text: '',
      shadow_ids: target.shadowId != null ? [target.shadowId] : undefined,
    });
    ctx.dispatch({ type: 'answered', thread });
    // The conversation has one more thread to list.
    ctx.onChanged?.();
    return 'summarized';
  } catch (error) {
    if (isNotBuiltYet(error)) {
      ctx.dispatch({ type: 'unavailable' });
      return 'unavailable';
    }
    if (wantsWordsFirst(error)) {
      ctx.dispatch({ type: 'summarySkipped' });
      return 'skipped';
    }
    // No answer, or a refusal: said plainly, and the box is hers. A thread the server may have opened holds
    // only a summary — nothing in the bot's knowledge moved.
    ctx.dispatch({
      type: 'summarySkipped',
      note: isUnanswered(error) ? REFINE_TEXT.summaryFailed : readableError(error, REFINE_TEXT.summaryFailed),
    });
    return 'failed';
  }
}

/**
 * "בטל" on a change card. One applied change: the thread's own undo. Several:
 * only this card's proposal, so the others stay (see `undoPlan`).
 */
export async function undoRefineChange(ctx: RefineFlowContext, index: number): Promise<boolean> {
  const state = ctx.getState();
  const plan = undoPlan(state.changes, index);
  if (!plan || state.threadId == null || state.undoing !== null || state.phase !== 'idle') return false;
  const key = changeKey(state.changes[index], index);
  ctx.dispatch({ type: 'undoing', key });
  try {
    if (plan.via === 'proposal') {
      await undoWahubProposal(plan.proposalId);
      ctx.dispatch({ type: 'undone', keys: [key], thread: null });
    } else {
      const thread = await undoWahubRefine(state.threadId);
      ctx.dispatch({ type: 'undone', keys: 'all', thread });
    }
    ctx.onChanged?.();
    return true;
  } catch (error) {
    ctx.dispatch({ type: 'undoFailed', error: readableError(error, REFINE_TEXT.undoFailed) });
    return false;
  }
}

/** An earlier thread of the same conversation, opened to read or to continue (GET refine/{id}/). */
export async function openRefineThread(ctx: RefineFlowContext, id: number): Promise<boolean> {
  if (ctx.getState().phase !== 'idle') return false;
  ctx.dispatch({ type: 'loading' });
  try {
    const thread = await fetchWahubRefineThread(id);
    ctx.dispatch({ type: 'opened', thread });
    return true;
  } catch (error) {
    ctx.dispatch({ type: 'failed', error: readableError(error, REFINE_TEXT.openFailed) });
    return false;
  }
}
