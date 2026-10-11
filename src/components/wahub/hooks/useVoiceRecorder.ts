'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { MAX_RECORDING_MS, pickRecordingMimeType } from '@/lib/wahub/demo';

export type RecorderState = 'idle' | 'starting' | 'recording' | 'stopping';

export interface Recording {
  blob: Blob;
  mimeType: string;
  durationMs: number;
}

interface Options {
  /** The recording stops by itself at this length, and is handed over as if the button were pressed. */
  maxMs?: number;
  onLimit?: (recording: Recording) => void;
}

const TICK_MS = 200;

function canRecord(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.mediaDevices?.getUserMedia)
  );
}

function permissionText(error: unknown): string {
  const name = (error as { name?: string } | null)?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'אין הרשאה למיקרופון. אפשרו אותה בדפדפן ונסו שוב.';
  if (name === 'NotFoundError') return 'לא נמצא מיקרופון.';
  return 'לא הצלחנו להתחיל הקלטה.';
}

/**
 * The microphone of the browser, as a WhatsApp voice note: press to start,
 * press again to stop and send. Chrome and Firefox record webm/ogg, Safari mp4;
 * the server takes all of them (docs/WAHUB-CONTRACT-REAL-DEMO.md, הבהרה 1).
 */
export function useVoiceRecorder({ maxMs = MAX_RECORDING_MS, onLimit }: Options = {}) {
  const [state, setState] = useState<RecorderState>('idle');
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState('');
  const [supported, setSupported] = useState(false);

  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const startedAt = useRef(0);
  const ticker = useRef<number | null>(null);
  const settle = useRef<((recording: Recording | null) => void) | null>(null);
  const discard = useRef(false);
  /** Goes up on every start and on every cancel, so a microphone that is granted too late is let go at once. */
  const attempt = useRef(0);
  const onLimitRef = useRef(onLimit);
  onLimitRef.current = onLimit;

  // Known only in a browser; the server render says nothing either way.
  useEffect(() => {
    setSupported(canRecord());
  }, []);

  const release = useCallback(() => {
    if (ticker.current !== null) window.clearInterval(ticker.current);
    ticker.current = null;
    stream.current?.getTracks().forEach((track) => track.stop());
    stream.current = null;
    recorder.current = null;
    chunks.current = [];
    setElapsedMs(0);
    setState('idle');
  }, []);

  const stop = useCallback((): Promise<Recording | null> => {
    const current = recorder.current;
    if (!current || current.state === 'inactive') return Promise.resolve(null);
    setState('stopping');
    return new Promise((resolve) => {
      settle.current = resolve;
      current.stop();
    });
  }, []);

  const start = useCallback(async (): Promise<boolean> => {
    if (!canRecord() || recorder.current) return false;
    setError('');
    setState('starting');
    const mine = (attempt.current += 1);
    let media: MediaStream;
    try {
      // The browser may ask the person first; until they answer, nothing is being recorded.
      media = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (failure) {
      if (mine !== attempt.current) return false;
      setError(permissionText(failure));
      setState('idle');
      return false;
    }
    if (mine !== attempt.current) {
      // Dropped while the browser was still asking: the microphone is not kept.
      media.getTracks().forEach((track) => track.stop());
      return false;
    }
    const mimeType = pickRecordingMimeType((type) => MediaRecorder.isTypeSupported(type));
    let instance: MediaRecorder;
    try {
      instance = mimeType ? new MediaRecorder(media, { mimeType }) : new MediaRecorder(media);
    } catch {
      media.getTracks().forEach((track) => track.stop());
      setError('הדפדפן לא תומך בהקלטה.');
      setState('idle');
      return false;
    }
    chunks.current = [];
    discard.current = false;
    instance.ondataavailable = (event: BlobEvent) => {
      if (event.data && event.data.size > 0) chunks.current.push(event.data);
    };
    instance.onstop = () => {
      const type = instance.mimeType || mimeType || chunks.current[0]?.type || 'audio/webm';
      const recording: Recording | null = discard.current
        ? null
        : { blob: new Blob(chunks.current, { type }), mimeType: type, durationMs: Date.now() - startedAt.current };
      const limitHit = !settle.current && recording;
      const done = settle.current;
      settle.current = null;
      release();
      if (done) done(recording);
      else if (limitHit) onLimitRef.current?.(recording);
    };
    instance.onerror = () => {
      setError('ההקלטה נקטעה.');
      discard.current = true;
      if (instance.state !== 'inactive') instance.stop();
    };
    recorder.current = instance;
    stream.current = media;
    startedAt.current = Date.now();
    instance.start(250);
    setElapsedMs(0);
    setState('recording');
    ticker.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAt.current;
      setElapsedMs(elapsed);
      // Long enough: stop by itself; onstop hands the recording to onLimit.
      if (elapsed >= maxMs && recorder.current && recorder.current.state === 'recording') {
        setState('stopping');
        recorder.current.stop();
      }
    }, TICK_MS);
    return true;
  }, [maxMs, release]);

  /** Drop what was recorded — or stop waiting for a microphone that was not granted yet. */
  const cancel = useCallback(() => {
    const current = recorder.current;
    if (!current) {
      attempt.current += 1;
      setState('idle');
      return;
    }
    discard.current = true;
    if (current.state !== 'inactive') current.stop();
    else release();
  }, [release]);

  // Leaving the screen mid-recording: the microphone is let go.
  useEffect(
    () => () => {
      discard.current = true;
      attempt.current += 1;
      const current = recorder.current;
      if (current && current.state !== 'inactive') current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
      if (ticker.current !== null) window.clearInterval(ticker.current);
    },
    [],
  );

  return { supported, state, elapsedMs, error, start, stop, cancel, clearError: () => setError('') };
}

export type VoiceRecorder = ReturnType<typeof useVoiceRecorder>;
