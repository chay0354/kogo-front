'use client';

import { useEffect, useRef, useState, type RefObject } from 'react';
import { AlertCircle, Bot, ChevronDown, FlaskConical, Image as ImageIcon, ImagePlus, Mic, Send, Sparkles, Trash2, X } from 'lucide-react';
import {
  DEMO_SENDERS,
  formatFileSize,
  formatRecordingClock,
  IMAGE_ACCEPT,
  imageFileProblem,
  recordingProblem,
  sendOnEnter,
  type DemoInput,
} from '@/lib/wahub/demo';
import type { WahubContact } from '@/types/wahub';
import { useVoiceRecorder, type Recording } from '../hooks/useVoiceRecorder';
import { Spinner } from '../shared/bits';
import { ThinkingDots } from '../shared/motion';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';

const MAX_LENGTH = 4096;
const CUSTOMER = DEMO_SENDERS[0];
const OLD_BOT = DEMO_SENDERS[1];

/** The new bot in this conversation: its switch, "ענה עכשיו", and what it is doing. */
export interface DemoReplyControls {
  /** "הבוט החדש עונה בשיחה" is on. */
  auto: boolean;
  /** The three seconds after the last message are running. */
  armed: boolean;
  /** The call is out: "הבוט כותב…". */
  inFlight: boolean;
  setAuto: (on: boolean) => void;
  replyNow: () => void;
}

interface DemoComposerProps {
  contact: WahubContact;
  /**
   * What was "sent": words, a recording, a picture. Resolves true when the
   * server kept it; the bubble is on screen before that, so the box never waits.
   */
  onSend: (input: DemoInput) => Promise<boolean>;
  reply: DemoReplyControls;
}

/**
 * The box a line is typed in, as in WhatsApp: Enter sends, Shift+Enter breaks
 * the line. It is never disabled and never loses the cursor, so several
 * messages can be fired one after the other.
 */
export function SendField({
  value,
  label,
  placeholder,
  fieldRef,
  onChange,
  onSend,
}: {
  value: string;
  label: string;
  placeholder: string;
  fieldRef?: RefObject<HTMLTextAreaElement>;
  onChange: (value: string) => void;
  onSend: () => void;
}) {
  return (
    <textarea
      ref={fieldRef}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => sendOnEnter(event, onSend)}
      rows={1}
      maxLength={MAX_LENGTH}
      dir="auto"
      enterKeyHint="send"
      placeholder={placeholder}
      aria-label={label}
      className={s.demoField}
    />
  );
}

/**
 * While the microphone is on: a red dot, the clock, drop it, or stop and send.
 * Until the browser has handed the microphone over (it may ask the person
 * first) nothing is being recorded, and the line says so instead of counting.
 */
export function RecordingLine({
  phase,
  elapsedMs,
  onCancel,
  onStop,
}: {
  phase: 'starting' | 'recording' | 'stopping';
  elapsedMs: number;
  onCancel: () => void;
  onStop: () => void;
}) {
  const live = phase === 'recording';
  return (
    <>
      <button type="button" onClick={onCancel} aria-label="בטל הקלטה" title="בטל הקלטה" className={cx(s.ib, s.ibBad)}>
        <Trash2 aria-hidden="true" />
      </button>
      <div className={s.recLine} role="status">
        {phase === 'starting' ? (
          <>
            <Spinner className="h-3.5 w-3.5" />
            <span>מחכה לאישור המיקרופון…</span>
          </>
        ) : (
          <>
            <i className={s.recDot} aria-hidden="true" />
            <span>{live ? 'מקליט…' : 'שולח…'}</span>
            <span dir="ltr" className={s.num}>
              {formatRecordingClock(elapsedMs)}
            </span>
          </>
        )}
      </div>
      <button
        type="button"
        onClick={onStop}
        disabled={!live}
        aria-label="עצור ושלח את ההקלטה"
        title="עצור ושלח"
        className={cx(s.btn, s.btnP, '!h-[38px]')}
      >
        {phase === 'stopping' ? <Spinner /> : <Send className="-scale-x-100" aria-hidden="true" />}
        <span className="hidden sm:inline">שלח</span>
      </button>
    </>
  );
}

