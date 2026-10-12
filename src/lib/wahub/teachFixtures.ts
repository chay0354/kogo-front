/**
 * What the server sends for "ללמד" and "בדיקות", as the two contracts word it
 * (docs/WAHUB-CONTRACT-TEACH-AND-TESTS.md, א; docs/WAHUB-CONTRACT-BOT-EVALS.md).
 * For tests only. Every name and every sentence is made up.
 */

type Raw = Record<string, unknown>;

/** A change of a teach thread, as the server sends it: what a person reads in `plain`, the code names in `technical`. */
export function rawTeachChange(over: Raw = {}): Raw {
  return {
    proposal_id: 88,
    status: 'pending',
    status_label: 'מחכה לאישור שלך',
    applied: false,
    can_undo: true,
    moved: false,
    plain: {
      headline: 'מעכשיו הבוט ישאל על איזה חוג מדובר לפני שיענה על מחיר',
      rule: 'כשלקוח שואל על מחיר בלי לומר על איזה חוג, שואלים קודם על איזה חוג מדובר.',
      why: 'כך הסברת: "כששואלים על מחיר, קודם לשאול על איזה חוג"',
      is_new: true,
      before: null,
      after: 'כשלקוח שואל על מחיר בלי לומר על איזה חוג, שואלים קודם על איזה חוג מדובר.',
      example_good: '',
      example_bad: '',
    },
    technical: {
      action: 'create',
      kind: 'behavior_rule',
      kind_label: 'כלל התנהגות',
      when_label: 'מיוזמתו כשרלוונטי',
      item_id: null,
      key: 'price_needs_course',
      title: 'מחיר: קודם שואלים על איזה חוג',
      before: null,
      after: { kind: 'behavior_rule', title: 'מחיר: קודם שואלים על איזה חוג', body: 'כשלקוח שואל על מחיר…', when_to_say: 'proactive' },
      kept_as_written: false,
    },
    ...over,
  };
}

/** POST refine/ {text} — a thread that waits for "מאשר", its example still on its way. */
export function rawTeachThread(over: Raw = {}): Raw {
  return {
    thread: 41,
    id: 41,
    mode: 'teach',
    status: 'open',
    status_label: 'פתוח',
    state: 'waiting',
    state_label: 'מחכה לאישור שלך',
    text: 'כששואלים על מחיר, קודם לשאול על איזה חוג',
    understood: 'כששואלים על מחיר, הבוט ישאל קודם על איזה חוג מדובר ורק אז יענה',
    question: null,
    changes: [rawTeachChange()],
    preview: { question: 'כמה עולה חוג?', before: null, after: null, pending: true },
    conflicts: [{ item_id: 12, title: 'מחיר', why: 'היום כתוב שם שעונים מחיר מיד' }],
    notes: [],
    needs_approval: true,
    needs_answer: false,
    can_undo: true,
    check: null,
    reply: 'הבנתי כך: כששואלים על מחיר, הבוט ישאל קודם על איזה חוג מדובר\nשום דבר עוד לא השתנה — זה מחכה לאישור שלך',
    turns: [],
    created_by_name: 'דנה המנהלת',
    created_at: '2026-10-12T09:30:00+03:00',
    technical: { model: 'claude-opus-5-5', reason: null, outcome: 'waiting' },
    ...over,
  };
}

/** The check after an approval. */
export function rawTeachCheck(over: Raw = {}): Raw {
  return {
    ran: 1,
    passed: 1,
    pending: false,
    lines: ['שאלתי "כמה עולה חוג?" — הבוט שאל קודם על איזה חוג מדובר ✓'],
    summary: 'בדקתי שיחה אחת — הבוט עונה נכון',
    details: [{ question: 'כמה עולה חוג?', answer: 'בשמחה 🙂 על איזה חוג מדובר?', passed: true, line: 'הבוט שאל קודם על איזה חוג מדובר' }],
    technical: { tries: [1], from_suite: false },
    ...over,
  };
}

