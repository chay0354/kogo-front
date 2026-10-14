/**
 * "מה זה אומר?" — the state of a lead in two short lines, for the small bubble
 * that opens on it (the owner, 14.10.2026: "כל מקום שרשום המצב של ליד… אם שמים
 * על זה את העכבר או לוחצים בטלפון — בועה קטנה שמסבירה פשוט מה זה").
 *
 * `what` — what the state means; `now` — what happens next, and who does it.
 * The point of each is marked **so** and shown in bold.
 *
 * The times are the server's (kogo-back apps/wahub/lead_stage.py: NUDGE_DELAYS,
 * SILENT_AFTER, IN_CONVERSATION_FOR, COLD_AFTER; the daily look of
 * nothing_to_offer — docs/WAHUB-CONTRACT-LEADS-NO-ONE-LOST.md). A change there
 * is a change here.
 */

export interface StageHelp {
  what: string;
  now: string;
}

export const STAGE_HELP: Record<string, StageHelp> = {
  signup_stuck: { what: 'ניסה להירשם באתר, והאתר עצר אותו', now: '**מחכה לך:** להתקשר ולסיים איתו את ההרשמה' },
  signup_failed: { what: 'ניסה להירשם, והחיוב בכרטיס נכשל', now: '**מחכה לך:** להתקשר ולעזור לו לשלם' },
  needs_reply: { what: 'שאל משהו או ביקש נציג, ועוד לא קיבל תשובה', now: '**מחכה לך:** לענות לו' },
  callback_due: {
    what: 'הגיע היום שבו ביקשו שנחזור אליהם',
    now: 'מועד שהמשרד קבע — **מחכה לך**. מועד שהלקוח עצמו אמר — **הבוט חוזר אליו**',
  },
  signup_started: {
    what: 'מילא פרטים באתר ולא שילם',
    now: '**הבוט שואל** יום אחרי אם משהו נתקע, ומזכיר שוב אחרי 3 ימים ושבוע',
  },
  link_sent: {
    what: 'הבוט או המשרד שלחו לו קישור להרשמה, וההרשמה עוד לא הגיעה ל-Kogo',
    now: '**הבוט מזכיר** אחרי יום, 3 ימים ושבוע. נרשם — הליד נסגר לבד',
  },
  will_check: { what: 'ענה שקודם יבדוק או ישאל מישהו, ויחזור אלינו', now: '**הבוט שואל פעם אחת**, יום אחרי. לא ענה — **עובר אליך**' },
  trial_booked: { what: 'יש לו שיעור ניסיון שעוד לא היה', now: 'מחכים לשיעור. אחריו **הבוט שואל איך היה**' },
  trial_no_show: {
    what: 'היה רשום לשיעור ניסיון, וסומן שלא הגיע',
    now: '**הבוט מציע מועד אחר** יום אחרי ושוב אחרי 3 ימים. לא ענה — **עובר אליך**',
  },
  trial_done: {
    what: 'שיעור הניסיון שלו כבר היה, ומאז לא נרשם לחוג',
    now: '**הבוט שואל איך היה** (יום אחרי), שולח קישור (3 ימים) ובודק אם עוד רלוונטי (שבוע). לא ענה — **עובר אליך**',
  },
  waiting_date: {
    what: 'ביקשו שנחזור במועד מסוים, או שהמשרד קבע מועד',
    now: 'עד אז אף אחד לא כותב לו. במועד **הבוט חוזר** — או **עובר אליך**, אם המשרד קבע',
  },
  waiting_list: { what: 'מחכה למקום בשיעור מלא', now: 'כשמתפנה מקום — **עובר אליך**, ואתה מחליט אם להודיע לו' },
  nothing_to_offer: {
    what: 'אין סניף באזור שלו, אין חוג שמתאים לגיל, או שהחוג מלא',
    now: '**המערכת בודקת כל יום.** כשנפתח חוג שמתאים — **עובר אליך**',
  },
  answered_silent: {
    what: 'קיבל תשובה, ושותק כבר יומיים בלי להירשם',
    now: '**הבוט חוזר פעם אחת** ומציע שיעור ניסיון. אחרי 30 יום של שקט — רדום',
  },
  in_conversation: {
    what: 'השיחה פעילה: כתבו בה ביומיים האחרונים',
    now: 'אף אחד לא צריך לחזור אליו עכשיו. כתב רק "היי"? **הבוט שואל** אחרי שעתיים מה הם מחפשים',
  },
  registered: { what: 'ההרשמה שלו לחוג הגיעה ל-Kogo אחרי הפנייה', now: 'הליד סגור' },
  customer: { what: 'כבר לקוח משלם: השיחה היא שירות, לא ליד', now: 'נפתח כליד רק כשהוא מבקש חוג נוסף' },
  not_interested: { what: 'הלקוח עצמו אמר שזה לא בשבילו, או שמישהו מהמשרד סגר את הליד', now: 'נפתח שוב לבד אם הוא כותב' },
  not_relevant: { what: 'הלקוח עצמו אמר שזה לא בשבילו, או שמישהו מהמשרד סגר את הליד', now: 'נפתח שוב לבד אם הוא כותב' },
  deleted: { what: 'מישהו מחק את הליד', now: 'נפתח שוב לבד אם הוא כותב' },
  cold: {
    what: 'אף אחד לא כתב בשיחה 30 יום ומעלה, ולא נרשם',
    now: 'אף אחד לא חוזר אליו. ביום שתקבע (פתיחת הרשמה) **הבוט שולח הודעה אחת** לכל הרדומים',
  },
};

