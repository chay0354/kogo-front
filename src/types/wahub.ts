/**
 * The "וואטסאפ ולידים" section (code name: wahub).
 *
 * These shapes follow docs/WAHUB-CONTRACT.md, version 1, field for field. The
 * server is built against the same document; a field that is not written there
 * does not belong here.
 */

import type {
  WahubCustomerRef,
  WahubFoundBy,
  WahubSearchContact,
  WahubSearchCustomer,
  WahubSearchExtras,
  WahubWaitingState,
  WahubWaitingSummary,
} from './wahubSearch';

export type WahubSource =
  | 'whatsapp'
  | 'ad'
  | 'broadcast_reply'
  | 'kogo_trial'
  | 'kogo_signup'
  | 'import'
  | 'manual'
  | 'demo';

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
  /**
   * "פתוחה": the conversation waits for a person now (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ג.1).
   * Absent on a server built before it — and with it absent, the screen offers none of what came
   * with it: no "פתוחות" box, no ✓, no clock, no note.
   */
  open?: boolean;
  /** Why it is open — the first that holds, in the contract's order. Empty when it is not. */
  open_reason?: WahubOpenReason | '';
  open_label?: string;
  /**
   * The one box that says where this conversation stands, and its words — "מבקש נציג", "בטיפול נציג", "הבוט
   * עונה"… (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ח.1.2). Sent always by a server that knows ח, and so its sign;
   * shown on a row while a search looks through every box.
   */
  box?: string;
  box_label?: string;
  /**
   * The conversation has waited for a person three hours of the office's own hours, or more
   * (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ט.2.3) — nights, the weekend and closed days are not counted. Sent
   * always by a server that knows ט, and so its sign: without it nothing is pinned and nothing pulses.
   */
  overdue?: boolean;
  /** How long it has waited, in minutes of the office's hours; null when it does not wait for a person. */
  waited_office_minutes?: number | null;
  /** Ready to show in place of "מחכה X": "מחכה 3:20 שע׳". Empty when the conversation does not wait for a person. */
  waiting_label?: string;
  /** The moment the wait is counted from; null when there is none. */
  waiting_from?: string | null;
}

/**
 * "ביקש הסר" (ט.1.3): the number is on the one list every broadcast of the system skips. Null — it is not;
 * absent on a server built before ט, and then no chip is drawn and no action offered.
 */
export interface WahubOptedOut {
  at: string | null;
  /** `message` — the customer wrote it; `office` — a person marked it. */
  source: 'message' | 'office' | '';
  source_label: string;
  /** Who marked it, when a person did. */
  by_name: string;
  /** The customer's message that did it, up to 160 characters; empty when a person marked it. */
  text: string;
  /** Always "ביקש הסר". */
  label: string;
}

/** One line of `overdue` in GET contacts/updates/ (ט.2.5): who is past the three hours right now. */
export interface WahubOverdueRow {
  id: number;
  waited_office_minutes: number | null;
  waiting_label: string;
  waiting_from: string | null;
}

/** Why a conversation is "open" (ג.1), in the order the server decides by. */
export type WahubOpenReason = 'needs_human' | 'future_due' | 'future_wrote' | 'human';

/** Where a future lead stands: waiting for its day, its day has come, or the customer wrote before it. */
export type WahubFutureState = 'parked' | 'due' | 'wrote';

/**
 * "ליד עתידי" (ג.1, ג.5): the office's own mark "בזמן אחר" with a day — whoever set it, on whichever
 * screen. Null when there is none; absent on a server built before it.
 */
export interface WahubFuture {
  /** YYYY-MM-DD. */
  due: string;
  /** What the person wrote; empty when nothing was written. */
  reason: string;
  /** Whose lead it is. */
  by_name: string;
  at: string | null;
  state: WahubFutureState;
  /** Always "ליד עתידי". */
  label: string;
  /** Days until the day; 0 and below once it has come. */
  days_left: number;
  /** The bot is silenced for this person now. False: it still answers them if they write. */
  muted: boolean;
}

export type WahubWaitingStatus = 'waiting' | 'freed';

/**
 * "רשימת המתנה" as a contact (and a lead) carries it (ג.1): the one active entry that matters most —
 * a freed place first, then the oldest — and how many more there are. Null when there is none.
 */
export interface WahubWaitingMark {
  status: WahubWaitingStatus;
  status_label: string;
  entry_id: number;
  lesson_id: string;
  /** The lesson, ready to show: "קפוארה גן חובה · יום שלישי · 17:00 · מינץ". */
  label: string;
  course: string;
  day: string;
  start: string;
  branch: string;
  /** What is known of the child, in a few words. */
  child: string;
  since: string | null;
  freed_at: string | null;
  /** Ready to show: "ברשימת המתנה: …", or "התפנה מקום ב…" once a place is free. */
  title: string;
  /** Further active entries of this person. */
  more: number;
  /**
   * Where the entry stands, of four (ח.3.1): waiting, a place was freed, the customer was told, the customer
   * answered — and whether that calls on the office. Absent on a server built before ח.
   */
  state?: WahubWaitingState | '';
  state_label?: string;
  needs_office?: boolean;
  /** The place in the lesson's line (1 = the oldest), and how many wait for it. On a lead only; null on a contact. */
  position?: number | null;
  queue?: number | null;
  /**
   * When the customer was last told of the freed place (ז.4) — null: not since it was freed. Absent on a server
   * that cannot tell a customer at all: "להודיע ללקוח" is then not offered.
   */
  notified_at?: string | null;
}

