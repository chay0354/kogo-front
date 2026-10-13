import type { WahubStatus } from '@/types/wahub';
import type { WahubBotMode } from '@/types/wahubBotMode';
import { isStubModel } from './bot';
import { whoAnswersWord } from './botMode';
import { liveTestCount } from './liveTest';

/**
 * "מצב המערכת" — the card at the top of the settings
 * (docs/WAHUB-CONTRACT-POLISH-1.md, ג). What used to be two chips beside the
 * page's title is read here, row by row: a title and a word each; the details
 * are a press away, and are written by the screen.
 */

export type StatusLevel = 'ok' | 'warn' | 'off' | 'unknown';

/** How the connection as a whole reads: a word, never a colour alone. */
export function connectionLevel(status: WahubStatus | undefined): { level: StatusLevel; word: string } {
  if (!status) return { level: 'unknown', word: '' };
  if (!status.inbound_configured) return { level: 'off', word: 'לא מחובר' };
  if (!status.last_inbound_at) return { level: 'warn', word: 'ממתין להודעה ראשונה' };
  if (!status.bot_replies_seen || !status.send_configured || !status.sending_enabled || status.simulate_send) {
    return { level: 'warn', word: 'חלקי' };
  }
  return { level: 'ok', word: 'תקין' };
}

export type SendingState = 'simulated' | 'off' | 'on' | 'unconfigured';

/** Whether anything goes out to a customer: simulated, switched off by the owner, on, or on with no key to send by. */
export function sendingState(status: Pick<WahubStatus, 'simulate_send' | 'sending_enabled' | 'send_configured'>): SendingState {
  if (status.simulate_send) return 'simulated';
  if (!status.sending_enabled) return 'off';
  return status.send_configured ? 'on' : 'unconfigured';
}

const SENDING_WORD: Record<SendingState, string> = {
  simulated: 'הדמיה',
  off: 'כבויה',
  on: 'פעילה',
  unconfigured: 'לא מוגדרת',
};

const SENDING_MISSING: Record<SendingState, string> = {
  simulated: 'שליחה אמיתית ללקוחות (כרגע הדמיה)',
  off: 'שליחה ללקוחות (כבויה)',
  on: '',
  unconfigured: 'מפתח ManyChat לשליחה',
};

/**
 * What a connection that is not whole is short of, in a few words each — the
 * line that says why the word is "חלקי". Empty when nothing is missing.
 */
export function connectionMissing(status: WahubStatus): string[] {
  const missing: string[] = [];
  if (!status.inbound_configured) missing.push('מפתח חיבור ל-ManyChat');
  else if (!status.last_inbound_at) missing.push('הודעה ראשונה מ-ManyChat');
  if (!status.bot_replies_seen) missing.push('העתק של תשובות הבוט');
  const sending = SENDING_MISSING[sendingState(status)];
  if (sending) missing.push(sending);
  return missing;
}

/**
 * Recordings in a word: working, never tried yet, no key — or why the last one
 * was refused. The usual reason is an account with no credit left, said short.
 */
export function transcribeLevel(transcribe: NonNullable<WahubStatus['transcribe']>): { level: StatusLevel; value: string } {
  if (!transcribe.configured) return { level: 'off', value: 'אין מפתח' };
  if (transcribe.ok === false) {
    const reason = (transcribe.reason ?? '').trim();
    return { level: 'warn', value: reason.includes('אין יתרה') ? 'אין יתרה בחשבון' : 'לא עובד' };
  }
  return transcribe.ok ? { level: 'ok', value: 'פעיל' } : { level: 'unknown', value: 'עוד לא נוסה' };
}

export type SystemStatusKey = 'connection' | 'summary' | 'shadow' | 'transcribe' | 'sending' | 'whoAnswers' | 'liveTest';

export interface SystemStatusRow {
  key: SystemStatusKey;
  title: string;
  level: StatusLevel;
  /** The word beside the title. */
  value: string;
  /** The value is a code name (a model's): written left to right. */
  ltr?: boolean;
  /** The row leads to a card of its own, instead of opening lines under it: what it stands for is said there, once. */
  link?: boolean;
}

/**
 * The rows of the card, in their fixed order. A row the server knows nothing
 * of (the shadow bot before stage 2, the live test before it was built, who
 * answers the customers before docs/WAHUB-CONTRACT-GO-LIVE.md) is left out
 * rather than guessed.
 */
export function systemStatusRows(status: WahubStatus, botMode?: WahubBotMode | null): SystemStatusRow[] {
  const rows: SystemStatusRow[] = [];

  const connection = connectionLevel(status);
  rows.push({ key: 'connection', title: 'חיבור הוואטסאפ', level: connection.level, value: connection.word });

  rows.push({
    key: 'summary',
    title: 'סיכום אוטומטי',
    level: status.ai_configured ? 'ok' : 'unknown',
    value: status.ai_configured ? 'פעיל' : 'כבוי',
  });

  if (status.shadow_configured !== undefined) {
    const model = (status.shadow_model ?? '').trim();
    const real = status.shadow_configured && !isStubModel(model);
    rows.push({
      key: 'shadow',
      title: 'הבוט בצל',
      level: real ? 'ok' : 'warn',
      value: real ? model || 'פעיל' : 'דמה',
      ltr: real && Boolean(model),
    });
  }

  if (status.transcribe !== undefined) {
    rows.push({ key: 'transcribe', title: 'תמלול הקלטות', ...transcribeLevel(status.transcribe) });
  }

  const sending = sendingState(status);
  rows.push({ key: 'sending', title: 'שליחה ללקוחות', level: sending === 'on' ? 'ok' : 'warn', value: SENDING_WORD[sending] });

  // Whom the new bot answers: a word here, and the card "מי עונה ללקוחות" for everything else.
  if (botMode) rows.push({ key: 'whoAnswers', title: 'מי עונה', ...whoAnswersWord(botMode), link: true });

  const live = liveTestCount(status);
  if (live !== null) {
    rows.push({
      key: 'liveTest',
      title: 'בדיקה חיה',
      level: live > 0 ? 'warn' : 'unknown',
      value: live === 0 ? 'כבויה' : live === 1 ? 'איש קשר אחד' : `${live} אנשי קשר`,
    });
  }

  return rows;
}
