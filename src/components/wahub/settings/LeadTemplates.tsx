'use client';

import { useId, useState, type FormEvent } from 'react';
import { AlertCircle, Check, ChevronDown, Copy } from 'lucide-react';
import { toast } from 'sonner';
import {
  AUTOMATION_TEXT,
  STAGE_TITLES,
  connectedByText,
  connectedText,
  pastedTarget,
  pickerOptions,
  pickerValue,
  stageCountText,
  templateStages,
  templateTitle,
} from '@/lib/wahub/leadsAutomation';
import type { WahubLeadTemplate, WahubLeadTemplateOption } from '@/types/wahub';
import type { TemplateSaving } from '../hooks/useLeadsAutomation';
import { Skeleton, Spinner } from '../shared/bits';
import { Fold, Tick } from '../shared/motion';
import { cx } from '../shared/tones';
import m from '../motion.module.css';
import s from '../wahub.module.css';
import a from './automation.module.css';

export interface LeadTemplatesProps {
  status: 'loading' | 'ready' | 'error';
  error: string;
  templates: WahubLeadTemplate[];
  /** The templates of the ManyChat account; null when it cannot be listed — a name is typed in instead. */
  options: WahubLeadTemplateOption[] | null;
  /** Why it cannot be listed, in the server's words; empty when it did not say. */
  optionsReason?: string;
  /** The account's templates are still on their way. */
  optionsLoading: boolean;
  now: Date;
  /** The save that is on its way, by wording. */
  saving: Record<string, TemplateSaving>;
  /** The wordings whose save just landed. */
  saved: Record<string, true>;
  /** Why the last save of a wording was refused. */
  errors: Record<string, string>;
  /** Stage 2 open to begin with (it is folded otherwise). */
  defaultStageTwoOpen?: boolean;
  onRetry: () => void;
  /** Ask ManyChat for its templates again. */
  onRetryOptions?: () => void;
  onConnect: (templateKey: string, target: string) => void;
  onDisconnect: (templateKey: string) => void;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/** "העתק נוסח" — the wording goes into ManyChat as it is; the mark turns into a tick for a moment. */
export function CopyWording({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        if (await copyText(text)) {
          setCopied(true);
          window.setTimeout(() => setCopied(false), 1400);
        } else {
          toast.error(AUTOMATION_TEXT.copyFailed);
        }
      }}
      className={cx(s.btn, s.btnSm)}
    >
      {copied ? <Tick className={s.goodText} /> : <Copy aria-hidden="true" />}
      {copied ? 'הועתק' : 'העתק נוסח'}
    </button>
  );
}

interface TemplateRowProps {
  template: WahubLeadTemplate;
  options: WahubLeadTemplateOption[] | null;
  optionsLoading: boolean;
  now: Date;
  saving: TemplateSaving | null;
  saved: boolean;
  error: string;
  onConnect: (templateKey: string, target: string) => void;
  onDisconnect: (templateKey: string) => void;
}

export interface TemplateRowViewProps extends TemplateRowProps {
  /** What stands in the box a name is pasted into. */
  pasted: string;
  onPasted: (value: string) => void;
}

/**
 * One wording: when it is sent, the wording itself — whole, with a way to copy
 * it — and the template connected to it. Choosing one saves it at once; so
 * does cutting it off.
 *
 * Drawn from what it is given, and keeps nothing of its own.
 */
