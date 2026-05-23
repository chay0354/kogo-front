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

export async function fetchWhatsAppContacts(q?: string) {
  const res = await api.get('/core/whatsapp/contacts/', {
    params: q ? { q } : undefined,
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

export type BulkSendContact = { phone: string; name: string };

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