/** A note about the customer (ג.6): a line of the log — not a message, sent to nobody. */
export interface WahubNote {
  id: number;
  text: string;
  by_name: string;
  created_at: string;
  /**
   * When the note was last edited (ז.5) — null: never. Absent on a server that cannot edit or delete a note:
   * the note is then shown as it always was, with no menu.
   */
  edited_at?: string | null;
  edited_by_name?: string;
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
  /** Began before the switch from the old bot: its answers are not here, and where to read them. Absent on an older server. */
  history?: import('@/lib/wahub/history').WahubHistoryNote | null;
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
  /** Stage 2 (§ה): invented by the owner to watch the system; never receives a message. Absent on an older server. */
  is_demo?: boolean;
  /**
   * Live test (docs/WAHUB-CONTRACT-LIVE-TEST.md): the new bot answers this
   * person for real, through ManyChat, with the old bot silenced. Absent on a
   * server built before it — the switch is then not offered.
   */
  live_test?: boolean;
  /**
   * The lead's one state, with why and what to do (docs/WAHUB-CONTRACT-LEAD-STAGES.md).
   * Absent on a server built before it — the screens then show what they showed before.
   */
  lead?: WahubLead | null;
  /** A future lead, or null (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ג.1). Absent on a server built before it. */
  future?: WahubFuture | null;
  /** The waiting list, or null (ג.1, ד). Absent on a server built before it. */
  waiting_list?: WahubWaitingMark | null;
  /**
   * "לכרטיס הלקוח" (ח.2): null — Kogo does not know this person, and there is no button. Absent on a server
   * built before ח: the screen then reads `kogo.child_ids` as it did.
   */
  customer?: WahubCustomerRef | null;
  /** Why a search found this row (ח.1.1); null — by the name or the phone the row shows. Only while searching. */
  found_by?: WahubFoundBy | null;
  /** "ביקש הסר" (ט.1.3): null — not on the list. Absent on a server built before ט. */
  opted_out?: WahubOptedOut | null;
}

export interface WahubMessage {
  id: number;
  direction: WahubMessageDirection;
  sender: WahubSender;
  sender_label: string;
  sender_name: string | null;
  text: string;
  message_type: WahubMessageType;
  /**
   * For a recording or a picture kept by Kogo: the object's path in the private
   * bucket, not an address. The screen asks GET messages/{id}/media/ for a
   * short-lived one. A link ManyChat passed may also sit in `text`.
   */
  media_url: string | null;
  /** A file is kept for this message (docs/WAHUB-CONTRACT-REAL-DEMO.md, הבהרה 2). Absent on an older server. */
  has_media?: boolean;
  /** The recording's transcript, once made; '' when there is none. */
  transcript?: string;
  /** The new bot's own answer, written into the conversation (never the old bot's copy). */
  new_bot?: boolean;
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
  | 'note'
  | 'conversation_closed'
  | 'waiting_list'
  | 'opt_out';

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
  /** The notes about this person, newest first, up to 50 (ג.6). Absent on a server built before them. */
  notes?: WahubNote[];
  /**
   * The conversation from before the switch, copied from ManyChat (lib/wahub/history.ts), oldest first — read
   * through `readHistoryLines`. Empty until it was copied; absent on a server built before it.
   */
  history_lines?: unknown;
  /**
   * What they asked for, when they are on a waiting list (ח.3.2) — as the server sent it; read by
   * lib/wahub/waitingSummary.ts. Null: no active entry. Absent on a server built before ח.
   */
  waiting_summary?: unknown;
}

/** The boxes every server knows. */
export type WahubBaseBox = 'all' | 'waiting' | 'needs_human' | 'unread' | 'human' | 'bot';
/** "פתוחות" and "לידים עתידיים" (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ג.2): only a server that sends their counts has them. */
export type WahubFutureBox = 'open' | 'future';
export type WahubBox = WahubBaseBox | WahubFutureBox;

export type WahubQueue =
  | 'all'
  | 'due'
  | 'none'
  | 'no_answer'
  | 'answered'
  | 'later'
  | 'registered'
  | 'not_relevant';

/** `overdue` (ט.2.5): how many conversations have waited for a person past three office hours — a count, not a box of the screen. */
export type WahubBoxCounts = Record<WahubBaseBox, number> & Partial<Record<WahubFutureBox | 'overdue', number>>;
export type WahubQueueCounts = Record<WahubQueue | 'hidden', number>;

export interface WahubCounts {
  boxes: WahubBoxCounts;
  queues: WahubQueueCounts;
}

export interface WahubUpdates {
  cursor: string;
  contacts: WahubContact[];
  boxes: WahubBoxCounts;
  /**
   * Everybody who is past the three office hours right now, the longest wait first, up to 50 (ט.2.5) — in
   * every answer, because a conversation crosses the line by the clock, with nobody touching it. Absent on a
   * server built before ט.
   */
  overdue?: WahubOverdueRow[];
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
  /** Stage 3: who asked in the last 30 days and did not register. Absent on a server built before it. */
  unregistered_leads?: WahubUnregisteredCounts;
  /** Lead stages: who needs handling now, by state (only states with someone in them). Absent on an older server. */
  lead_act?: WahubLeadActSummary;
  /** "מחכים שיתפנה מקום" in numbers (ח.3.1): how many wait, and how many of them call on the office now. */
  waiting_list?: { label?: string; total: number; act: number };
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
  /** Stage 2: the shadow bot has its key. Absent on a server built before stage 2. */
  shadow_configured?: boolean;
  /** The model the shadow bot drafts with; "stub" without a key. */
  shadow_model?: string;
  /** Recordings: is there a key, and did the transcription take the last one (`ok` is null until one was tried). */
  transcribe?: { configured: boolean; ok: boolean | null; reason: string; at: string | null };
  last_inbound_at: string | null;
  contacts_total: number;
  messages_last_24h: number;
  inbound_url: string;
  /**
   * Live test: who the new bot answers for real — the contract names the field,
   * not its shape, so a count and a short list are both read. Absent on a
   * server built before it.
   */
  live_test_contacts?: number | WahubLiveTestContact[];
}

/** One line of `status.live_test_contacts`, when the server sends the people rather than a number. */
export interface WahubLiveTestContact {
  id: number;
  name: string;
  phone: string;
  phone_display?: string;
}

/** GET messages/{id}/media/ — a short-lived address of a message's recording or picture. */
export interface WahubMessageMedia {
  url: string;
  /** Seconds the address is good for; null for an address that is not ours to sign. */
  expires_in: number | null;
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
  /**
   * What a search brings beside its rows, on its first page (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ח.1.5):
   * families in Kogo with no WhatsApp conversation. Absent with no search, and on a server built before ח.
   */
  extras?: WahubSearchExtras;
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
  /** Only the people in a live test (`live_test=1`). A server that does not know the filter ignores it; the screen filters again. */
  liveTest?: boolean;
  /** One lead state (`lead_stage=<key>`), or a whole group of them (`lead_group=act|wait|closed`). */
  leadStage?: string;
  leadGroup?: WahubLeadGroup;
  page?: number;
  pageSize?: number;
}

