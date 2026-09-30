/**
 * Who got a broadcast, who did not, and who may not have — in words the office
 * can act on, the moment the answers come in.
 *
 * The results screen used to list every row, sent and failed alike, in one
 * small scrolling box: in a broadcast to four hundred parents the four who
 * failed had to be hunted for, and their reason read like "איש הקשר:
 * Validation error". A message sent as free text was green, "נשלח", though
 * WhatsApp delivers free text only to someone who wrote to the business in the
 * last 24 hours.
 */
import type { BroadcastExtraPhone, BroadcastRow } from './whatsappApi';

export type Recipient = {
  key: string;
  childId: string;
  childName: string;
  parentName: string;
  phone: string;
  /** One of the family's other parents, not the row's own phone. */
  extra: boolean;
  status: BroadcastRow['status'];
  method: string | null;
  reason: string | null;
  error: string | null;
};

/** Every phone of the run, each row's own first and its extra phones after it. */
export function recipientsOf(rows: BroadcastRow[]): Recipient[] {
  return rows.flatMap((row) => [
    toRecipient(row, row, false),
    ...(row.extra_phones ?? []).map((extra) => toRecipient(row, extra, true)),
  ]);
}

function toRecipient(row: BroadcastRow, phone: BroadcastRow | BroadcastExtraPhone, extra: boolean): Recipient {
  return {
    key: `${row.child_id}:${phone.phone || (extra ? phone.parent_name : 'own')}`,
    childId: row.child_id,
    childName: row.child_name,
    parentName: phone.parent_name,
    phone: phone.phone,
    extra,
    status: phone.status,
    method: phone.method ?? null,
    reason: phone.reason ?? null,
    error: phone.error ?? null,
  };
}

/** Sent through ManyChat, but as free text — WhatsApp holds it back outside the 24-hour window. */
export function mayNotHaveArrived(r: Recipient): boolean {
  return r.status === 'sent' && r.method !== 'flow';
}

export type Outcome = {
  failed: Recipient[];
  freeText: Recipient[];
  delivered: Recipient[];
  skipped: Recipient[];
};

export function splitOutcome(rows: BroadcastRow[]): Outcome {
  const outcome: Outcome = { failed: [], freeText: [], delivered: [], skipped: [] };
  for (const r of recipientsOf(rows)) {
    if (r.status === 'failed') outcome.failed.push(r);
    else if (mayNotHaveArrived(r)) outcome.freeText.push(r);
    else if (r.status === 'sent') outcome.delivered.push(r);
    else if (r.status === 'skipped') outcome.skipped.push(r);
  }
  return outcome;
}

export type PlainReason = { why: string; action: string };

/**
 * A failed row's reason, plainly, and what to do about it. The server gives a
 * code for some failures (`reason`) and ManyChat's own text for the rest
 * (`error`, prefixed by the step that failed).
 */
export function plainReason(r: Pick<Recipient, 'reason' | 'error'>): PlainReason {
  const error = r.error || '';
  if (r.reason === 'contact_unfindable') {
    return {
      why: 'ManyChat לא מוצא את איש הקשר לפי המספר.',
      action: 'ללחוץ "קישור לאיש קשר" כאן, או לייבא את הקובץ מהגדרות › הודעות — ואז לשלוח שוב.',
    };
  }
  if (error.includes('אינו רשום ב-WhatsApp')) {
    return { why: 'המספר לא רשום בוואטסאפ.', action: 'לבדוק את מספר הטלפון בכרטיס הלקוח ולתקן.' };
  }
  if (error.startsWith('האוטומציה')) {
    return {
      why: 'ManyChat סירב להפעיל את האוטומציה.',
      action: 'לבדוק ב-ManyChat שהאוטומציה קיימת ופעילה, ולשלוח שוב.',
    };
  }
  if (error.startsWith('שליחת הטקסט')) {
    return { why: 'ManyChat סירב לשלוח את ההודעה.', action: 'לבדוק את איש הקשר ב-ManyChat, ולשלוח שוב.' };
  }
  if (error === 'link_host_not_configured') {
    return { why: 'בהודעה יש קישור שלא ייפתח ללקוח, ולכן היא לא נשלחה.', action: 'לדווח למפתח (CRM_FRONTEND_URL).' };
  }
  if (error === 'manychat_not_configured') {
    return { why: 'ManyChat לא מוגדר בשרת.', action: 'לדווח למפתח — שום הודעה לא יוצאת.' };
  }
  if (error === 'missing_flow_ns' || error === 'unknown_kind') {
    return { why: 'האוטומציה שנבחרה לא נמצאה ב-ManyChat.', action: 'לבחור אוטומציה אחרת, או לבדוק אותה ב-ManyChat.' };
  }
  if (error.startsWith('איש הקשר')) {
    return { why: 'לא הצלחנו למצוא או ליצור את איש הקשר ב-ManyChat.', action: 'לשלוח שוב בעוד כמה דקות.' };
  }
  return { why: 'ManyChat החזיר שגיאה.', action: 'לשלוח שוב. אם זה חוזר — לדווח למפתח.' };
}
