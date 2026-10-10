'use client';

import { useEffect, useState } from 'react';
import { Bookmark, FlaskConical, Search, Send, X } from 'lucide-react';
import { toast } from 'sonner';
import { readableError } from '@/lib/apiError';
import { displayName } from '@/lib/wahub/format';
import { fetchWahubContacts, tryWahubShadow, type WahubShadowTryBody } from '@/lib/wahubApi';
import type { WahubContact, WahubShadowTry, WahubStatus } from '@/types/wahub';
import { ContactAvatar, Spinner, useDismiss } from '../../shared/bits';
import { cx } from '../../shared/tones';
import s from '../../wahub.module.css';
import { ShadowBubble, ShadowWhy } from '../shared';

const SEARCH_DELAY_MS = 300;

interface Asked {
  id: number;
  body: WahubShadowTryBody;
  contactName: string;
  answer: WahubShadowTry;
  saved: boolean;
  saving: boolean;
}

/** Choose a contact for the question, by name or phone. Optional: a question can stand alone. */
function ContactPicker({ value, onChange }: { value: WahubContact | null; onChange: (contact: WahubContact | null) => void }) {
  const [text, setText] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<WahubContact[]>([]);
  const [searching, setSearching] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapper = useDismiss(open, () => setOpen(false));

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(text.trim()), SEARCH_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [text]);

  useEffect(() => {
    if (query.length < 2) {
      setResults([]);
      return;
    }
    let live = true;
    setSearching(true);
    fetchWahubContacts({ view: 'chats', search: query, pageSize: 8 })
      .then((page) => {
        if (live) setResults(page.results);
      })
      .catch(() => {
        if (live) setResults([]);
      })
      .finally(() => {
        if (live) setSearching(false);
      });
    return () => {
      live = false;
    };
  }, [query]);

  if (value) {
    return (
      <div className="flex items-center gap-2">
        <ContactAvatar contact={value} size="sm" />
        <span className={cx(s.t1, 'min-w-0 truncate')} dir="auto">
          {displayName(value)}
        </span>
        <button type="button" onClick={() => onChange(null)} aria-label="הסר את איש הקשר" className={cx(s.ib, s.ibSm)}>
          <X aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div ref={wrapper} className="relative">
      <label className={cx(s.search, '!h-[38px]')}>
        <Search aria-hidden="true" />
        <input
          type="search"
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="לא חובה: שם או טלפון של לקוח, כדי שהבוט יכיר אותו"
          aria-label="איש קשר לשאלה"
        />
        {searching && <Spinner className="h-3.5 w-3.5" />}
      </label>
      {open && query.length >= 2 && (
        <div className={cx(s.pop, s.popDown, 'absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-y-auto')}>
          {results.length === 0 && !searching ? (
            <p className={cx(s.muted, 'm-0 p-3 text-[13px]')}>לא נמצא איש קשר.</p>
          ) : (
            <ul role="listbox" className="m-0 list-none p-1">
              {results.map((contact) => (
                <li key={contact.id} role="none">
                  <button
                    type="button"
                    role="option"
                    aria-selected={false}
                    onClick={() => {
                      onChange(contact);
                      setOpen(false);
                      setText('');
                    }}
                    className={cx(s.listRow, '!min-h-[38px]')}
                  >
                    <ContactAvatar contact={contact} size="sm" />
                    <span className={cx(s.t1, 'min-w-0 flex-1 truncate')} dir="auto">
                      {displayName(contact)}
                    </span>
                    <span className={cx(s.t2, s.num)}>{contact.phone_display}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** One question and its answer, newest at the top of the list. */
function AskedCard({ asked, onSave, onOpenItem, onAskAgain }: { asked: Asked; onSave: () => void; onOpenItem: (id: number) => void; onAskAgain: () => void }) {
  return (
    <article className={cx(s.card, 'flex flex-col gap-3')} aria-label={`שאלה: ${asked.body.question}`}>
      <div className={s.bubbleRow}>
        <div className={s.bubbleCol}>
          <div className={cx(s.bubble, s.bCustomer)}>
            <p className={s.bubbleMeta}>
              <span>{asked.contactName ? `כאילו כתב ${asked.contactName}` : 'לקוח'}</span>
              {asked.body.pretend_now && <span>· כאילו עכשיו {new Date(asked.body.pretend_now).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Jerusalem' })}</span>}
              {asked.body.last_outbound && <span>· אחרי: {asked.body.last_outbound}</span>}
            </p>
            <p className={s.bubbleText} dir="auto">
              {asked.body.question}
            </p>
          </div>
        </div>
      </div>
      <div className={cx(s.bubbleRow, s.bubbleRowOut)}>
        <div className={s.bubbleCol}>
          <ShadowBubble
            text={asked.answer.text}
            model={asked.answer.model}
            tookMs={asked.answer.took_ms}
            requestHuman={asked.answer.request_human}
            requestHumanReason={asked.answer.request_human_reason}
            heading="הבוט החדש היה עונה"
          />
        </div>
      </div>
      <ShadowWhy reasoning={asked.answer.reasoning} tools={asked.answer.tools_used} knowledge={asked.answer.knowledge_used} onOpenItem={onOpenItem} />
      <div className="flex flex-wrap items-center gap-2">
        {asked.saved ? (
          <span className={cx(s.pill, s.pGood)}>
            <Bookmark aria-hidden="true" />
            נשמר כבדיקה
          </span>
        ) : (
          <button type="button" onClick={onSave} disabled={asked.saving} className={cx(s.btn, s.btnSm)} title="השאלה נשמרת כבדיקה קבועה; השרת מריץ אותה שוב כדי לשמור">
            {asked.saving ? <Spinner className="h-3.5 w-3.5" /> : <Bookmark aria-hidden="true" />}
            שמור כבדיקה
          </button>
        )}
        <button type="button" onClick={onAskAgain} className={cx(s.btn, s.btnSm)}>
          שאל שוב
        </button>
      </div>
    </article>
  );
}

interface TryTabProps {
  status: WahubStatus | undefined;
  /** A question handed in from elsewhere (a fact just added), put into the box. */
  initialQuestion: string;
  onOpenItem: (id: number) => void;
}

/**
 * "נסה שאלה": write what a customer might write, say who and when to pretend,
 * and see what the new bot would answer right now, with why. Nothing is sent.
 */
export default function TryTab({ status, initialQuestion, onOpenItem }: TryTabProps) {
  const [question, setQuestion] = useState(initialQuestion);
  const [contact, setContact] = useState<WahubContact | null>(null);
  const [pretendNow, setPretendNow] = useState('');
  const [lastOutbound, setLastOutbound] = useState('');
  const [asking, setAsking] = useState(false);
  const [asked, setAsked] = useState<Asked[]>([]);

  useEffect(() => {
    if (initialQuestion) setQuestion(initialQuestion);
  }, [initialQuestion]);

  const ready = question.trim().length > 0 && !asking;

  async function ask(body?: WahubShadowTryBody, contactName?: string) {
    const request: WahubShadowTryBody = body ?? {
      question: question.trim(),
      contact_id: contact?.id ?? null,
      pretend_now: pretendNow ? new Date(pretendNow).toISOString() : null,
      last_outbound: lastOutbound.trim() || null,
    };
    if (!request.question) return;
    setAsking(true);
    try {
      const answer = await tryWahubShadow(request);
      setAsked((prev) => [
        { id: Date.now(), body: request, contactName: contactName ?? (contact ? displayName(contact) : ''), answer, saved: Boolean(answer.trial_question_id), saving: false },
        ...prev,
      ]);
    } catch (error) {
      toast.error(readableError(error, 'הבוט לא ענה'));
    } finally {
      setAsking(false);
    }
  }

  async function saveAsTest(entry: Asked) {
    setAsked((prev) => prev.map((item) => (item.id === entry.id ? { ...item, saving: true } : item)));
    try {
      const answer = await tryWahubShadow({ ...entry.body, save: true });
      setAsked((prev) => prev.map((item) => (item.id === entry.id ? { ...item, saving: false, saved: true, answer: answer.text ? answer : item.answer } : item)));
      toast.success('השאלה נשמרה כבדיקה');
    } catch (error) {
      setAsked((prev) => prev.map((item) => (item.id === entry.id ? { ...item, saving: false } : item)));
      toast.error(readableError(error, 'השאלה לא נשמרה'));
    }
  }

  return (
    <div className="flex flex-col gap-3.5">
      {status?.shadow_configured === false && (
        <p className={cx(s.strip, 'm-0')} role="status">
          <FlaskConical aria-hidden="true" />
          חסר מפתח למודל – התשובות כאן הן <strong className="font-extrabold">דמה</strong> עד שהמפתח יוגדר.
        </p>
      )}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (ready) void ask();
        }}
        className={cx(s.card, 'flex flex-col gap-3')}
        aria-label="נסה שאלה"
      >
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className={s.iconBox}>
            <FlaskConical className="h-[18px] w-[18px]" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-extrabold">נסה שאלה</h3>
            <p className={cx(s.t2, 'm-0 !text-[12.5px]')}>מה הבוט החדש היה עונה עכשיו. שום דבר לא נשלח ללקוח.</p>
          </div>
        </div>

        <textarea
          value={question}
          onChange={(event) => setQuestion(event.target.value)}
          rows={3}
          maxLength={4000}
          placeholder="מה הלקוח כותב? למשל: היי, כמה עולה קפוארה בראש העין לבן 5?"
          aria-label="השאלה"
          className={s.field}
          autoFocus
        />

        <div className={s.form}>
          <div className={cx(s.fieldLabel, s.full)}>
            איש קשר
            <ContactPicker value={contact} onChange={setContact} />
          </div>
          <label>
            העמד פנים שהתאריך והשעה הם (לא חובה)
            <input type="datetime-local" value={pretendNow} onChange={(event) => setPretendNow(event.target.value)} dir="ltr" />
          </label>
          <label>
            ההודעה האחרונה שיצאה ללקוח (לא חובה)
            <input type="text" value={lastOutbound} onChange={(event) => setLastOutbound(event.target.value)} maxLength={500} placeholder="למשל: תזכורת לשיעור ניסיון מחר ב-17:00" />
          </label>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button type="submit" disabled={!ready} className={cx(s.btn, s.btnP)}>
            {asking ? <Spinner /> : <Send className="-scale-x-100" aria-hidden="true" />}
            {asking ? 'הבוט חושב…' : 'מה הבוט היה עונה?'}
          </button>
          {(pretendNow || lastOutbound || contact) && (
            <button
              type="button"
              onClick={() => {
                setPretendNow('');
                setLastOutbound('');
                setContact(null);
              }}
              className={cx(s.btn, s.btnSm)}
            >
              נקה הקשר
            </button>
          )}
        </div>
      </form>

      {asked.map((entry) => (
        <AskedCard
          key={entry.id}
          asked={entry}
          onSave={() => void saveAsTest(entry)}
          onOpenItem={onOpenItem}
          onAskAgain={() => void ask(entry.body, entry.contactName)}
        />
      ))}
    </div>
  );
}