export interface WahubFollowupPatch {
  status?: WahubFollowupStatus;
  due?: string | null;
  note?: string;
}

export type WahubTab = 'chats' | 'today' | 'leads' | 'bot' | 'settings';

/** The sub-tabs of "הבוט" (stage 2; "ללמד" and "בדיקות" since 12.10.2026). */
export type WahubBotSub = 'teach' | 'knowledge' | 'hours' | 'try' | 'evals' | 'shadow' | 'review' | 'demo';

// ---------------------------------------------------------------------------
// Stage 2 — the bot's knowledge, the shadow bot and the review
// (docs/WAHUB-CONTRACT-STAGE2.md). Field for field; what the contract leaves
// unnamed is marked "assumed" and listed in the hand-over report.
// ---------------------------------------------------------------------------

export type WahubKnowledgeKind =
  | 'profile'
  | 'style_rule'
  | 'behavior_rule'
  | 'phrasing'
  | 'topic'
  | 'fact'
  | 'contact'
  | 'link'
  | 'alias'
  | 'special_day'
  | 'office_hours';

export type WahubScopeLevel = 'business' | 'city' | 'branch' | 'course_type' | 'course';

export type WahubWhenToSay = 'proactive' | 'if_asked' | 'internal';

export type WahubSpecialDayState = 'closed' | 'open' | 'hours' | 'quiet';

export type WahubOfficeSendMode = 'on_agent_request' | 'always' | 'on_takeover';

export type WahubWeekday = 'sun' | 'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat';

export interface WahubKnowledgeScope {
  level: WahubScopeLevel;
  id: string | number | null;
  label: string;
}

/** One day of the office hours. Times are "HH:MM". */
export interface WahubOfficeDay {
  open: boolean;
  from: string;
  to: string;
  message: string;
}

export type WahubOfficeWeekly = Record<WahubWeekday, WahubOfficeDay>;

/** A step of a topic (script). The server's kinds: ask, say, handoff, tool, tag (knowledge.py STEP_KINDS). */
export type WahubTopicStepKind = 'ask' | 'say' | 'handoff' | 'tool' | 'tag';

export interface WahubTopicStep {
  kind: WahubTopicStepKind;
  text: string;
  condition?: string;
  next?: string;
}

export interface WahubKnowledgeItem {
  id: number;
  kind: WahubKnowledgeKind;
  kind_label: string;
  title: string;
  body: string;
  scope: WahubKnowledgeScope;
  valid_from: string | null;
  valid_until: string | null;
  is_active: boolean;
  when_to_say: WahubWhenToSay;
  when_to_say_label: string;
  example_good: string;
  example_bad: string;
  source_note: string;
  updated_at: string;
  updated_by_name: string | null;
  version: number;

  // --- by kind: the server's `data`, flattened (kogo-back apps/wahub/knowledge.py DATA_FIELDS) ---
  /** phrasing, link: how the code refers to it. The server returns it for every kind. */
  key?: string;
  /** profile */
  name?: string;
  age?: string | number | null;
  personality?: string;
  voice?: string;
  address_default?: string;
  forbidden_phrases?: string[] | string;
  /** style_rule */
  enforced_in_code?: boolean;
  /** behavior_rule */
  priority?: number | string | null;
  /** phrasing */
  variants?: string[];
  verbatim?: boolean;
  /** phrasing, link, contact: when it is said / sent / referred to */
  when?: string;
  /** topic */
  triggers?: string[] | string;
  steps?: WahubTopicStep[];
  handoff_reason?: string;
  tag?: string;
  /** fact */
  certainty?: string;
  question?: string;
  /** contact (name, role, phone, when, how) */
  role?: string;
  phone?: string;
  how?: string;
  /** link */
  url?: string;
  /** alias */
  what_customer_writes?: string;
  means?: string;
  means_kind?: string;
  /** special_day */
  date_from?: string | null;
  date_to?: string | null;
  state?: WahubSpecialDayState;
  state_label?: string;
  hours_from?: string | null;
  hours_to?: string | null;
  message?: string;
  /** office_hours (one item) */
  weekly?: WahubOfficeWeekly;
  default_closed_message?: string;
  send_mode?: WahubOfficeSendMode;
  send_mode_label?: string;
}

/** What POST/PATCH knowledge/ take: the columns flat (`scope_level`, `scope_id`) and the kind's own fields beside them. */
export type WahubKnowledgeWrite = Partial<
  Omit<
    WahubKnowledgeItem,
    'id' | 'kind_label' | 'when_to_say_label' | 'state_label' | 'send_mode_label' | 'updated_at' | 'updated_by_name' | 'version' | 'scope'
  >
> & {
  scope_level?: WahubScopeLevel;
  scope_id?: string | null;
  scope_label?: string;
  /** Written into the history line. */
  note?: string;
};

export interface WahubKnowledgeHistoryEntry {
  version: number;
  changed_at: string;
  changed_by_name: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  note: string;
}

export interface WahubFromKogoBranch {
  id: string;
  name: string;
  city: string;
  is_external: boolean;
  external_link?: string;
  address: string;
  phone: string;
  manager_name?: string;
  directions: string;
  /** The fields the owner still has to fill in on the branch's card (address, phone, directions, external_link). */
  missing: string[];
  edit_path?: string;
}

export interface WahubFromKogoCourseType {
  id: string;
  name: string;
  description: string;
  trial_bring_note: string;
  missing?: string[];
  edit_path?: string;
}

export interface WahubFromKogoCourse {
  id: string;
  name: string;
  display_id?: number;
  branch: string;
  branch_id?: string;
  course_type: string;
  price: string | null;
  trial_is_paid: boolean;
  trial_price: string | null;
  registration_fee_override?: string | null;
  min_age?: number | null;
  max_age?: number | null;
  show_in_widget?: boolean;
  external_link?: string;
  missing: string[];
  edit_path?: string;
}

