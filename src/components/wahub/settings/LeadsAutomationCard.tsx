'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, Check, CheckCircle2, ChevronDown, PauseCircle, Repeat2, X } from 'lucide-react';
import { readableError } from '@/lib/apiError';
import { FOLLOWUPS_LINE_KEY, FOLLOWUPS_TEXT, followupsLeftBehind, withFollowupsLine } from '@/lib/wahub/botMode';
import {
  AUTOMATION_TEXT,
  UPCOMING_FIRST,
  automationHeadline,
  hebrewOr,
  howParts,
  shortText,
  templatesTitle,
  todayWords,
  upcomingName,
  upcomingTag,
  upcomingWhen,
} from '@/lib/wahub/leadsAutomation';
import type { WahubAutomationLine, WahubAutomationUpcoming, WahubLeadTemplate, WahubLeadTemplateOption, WahubLeadsAutomation } from '@/types/wahub';
import {
  useLeadTemplateOptions,
  useLeadTemplates,
  useLeadsAutomation,
  useTemplateConnect,
  type TemplateSaving,
} from '../hooks/useLeadsAutomation';
import { useBotMode, useBotModeChanges } from '../hooks/useBotMode';
import { useNow } from '../hooks/useNow';
import { DemoTag, InlineConfirm, Skeleton, Spinner } from '../shared/bits';
import { RefreshNote } from '../shared/loading';
import { Fold, prefersReducedMotion } from '../shared/motion';
import { cx } from '../shared/tones';
import m from '../motion.module.css';
import s from '../wahub.module.css';
import a from './automation.module.css';
import LeadTemplates from './LeadTemplates';

/** Where the strip on the leads tab leads to. */
export const LEADS_AUTOMATION_CARD_ID = 'wahub-leads-automation';

export interface LeadsAutomationTemplates {
  status: 'loading' | 'ready' | 'error';
  error: string;
  list: WahubLeadTemplate[];
  options: WahubLeadTemplateOption[] | null;
  /** Why the account's templates cannot be listed, when the server says. */
  optionsReason: string;
  optionsLoading: boolean;
  saving: Record<string, TemplateSaving>;
  saved: Record<string, true>;
  errors: Record<string, string>;
}

/**
 * The owner's own switch for the bot's comings back (docs/WAHUB-CONTRACT-GO-LIVE.md, ב.6) — apart from "מי עונה
 * ללקוחות". It stands on the line "חזרות אוטומטיות"; turning it on asks first, turning it off does not.
 */
