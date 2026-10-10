'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, ExternalLink, Lightbulb, X } from 'lucide-react';
import {
  BELONG_WHAT,
  INFO_KINDS,
  KOGO_FACTS,
  SCOPE_LEVELS,
  WHEN_TO_SAY,
  belongsTo,
  kindDef,
  type BelongAnswers,
} from '@/lib/wahub/bot';
import type { WahubKnowledgeItem, WahubKnowledgeKind, WahubScopeLevel, WahubWhenToSay } from '@/types/wahub';
import { cx } from '../../shared/tones';
import s from '../../wahub.module.css';

interface AddWizardProps {
  onPick: (kind: WahubKnowledgeKind, preset: Partial<WahubKnowledgeItem>) => void;
  onClose: () => void;
  onShowFromKogo: () => void;
}

function OptionCard({ pressed, title, hint, onClick }: { pressed: boolean; title: string; hint?: string; onClick: () => void }) {
  return (
    <button type="button" aria-pressed={pressed} onClick={onClick} className={s.optCard}>
      <b>{title}</b>
      {hint && <span>{hint}</span>}
    </button>
  );
}

function Question({ number, title, children }: { number: number; title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <h4 className="mb-2 text-[14px] font-extrabold">
        <span className={cx(s.num, s.navyInk)}>{number}.</span> {title}
      </h4>
      {children}
    </section>
  );
}

/**
 * "איפה זה שייך": the questionnaire of the mapping report (§3.4). Whatever is
 * a price, an address or a discount is sent to its card in Kogo and never
 * written here; everything else lands in the editor with its kind, scope,
 * validity and "when to say" already set.
 */
