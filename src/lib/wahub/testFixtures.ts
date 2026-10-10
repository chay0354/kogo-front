import type { WahubContact, WahubKnowledgeItem, WahubKnowledgeProposal, WahubMessage, WahubShadowReply } from '@/types/wahub';

/** Builders for the tests beside this file. Not used by any screen. */

type ContactOverrides = Partial<Omit<WahubContact, 'chat' | 'known' | 'kogo' | 'followup'>> & {
  chat?: Partial<WahubContact['chat']>;
  known?: Partial<WahubContact['known']>;
  kogo?: Partial<WahubContact['kogo']>;
  followup?: Partial<WahubContact['followup']>;
};

export function makeContact(id: number, overrides: ContactOverrides = {}): WahubContact {
  const { chat, known, kogo, followup, ...rest } = overrides;
  return {
    id,
    phone: `97250000${String(id).padStart(4, '0')}`,
    phone_display: `050-000${String(id).padStart(4, '0')}`,
    name: `איש קשר ${id}`,
    source: 'whatsapp',
    source_label: 'וואטסאפ',
    first_inbound_at: '2026-10-01T08:00:00+03:00',
    last_inbound_at: '2026-10-08T09:00:00+03:00',
    last_message_at: '2026-10-08T09:00:00+03:00',
    last_message: { text: 'שלום', direction: 'in', sender: 'customer', sent_at: '2026-10-08T09:00:00+03:00' },
    messages_count: 1,
    tags: [],
    ...rest,
    chat: {
      unread_count: 0,
      waiting_since: null,
      handled_by: 'bot',
      handled_by_label: 'הבוט עונה',
      needs_human: false,
      needs_human_reason: '',
      needs_human_at: null,
      can_free_text: true,
      window_closes_at: null,
      ...chat,
    },
    known: {
      topic: '',
      topic_label: '',
      course_type: '',
      city: '',
      branch_id: null,
      branch_name: '',
      child_age: '',
      interest: '',
      interest_label: '',
      callback_on: null,
      flags: [],
      flag_labels: [],
      summary: '',
      analyzed_at: null,
      analysis_source: '',
      ...known,
    },
    kogo: {
      outcome: '',
      outcome_label: '',
      family_id: null,
      child_ids: [],
      detail: '',
      checked_at: null,
      is_customer: false,
      hidden_by_default: false,
      ...kogo,
    },
    followup: {
      status: '',
      status_label: '',
      due: null,
      note: '',
      by_name: '',
      at: null,
      is_due: false,
      ...followup,
    },
  };
}

export function makeMessage(id: number, overrides: Partial<WahubMessage> = {}): WahubMessage {
  return {
    id,
    direction: 'in',
    sender: 'customer',
    sender_label: 'לקוח',
    sender_name: null,
    text: `הודעה ${id}`,
    message_type: 'text',
    media_url: null,
    status: 'received',
    error: '',
    sent_at: '2026-10-08T09:00:00+03:00',
    ...overrides,
  };
}

export function makeKnowledgeItem(id: number, overrides: Partial<WahubKnowledgeItem> = {}): WahubKnowledgeItem {
  return {
    id,
    kind: 'fact',
    kind_label: 'עובדה',
    title: `רשומה ${id}`,
    body: '',
    scope: { level: 'business', id: null, label: 'כל העסק' },
    valid_from: null,
    valid_until: null,
    is_active: true,
    when_to_say: 'if_asked',
    when_to_say_label: 'רק אם שואלים',
    example_good: '',
    example_bad: '',
    source_note: '',
    updated_at: '2026-10-10T10:00:00+03:00',
    updated_by_name: 'דור',
    version: 1,
    ...overrides,
  };
}

export function makeShadowReply(id: number, overrides: Partial<WahubShadowReply> = {}): WahubShadowReply {
  return {
    id,
    after_message_id: 1,
    text: `הצעה ${id}`,
    reasoning: '',
    tools_used: [],
    knowledge_used: [],
    created_at: `2026-10-10T10:${String(id).padStart(2, '0')}:00+03:00`,
    old_bot_reply: null,
    verdict: null,
    verdict_note: '',
    ...overrides,
  };
}

export function makeProposal(id: number, overrides: Partial<WahubKnowledgeProposal> = {}): WahubKnowledgeProposal {
  return {
    id,
    status: 'pending',
    status_label: 'ממתין לאישור',
    source: 'reviewer',
    source_label: 'סריקה יזומה',
    contact_id: null,
    message_id: null,
    shadow_id: null,
    title: `הצעה ${id}`,
    explanation: '',
    change: { action: 'create', item_id: null, kind: 'fact', before: null, after: { title: 'x' } },
    evidence: [],
    created_at: '2026-10-10T10:00:00+03:00',
    decided_at: null,
    decided_by_name: null,
    decision_note: '',
    ...overrides,
  };
}