export interface LeadsAutomationFollowups {
  on: boolean;
  /** Where the switch stands, in the server's sentence: "כבויות — …", "דלוקות — יוצאות רק חזרות שמועדן אחרי …". */
  text: string;
  /** How many comings back wait right now: these are the ones that turning it on leaves behind. */
  dueNow: number;
  /** The press is on its way to the server. */
  busy: boolean;
  /** Turning on was pressed, and waits for its yes. */
  confirming: boolean;
  /** Why the last press was refused. */
  error: string;
  /** The switch was pressed: `true` asks first, `false` turns it off at once. */
  onToggle: (on: boolean) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

export interface LeadsAutomationViewProps {
  status: 'loading' | 'ready' | 'error';
  error: string;
  /** What the server said; null until it has. */
  automation: WahubLeadsAutomation | null;
  /** What is on screen is being read again. */
  refreshing?: boolean;
  /** The switch of the comings back. Absent on a server that does not have it: the card is then as it was. */
  followups?: LeadsAutomationFollowups;
  templates: LeadsAutomationTemplates;
  now: Date;
  /** The templates are unfolded. */
  templatesOpen: boolean;
  /** Stage 2 of the templates open to begin with. */
  defaultStageTwoOpen?: boolean;
  /** The comings back whose wording is open to begin with, by their place in the list. */
  defaultOpenUpcoming?: number[];
  onToggleTemplates: () => void;
  onRetry: () => void;
  onRetryTemplates: () => void;
  onRetryOptions?: () => void;
  onConnect: (templateKey: string, target: string) => void;
  onDisconnect: (templateKey: string) => void;
}

/**
 * One of the lines: a tick or a cross, the title, the sentence — and, where it is not ok, how it is put right.
 * The line of "חזרות אוטומטיות" carries its switch at its end (`followups`), and under its words the question
 * that turning it on asks.
 */
export function AutomationLineView({ line, followups }: { line: WahubAutomationLine; followups?: LeadsAutomationFollowups }) {
  // The question belongs to a switch that is off: a state that changed under it puts it away.
  const asking = Boolean(followups?.confirming && !followups.on);
  const left = followups ? followupsLeftBehind(followups.dueNow) : '';
  return (
    <li className={a.line} data-ok={line.ok ? 'yes' : 'no'} data-line={line.key || undefined}>
      <span className={cx(a.mark, line.ok ? a.markOk : a.markOff)} role="img" aria-label={line.ok ? 'תקין' : 'חסר'}>
        {line.ok ? <Check aria-hidden="true" /> : <X aria-hidden="true" />}
      </span>
      <div className={a.lineBody}>
        <h4 className={a.lineTitle}>{line.title}</h4>
        {line.detail && <p className={a.lineDetail}>{line.detail}</p>}
        {asking && followups && (
          <div className={a.lineConfirm}>
            <InlineConfirm
              text={
                <>
                  <b>{FOLLOWUPS_TEXT.question}</b> {FOLLOWUPS_TEXT.line}
                  {left && <> {left}</>}
                </>
              }
              confirmLabel={FOLLOWUPS_TEXT.confirm}
              busy={followups.busy}
              onConfirm={followups.onConfirm}
              onCancel={followups.onCancel}
            />
          </div>
        )}
        {followups?.error && (
          <p role="alert" className={a.tplError}>
            {followups.error}
          </p>
        )}
        {!line.ok && line.how && !asking && (
          <p className={a.how}>
            <b>איך מתקנים:</b>{' '}
            {howParts(line.how).map((part, index) =>
              part.code ? (
                <span key={index} className={a.setting}>
                  {part.text}
                </span>
              ) : (
                <span key={index}>
                  {index > 0 ? ' ' : ''}
                  {part.text}
                </span>
              ),
            )}
          </p>
        )}
      </div>
      {followups && (
        <button
          type="button"
          role="switch"
          aria-checked={followups.on}
          aria-label={FOLLOWUPS_TEXT.switchLabel}
          disabled={followups.busy}
          onClick={() => followups.onToggle(!followups.on)}
          className={cx(s.switchRow, a.lineSwitch)}
        >
          {followups.busy ? <Spinner /> : <span className={s.switch} aria-hidden="true" />}
        </button>
      )}
    </li>
  );
}

/** One coming back: who, what (the wording cut short; whole on a press), when, and whether a template stands behind it. */
function Upcoming({ item, now, defaultOpen }: { item: WahubAutomationUpcoming; now: Date; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  const when = upcomingWhen(item, now);
  const tag = upcomingTag(item);
  const short = shortText(item.text);
  const head = (
    <>
      <span className={a.upWho}>
        <span className={a.upName} dir="auto">
          {upcomingName(item)}
        </span>
        {item.is_demo && <DemoTag size="row" />}
      </span>
      {when.text && <span className={cx(a.upWhen, when.held && a.upWhenHeld)}>{when.text}</span>}
      <span className={a.upSecond}>
        <span className={a.upWhat}>
          {item.kind_label && <span className={a.upKind}>{item.kind_label}</span>}
          {/* Open, the wording stands whole under the row; it is not said twice. */}
          {!open && short && (
            <span dir="auto">
              {item.kind_label ? ' · ' : ''}
              {short}
            </span>
          )}
        </span>
        {tag && <span className={cx(s.pill, tag.tone === 'warn' ? s.pWarn : s.pGood, a.upTag)}>{tag.text}</span>}
      </span>
    </>
  );

  // Nothing to open: a plain row.
  if (!item.text && !item.note) {
    return (
      <li>
        <div className={a.upHead}>{head}</div>
      </li>
    );
  }
  return (
    <li className={open ? s.foldOpen : undefined}>
      <button type="button" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)} className={a.upHead}>
        {head}
        <ChevronDown className={cx(s.foldChevron, a.upChev)} aria-hidden="true" />
      </button>
      <Fold open={open} id={panelId} innerClassName={a.upBody}>
        {item.text && (
          <blockquote className={a.quote} dir="auto">
            {item.text}
          </blockquote>
        )}
        {/* What stops this very one, in the server's words: "השליחה כבויה", "חסרה תבנית". */}
        {item.note && <p className={a.upNote}>{item.note}</p>}
      </Fold>
    </li>
  );
}