export interface WahubFromKogoDiscount {
  id: string;
  name: string;
  type: string;
  type_label: string;
  value: string;
  start_date: string | null;
  end_date: string | null;
  is_built_in: boolean;
  is_active: boolean;
  /** A built-in discount at 0 is one nobody has configured. */
  configured: boolean;
  edit_path?: string;
}

export interface WahubFromKogoBlockedDate {
  date: string;
  reason: string;
  is_past: boolean;
}

/** GET knowledge/from-kogo/ — what the bot reads from Kogo, read only (kogo-back knowledge.from_kogo). */
export interface WahubFromKogo {
  branches: WahubFromKogoBranch[];
  course_types: WahubFromKogoCourseType[];
  pricing_summary: {
    courses: WahubFromKogoCourse[];
    courses_total: number;
    courses_without_price: number;
    paid_trials: number;
  };
  registration_fee: number | string | null;
  discounts: WahubFromKogoDiscount[];
  blocked_dates: WahubFromKogoBlockedDate[];
  note?: string;
}

/** GET knowledge/office-hours/now/ (kogo-back knowledge.office_hours_now). */
export interface WahubOfficeHoursNow {
  now?: string;
  open: boolean;
  today: Partial<WahubOfficeDay> & { day?: WahubWeekday; day_label?: string };
  special: WahubKnowledgeItem | null;
  message_if_closed: string | null;
  send_mode?: WahubOfficeSendMode;
  send_mode_label?: string;
  /** False until the office hours were saved once. */
  configured?: boolean;
}

// ---------- shadow ----------

export type WahubShadowVerdict = null | 'good' | 'bad';

export interface WahubShadowKnowledgeRef {
  id: number;
  kind_label: string;
  title: string;
}

/** `tools_used`: the server writes `{name, input, summary}`; a bare name is read too. */
export interface WahubShadowTool {
  name: string;
  input?: Record<string, unknown>;
  summary?: string;
}

export interface WahubShadowReply {
  id: number;
  after_message_id: number | null;
  text: string;
  reasoning: string;
  tools_used: Array<string | WahubShadowTool>;
  knowledge_used: WahubShadowKnowledgeRef[];
  created_at: string;
  /** The old bot's answer to the same message, when there was one. */
  old_bot_reply: { text: string; sent_at: string | null } | null;
  verdict: WahubShadowVerdict;
  verdict_note: string;
  verdict_by_name?: string | null;
  verdict_at?: string | null;
  /** "stub" when there is no key. */
  model?: string;
  took_ms?: number;
  /** Several customer messages within twenty seconds got this one reply. */
  covers_message_ids?: number[];
  /** The draft asked for a person instead of answering (never sent; only noted). */
  request_human?: boolean;
  request_human_reason?: string;
  /** On the lists across conversations (shadow/recent/, shadow/bad/). */
  contact_id?: number;
  contact_name?: string;
  /** The customer's message the reply answers — on the lists across conversations. */
  customer_text?: string;
  /** On the answer to POST shadow/{id}/verdict/: the proposal a 👎 with a note made. */
  proposal_id?: number | null;
}

/** POST shadow/try/ — the draft, plus the question as the server read it. */
export interface WahubShadowTry {
  text: string;
  reasoning: string;
  tools_used: Array<string | WahubShadowTool>;
  knowledge_used: WahubShadowKnowledgeRef[];
  model?: string;
  took_ms?: number;
  request_human?: boolean;
  request_human_reason?: string;
  question?: string;
  pretend_now?: string | null;
  /** Set when `save: true` kept the question as a test. */
  trial_question_id?: number | null;
}

export interface WahubShadowSummary {
  proposed_7d: number;
  judged_good: number;
  judged_bad: number;
  awaiting_verdict: number;
  avg_ms: number | null;
  /** Stand-in answers (no key) in the last week. */
  stub_7d?: number;
  shadow_configured?: boolean;
  model?: string;
  /** Conversations waiting for a shadow reply right now. */
  pending?: number;
}

// ---------- review ----------

/** `undone`: an applied change that was taken back with "בטל" (docs/WAHUB-CONTRACT-REFINE.md). */
export type WahubProposalStatus = 'pending' | 'approved' | 'rejected' | 'applied' | 'undone';

export type WahubProposalSource = 'human_override' | 'bad_verdict' | 'service_note' | 'reviewer' | 'refine';

export interface WahubProposalChange {
  action: 'create' | 'update' | 'deactivate';
  item_id: number | null;
  kind: WahubKnowledgeKind;
  before: Record<string, unknown> | null;
  after: Record<string, unknown>;
}

export interface WahubProposalEvidence {
  message_id: number | null;
  who: 'customer' | 'bot' | 'office' | 'shadow' | 'system';
  text: string;
  sent_at?: string | null;
}

/**
 * A proposal in words a person reads (docs/WAHUB-CONTRACT-REFINE.md, ג): one
 * sentence that says what the bot will do from now on, the rule itself, why,
 * the examples, and the kind and "when to say" in Hebrew. Absent on a server
 * built before it — the screen then words the card from the change itself.
 */
export interface WahubProposalPlain {
  headline: string;
  rule: string;
  why: string;
  example_bad: string;
  example_good: string;
  kind_label: string;
  when_label: string;
  /** A new item: there is no "before". */
  is_new: boolean;
}

export interface WahubKnowledgeProposal {
  id: number;
  status: WahubProposalStatus;
  status_label: string;
  source: WahubProposalSource;
  source_label: string;
  /** For the reviewer's own scan: which pattern fired. */
  pattern?: string;
  pattern_label?: string;
  contact_id: number | null;
  contact_name?: string;
  message_id: number | null;
  shadow_id: number | null;
  title: string;
  explanation: string;
  change: WahubProposalChange;
  change_kind_label?: string;
  evidence: WahubProposalEvidence[];
  created_at: string;
  decided_at: string | null;
  decided_by_name: string | null;
  decision_note: string;
  /** The knowledge item an approval made or changed. */
  applied_item_id?: number | null;
  /** Applied by the system itself, without a press (auto-apply). Read when the server says it; see `isAutoApplied`. */
  auto_applied?: boolean;
  /** False when the change is in the knowledge but cannot be taken back from here; absent on an older server. */
  can_undo?: boolean;
  plain?: Partial<WahubProposalPlain> | null;
}