export function stageHelp(stage: string | null | undefined): StageHelp | null {
  return (stage && STAGE_HELP[stage]) || null;
}

export interface HelpPart {
  text: string;
  bold: boolean;
}

/** "**הבוט מזכיר** אחרי יום" → the parts to draw, the marked ones bold. An unmatched mark is shown as it is. */
export function helpParts(line: string): HelpPart[] {
  const parts: HelpPart[] = [];
  const pattern = /\*\*(.+?)\*\*/g;
  let at = 0;
  for (let found = pattern.exec(line); found; found = pattern.exec(line)) {
    if (found.index > at) parts.push({ text: line.slice(at, found.index), bold: false });
    parts.push({ text: found[1], bold: true });
    at = found.index + found[0].length;
  }
  if (at < line.length) parts.push({ text: line.slice(at), bold: false });
  return parts;
}

/** The two lines as one plain sentence — for a screen reader, and for the `title` of a row where a bubble cannot open. */
export function stageHelpText(stage: string | null | undefined): string {
  const help = stageHelp(stage);
  if (!help) return '';
  return `${help.what}. ${help.now.replace(/\*\*/g, '')}`;
}

/** The external branch's line, as the server writes it (kogo-back lead_stage.EXTERNAL_BRANCH). */
const EXTERNAL_LINE = 'סניף חיצוני';

/**
 * What the next-step line of a lead means, for the bubble on it (the owner, 14.10.2026, on a row that said
 * "סניף חיצוני — ההרשמה מול העירייה": "זה לא מראה לי בועה… שמסביר לי משהו"). A line that will not go out says
 * why and what becomes of it; an external branch says why nobody sees the registration; any other line is the
 * lead's state.
 */
export function nextStepHelp(
  lead: { stage: string },
  line: { text: string; tone: string; detail?: string },
): StageHelp | null {
  const held = line.text.match(/(?:לא ייצא:|היה נשלח עכשיו —)\s*(.+)$/);
  if (line.tone === 'held' && held) {
    const step = (line.detail || '').trim();
    return {
      what: `${step ? `${step}, ` : 'הבוט היה אמור לשלוח הודעה, '}אבל ${held[1].trim()}`,
      now: '**לא ייצא באיחור:** כשמדליקים, יוצא רק מה שהגיע זמנו אחרי ההדלקה',
    };
  }
  if (line.text.startsWith(EXTERNAL_LINE)) {
    return {
      what: 'ההרשמה בסניף הזה היא מול העירייה או המתנ"ס, ולכן Kogo לא רואה אם נרשם',
      now: 'כשהשיחה שוקטת, **הבוט בודק איתו פעם אחת** אם הסתדר מול העירייה',
    };
  }
  return stageHelp(lead.stage);
}