/** A name for each row that stays the same while the list moves under it. */
function upcomingKeys(items: WahubAutomationUpcoming[]): string[] {
  const seen = new Set<string>();
  return items.map((item, index) => {
    const own = item.contact_id != null ? `lead-${item.contact_id}` : `row-${index}`;
    const key = seen.has(own) ? `${own}-${index}` : own;
    seen.add(key);
    return key;
  });
}

function CardHead({ refreshing = false }: { refreshing?: boolean }) {
  return (
    <div className={a.head}>
      <span aria-hidden="true" className={s.iconBox}>
        <Repeat2 className="h-[18px] w-[18px]" />
      </span>
      <h3>{AUTOMATION_TEXT.title}</h3>
      <RefreshNote active={refreshing} />
    </div>
  );
}

/**
 * "חזרה אוטומטית ללידים" (docs/WAHUB-CONTRACT-LEADS-V2.md, י) — the owner
 * asked: "אני צריך הכול אוטומטי, מה קורה עם זה". The card answers at a
 * glance, in this order: one large sentence — is the bot coming back by
 * itself; the four lines — what stands and what is missing, and how the
 * missing is put right; what the bot plans to send, and when; and, folded, the
 * templates, to be connected without help.
 *
 * The card switches nothing on: sending is the owner's one switch, elsewhere.
 * Drawn from what it is given, so every state can be shown without a server.
 */