/** The picture chosen, before it is sent: small, with its name, and a way to drop it. */
export function ImagePreview({
  name,
  size,
  url,
  onRemove,
}: {
  name: string;
  size: number;
  url: string;
  onRemove: () => void;
}) {
  return (
    <div className={s.imgPreview} role="group" aria-label="התמונה שנבחרה">
      {/* A format the browser cannot draw (heic, outside Safari) leaves the picture mark standing in its place. */}
      <span className={s.imgPreviewBox}>
        <ImageIcon aria-hidden="true" />
        <img
          src={url}
          alt=""
          onError={(event) => {
            event.currentTarget.style.display = 'none';
          }}
        />
      </span>
      <p className={cx(s.imgPreviewText, 'm-0')}>
        <strong dir="auto">{name || 'תמונה'}</strong>
        {formatFileSize(size)} · אפשר להוסיף כיתוב, ו-Enter שולח.
      </p>
      <button type="button" onClick={onRemove} aria-label="הסר את התמונה" title="הסר את התמונה" className={cx(s.ib, s.ibSm)}>
        <X aria-hidden="true" />
      </button>
    </div>
  );
}

/**
 * The new bot's line: the switch "הבוט החדש עונה בשיחה", "ענה עכשיו" — held
 * back while an answer is on its way, so the same burst is never answered
 * twice — and the way to the old bot's box.
 */
export function BotLine({
  reply,
  oldOpen,
  onToggleOld,
}: {
  reply: DemoReplyControls;
  oldOpen: boolean;
  onToggleOld: () => void;
}) {
  const state = reply.inFlight ? 'הבוט כותב…' : reply.armed ? 'עונה בעוד רגע…' : '';
  return (
    <div className={s.demoBotLine}>
      <button
        type="button"
        role="switch"
        aria-checked={reply.auto}
        onClick={() => reply.setAuto(!reply.auto)}
        className={s.switchRow}
      >
        <span className={s.switch} aria-hidden="true" />
        הבוט החדש עונה בשיחה
      </button>
      <button
        type="button"
        onClick={reply.replyNow}
        disabled={reply.inFlight}
        title={reply.inFlight ? 'הבוט כותב…' : 'הבוט החדש עונה עכשיו על מה שעוד לא נענה'}
        className={cx(s.btn, s.btnSm)}
      >
        {reply.inFlight ? <Spinner className="h-3.5 w-3.5" /> : <Sparkles aria-hidden="true" />}
        ענה עכשיו
      </button>
      {/* On a phone the "כותב…" bubble in the conversation says it; here there is room for the words too. */}
      <span role="status" className={cx(s.demoBotState, s.deskOnly)}>
        {/* The bot is seen thinking here too, beside the words. */}
        {reply.inFlight && <ThinkingDots />}
        {state}
      </span>
      <span className="flex-1" />
      {/* The keys, while the line has nothing else to say; a narrow box drops them (the placeholder says "Enter שולח"). */}
      {!state && <span className={cx(s.t2, s.composerHint, s.demoKeys)}>Enter שולח · Shift+Enter שורה חדשה</span>}
      <button
        type="button"
        onClick={onToggleOld}
        aria-expanded={oldOpen}
        aria-label={OLD_BOT.label}
        title={`${OLD_BOT.label} · ${OLD_BOT.hint}`}
        className={cx(s.btn, s.btnSm, s.demoToggle, oldOpen && s.btnOn)}
      >
        <span className={s.toolLabel}>{OLD_BOT.label}</span>
        <ChevronDown className={cx('transition-transform', oldOpen && 'rotate-180')} aria-hidden="true" />
      </button>
    </div>
  );
}