export function TemplateRowView({
  template,
  options,
  optionsLoading,
  now,
  saving,
  saved,
  error,
  pasted,
  onPasted,
  onConnect,
  onDisconnect,
}: TemplateRowViewProps) {
  const title = templateTitle(template);
  const key = template.template_key;
  const busy = saving !== null;
  // A list with nothing in it offers nothing to choose: a name is pasted, as when the account cannot be listed.
  const choices = options && options.length > 0 ? options : null;
  const name = pastedTarget(pasted);

  // What was typed stays in the box until it is connected: a name the server refuses comes back to be put right.
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name || busy) return;
    onConnect(key, name);
  }

  return (
    <li className={cx(a.tpl, !template.active && a.tplOff)}>
      <div className={a.tplHead}>
        <div className="min-w-0">
          <h5 className={a.tplTitle}>{title}</h5>
          {template.kind_label && template.when_label && <p className={a.tplWhen}>{template.when_label}</p>}
        </div>
        {template.mapped && (
          <span className={cx(s.pill, s.pGood, a.tplPill)} title={connectedByText(template, now) || undefined}>
            <Check aria-hidden="true" />
            מחובר
          </span>
        )}
      </div>

      {/* The name the template is given in ManyChat, so the one that is made there is easy to find here. A press marks it whole, to copy. */}
      {!template.mapped && template.suggested_name && (
        <p className={a.tplName}>
          {AUTOMATION_TEXT.suggestedName}: <span className={a.tplNameValue}>{template.suggested_name}</span>
        </p>
      )}

      {template.text && (
        <div className={a.wording}>
          <p className={a.wordingText} dir="auto">
            {template.text}
          </p>
          <div className={a.wordingFoot}>
            <CopyWording text={template.text} />
          </div>
        </div>
      )}

      <div className={a.connect}>
        {optionsLoading ? (
          <Skeleton className="h-[38px] w-full max-w-[380px] !rounded-[10px]" />
        ) : choices ? (
          <label className={a.pick}>
            <select
              value={pickerValue(template, choices)}
              onChange={(event) => {
                if (event.target.value) onConnect(key, event.target.value);
              }}
              disabled={busy}
              aria-label={`התבנית של “${title}”`}
            >
              {/* Once something is connected, "nothing" is chosen with "נתק" and not from the list. */}
              <option value="" disabled={template.mapped}>
                {AUTOMATION_TEXT.pick}
              </option>
              {pickerOptions(template, choices).map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
            <ChevronDown aria-hidden="true" />
          </label>
        ) : template.mapped ? (
          <span className={a.connected} title={connectedText(template, null)}>
            {connectedText(template, null)}
          </span>
        ) : (
          <form onSubmit={submit} className={a.paste}>
            <input
              type="text"
              value={pasted}
              onChange={(event) => onPasted(event.target.value)}
              placeholder={AUTOMATION_TEXT.pasteLabel}
              aria-label={`${AUTOMATION_TEXT.pasteLabel} – “${title}”`}
              // A template's name is written in Latin letters; the empty box keeps the page's own direction for its hint.
              dir={pasted ? 'ltr' : undefined}
              maxLength={200}
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              disabled={busy}
            />
            <button type="submit" disabled={!name || busy} className={cx(s.btn, s.btnSm, s.btnP)}>
              חבר
            </button>
          </form>
        )}

        {template.mapped && !optionsLoading && (
          <button type="button" onClick={() => onDisconnect(key)} disabled={busy} className={cx(s.link, a.cut)}>
            נתק
          </button>
        )}
        {busy && <Spinner className="h-4 w-4" />}
        {saved && !busy && (
          <span role="status" className={cx(a.savedNote, m.fade)}>
            <Tick />
            נשמר
          </span>
        )}
      </div>

      {!template.active && <p className={a.tplNote}>{AUTOMATION_TEXT.inactive}</p>}
      {error && (
        <p role="alert" className={a.tplError}>
          {error}
        </p>
      )}
    </li>
  );
}

/** A wording with the box a name is pasted into, when the account's templates cannot be listed. */
function TemplateRow(props: TemplateRowProps) {
  const [pasted, setPasted] = useState('');
  return (
    <TemplateRowView
      {...props}
      pasted={pasted}
      onPasted={setPasted}
      onDisconnect={(key) => {
        // Cut off, the box opens empty — not on the name that was just let go.
        setPasted('');
        props.onDisconnect(key);
      }}
    />
  );
}

/**
 * The templates, inside their fold: stage 1 — the five to start with — and
 * under it stage 2, folded. A wording a row; nothing here is a switch.
 *
 * Drawn from what it is given; the reading and the saving are the card's.
 */
