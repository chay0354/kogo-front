'use client';

import { memo, useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Check, ExternalLink, X } from 'lucide-react';
import { formatClock, messageTypeLabel } from '@/lib/wahub/format';
import { MEDIA_WORDS, type ExternalMediaKind } from '@/lib/wahub/media';
import { bubbleMedia, bubbleText, isNewBotMessage, MEDIA_PLACEHOLDER } from '@/lib/wahub/messages';
import type { WahubMessage } from '@/types/wahub';
import { useMessageMedia } from '../hooks/useWahubQueries';
import { useBubbleRefine } from '../refine/RefineRow';
import { Skeleton, Spinner } from '../shared/bits';
import { cx } from '../shared/tones';
import s from '../wahub.module.css';

/**
 * Whose bubble it is, in the section's colours: the customer on a plain
 * surface, the old bot in light lavender, the new bot in soft green, the office
 * in navy, and a system message or a template in gold. A message that did not
 * go out is red, whoever sent it.
 */
export function bubbleTone(message: WahubMessage): string {
  if (message.status === 'failed') return s.bFailed;
  if (message.sender === 'customer') return s.bCustomer;
  if (message.sender === 'system' || message.message_type === 'template') return s.bSystem;
  if (isNewBotMessage(message)) return s.bNewBot;
  if (message.sender === 'bot') return s.bBot;
  return s.bOffice;
}

export function senderLine(message: WahubMessage): string {
  if (message.sender === 'customer') return '';
  if (isNewBotMessage(message)) return 'בוט חדש';
  const label = message.sender_label || '';
  if (message.sender === 'office' && message.sender_name) return `${label || 'משרד'} · ${message.sender_name}`;
  return label;
}

/** The picture, large, over the whole window. A press anywhere, or Escape, closes it. */
function Lightbox({ url, onClose }: { url: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  if (typeof document === 'undefined') return null;
  // Outside the section's wrapper, so no variable of its reaches here: the colours are written plainly.
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label="תמונה בגדול" onClick={onClose} className={s.lightbox}>
      <button type="button" onClick={onClose} aria-label="סגור" className={s.lightboxClose}>
        <X aria-hidden="true" />
      </button>
      <img src={url} alt="תמונה מהלקוח" onClick={(event) => event.stopPropagation()} />
    </div>,
    document.body,
  );
}

/** "פתח את הקובץ" — the file in a tab of its own, for what the page cannot show. */
function FileLink({ url }: { url: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={s.mediaLink}>
      <ExternalLink aria-hidden="true" />
      פתח את הקובץ
    </a>
  );
}

function ImageThumb({ url }: { url: string }) {
  const [open, setOpen] = useState(false);
  const [broken, setBroken] = useState(false);
  // A format the browser cannot draw (heic, outside Safari): the word and the way to the file.
  if (broken) {
    return (
      <>
        <p className={s.bubbleText}>{MEDIA_WORDS.image}</p>
        <FileLink url={url} />
      </>
    );
  }
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="פתח את התמונה בגדול" className={s.mediaThumb}>
        <img src={url} alt="תמונה מהלקוח" loading="lazy" onError={() => setBroken(true)} className={s.mediaImg} />
      </button>
      {open && <Lightbox url={url} onClose={() => setOpen(false)} />}
    </>
  );
}

export type MediaState = 'loading' | 'ready' | 'error';

/**
 * A recording or a picture inside the bubble: the picture as a thumbnail that
 * opens large, the recording as a player with its transcript under it. Drawn
 * from the address once it is in hand; a grey shape of the same size until then,
 * so the conversation does not jump when it arrives.
 */
export function MediaView({
  kind,
  url,
  state,
  transcript,
  onRetry,
}: {
  kind: ExternalMediaKind;
  url: string | null;
  state: MediaState;
  transcript: string;
  onRetry?: () => void;
}) {
  let body: ReactNode;
  if (state === 'error' || (state === 'ready' && !url)) {
    body = (
      <p className={cx(s.mediaNote, 'flex flex-wrap items-center gap-1.5')}>
        <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        {MEDIA_WORDS[kind]} · לא הצלחנו לטעון את הקובץ
        {onRetry && (
          <button type="button" onClick={onRetry} className={s.mediaRetry}>
            נסו שוב
          </button>
        )}
      </p>
    );
  } else if (state === 'loading' || !url) {
    body = <Skeleton className={cx('block', kind === 'image' ? s.mediaImg : s.mediaAudio)} />;
  } else if (kind === 'image') {
    body = <ImageThumb url={url} />;
  } else if (kind === 'voice') {
    body = <audio controls preload="metadata" src={url} className={s.mediaAudio} aria-label="הודעה קולית" />;
  } else {
    body = (
      <>
        <p className={s.bubbleText}>{MEDIA_WORDS.video}</p>
        <FileLink url={url} />
      </>
    );
  }
  return (
    <div className={s.media}>
      {body}
      {kind === 'voice' && (
        <p className={s.transcript} dir="auto">
          {transcript ? (
            <>
              <strong>תמלול:</strong> {transcript}
            </>
          ) : (
            'הקלטה — לא תומללה'
          )}
        </p>
      )}
    </div>
  );
}