export interface WahubReviewSummary {
  pending: number;
  applied_7d: number;
  rejected_7d: number;
  /** The server's older word for the same switch; `auto_apply` is the one the screens read. */
  auto_mode: boolean;
  notes_7d?: number;
  /** Changes the system applied by itself in the last week. Absent on a server built before auto-apply. */
  auto_applied_7d?: number;
  /** "אישור אוטומטי של תיקונים" as it stands. Absent on a server built before it. */
  auto_apply?: boolean;
  /**
   * "מה הבוט לא ידע השבוע" in two numbers (ט.3.3): the open topics of this week, and the questions in them.
   * Absent on a server built before ט — the screen then shows nothing of it.
   */
  unknowns?: { topics: number; questions: number };
}

export interface WahubReviewNoteResult {
  note_id: number;
  proposal_id: number | null;
  /** When no proposal could be made of the note: "לא הבנתי, פרט…". */
  detail?: string;
}

/** POST review/proposals/{id}/approve/ — the decided proposal and the knowledge item it made or changed. */
export interface WahubApproveResult {
  proposal: WahubKnowledgeProposal;
  item: WahubKnowledgeItem;
}

// ---------- demo (§ה) ----------

/** GET demo/scenarios/ — a ready-made conversation the owner can create to watch the system. */
export interface WahubDemoScenario {
  key: string;
  title: string;
  description: string;
}

// ---------------------------------------------------------------------------
// Stage 3, part א (docs/WAHUB-CONTRACT-STAGE3.md): who asked and did not
// register, and the WhatsApp block on a customer's card. Field for field.
// ---------------------------------------------------------------------------

/** `counts` of GET leads/unregistered/, and `unregistered_leads` on GET summary/ (30 days). */
export interface WahubUnregisteredCounts {
  total: number;
  hot: number;
  /** Days since the oldest lead on the list last wrote; null when the list is empty. */
  oldest_days: number | null;
}

/** One row of GET leads/unregistered/ — a flat line, not a full contact. */
export interface WahubUnregisteredLead {
  id: number;
  name: string;
  phone: string;
  /** 050-000-0000. Not in the contract's row; the server sends it, and a row without it shows `phone`. */
  phone_display?: string;
  is_demo: boolean;
  first_inbound_at: string | null;
  last_inbound_at: string | null;
  days_since_first: number | null;
  days_since_last: number | null;
  /** The summary when there is one, otherwise the last inbound message, up to 160 characters. */
  asked: string;
  known_interest: WahubInterest;
  known_interest_label: string;
  known_city: string;
  known_branch_name: string;
  known_course_type: string;
  kogo_outcome: WahubOutcome;
  kogo_outcome_label: string;
  kogo_detail: string;
  followup_status: WahubFollowupStatus;
  followup_status_label: string;
  followup_due: string | null;
  /** Interested in a trial or in registering, or tried and the charge failed, or a trial ahead / done. */
  hot: boolean;
  handled_by: WahubHandledBy;
  needs_human: boolean;
}

/** GET leads/unregistered/?days=30&hot=0|1 — hot first, then whoever has waited longest. */
export interface WahubUnregisteredLeads {
  days: number;
  counts: WahubUnregisteredCounts;
  leads: WahubUnregisteredLead[];
}

/** One WhatsApp contact of a family, as GET for-customer/ lists it. */
export interface WahubForCustomerContact {
  id: number;
  name: string;
  phone: string;
  /** As above: sent by the server, optional here. */
  phone_display?: string;
  is_demo: boolean;
  last_message_at: string | null;
  last_message_text: string;
  last_message_direction: WahubMessageDirection | '';
  last_message_sender: WahubSender | '';
  handled_by: WahubHandledBy;
  needs_human: boolean;
  known_summary: string;
  known_interest_label: string;
  followup_status: WahubFollowupStatus;
  followup_status_label: string;
  followup_due: string | null;
  kogo_outcome: WahubOutcome;
  kogo_outcome_label: string;
  /** The cross-check tied this contact to this very family. */
  linked: boolean;
  /** /wahub?tab=chats&contact=<id> */
  link: string;
}

/** GET for-customer/?family=<uuid> and POST for-customer/recheck/. */
export interface WahubForCustomer {
  family: string;
  /** Every phone of the family the contacts were looked up by. */
  phones: string[];
  contacts: WahubForCustomerContact[];
  checked_at: string | null;
}

// ---------------------------------------------------------------------------
// The lead's state (docs/WAHUB-CONTRACT-LEAD-STAGES.md). The server decides the
// state from facts, by rules; the screen only shows it. Field for field.
// ---------------------------------------------------------------------------

/** The three groups of the board, in the order they are shown. */
export type WahubLeadGroup = 'act' | 'wait' | 'closed';

/** The states the contract names. A key the screen does not know is still shown, by the label the server sent. */
export type WahubLeadStage =
  | 'needs_reply'
  | 'signup_failed'
  | 'signup_started'
  | 'trial_no_show'
  | 'trial_done'
  | 'callback_due'
  | 'answered_silent'
  | 'trial_booked'
  | 'waiting_date'
  | 'waiting_list'
  | 'in_conversation'
  | 'registered'
  | 'customer'
  | 'not_relevant'
  | 'cold';

export type WahubLeadTemperature = 'hot' | 'warm' | 'cold' | '';

/** `lead` on a contact: one state, one sentence why, one sentence what to do. */
export interface WahubLead {
  stage: WahubLeadStage | string;
  stage_label: string;
  group: WahubLeadGroup;
  /** Since when the contact is in this state. */
  since: string | null;
  /** Whole days in this state. */
  days: number | null;
  /** "למה" — a sentence built from facts. */
  reason: string;
  /** "מה עושים". Empty where there is nothing to do now. */
  next_step: string;
  /** A person from the office wrote to them at some point. */
  human_touched: boolean;
  temperature: WahubLeadTemperature;
}

/** One state on the board: how many are in it, and how long the oldest has been there. */
export interface WahubLeadBoardStage {
  key: WahubLeadStage | string;
  label: string;
  hint: string;
  next_step: string;
  count: number;
  oldest_days: number | null;
}

export interface WahubLeadBoardGroup {
  key: WahubLeadGroup;
  label: string;
  total: number;
  stages: WahubLeadBoardStage[];
}

