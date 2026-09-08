import api from './api';

export type WhatsAppContact = {
  id: string;
  source: 'family' | 'parent';
  name: string;
  phone: string;
  phone_e164: string;
  branch_name?: string | null;
  family_name?: string | null;
};

export type WhatsAppSubscriber = {
  id?: number;
  first_name?: string;
  last_name?: string;
  name?: string;
  phone?: string;
  status?: string;
  [key: string]: unknown;
};

export type LocalMessage = {
  id: string;
  text: string;
  direction: 'outbound';
  sent_at: string;
};

export async function fetchWhatsAppStatus() {
  const res = await api.get('/core/whatsapp/status/');
  return res.data as { configured: boolean; page_name?: string; error?: string };
}

export async function fetchWhatsAppContacts(filters?: {
  q?: string;
  branch_id?: string;
  course_type_id?: string;
  course_id?: string;
  instructor_id?: string;
}) {
  const params: Record<string, string> = {};
  if (filters?.q) params.q = filters.q;
  if (filters?.branch_id) params.branch_id = filters.branch_id;
  if (filters?.course_type_id) params.course_type_id = filters.course_type_id;
  if (filters?.course_id) params.course_id = filters.course_id;
  if (filters?.instructor_id) params.instructor_id = filters.instructor_id;
  const res = await api.get('/core/whatsapp/contacts/', {
    params: Object.keys(params).length ? params : undefined,
  });
  return (res.data?.contacts || []) as WhatsAppContact[];
}

export async function resolveWhatsAppSubscriber(phone: string, name: string) {
  const res = await api.post('/core/whatsapp/resolve/', { phone, name });
  return res.data as {
    subscriber_id: number;
    created: boolean;
    display_name: string;
    subscriber: WhatsAppSubscriber;
  };
}

export async function fetchWhatsAppSubscriber(subscriberId: number | string) {
  const res = await api.get(`/core/whatsapp/subscriber/?subscriber_id=${subscriberId}`);
  return res.data?.subscriber as WhatsAppSubscriber;
}

export async function sendWhatsAppMessage(payload: {
  subscriber_id?: number | string;
  phone?: string;
  name?: string;
  text: string;
}) {
  const res = await api.post('/core/whatsapp/send/', payload);
  return res.data;
}

export type BulkSendContact = { phone: string; name: string; branch_name?: string };

export type BulkSendResult = {
  dry_run: boolean;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  preview_count: number;
  message?: string | null;
  results: Array<{
    phone: string;
    name: string;
    status: string;
    error?: string;
    subscriber_id?: number;
  }>;
};

/** Preview (dry_run) or send to many contacts via ManyChat. */
export type WhatsAppAutomation = {
  automation_type: 'kind' | 'flow';
  automation_id: string;
  flow_ns: string;
  label: string;
  manychat_name?: string | null;
  kogo_label?: string;
  needs_enrollment_context?: boolean;
};

export async function fetchWhatsAppAutomations() {
  const res = await api.get('/core/whatsapp/automations/');
  return res.data as { configured: boolean; automations: WhatsAppAutomation[] };
}

export type BulkFlowResult = BulkSendResult & {
  automation_type?: string;
  automation_id?: string;
  automation_label?: string;
};

export async function bulkSendWhatsAppAutomation(payload: {
  automation_type: 'kind' | 'flow';
  automation_id: string;
  contacts: BulkSendContact[];
  dry_run?: boolean;
}) {
  const body: {
    automation_type: string;
    automation_id: string;
    contacts: BulkSendContact[];
    dry_run?: boolean;
  } = {
    automation_type: payload.automation_type,
    automation_id: payload.automation_id,
    contacts: payload.contacts,
  };
  if (payload.dry_run !== undefined) {
    body.dry_run = payload.dry_run;
  }
  const res = await api.post('/core/whatsapp/bulk-flow/', body);
  return res.data as BulkFlowResult;
}

