'use client';

import { useId, useState, type ReactNode } from 'react';
import { BookOpen, ChevronDown, ThumbsDown, ThumbsUp, Wrench } from 'lucide-react';
import { isStubModel, toolLabel, toolName } from '@/lib/wahub/bot';
import type { WahubShadowKnowledgeRef, WahubShadowTool, WahubShadowVerdict } from '@/types/wahub';
import { Spinner } from '../shared/bits';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';

/**
 * Pieces every part of the bot tab uses. The owner's rule shapes them all:
 * a title first, the details on a press.
 */

/** A folded section: the title (and a count) always; the body on a press. */
export function Fold({
  title,
  count,
  icon,
  defaultOpen = false,
  children,
  className,
}: {
  title: string;
  count?: number | null;
  icon?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={className}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((value) => !value)}
        className={cx(s.sectTitle, 'flex w-full items-center justify-between gap-2 border-0 bg-transparent p-0 text-start')}
      >
        <span className="inline-flex items-center gap-1.5">
          {icon}
          {title}
          {count != null && count > 0 && <span className={s.num}>({count})</span>}
        </span>
        <ChevronDown className={cx('h-4 w-4 transition-transform', open && 'rotate-180')} aria-hidden="true" />
      </button>
      {open && (
        <div id={id} className="mt-2">
          {children}
        </div>
      )}
    </div>
  );
}

/** "דמה": the answer came without a model, because there is no key. */
export function StubTag() {
  return (
    <span className={s.stubMark} title="אין מפתח למודל – התשובה היא דמה, לא תשובה אמיתית">
      דמה
    </span>
  );
}

/** The shadow bot's proposed answer, as a bubble that was never sent. */
export function ShadowBubble({
  text,
  model,
  tookMs,
  requestHuman = false,
  requestHumanReason = '',
  heading = 'הבוט החדש היה עונה',
}: {
  text: string;
  model?: string | null;
  tookMs?: number | null;
  /** The draft asked for a person instead of answering by itself. Noted, never sent. */
  requestHuman?: boolean;
  requestHumanReason?: string;
  heading?: string | null;
}) {
  return (
    <div className={cx(s.bubble, s.bShadow)}>
      <p className={s.bubbleMeta}>
        {heading && <span>{heading}</span>}
        {isStubModel(model) && <StubTag />}
        {requestHuman && (
          <span className={cx(s.pill, s.pWarn)} title={requestHumanReason || undefined}>
            היה מבקש נציג{requestHumanReason ? ` · ${requestHumanReason}` : ''}
          </span>
        )}
        {tookMs != null && tookMs > 0 && <span className={s.num}>{(tookMs / 1000).toFixed(1)} שנ׳</span>}
      </p>
      <p className={s.bubbleText} dir="auto">
        {text || <span className={s.muted}>(תשובה ריקה)</span>}
      </p>
    </div>
  );
}

export function ToolChips({ tools }: { tools: ReadonlyArray<string | WahubShadowTool> }) {
  if (!tools.length) return <span className={cx(s.t2, '!text-[12px]')}>לא נקרא אף כלי</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {tools.map((tool, index) => {
        const name = toolName(tool);
        const detail =
          typeof tool === 'object' && tool
            ? [tool.summary, tool.input ? JSON.stringify(tool.input) : ''].filter(Boolean).join(' · ')
            : '';
        return (
          <span key={`${name}-${index}`} className={cx(s.pill, s.pNav)} title={detail || name}>
            <Wrench aria-hidden="true" />
            {toolLabel(tool)}
          </span>
        );
      })}
    </div>
  );
}

/** The knowledge the answer leaned on, each a link into the knowledge list. */
export function KnowledgeLinks({
  refs,
  onOpenItem,
}: {
  refs: ReadonlyArray<WahubShadowKnowledgeRef>;
  onOpenItem?: (id: number) => void;
}) {
  if (!refs.length) return <span className={cx(s.t2, '!text-[12px]')}>בלי רשומות ידע</span>;
  return (
    <div className="flex flex-wrap gap-1.5">
      {refs.map((ref) => (
        <button
          key={ref.id}
          type="button"
          onClick={() => onOpenItem?.(ref.id)}
          disabled={!onOpenItem}
          className={cx(s.pill, s.pGold, onOpenItem && 'cursor-pointer hover:brightness-95')}
          title={ref.kind_label}
        >
          <BookOpen aria-hidden="true" />
          {ref.kind_label ? `${ref.kind_label}: ` : ''}
          {ref.title}
        </button>
      ))}
    </div>
  );
}