/** GET leads/board/ — the three groups in the order act / wait / closed; a state with nobody in it stays on the list. */
export interface WahubLeadBoard {
  groups: WahubLeadBoardGroup[];
  checked_at: string | null;
  /** Contacts the scan has not reached yet. */
  pending_scan: number;
}

/** `lead_act` on GET summary/. */
export interface WahubLeadActSummary {
  total: number;
  stages: Array<{ key: WahubLeadStage | string; label: string; count: number }>;
}

// ---------------------------------------------------------------------------
// Leads, version 2 (docs/WAHUB-CONTRACT-LEADS-V2.md, ד). The bot reads each
// lead by itself — branch, class, child, what stops them, when to come back —
// and every lead has someone who makes the next move: the bot or the office.
// Field for field; what the contract names without spelling out its shape
// (`followups`, `timeline`, `in_system`) is read tolerantly in lib/wahub/leadsV2.ts.
// ---------------------------------------------------------------------------

/** Who makes the next move on a lead. Empty: nobody (no step now, or the lead is closed). */
export type WahubLeadOwner = 'office' | 'bot' | '';

/** The three lists of GET leads/ (`owner=`): waiting for the office, handled by the bot, closed. */
export type WahubLeadsView = 'office' | 'bot' | 'closed';

export type WahubLeadNextWho = 'bot' | 'office' | 'none';

/** `due`: the bot would have sent it now — sending is off, or there is no approved template. */
export type WahubLeadNextState = 'planned' | 'due' | 'none';

/** "הצעד הבא": who, what, and when. */
export interface WahubLeadNext {
  who: WahubLeadNextWho;
  what: string;
  /** A moment, or a plain YYYY-MM-DD; null when there is no time to it. */
  when: string | null;
  state: WahubLeadNextState;
  /**
   * Why the bot's step will not leave when its time comes — or did not leave now: the server's own words
   * ("החזרות האוטומטיות כבויות", "השליחה כבויה", "חסרה תבנית"). Empty when it will leave. Absent from an
   * older server.
   */
  hold?: string;
}

/** What the bot understood, as short words for a row. Each may be empty. */
export interface WahubLeadChips {
  branch: string;
  course_type: string;
  child: string;
  /**
   * An existing customer who wants to add a class, a sibling or another group
   * (ח.1, ח.12): `chips.existing: true`, or `intent: "add_class"` on the row —
   * either is read. A lead like any other; the row only says so, quietly.
   */
  existing?: boolean;
}

/** One row of GET leads/. */
export interface WahubLeadRow {
  contact_id: number;
  name: string;
  phone: string;
  is_demo: boolean;
  stage: string;
  stage_label: string;
  owner: WahubLeadOwner;
  /** One sentence: why this person is a lead. */
  summary: string;
  chips: WahubLeadChips;
  /** Since when the lead is in this state. */
  since: string | null;
  next: WahubLeadNext;
  last_message_at: string | null;
  /** The waiting list (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ד.3) — null when there is none, absent on an older server. */
  waiting_list?: WahubWaitingMark | null;
  /** A future lead (ג.5) — the same object a contact carries. */
  future?: WahubFuture | null;
  /**
   * Which of the four lists the lead stands in, and its name — "מחכים לך", "הבוט מטפל", "מחכים שיתפנה מקום",
   * "נסגרו" (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ח.3.1). Shown on a row while a search looks through all of them.
   */
  list?: string;
  list_label?: string;
  /** "לכרטיס הלקוח" (ח.2); null — nobody Kogo knows. Absent on a server built before ח. */
  customer?: WahubCustomerRef | null;
  /** Why a search found this row (ח.1.1). Only while searching. */
  found_by?: WahubFoundBy | null;
  /** "ביקש הסר" (ט.1.6): the bot does not come back to them. Null — not on the list; absent on a server built before ט. */
  opted_out?: WahubOptedOut | null;
  /** The same four a conversation carries in `chat` (ט.2.3), on the row itself. Absent on a server built before ט. */
  overdue?: boolean;
  waited_office_minutes?: number | null;
  waiting_label?: string;
  waiting_from?: string | null;
}

export type WahubLeadCounts = Record<WahubLeadsView, number> & {
  /** "מחכים שיתפנה מקום" (ח.3.1): how many, and how many of them call on the office now. A server that knows ח sends both. */
  waiting?: number;
  waiting_act?: number;
};

/** A state of the list asked for, with how many are in it — for the one filter above the list. */
export interface WahubLeadStageCount {
  key: string;
  label: string;
  /** Null when the number is not known (worked out from a list that is only partly read). */
  count: number | null;
}

/** GET leads/?owner=&stage=&branch=&q=&cursor= */
export interface WahubLeadsPage {
  counts: WahubLeadCounts;
  results: WahubLeadRow[];
  next_cursor: string | null;
  /**
   * Not in the contract: the states of the list asked for, with a number each.
   * Read when the server sends it; without it the filter is built from the rows read so far.
   */
  stages?: WahubLeadStageCount[];
  /**
   * What a search brings beside its rows (ח.1.3), on the first page: people it found among the conversations who
   * are not leads, and families in Kogo with no conversation at all.
   */
  contacts?: WahubSearchContact[];
  customers?: WahubSearchCustomer[];
  customers_more?: boolean;
}

export interface WahubLeadsQuery {
  /** One of the three lists — or, for a search that looks through every one of them, "all" (ח.1.3). */
  owner: WahubLeadsView | 'all';
  stage?: string | null;
  q?: string;
  cursor?: string | null;
}

/** What was said about the child. Any part may be missing. */
export interface WahubLeadChild {
  name: string;
  age_years: number | null;
  age_months: number | null;
  grade: string;
  birth_date: string | null;
}

export interface WahubLeadTrial {
  course: string;
  branch: string;
  date: string | null;
  instructor: string;
  /** Null: not known yet (the lesson is still ahead, or nobody marked it). */
  attended: boolean | null;
  /**
   * Not a trial at all: the child came to a lesson without being registered, and the instructor added them on the
   * attendance screen with the parent's phone (a walk-in). `date` is the last time they came. Absent from an older server.
   */
  walk_in?: boolean;
  /** How many times the walk-in came, when the server counts them. */
  visits?: number | null;
}