export async function bulkSendWhatsAppMessage(payload: {
  text: string;
  contacts: BulkSendContact[];
  dry_run?: boolean;
}) {
  const body: { text: string; contacts: BulkSendContact[]; dry_run?: boolean } = {
    text: payload.text,
    contacts: payload.contacts,
  };
  if (payload.dry_run !== undefined) {
    body.dry_run = payload.dry_run;
  }
  const res = await api.post('/core/whatsapp/bulk-send/', body);
  return res.data as BulkSendResult;
}

export function whatsappContactKey(c: { source: string; id: string }) {
  return `${c.source}-${c.id}`;
}

const TALKED_STORAGE_KEY = 'kogo_whatsapp_talked_contacts';

export function loadTalkedContactKeys(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(TALKED_STORAGE_KEY);
    const arr = raw ? (JSON.parse(raw) as string[]) : [];
    return new Set(arr);
  } catch {
    return new Set();
  }
}

export function saveTalkedContactKey(key: string) {
  if (typeof window === 'undefined') return;
  const set = loadTalkedContactKeys();
  set.add(key);
  localStorage.setItem(TALKED_STORAGE_KEY, JSON.stringify([...set]));
}

// ---------------------------------------------------------------------------
// Broadcast from the customers page (children, not bare contacts)
// ---------------------------------------------------------------------------

/**
 * How many children go in one request. A personalised Kogo template (kind)
 * costs several ManyChat calls plus a settle sleep per parent, so the chunk
 * stays small enough to answer before the serverless timeout; a plain flow is
 * cheaper. Raising `maxDuration` in kogo-back/vercel.json allows larger chunks.
 */
export const BROADCAST_CHUNK_KIND = 4;
export const BROADCAST_CHUNK_FLOW = 8;

export type BroadcastRowStatus = 'sent' | 'failed' | 'preview' | 'skipped';

export type BroadcastRow = {
  child_id: string;
  child_name: string;
  parent_name: string;
  phone: string;
  status: BroadcastRowStatus;
  reason?: 'no_parent_phone' | 'duplicate_phone' | 'no_active_lesson' | null;
  method?: string | null;
  error?: string | null;
};

export type BroadcastResult = {
  dry_run: boolean;
  automation_type: 'kind' | 'flow';
  automation_id: string;
  automation_label?: string | null;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  preview_count: number;
  missing: number;
  /** E.164 phones this request used — pass back as skip_phones so siblings across chunks get one message. */
  phones: string[];
  results: BroadcastRow[];
};

export function broadcastChunkSize(automationType: 'kind' | 'flow') {
  return automationType === 'kind' ? BROADCAST_CHUNK_KIND : BROADCAST_CHUNK_FLOW;
}

export function chunkIds(ids: string[], size: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) out.push(ids.slice(i, i + size));
  return out;
}

/** One chunk. `dry_run` defaults to true on the server as well — a real send is always explicit. */
export async function broadcastToChildren(payload: {
  child_ids: string[];
  automation_type: 'kind' | 'flow';
  automation_id: string;
  dry_run: boolean;
  skip_phones?: string[];
  /** The lesson / weekday the audience was filtered by (see the server's hint handling). */
  lesson_id?: string;
  day_of_week?: number;
}) {
  const res = await api.post('/customers/children/broadcast/', payload, { timeout: 120_000 });
  return res.data as BroadcastResult;
}

export function automationOptionValue(a: Pick<WhatsAppAutomation, 'automation_type' | 'automation_id'>) {
  return `${a.automation_type}:${a.automation_id}`;
}

export function parseAutomationValue(value: string): Pick<WhatsAppAutomation, 'automation_type' | 'automation_id'> | null {
  const idx = value.indexOf(':');
  if (idx < 0) return null;
  const automation_type = value.slice(0, idx);
  const automation_id = value.slice(idx + 1);
  if ((automation_type !== 'kind' && automation_type !== 'flow') || !automation_id) return null;
  return { automation_type, automation_id };
}

export function automationDisplayLabel(a: WhatsAppAutomation) {
  return a.kogo_label && a.kogo_label !== a.label ? `${a.label} · ${a.kogo_label}` : a.label;
}