export default function LeadTemplates({
  status,
  error,
  templates,
  options,
  optionsReason = '',
  optionsLoading,
  now,
  saving,
  saved,
  errors,
  defaultStageTwoOpen = false,
  onRetry,
  onRetryOptions,
  onConnect,
  onDisconnect,
}: LeadTemplatesProps) {
  const stages = templateStages(templates);
  // With no first stage to stand before it, the second is simply the list.
  const [twoOpen, setTwoOpen] = useState(defaultStageTwoOpen);
  const twoId = useId();

  if (status === 'error') {
    return (
      <div role="alert" className={cx(s.emptyState, s.emptyTight, a.failed)}>
        <div aria-hidden="true" className={cx(s.emptyIc, s.emptyIcBad)}>
          <AlertCircle />
        </div>
        <h3>{AUTOMATION_TEXT.templatesFailed}</h3>
        {error && <p>{error}</p>}
        <button type="button" onClick={onRetry} className={cx(s.btn, s.btnP, 'mt-1')}>
          נסו שוב
        </button>
      </div>
    );
  }

  if (status === 'loading') {
    return (
      <div className={a.sk} aria-busy="true" aria-label="טוען את התבניות">
        {[0, 1].map((row) => (
          <Skeleton key={row} className="!rounded-[14px]" style={{ height: 132 }} />
        ))}
      </div>
    );
  }

  if (templates.length === 0) return <p className={a.empty}>{AUTOMATION_TEXT.templatesEmpty}</p>;

  const list = (rows: WahubLeadTemplate[]) => (
    <ul className={a.tplList}>
      {rows.map((template) => (
        <TemplateRow
          key={template.template_key}
          template={template}
          options={options}
          optionsLoading={optionsLoading}
          now={now}
          saving={saving[template.template_key] ?? null}
          saved={saved[template.template_key] === true}
          error={errors[template.template_key] ?? ''}
          onConnect={onConnect}
          onDisconnect={onDisconnect}
        />
      ))}
    </ul>
  );

  return (
    <>
      <p className={a.tplHint}>{AUTOMATION_TEXT.templatesHint}</p>
      {/* The account could not be listed, and the server said why: said once, with a way to ask again. */}
      {!optionsLoading && !options && optionsReason && (
        <p className={a.tplReason}>
          {AUTOMATION_TEXT.optionsMissing} ({optionsReason}).
          {onRetryOptions && (
            <>
              {' '}
              <button type="button" onClick={onRetryOptions} className={s.link}>
                נסו שוב
              </button>
            </>
          )}
        </p>
      )}

      {stages.one.length > 0 && (
        <section aria-label={STAGE_TITLES[1]}>
          <h4 className={a.stageHead}>
            <span className={a.stageTitle}>{STAGE_TITLES[1]}</span>
            <span className={a.stageCount}>{stageCountText(stages.one)}</span>
          </h4>
          {list(stages.one)}
        </section>
      )}

      {stages.two.length > 0 &&
        (stages.one.length === 0 ? (
          <section aria-label={STAGE_TITLES[2]}>
            <h4 className={a.stageHead}>
              <span className={a.stageTitle}>{STAGE_TITLES[2]}</span>
              <span className={a.stageCount}>{stageCountText(stages.two)}</span>
            </h4>
            {list(stages.two)}
          </section>
        ) : (
          <section aria-label={STAGE_TITLES[2]} className={cx(a.stageTwo, twoOpen && s.foldOpen)}>
            <button type="button" aria-expanded={twoOpen} aria-controls={twoId} onClick={() => setTwoOpen((open) => !open)} className={s.foldHead}>
              <span className={s.foldTitle}>{STAGE_TITLES[2]}</span>
              <span className={s.foldHint}>{stageCountText(stages.two)}</span>
              <ChevronDown className={s.foldChevron} aria-hidden="true" />
            </button>
            <Fold open={twoOpen} id={twoId} innerClassName={a.stageTwoBody}>
              {list(stages.two)}
            </Fold>
          </section>
        ))}
    </>
  );
}