export type WahubLeadFollowUpStatus = 'planned' | 'due' | 'sent' | 'skipped' | 'failed';

/** One time the bot comes back to the lead (`LeadFollowUp`, ג): when, the wording, and what became of it. */
export interface WahubLeadFollowUp {
  id: number | null;
  kind: string;
  kind_label: string;
  /** 1–3. */
  step: number | null;
  due_at: string | null;
  status: WahubLeadFollowUpStatus | string;
  status_label: string;
  text: string;
  why: string;
  acted_at: string | null;
  outcome_note: string;
}

/** One line of the short timeline, in plain words. */
export interface WahubLeadTimelineEvent {
  at: string | null;
  text: string;
}

/** `details` of GET leads/{contact_id}/. */
export interface WahubLeadDetails {
  /** Why they are a lead — with the customer's own words when it was closed as "לא מעוניין". */
  reason: string;
  /** What stops them from registering, in a sentence. */
  blocker_text: string;
  child: WahubLeadChild | null;
  come_back_on: string | null;
  come_back_why: string;
  trial: WahubLeadTrial | null;
  followups: WahubLeadFollowUp[];
  /** Up to ten. */
  timeline: WahubLeadTimelineEvent[];
  /** The customer's card in Kogo, as a path inside the CRM; null when there is none. */
  in_system: string | null;
  /** The notes the office wrote about this person, newest first, up to ten (docs/WAHUB-CONTRACT-FUTURE-LEADS.md, ג.6). */
  notes?: WahubNote[];
  /** Every waiting-list entry of this person, newest first, up to twenty (ד.3). */
  waiting_list_entries?: WahubWaitingEntry[];
  /** What they asked for, when they are on a waiting list (ח.3.2); null — no active entry. */
  waiting_summary?: WahubWaitingSummary | null;
}

/** GET leads/{contact_id}/ — the row, and everything a press opens. */
export interface WahubLeadDetail extends WahubLeadRow {
  details: WahubLeadDetails;
}

export type WahubLeadCloseReason = 'deleted' | 'not_interested';

// ---------------------------------------------------------------------------
// "הכול אוטומטי" — the bot comes back to the leads by itself
// (docs/WAHUB-CONTRACT-LEADS-V2.md, י): how the automation stands, what it
// plans to send, and the WhatsApp templates that let a send go out after 24
// hours. Read tolerantly in lib/wahub/leadsAutomation.ts.
// ---------------------------------------------------------------------------

/** One of the four things that have to stand for a message to go out by itself. */
export interface WahubAutomationLine {
  /** `classify` / `schedule` / `sending` / `templates` — or one the server adds later. */
  key: string;
  ok: boolean;
  title: string;
  /** One sentence, ready to show. */
  detail: string;
  /** How it is put right — only on a line that is not ok. May name a setting in Latin letters. */
  how: string;
}

/**
 * The comings back in numbers: `planned` and `due` are everything open now;
 * `sent`, `skipped` and `failed` are what was closed today.
 */
export interface WahubAutomationToday {
  planned: number;
  due: number;
  sent: number;
  skipped: number;
  /** Not in the contract's first shape: 0 on a server that does not send it. */
  failed: number;
}

/** One coming back the bot has planned. */
export interface WahubAutomationUpcoming {
  contact_id: number | null;
  name: string;
  kind_label: string;
  /** The wording that would be sent. */
  text: string;
  when: string | null;
  /** `due`: its time has come and it did not go out. */
  state: 'planned' | 'due';
  /** It goes out after the 24 hours, so only as an approved template. */
  needs_template: boolean;
  template_mapped: boolean;
  /** An invented customer: listed, marked, and never sent to anyone. */
  is_demo: boolean;
  /** What stops this very one from going out, in words ("השליחה כבויה", "חסרה תבנית"); empty when nothing does. */
  note: string;
}

/** The strip at the head of "הבוט מטפל", as the server words it. */
export interface WahubAutomationBanner {
  count: number;
  text: string;
}

/** GET leads/automation/ */
export interface WahubLeadsAutomation {
  /** Every line is ok: the bot comes back by itself. */
  ready: boolean;
  lines: WahubAutomationLine[];
  today: WahubAutomationToday;
  /** Up to 15, the soonest first. */
  upcoming: WahubAutomationUpcoming[];
  /**
   * The strip, ready to show; null when there is nothing to show. Absent on a
   * server that leaves the wording to the screen (it is then worked out from
   * `today.due` and the lines).
   */
  banner?: WahubAutomationBanner | null;
}

/** One wording the bot comes back with, and the WhatsApp template connected to it (GET leads/templates/). */
export interface WahubLeadTemplate {
  template_key: string;
  kind_label: string;
  /** When it is sent, in words. */
  when_label: string;
  text: string;
  /** 1: the five to start with. 2: the ones that follow. */
  stage: 1 | 2;
  /** Which of a round's approaches this wording is (1–3), when the server says; null when it does not. */
  step: number | null;
  mapped: boolean;
  /** What is connected — the template's identifier in ManyChat; null when nothing is. */
  target: string | null;
  /** Its name, when the server sends one beside the identifier. */
  target_name: string;
  /** False: this wording is switched off, and is not sent whatever is connected. */
  active: boolean;
  /** False: it goes out without a template (inside the 24 hours), or is switched off — it is not counted as missing. */
  required: boolean;
  /** The name the owner's document proposes for this template in ManyChat; empty when there is none. */
  suggested_name: string;
  /** Who connected it, and when — as the server recorded it. */
  connected_by: string;
  connected_at: string | null;
}

/** A template that exists in the ManyChat account and can be chosen. */
export interface WahubLeadTemplateOption {
  id: string;
  name: string;
}

/** GET leads/templates/options/ */
export interface WahubLeadTemplateOptions {
  /** Null: the account cannot be listed right now — the screen takes a name that is typed in. */
  options: WahubLeadTemplateOption[] | null;
  /** Why it cannot be listed, in Hebrew, when the server says. */
  reason: string;
}

// ---------------------------------------------------------------------------
// Future leads, the clock and the note; the waiting list
// (docs/WAHUB-CONTRACT-FUTURE-LEADS.md). Field for field; what a server built
// before it leaves out is optional above, and read tolerantly in
// lib/wahub/futureLeads.ts.
// ---------------------------------------------------------------------------

