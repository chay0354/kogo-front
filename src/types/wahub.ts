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
  /** Stage 3: who asked in the last 30 days and did not register. Absent on a server built before it. */
  unregistered_leads?: WahubUnregisteredCounts;
  /** Lead stages: who needs handling now, by state (only states with someone in them). Absent on an older server. */
  lead_act?: WahubLeadActSummary;
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

/** The sub-tabs of "הבוט" (stage 2). */
export type WahubBotSub = 'knowledge' | 'hours' | 'try' | 'shadow' | 'review' | 'demo';

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
}

export type WahubLeadCounts = Record<WahubLeadsView, number>;

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
}

export interface WahubLeadsQuery {
  owner: WahubLeadsView;
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
}

/** GET leads/{contact_id}/ — the row, and everything a press opens. */
export interface WahubLeadDetail extends WahubLeadRow {
  details: WahubLeadDetails;
}

export type WahubLeadCloseReason = 'deleted' | 'not_interested';