/** The file Kogo keeps for this message, by its short-lived address. */
function StoredMedia({ message, kind }: { message: WahubMessage; kind: 'voice' | 'image' }) {
  const media = useMessageMedia(message.id, true);
  const state: MediaState = media.isError ? 'error' : media.data ? 'ready' : 'loading';
  return (
    <MediaView
      kind={kind}
      url={media.data?.url ?? null}
      state={state}
      transcript={message.transcript ?? ''}
      onRetry={() => void media.refetch()}
    />
  );
}

/**
 * One bubble. The customer stands on one side; the bot, the office and the
 * system on the other, each in its own shade and with a small label saying who.
 * A recording plays inside it, a picture opens large; a file is named or
 * played, never printed as an address.
 */
const MessageBubble = memo(function MessageBubble({
  message,
  arrived,
  onRefine,
}: {
  message: WahubMessage;
  arrived: boolean;
  /** "דיוק" on this bubble alone: beside it on hover, and after a long press on a phone. */
  onRefine?: (id: number) => void;
}) {
  const mine = message.direction === 'out';
  const failed = message.status === 'failed';
  const sending = message.local_state === 'sending';
  const who = senderLine(message);
  const media = bubbleMedia(message);
  const text = bubbleText(message);
  // The player, the thumbnail and the placeholder already say what it is; the small label would say it twice.
  const typeLabel = media ? '' : messageTypeLabel(message.message_type);
  const newBot = isNewBotMessage(message);
  const simulated = message.status === 'simulated' && !newBot;
  const refine = useBubbleRefine(message.id, mine, onRefine);

  return (
    <div className={cx(s.bubbleRow, mine && s.bubbleRowOut, arrived && s.feedinUp, refine.rowClass)} {...refine.rowProps}>
      <div className={cx(s.bubbleCol, refine.colClass)}>
        <div className={cx(s.bubble, bubbleTone(message), sending && s.bSending)}>
          {(who || typeLabel || simulated) && (
            <p className={s.bubbleMeta}>
              {who && <span className={cx(newBot && s.newBotMark)}>{who}</span>}
              {typeLabel && (
                <span>
                  {who ? '· ' : ''}
                  {typeLabel}
                </span>
              )}
              {simulated && <span className={s.simMark}>הדמיה</span>}
            </p>
          )}
          {media?.source === 'stored' && <StoredMedia message={message} kind={media.kind} />}
          {media?.source === 'link' && (
            <MediaView kind={media.kind} url={media.url} state="ready" transcript={message.transcript ?? ''} />
          )}
          {media?.source === 'none' && <p className={s.bubbleText}>{MEDIA_PLACEHOLDER[media.kind]}</p>}
          {text && (
            <p className={s.bubbleText} dir="auto">
              {text}
            </p>
          )}
          {media?.source === 'none' && media.link && <FileLink url={media.link} />}
          <p className={cx(s.bubbleTime, mine && 'justify-end')}>
            {sending ? (
              <>
                <Spinner className="h-3 w-3" /> נשלח…
              </>
            ) : (
              <>
                {formatClock(message.sent_at)}
                {mine && message.status === 'sent' && <Check aria-label="נשלח" />}
              </>
            )}
          </p>
        </div>
        {failed && (
          <p className={s.failNote} role="alert">
            <AlertCircle aria-hidden="true" />
            לא נשלח{message.error ? ` – ${message.error}` : ''}
          </p>
        )}
        {refine.button}
      </div>
    </div>
  );
});

export default MessageBubble;

/** "הבוט כותב…" — three dots in the new bot's own bubble, at the end of the conversation while its answer is on its way. */
export function TypingBubble() {
  return (
    <div className={cx(s.bubbleRow, s.bubbleRowOut)} role="status" aria-label="הבוט החדש כותב">
      <div className={s.bubbleCol}>
        <div className={cx(s.bubble, s.bNewBot)}>
          <p className={s.bubbleMeta}>
            <span className={s.newBotMark}>בוט חדש</span>
            <span>· כותב…</span>
          </p>
          <p className={s.typing} aria-hidden="true">
            <i />
            <i />
            <i />
          </p>
        </div>
      </div>
    </div>
  );
}