/** What the bot understood when the conversation was handed to it (ג.4). */
export interface WahubUnderstood {
  /** The bot has a dated step: it was applied. False: nothing changed, and `text` says why. */
  ok: boolean;
  /** The one sentence to show. */
  text: string;
  why: string;
  stage: string;
  stage_label: string;
  come_back_on: string | null;
  /** When the bot comes back, or null when there is no step (and always when `ok` is false). */
  next_when: string | null;
  source: 'ai' | 'rules' | '';
  /** False: the comeback waits until sending to customers is turned on. Null: the server did not say. */
  sending_enabled: boolean | null;
}

/** POST contacts/{id}/hand-to-bot/ */
export interface WahubHandToBotResult {
  contact: WahubContact | null;
  understood: WahubUnderstood;
}

/** POST contacts/{id}/future/ — saved either way; `muted` false means the bot still answers this person. */
export interface WahubFutureResult {
  contact: WahubContact | null;
  mute: { muted: boolean; detail: string };
}

/** POST contacts/{id}/notes/ */
export interface WahubNoteResult {
  note: WahubNote;
  contact: WahubContact | null;
}

export type WahubWaitingEntryStatus = WahubWaitingStatus | 'handled' | 'removed';

/** One entry of the waiting list (ד.4): a person, one lesson, and where the entry stands. */
export interface WahubWaitingEntry {
  id: number;
  status: WahubWaitingEntryStatus | string;
  status_label: string;
  /** The lesson as it was when the entry was made — it shows itself even after the lesson is gone. */
  lesson_label: string;
  child: string;
  added_by: 'bot' | 'person' | '';
  added_by_name: string;
  created_at: string | null;
  freed_at: string | null;
  closed_at: string | null;
  closed_by_name: string;
  closed_reason: string;
  /** The place in the line for that lesson among the active entries (1 = the oldest); null once closed. */
  position: number | null;
  title: string;
  // --- whose entry it is, and for which lesson: sent with every entry of the full list (ד.4) ---
  contact_id?: number;
  name?: string;
  phone_display?: string;
  is_demo?: boolean;
  lesson_id?: string;
  // --- telling the customer of the freed place (ז.1, ז.4): absent on a server that cannot ---
  /** When the customer was last told; null: not told. Absent: the server has no "להודיע ללקוח". */
  notified_at?: string | null;
  notified_by_name?: string;
  notified_how?: WahubNotifyHow;
  notified_how_label?: string;
  /** The customer's last message, only when it was written after they were told. */
  customer_replied_at?: string | null;
  /** "לכרטיס הלקוח" (ח.2): the child the entry is about, when Kogo knows the family. */
  customer?: WahubCustomerRef | null;
}

/** How a message about a freed place goes out: plain words inside the 24 hours, an approved template after them. */
export type WahubNotifyHow = 'text' | 'template' | '';

/**
 * One lesson of the full waiting list (ז.1, `lessons`): what it is, how full it is right now by the sign-up
 * form's own count, and which entries of the list are its own.
 */
export interface WahubWaitingLesson {
  id: string;
  course: string;
  day: string;
  start: string;
  end: string;
  branch: string;
  /** "קפוארה גן חובה · יום שלישי · 17:00 · מינץ" */
  label: string;
  /** False: the lesson was deleted or no longer takes place — the numbers are then unknown. */
  exists: boolean;
  enrolled: number | null;
  /** Null: the lesson has no limit. */
  capacity: number | null;
  seats_left: number | null;
  is_full: boolean;
  /** "19 מתוך 20 · נשאר מקום אחד" — ready to show; '' when the server did not say. */
  seats_label: string;
  /** Active entries of this lesson in the whole list, whatever the list is narrowed to. */
  waiting: number;
  freed: number;
  /** The entries of this lesson among the results, in the order of the line. */
  entry_ids: number[];
}

/** GET waiting-list/ */
export interface WahubWaitingListPage {
  counts: { waiting: number; freed: number };
  /**
   * The lessons, a place that was freed first. `counted` is false on a server that sends no `lessons` (before ז):
   * the groups are then built from the entries themselves, and carry no numbers.
   */
  lessons: WahubWaitingLesson[];
  counted: boolean;
  results: WahubWaitingEntry[];
}

/** One lesson that can be chosen for the waiting list (ז.2). */
export interface WahubLessonOption {
  id: string;
  course: string;
  day: string;
  start: string;
  end: string;
  branch_id: string;
  branch: string;
  label: string;
  seats_label: string;
  is_full: boolean;
  /** Only a full lesson can be waited for — the office adds to the same lessons the bot does. */
  can_join: boolean;
  /** How many wait for it now. */
  waiting: number;
  /** This contact is already on its list. */
  on_list: boolean;
}

/** GET waiting-list/lessons/ */
export interface WahubLessonOptions {
  branches: Array<{ id: string; name: string }>;
  total: number;
  results: WahubLessonOption[];
}

/** GET waiting-list/{entry_id}/notify/ — what would go out, how, and — when it would not — why (ז.4). */
export interface WahubNotifyPreview {
  can: boolean;
  how: WahubNotifyHow;
  how_label: string;
  /** The wording as it will stand in the conversation. */
  text: string;
  /** Why it would not go out now — a code; '' when it would. */
  blocked: string;
  /** The same, in words, ready to show. */
  detail: string;
  /**
   * The customer was already told of the place that is free now. It may be sent again — but only when the
   * office says so: the screen asks first, and the send then says `again`.
   */
  needs_again: boolean;
  already_notified_at: string | null;
  already_notified_by_name: string;
}

/** POST waiting-list/{entry_id}/notify/ */
export interface WahubNotifyResult {
  sent: boolean;
  how: WahubNotifyHow;
  code: string;
  detail: string;
  text: string;
  already_notified_at: string | null;
  already_notified_by_name: string;
  entry: WahubWaitingEntry | null;
  contact: WahubContact | null;
}

/** POST waiting-list/{entry_id}/handled/ and …/remove/ */
export interface WahubWaitingResult {
  entry: WahubWaitingEntry | null;
  contact: WahubContact | null;
}