/** "למה", the tools and the knowledge — folded under an answer. */
export function ShadowWhy({
  reasoning,
  tools,
  knowledge,
  onOpenItem,
  defaultOpen = false,
}: {
  reasoning: string;
  tools: ReadonlyArray<string | WahubShadowTool>;
  knowledge: ReadonlyArray<WahubShadowKnowledgeRef>;
  onOpenItem?: (id: number) => void;
  defaultOpen?: boolean;
}) {
  return (
    <Fold title="למה" defaultOpen={defaultOpen}>
      <div className="flex flex-col gap-2.5">
        <p className="m-0 whitespace-pre-line text-[13.5px] leading-relaxed" dir="auto">
          {reasoning || <span className={s.muted}>לא נרשם הסבר.</span>}
        </p>
        <div>
          <p className={cx(s.sectTitle, 'mb-1')}>כלים שנקראו</p>
          <ToolChips tools={tools} />
        </div>
        <div>
          <p className={cx(s.sectTitle, 'mb-1')}>ידע ששימש</p>
          <KnowledgeLinks refs={knowledge} onOpenItem={onOpenItem} />
        </div>
      </div>
    </Fold>
  );
}

/**
 * 👍 / 👎 with a note. The mark shows at once; "bad" opens a line for the
 * note, because a 👎 with a note becomes a proposal to fix the bot.
 */
export function VerdictButtons({
  verdict,
  note,
  busy = false,
  onVerdict,
}: {
  verdict: WahubShadowVerdict;
  note: string;
  busy?: boolean;
  onVerdict: (verdict: 'good' | 'bad', note: string) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const noting = draft !== null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="סימון התשובה">
        <button
          type="button"
          aria-pressed={verdict === 'good'}
          disabled={busy}
          onClick={() => {
            setDraft(null);
            onVerdict('good', '');
          }}
          className={cx(s.thumb, s.thumbGood)}
        >
          <ThumbsUp aria-hidden="true" />
          תשובה טובה
        </button>
        <button
          type="button"
          aria-pressed={verdict === 'bad'}
          disabled={busy}
          onClick={() => setDraft(noting ? null : note || '')}
          className={cx(s.thumb, s.thumbBad)}
        >
          <ThumbsDown aria-hidden="true" />
          לתקן
        </button>
        {busy && <Spinner className="h-3.5 w-3.5" />}
        {verdict === 'bad' && note && !noting && (
          <span className={cx(s.t2, '!text-[12px]')} dir="auto">
            {note}
          </span>
        )}
      </div>
      {noting && (
        <div className={cx(s.inset, 'flex flex-col gap-2')}>
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            rows={2}
            maxLength={1000}
            autoFocus
            placeholder="מה היה צריך לענות? ההערה הופכת להצעת תיקון."
            aria-label="הערה לתיקון"
            className={s.field}
          />
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                onVerdict('bad', draft);
                setDraft(null);
              }}
              className={cx(s.btn, s.btnSm, s.btnP)}
            >
              שמור סימון
            </button>
            <button type="button" onClick={() => setDraft(null)} className={cx(s.btn, s.btnSm)}>
              ביטול
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** A small "who" mark for an evidence line or an old reply. */
export function WhoMark({ who }: { who: 'customer' | 'bot' | 'office' | 'shadow' | 'system' }) {
  const label = { customer: 'לקוח', bot: 'הבוט הישן', office: 'משרד', shadow: 'הבוט החדש', system: 'מערכת' }[who];
  const tone = { customer: s.pMute, bot: s.pNav, office: s.pGold, shadow: s.pGood, system: s.pWarn }[who];
  return <span className={cx(s.who, tone)}>{label}</span>;
}