export function LeadsAutomationView({
  status,
  error,
  automation,
  refreshing,
  followups,
  templates,
  now,
  templatesOpen,
  defaultStageTwoOpen,
  defaultOpenUpcoming,
  onToggleTemplates,
  onRetry,
  onRetryTemplates,
  onRetryOptions,
  onConnect,
  onDisconnect,
}: LeadsAutomationViewProps) {
  const [showAll, setShowAll] = useState(false);
  const templatesId = useId();

  if (!automation) {
    return (
      <section id={LEADS_AUTOMATION_CARD_ID} className={cx(s.card, a.card)} aria-label={AUTOMATION_TEXT.title}>
        <CardHead />
        {status === 'error' ? (
          <div role="alert" className={cx(s.emptyState, s.emptyTight, a.failed)}>
            <div aria-hidden="true" className={cx(s.emptyIc, s.emptyIcBad)}>
              <AlertCircle />
            </div>
            <h3>{AUTOMATION_TEXT.loadFailed}</h3>
            {error && <p>{error}</p>}
            <button type="button" onClick={onRetry} className={cx(s.btn, s.btnP, 'mt-1')}>
              נסו שוב
            </button>
          </div>
        ) : (
          // The shape of what is coming: the sentence, and the four lines under it.
          <div className={a.sk} aria-busy="true" aria-label="טוען את מצב החזרה ללידים">
            <Skeleton className="!rounded-[14px]" style={{ height: 62 }} />
            {[46, 38, 52, 42].map((width, row) => (
              <div key={row} className={a.skLine}>
                <Skeleton className="h-[22px] w-[22px] flex-none !rounded-full" />
                <Skeleton className="h-[14px]" style={{ width: `${width}%` }} />
              </div>
            ))}
          </div>
        )}
      </section>
    );
  }

  // With the switch, its line is always among the lines — in the server's words where it sent one — and the
  // sentence above counts it with the rest.
  const lines = followups ? withFollowupsLine(automation.lines, followups) : automation.lines;
  const headline = automationHeadline({ ready: automation.ready && lines.every((line) => line.ok), lines });
  const today = todayWords(automation.today);
  const upcoming = showAll ? automation.upcoming : automation.upcoming.slice(0, UPCOMING_FIRST);
  const hidden = automation.upcoming.length - upcoming.length;
  const keys = upcomingKeys(upcoming);

  return (
    <section id={LEADS_AUTOMATION_CARD_ID} className={cx(s.card, a.card)} aria-label={AUTOMATION_TEXT.title}>
      <CardHead refreshing={refreshing} />

      {/* 1 — the one large sentence. */}
      <div className={cx(a.headline, headline.ready ? a.headGood : a.headWarn)} data-ready={headline.ready ? 'yes' : 'no'}>
        {headline.ready ? <CheckCircle2 aria-hidden="true" /> : <PauseCircle aria-hidden="true" />}
        <div className="min-w-0">
          <p className={a.headText}>{headline.text}</p>
          {today && <p className={a.headSub}>{today}</p>}
        </div>
      </div>

      {/* 2 — the lines: the four, and "חזרות אוטומטיות" with its switch. */}
      {lines.length > 0 && (
        <ul className={cx(s.rows, a.lines)} aria-label="מה עובד ומה חסר">
          {lines.map((line, index) => (
            <AutomationLineView key={line.key || index} line={line} followups={line.key === FOLLOWUPS_LINE_KEY ? followups : undefined} />
          ))}
        </ul>
      )}

      {/* 3 — what the bot plans to send. */}
      <section className={a.block} aria-label={AUTOMATION_TEXT.upcomingTitle}>
        <h4 className={s.sectTitle}>{AUTOMATION_TEXT.upcomingTitle}</h4>
        {automation.upcoming.length === 0 ? (
          <p className={a.empty}>{AUTOMATION_TEXT.upcomingEmpty}</p>
        ) : (
          <>
            <ul className={cx(a.upList, m.stagger)}>
              {upcoming.map((item, index) => (
                <Upcoming
                  // A lead has one coming back open at the most, so the lead names the row — and a row that
                  // moves up as others go out keeps what was opened in it.
                  key={keys[index]}
                  item={item}
                  now={now}
                  defaultOpen={defaultOpenUpcoming?.includes(index) ?? false}
                />
              ))}
            </ul>
            {hidden > 0 && (
              <button type="button" onClick={() => setShowAll(true)} className={cx(s.link, a.more)}>
                הצג עוד {hidden.toLocaleString('he-IL')}
              </button>
            )}
          </>
        )}
      </section>

      {/* 4 — the templates, folded. */}
      <section className={cx(a.block, a.blockFold, templatesOpen && s.foldOpen)} aria-label="תבניות">
        <button type="button" aria-expanded={templatesOpen} aria-controls={templatesId} onClick={onToggleTemplates} className={s.foldHead}>
          <span className={s.foldTitle}>{templatesTitle(templates.status === 'ready' ? templates.list : null)}</span>
          <ChevronDown className={s.foldChevron} aria-hidden="true" />
        </button>
        <Fold open={templatesOpen} id={templatesId} innerClassName={a.tplBody}>
          <LeadTemplates
            status={templates.status}
            error={templates.error}
            templates={templates.list}
            options={templates.options}
            optionsReason={templates.optionsReason}
            optionsLoading={templates.optionsLoading}
            now={now}
            saving={templates.saving}
            saved={templates.saved}
            errors={templates.errors}
            defaultStageTwoOpen={defaultStageTwoOpen}
            onRetry={onRetryTemplates}
            onRetryOptions={onRetryOptions}
            onConnect={onConnect}
            onDisconnect={onDisconnect}
          />
        </Fold>
      </section>
    </section>
  );
}

/**
 * The card with its reading and its saving. On a server that has no
 * `leads/automation/` yet (404 / 405) it is simply not there.
 *
 * `focus`: the card was asked for by name (the strip on the leads tab) — once
 * it is drawn, the page is brought to it.
 */