export default function AddWizard({ onPick, onClose, onShowFromKogo }: AddWizardProps) {
  const [answers, setAnswers] = useState<BelongAnswers>({});
  const [scope, setScope] = useState<WahubScopeLevel>('business');
  const [validFrom, setValidFrom] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [when, setWhen] = useState<WahubWhenToSay>('if_asked');
  const [example, setExample] = useState('');
  const result = belongsTo(answers);
  const decided = result.target === 'kind';

  function finish() {
    if (result.target !== 'kind') return;
    const preset: Partial<WahubKnowledgeItem> = {
      scope: { level: scope, id: null, label: '' },
      valid_from: validFrom || null,
      valid_until: validUntil || null,
      when_to_say: when,
    };
    const question = example.trim();
    if (question) {
      if (result.kind === 'fact') preset.title = question;
      else preset.example_good = question;
    }
    onPick(result.kind, preset);
  }

  return (
    <section className={cx(s.card, 'flex flex-col gap-4')} aria-label="איפה זה שייך">
      <div className="flex items-start gap-3">
        <span aria-hidden="true" className={s.iconBox}>
          <Lightbulb className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] font-extrabold">איפה זה שייך?</h3>
          <p className={cx(s.t2, 'm-0 !text-[12.5px]')}>כמה שאלות, והרשומה נפתחת במקום הנכון. מה שכבר ב-Kogo לא נכתב פעמיים.</p>
        </div>
        <button type="button" onClick={onClose} aria-label="סגור" className={cx(s.ib, s.ibSm)}>
          <X aria-hidden="true" />
        </button>
      </div>

      <Question number={1} title="מה זה?">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {BELONG_WHAT.map((option) => (
            <OptionCard
              key={option.value}
              pressed={answers.what === option.value}
              title={option.label}
              hint={option.hint}
              onClick={() => setAnswers({ what: option.value })}
            />
          ))}
        </div>
      </Question>

      {answers.what === 'info' && (
        <Question number={2} title="האם זה מחיר, שעה, כתובת, מדריך, חוג, תאריך סגירה, הנחה או מה להביא?">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
            {KOGO_FACTS.map((fact) => (
              <OptionCard key={fact.value} pressed={answers.kogo === fact.value} title={fact.label} onClick={() => setAnswers({ what: 'info', kogo: fact.value })} />
            ))}
            <OptionCard pressed={answers.kogo === 'none'} title="לא, משהו אחר" hint="מדיניות, איש קשר, קישור, כינוי" onClick={() => setAnswers({ what: 'info', kogo: 'none' })} />
          </div>
        </Question>
      )}

      {result.target === 'kogo' && (
        <div className={s.noteGood} role="status">
          <p className="m-0">
            <strong className="font-extrabold">זה כבר ב-Kogo.</strong> {result.fact.label} נקרא מ{result.fact.where}; הבוט רואה אותו משם, ולכן כאן לא כותבים אותו שוב.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <Link href={result.fact.href} className={cx(s.btn, s.btnSm, s.btnP)}>
              <ExternalLink aria-hidden="true" />
              ערוך ב{result.fact.where}
            </Link>
            <button type="button" onClick={onShowFromKogo} className={cx(s.btn, s.btnSm)}>
              מה הבוט קורא מ-Kogo
            </button>
          </div>
        </div>
      )}

      {answers.what === 'info' && answers.kogo === 'none' && (
        <Question number={3} title="איזה סוג מידע?">
          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {INFO_KINDS.map((kind) => (
              <OptionCard
                key={kind.value}
                pressed={answers.info === kind.value}
                title={kind.label}
                hint={kind.hint}
                onClick={() => setAnswers({ what: 'info', kogo: 'none', info: kind.value })}
              />
            ))}
          </div>
        </Question>
      )}

      {decided && (
        <>
          <Question number={answers.what === 'info' ? 4 : 2} title="על מי זה חל?">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="היקף">
              {SCOPE_LEVELS.map((level) => (
                <button
                  key={level.level}
                  type="button"
                  aria-pressed={scope === level.level}
                  onClick={() => setScope(level.level)}
                  className={cx(s.chipbtn, scope === level.level && s.on)}
                >
                  {level.label}
                </button>
              ))}
            </div>
            {scope !== 'business' && <p className={cx(s.t2, 'm-0 mt-1.5')}>את ה{SCOPE_LEVELS.find((level) => level.level === scope)?.label} עצמו בוחרים בטופס, בשלב הבא.</p>}
          </Question>

          <Question number={answers.what === 'info' ? 5 : 3} title="יש תוקף?">
            <div className={cx(s.form, 'max-w-md')}>
              <label>
                מתאריך (לא חובה)
                <input type="date" value={validFrom} onChange={(event) => setValidFrom(event.target.value)} />
              </label>
              <label>
                עד תאריך (לא חובה)
                <input type="date" value={validUntil} min={validFrom || undefined} onChange={(event) => setValidUntil(event.target.value)} />
              </label>
            </div>
          </Question>

          <Question number={answers.what === 'info' ? 6 : 4} title="מתי לומר?">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {WHEN_TO_SAY.map((option) => (
                <OptionCard key={option.value} pressed={when === option.value} title={option.label} hint={option.hint} onClick={() => setWhen(option.value)} />
              ))}
            </div>
          </Question>

          <Question number={answers.what === 'info' ? 7 : 5} title="דוגמה לשאלת לקוח">
            <input
              type="text"
              value={example}
              onChange={(event) => setExample(event.target.value)}
              maxLength={300}
              placeholder="למשל: אפשר להישאר עם הילד בשיעור?"
              aria-label="דוגמה לשאלת לקוח"
              className={cx(s.field, 'max-w-xl')}
            />
            <p className={cx(s.t2, 'm-0 mt-1.5')}>אחרי השמירה אפשר לשאול אותה ב“נסה שאלה” ולראות מה הבוט עונה.</p>
          </Question>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={finish} className={cx(s.btn, s.btnP)}>
              <ArrowRight aria-hidden="true" />
              המשך לטופס: {kindDef(result.kind).label}
            </button>
            <button type="button" onClick={onClose} className={s.btn}>
              ביטול
            </button>
          </div>
        </>
      )}
    </section>
  );
}