/** The same thread after "מאשר": kept, with the example whole and the check done. */
export function rawTeachSaved(over: Raw = {}): Raw {
  return rawTeachThread({
    status: 'done',
    state: 'applied',
    state_label: 'נשמר',
    changes: [rawTeachChange({ status: 'applied', status_label: 'נשמר', applied: true })],
    preview: { question: 'כמה עולה חוג?', before: 'החוגים שלנו עולים בין ₪220 ל-₪290', after: 'בשמחה 🙂 על איזה חוג מדובר?', pending: false },
    needs_approval: false,
    check: rawTeachCheck(),
    reply: 'אישרת — השינוי נשמר, והבוט כבר עונה לפיו',
    technical: { model: 'claude-opus-5-5', reason: null, outcome: 'approved' },
    ...over,
  });
}

/** One line of GET refine/?mode=teach. */
export function rawTeachRow(thread: number, over: Raw = {}): Raw {
  return {
    thread,
    at: '2026-10-11T16:20:00+03:00',
    by: 'דנה המנהלת',
    understood: 'כשמבקשים נציג מחוץ לשעות, הבוט יגיד מתי המשרד נפתח שוב',
    text: 'כשמבקשים לדבר עם נציג כשהמשרד סגור, לומר מתי נפתח',
    state: 'applied',
    state_label: 'נשמר',
    needs_answer: false,
    changes_count: 1,
    ...over,
  };
}

export function rawTeachPage(rows: Raw[], over: Raw = {}): Raw {
  return { count: rows.length, next: null, previous: null, results: rows, ...over };
}

// ---------------------------------------------------------------------------
// "בדיקות הבוט"
// ---------------------------------------------------------------------------

export function rawEvalLast(over: Raw = {}): Raw {
  return {
    run_id: 412,
    status: 'failed',
    status_label: 'נכשל',
    finished_at: '2026-10-12T09:41:07.120394+00:00',
    engine: 'claude-opus-5-5',
    engine_is_stub: false,
    took_ms: 14230,
    passed_checks: 23,
    failed_checks: 2,
    not_judged: 0,
    headline: 'המערכת אמרה שקודם צריך לשאול באיזה תחום מדובר, והבוט כבר נתן פרטים של חוג (17:00, ₪260). קודם מבררים, אחר כך מציעים',
    ...over,
  };
}

export function rawEvalScenario(id: string, over: Raw = {}): Raw {
  return {
    id,
    title: 'נותן עיר בלבד',
    group: 'order',
    group_title: 'סדר השיחה',
    what: 'הבוט שואל על התחום ומציג תחומים, לא חוגים',
    rules: [{ id: 'P1', title: 'קודם מבררים, אחר כך מציעים: עיר או סניף ← תחום ← גיל או כיתה ← החוג' }],
    turns: 1,
    last: rawEvalLast(),
    in_progress: null,
    ...over,
  };
}

const PASSED = { status: 'passed', status_label: 'עבר', failed_checks: 0, headline: '' };