export default function LeadsAutomationCard({ focus = false }: { focus?: boolean }) {
  const now = useNow(60_000);
  const automation = useLeadsAutomation();
  const available = automation.data != null;
  const [templatesOpen, setTemplatesOpen] = useState(false);
  // The wordings feed the fold's own title ("2 מתוך 16 מחוברות"); the account's templates wait for the fold to be opened.
  const templates = useLeadTemplates(available);
  const options = useLeadTemplateOptions(available && templatesOpen);
  const connect = useTemplateConnect();
  // "נסו שוב" was pressed and the read is on its way: the waiting shape comes back, so the press is seen to do something.
  const [retrying, setRetrying] = useState({ card: false, templates: false, options: false });
  const retry = (part: 'card' | 'templates' | 'options', read: () => Promise<unknown>) => {
    setRetrying((now) => ({ ...now, [part]: true }));
    void read().finally(() => setRetrying((now) => ({ ...now, [part]: false })));
  };

  // The owner's own switch for the comings back: read with "מי עונה ללקוחות" (one request, shared), changed here.
  const botMode = useBotMode(available);
  const changes = useBotModeChanges();
  const [confirmingFollowups, setConfirmingFollowups] = useState(false);
  const [followupsError, setFollowupsError] = useState('');
  const followupsState = botMode.data?.followups;

  async function setFollowups(on: boolean) {
    setFollowupsError('');
    const outcome = await changes.setFollowups(on);
    setConfirmingFollowups(false);
    if (!outcome.ok) setFollowupsError(outcome.message);
  }

  const brought = useRef(false);
  useEffect(() => {
    if (!focus) {
      brought.current = false;
      return;
    }
    if (!available || brought.current) return;
    brought.current = true;
    document
      .getElementById(LEADS_AUTOMATION_CARD_ID)
      ?.scrollIntoView({ block: 'start', behavior: prefersReducedMotion() ? 'auto' : 'smooth' });
  }, [available, focus]);

  // A server from before this was built: no card, and nothing in its place.
  if (automation.data === null) return null;

  return (
    <LeadsAutomationView
      status={automation.data ? 'ready' : automation.isError && !retrying.card ? 'error' : 'loading'}
      error={automation.isError ? hebrewOr(readableError(automation.error, ''), '') : ''}
      automation={automation.data ?? null}
      refreshing={Boolean(automation.data) && automation.isFetching}
      followups={
        followupsState
          ? {
              on: followupsState.on,
              text: followupsState.text,
              dueNow: followupsState.due_now,
              busy: changes.busy === 'followups',
              confirming: confirmingFollowups,
              error: followupsError,
              onToggle: (on) => {
                setFollowupsError('');
                // Turning on asks first; turning off is the safe way, and is done at once.
                if (on) setConfirmingFollowups(true);
                else void setFollowups(false);
              },
              onConfirm: () => void setFollowups(true),
              onCancel: () => setConfirmingFollowups(false),
            }
          : undefined
      }
      templates={{
        status: templates.data ? 'ready' : templates.isError && !retrying.templates ? 'error' : 'loading',
        error: templates.isError ? hebrewOr(readableError(templates.error, ''), '') : '',
        list: templates.data ?? [],
        // The account's list failed to arrive: a name can still be typed in.
        options: options.data?.options ?? null,
        optionsReason: options.data?.reason ?? '',
        optionsLoading: templatesOpen && ((options.isPending && !options.isError) || retrying.options),
        saving: connect.saving,
        saved: connect.saved,
        errors: connect.errors,
      }}
      now={now}
      templatesOpen={templatesOpen}
      onToggleTemplates={() => setTemplatesOpen((open) => !open)}
      onRetry={() => retry('card', () => automation.refetch())}
      onRetryTemplates={() => retry('templates', () => templates.refetch())}
      onRetryOptions={() => {
        // A refusal that said "ManyChat cannot be asked" is no longer the last word once it is asked again.
        connect.clearErrors();
        retry('options', () => options.refetch());
      }}
      onConnect={(key, target) => void connect.save(key, target)}
      onDisconnect={(key) => void connect.save(key, null)}
    />
  );
}