/** The box grows with what is typed, up to a few lines, and shrinks back once it is sent. */
function useGrowingField(field: RefObject<HTMLTextAreaElement>, value: string, shown: boolean) {
  useEffect(() => {
    const element = field.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${Math.min(element.scrollHeight, 140)}px`;
  }, [field, value, shown]);
}

interface ChosenImage {
  file: File;
  url: string;
}

/**
 * Under the writing box of a demo conversation: a real conversation, typed by
 * the owner as the customer. Words go on Enter, one after the other; the
 * microphone records a voice note and the picture button attaches a photo. The
 * new bot answers three seconds after the last of them, in the conversation
 * itself. Nothing goes to WhatsApp — it all lands in this conversation only.
 */
export default function DemoComposer({ contact, onSend, reply }: DemoComposerProps) {
  const [text, setText] = useState('');
  const [image, setImage] = useState<ChosenImage | null>(null);
  const [problem, setProblem] = useState('');
  const [oldText, setOldText] = useState('');
  const [oldOpen, setOldOpen] = useState(false);
  const field = useRef<HTMLTextAreaElement>(null);
  const oldField = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const onSendRef = useRef(onSend);
  onSendRef.current = onSend;
  const name = contact.name || contact.phone_display || contact.phone;

  function sendRecording(recording: Recording) {
    const why = recordingProblem(recording.blob);
    if (why) {
      setProblem(why);
      return;
    }
    void onSendRef.current({ kind: 'voice', file: recording.blob, mimeType: recording.mimeType, durationMs: recording.durationMs });
  }
  // A recording that reached its longest goes out as if the button were pressed.
  const recorder = useVoiceRecorder({ onLimit: sendRecording });
  const recording = recorder.state !== 'idle';
  const { cancel: cancelRecording } = recorder;

  // Each conversation starts with an empty box, no picture and the microphone off.
  useEffect(() => {
    setText('');
    setOldText('');
    setProblem('');
    setImage((held) => {
      if (held) URL.revokeObjectURL(held.url);
      return null;
    });
    cancelRecording();
  }, [contact.id, cancelRecording]);

  // Leaving the screen with a picture chosen: its address is let go.
  const heldImage = useRef<ChosenImage | null>(null);
  heldImage.current = image;
  useEffect(
    () => () => {
      if (heldImage.current) URL.revokeObjectURL(heldImage.current.url);
    },
    [],
  );

  useGrowingField(field, text, recording);
  useGrowingField(oldField, oldText, oldOpen);

  function dropImage() {
    setImage((held) => {
      if (held) URL.revokeObjectURL(held.url);
      return null;
    });
  }

  function sendCustomer() {
    setProblem('');
    if (image) {
      const sent = image;
      const caption = text;
      setImage(null);
      setText('');
      void onSend({ kind: 'image', file: sent.file, caption }).then((taken) => {
        if (taken) {
          URL.revokeObjectURL(sent.url);
          return;
        }
        // Not kept: the picture and its caption come back, unless something else was started meanwhile.
        setImage((held) => {
          if (held) URL.revokeObjectURL(sent.url);
          return held ?? sent;
        });
        setText((current) => current || caption);
      });
    } else {
      const body = text.trim();
      if (!body) return;
      setText('');
      void onSend({ kind: 'text', text: body, sender: 'customer' }).then((taken) => {
        // Not kept: the words go back into the box, unless something new was typed meanwhile.
        if (!taken) setText((current) => current || body);
      });
    }
    field.current?.focus();
  }

  function sendOldBot() {
    const body = oldText.trim();
    if (!body) return;
    setOldText('');
    void onSend({ kind: 'text', text: body, sender: 'bot' }).then((taken) => {
      if (!taken) setOldText((current) => current || body);
    });
  }

  function pickImage(files: FileList | null) {
    const file = files?.[0];
    if (!file) return;
    const why = imageFileProblem(file);
    if (why) {
      setProblem(why);
      return;
    }
    setProblem('');
    const url = URL.createObjectURL(file);
    setImage((held) => {
      if (held) URL.revokeObjectURL(held.url);
      return { file, url };
    });
    field.current?.focus();
  }

  async function startRecording() {
    setProblem('');
    await recorder.start();
  }

  async function stopRecording() {
    const made = await recorder.stop();
    if (made) sendRecording(made);
    field.current?.focus();
  }

  const said = problem || recorder.error;
  const canSend = Boolean(image) || Boolean(text.trim());

  return (
    <section className={s.demoBox} aria-label="הדמיה: שיחה עם לקוח דמו">
      <p className={cx(s.t1, s.demoTitle, 'm-0 flex min-w-0 flex-wrap items-center gap-1.5')}>
        <FlaskConical className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="truncate">הדמיה · {name} הוא לקוח דמו</span>
        <span className={cx(s.t2, 'font-medium')}>— מה שנכתב כאן נכנס לשיחה הזו בלבד; שום דבר לא נשלח בוואטסאפ.</span>
      </p>

      {said && (
        <p className={s.demoProblem} role="alert">
          <AlertCircle aria-hidden="true" />
          {said}
        </p>
      )}

      {image && !recording && <ImagePreview name={image.file.name} size={image.file.size} url={image.url} onRemove={dropImage} />}

      <div className={s.demoLine} role="group" aria-label={CUSTOMER.label}>
        {recording ? (
          <RecordingLine
            phase={recorder.state === 'idle' ? 'starting' : recorder.state}
            elapsedMs={recorder.elapsedMs}
            onCancel={recorder.cancel}
            onStop={() => void stopRecording()}
          />
        ) : (
          <>
            <button
              type="button"
              onClick={() => void startRecording()}
              disabled={!recorder.supported}
              aria-label="הקלט הודעה קולית"
              title={recorder.supported ? 'הקלט הודעה קולית' : 'הדפדפן הזה לא מקליט מכאן'}
              className={s.ib}
            >
              <Mic aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => picker.current?.click()}
              aria-label="צרף תמונה"
              title="צרף תמונה"
              className={s.ib}
            >
              <ImagePlus aria-hidden="true" />
            </button>
            <input
              ref={picker}
              type="file"
              accept={IMAGE_ACCEPT}
              hidden
              aria-hidden="true"
              tabIndex={-1}
              onChange={(event) => {
                pickImage(event.target.files);
                // The same picture can be chosen again right after.
                event.target.value = '';
              }}
            />
            <SendField
              value={text}
              label={CUSTOMER.label}
              placeholder={image ? 'כיתוב לתמונה (לא חובה)…' : 'כתבו כלקוח… Enter שולח'}
              fieldRef={field}
              onChange={setText}
              onSend={sendCustomer}
            />
            <button
              type="button"
              onClick={sendCustomer}
              disabled={!canSend}
              aria-label={CUSTOMER.button}
              title={CUSTOMER.button}
              className={cx(s.btn, s.btnP, '!h-[38px]')}
            >
              <Send className="-scale-x-100" aria-hidden="true" />
              <span className="hidden sm:inline">שלח</span>
            </button>
          </>
        )}
      </div>

      <BotLine reply={reply} oldOpen={oldOpen} onToggleOld={() => setOldOpen((value) => !value)} />

      {/* Folded, not removed: what was typed is still there when it is opened again. */}
      <form
        onSubmit={(event) => {
          event.preventDefault();
          sendOldBot();
        }}
        aria-label={OLD_BOT.label}
        className={oldOpen ? s.demoOld : 'hidden'}
      >
        <p className={s.demoLabel}>
          <Bot aria-hidden="true" />
          {OLD_BOT.label}
          <span className="font-medium">· {OLD_BOT.hint}</span>
        </p>
        <div className={s.demoOldLine}>
          <SendField
            value={oldText}
            label={OLD_BOT.label}
            placeholder="מה הבוט הישן היה עונה…"
            fieldRef={oldField}
            onChange={setOldText}
            onSend={sendOldBot}
          />
          <button type="submit" disabled={!oldText.trim()} className={cx(s.btn, '!h-[38px]')}>
            {OLD_BOT.button}
          </button>
        </div>
      </form>
    </section>
  );
}