/** GET bot/evals/ — six conversations in three groups: one failed, three passed, one skipped, one never run. */
export function rawEvalListing(over: Raw = {}): Raw {
  return {
    engine: { configured: true, model: 'claude-opus-5-5', judge: true, label: 'הבוט עצמו' },
    summary: { total: 6, passed: 3, failed: 1, skipped: 1, not_run: 0, never_run: 1, last_run_at: '2026-10-12T09:41:07.120394+00:00' },
    groups: [
      { id: 'order', title: 'סדר השיחה', total: 3, passed: 2, failed: 1 },
      { id: 'money', title: 'מחיר, ניסיון והרשמה', total: 2, passed: 1, failed: 0 },
      { id: 'places', title: 'סניפים וכתובות', total: 1, passed: 0, failed: 0 },
    ],
    scenarios: [
      rawEvalScenario('order_greeting', { title: 'הורה שואל "יש לכם חוגים?" בלי פרטים', what: 'הבוט שואל באיזו עיר או סניף מדובר', last: rawEvalLast({ run_id: 410, ...PASSED }) }),
      rawEvalScenario('order_city_only'),
      rawEvalScenario('order_step_by_step', { title: 'שיחה שלמה, פרט אחרי פרט', turns: 4, last: rawEvalLast({ run_id: 413, ...PASSED }) }),
      rawEvalScenario('money_price', { title: 'הורה ששואל על מחיר', group: 'money', group_title: 'מחיר, ניסיון והרשמה', last: rawEvalLast({ run_id: 414, ...PASSED }) }),
      rawEvalScenario('money_sibling', { title: 'שואלת על הנחת אחים', group: 'money', group_title: 'מחיר, ניסיון והרשמה', last: null }),
      rawEvalScenario('places_external', {
        title: 'סניף חיצוני: מי רושם?',
        group: 'places',
        group_title: 'סניפים וכתובות',
        last: rawEvalLast({ run_id: 415, status: 'skipped', status_label: 'דולג', failed_checks: 0, headline: 'אי אפשר להריץ כאן: במערכת אין סניף חיצוני פעיל' }),
      }),
    ],
    ...over,
  };
}

/** POST bot/evals/run/ — one run in full: the conversation that failed in the listing above. */
export function rawEvalRun(over: Raw = {}): Raw {
  const failure = {
    id: 'asks_field_first',
    turn: 1,
    kind: 'hard',
    title: 'הבוט שואל באיזה תחום מדובר לפני שהוא מציע חוגים',
    status: 'failed',
    status_label: 'נכשל',
    explain: 'המערכת אמרה שקודם צריך לשאול באיזה תחום מדובר, והבוט כבר נתן פרטים של חוג (17:00, ₪260). קודם מבררים, אחר כך מציעים',
  };
  return {
    run_id: 412,
    scenario: {
      id: 'order_city_only',
      title: 'נותן עיר בלבד',
      group: 'order',
      group_title: 'סדר השיחה',
      what: 'הבוט שואל על התחום ומציג תחומים, לא חוגים',
      rules: [{ id: 'P1', title: 'קודם מבררים, אחר כך מציעים' }],
      turns: 1,
    },
    status: 'failed',
    status_label: 'נכשל',
    done: true,
    turns_played: 1,
    turns_total: 1,
    engine: 'claude-opus-5-5',
    engine_is_stub: false,
    started_at: '2026-10-12T09:40:52.004118+00:00',
    finished_at: '2026-10-12T09:41:07.120394+00:00',
    took_ms: 14230,
    detail: '',
    headline: failure.explain,
    counts: { passed: 23, failed: 1, not_judged: 1 },
    conversation: [
      {
        turn: 1,
        customer: [{ kind: 'text', text: 'פתח תקווה' }],
        last_outbound: '',
        bot: 'בפתח תקווה יש לנו *קפוארה* בימי שני ב-17:00 (₪260)',
        reasoning: 'יש עיר, אז אפשר להציע חוגים',
        tools: [{ name: 'find_courses', input: { city: 'פתח תקווה' }, summary: 'חיפוש חוגים בעיר שנאמרה' }],
        request_human: false,
        request_human_reason: '',
        tags: [],
      },
    ],
    checks: [
      failure,
      { id: 'hebrew_only', turn: 1, kind: 'hard', title: 'התשובה בעברית בלבד', status: 'passed', status_label: 'עבר', explain: '' },
      { id: 'tone', turn: 1, kind: 'rubric', title: 'הטון חם וקצר', status: 'not_judged', status_label: 'לא נשפט', explain: 'השופט לא ענה' },
    ],
    failures: [{ ...failure, customer: [{ kind: 'text', text: 'פתח תקווה' }], bot: 'בפתח תקווה יש לנו *קפוארה* בימי שני ב-17:00 (₪260)' }],
    ...over,
  };
}
