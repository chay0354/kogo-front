/**
 * The "וואטסאפ ולידים" section (code name: wahub).
 *
 * These shapes follow docs/WAHUB-CONTRACT.md, version 1, field for field. The
 * server is built against the same document; a field that is not written there
 * does not belong here.
 */

export type WahubSource =
  | 'whatsapp'
  | 'ad'
  | 'broadcast_reply'
  | 'kogo_trial'
  | 'kogo_signup'
  | 'import'
  | 'manual';

export type WahubHandledBy = 'bot' | 'human';

export type WahubTopic = 'trial' | 'registration' | 'info' | 'other' | '';

export type WahubInterest = 'hot' | 'warm' | 'cold' | 'none' | '';

export type WahubFlag =
  | 'price'
  | 'class_full'
  | 'lives_far'
  | 'no_branch_nearby'
  | 'complaint'
  | 'says_registered'
  | 'child_too_young'
  | 'difficult';

export type WahubOutcome =
  | ''
  | 'not_found'
  | 'in_system'
  | 'pending'
  | 'signup_declined'
  | 'trial_upcoming'
  | 'trial_only'
  | 'registered_after'
  | 'customer_before';

/** The marks only a person sets. Empty means nobody marked this contact yet. */
export type WahubFollowupStatus =
  | ''
  | 'waiting_us'
  | 'no_answer'
  | 'answered'
  | 'later'
  | 'registered'
  | 'not_relevant';

export type WahubMessageDirection = 'in' | 'out';
export type WahubSender = 'customer' | 'bot' | 'office' | 'system';
export type WahubMessageType = 'text' | 'voice' | 'image' | 'template' | 'other';
export type WahubMessageStatus = 'received' | 'sent' | 'failed' | 'simulated';

export interface WahubLastMessage {
  text: string;
  direction: WahubMessageDirection;
  sender: WahubSender;
  sent_at: string;
}

export interface WahubChatState {
  unread_count: number;
  waiting_since: string | null;
  handled_by: WahubHandledBy;
  handled_by_label: string;
  needs_human: boolean;
  needs_human_reason: string;
  needs_human_at: string | null;
  can_free_text: boolean;
  window_closes_at: string | null;
}

/** What the system worked out by itself. Never written by a person. */
export interface WahubKnown {
  topic: WahubTopic;
  topic_label: string;
  course_type: string;
  city: string;
  branch_id: number | string | null;
  branch_name: string;
  child_age: string;
  interest: WahubInterest;
  interest_label: string;
  callback_on: string | null;
  flags: WahubFlag[];
  flag_labels: string[];
  summary: string;
  analyzed_at: string | null;
  analysis_source: 'ai' | 'rules' | '';
}

export interface WahubKogoChild {
  id: number | string;
  name: string;
  status: string;
  status_label: string;
}

/** The cross-check against the registrations in Kogo. */
export interface WahubKogo {
  outcome: WahubOutcome;
  outcome_label: string;
  family_id: number | string | null;
  child_ids: Array<number | string>;
  detail: string;
  checked_at: string | null;
  is_customer: boolean;
  hidden_by_default: boolean;
  /** Only on a single contact (GET contacts/{id}/). */
  children?: WahubKogoChild[];
}

export interface WahubFollowup {
  status: WahubFollowupStatus;
  status_label: string;
  due: string | null;
  note: string;
  by_name: string;
  at: string | null;
  is_due: boolean;
}

export interface WahubTag {
  id: number;
  name: string;
  color: string;
}

export interface WahubContact {
  id: number;
  phone: string;
  phone_display: string;
  name: string;
  source: WahubSource;
  source_label: string;
  first_inbound_at: string | null;
  last_inbound_at: string | null;
  last_message_at: string | null;
  last_message: WahubLastMessage | null;
  messages_count: number;
  chat: WahubChatState;
  known: WahubKnown;
  kogo: WahubKogo;
  followup: WahubFollowup;
  tags: WahubTag[];
}

export interface WahubMessage {
  id: number;
  direction: WahubMessageDirection;
  sender: WahubSender;
  sender_label: string;
  sender_name: string | null;
  text: string;
  message_type: WahubMessageType;
  media_url: string | null;
  status: WahubMessageStatus;
  error: string;
  sent_at: string;
  /**
   * Screen only, never from the server: a message the office just typed, shown
   * before the server has answered. Its id is negative until then.
   */
  local_state?: 'sending';
}

export type WahubEventKind =
  | 'created'
  | 'followup_changed'
  | 'tags_changed'
  | 'kogo_outcome_changed'
  | 'analyzed'
  | 'handled_by_changed'
  | 'needs_human_changed'
  | 'note';

export interface WahubEvent {
  id: number;
  kind: WahubEventKind;
  kind_label: string;
  text: string;
  actor_name: string;
  created_at: string;
}

/** GET contacts/{id}/ */
export interface WahubContactDetail extends WahubContact {
  messages: WahubMessage[];
  has_older: boolean;
  events: WahubEvent[];
}

export type WahubBox = 'all' | 'waiting' | 'needs_human' | 'unread' | 'human' | 'bot';

export type WahubQueue =
  | 'all'
  | 'due'
  | 'none'
  | 'no_answer'
  | 'answered'
  | 'later'
  | 'registered'
  | 'not_relevant';

export type WahubBoxCounts = Record<WahubBox, number>;
export type WahubQueueCounts = Record<WahubQueue | 'hidden', number>;

export interface WahubCounts {
  boxes: WahubBoxCounts;
  queues: WahubQueueCounts;
}

export interface WahubUpdates {
  cursor: string;
  contacts: WahubContact[];
  boxes: WahubBoxCounts;
}

export interface WahubDayStat {
  date: string;
  inbound: number;
  outbound: number;
  new_contacts: number;
}

export interface WahubSummary {
  waiting: number;
  needs_human: number;
  unread: number;
  due_followups: number;
  new_contacts_today: number;
  new_contacts_7d: number;
  inbound_today: number;
  outbound_today: number;
  oldest_waiting_since: string | null;
  by_day: WahubDayStat[];
}

export interface WahubStatus {
  inbound_configured: boolean;
  inbound_key_set_at: string | null;
  bot_replies_seen: boolean;
  ai_configured: boolean;
  send_configured: boolean;
  /** The owner's switch: until it is on, nothing is sent to a customer and the bot is not touched. */
  sending_enabled: boolean;
  simulate_send: boolean;
  last_inbound_at: string | null;
  contacts_total: number;
  messages_last_24h: number;
  inbound_url: string;
}

export interface WahubQuickReply {
  id: number;
  title: string;
  text: string;
}

export interface WahubPage<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface WahubMessagesPage {
  messages: WahubMessage[];
  has_older: boolean;
}

export interface WahubSendResult {
  message: WahubMessage;
  contact: WahubContact;
}

/** The filters both lists and the counts accept. */
export interface WahubSharedFilters {
  search?: string;
  tag?: string;
  branch?: string;
  outcome?: string;
  topic?: string;
  interest?: string;
  flag?: string;
}

export interface WahubContactsQuery extends WahubSharedFilters {
  view: 'chats' | 'leads';
  box?: WahubBox;
  queue?: WahubQueue;
  showHidden?: boolean;
  page?: number;
  pageSize?: number;
}

export interface WahubFollowupPatch {
  status?: WahubFollowupStatus;
  due?: string | null;
  note?: string;
}

export type WahubTab = 'chats' | 'today' | 'leads' | 'settings';
