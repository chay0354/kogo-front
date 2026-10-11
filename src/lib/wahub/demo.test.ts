import { describe, expect, test, vi } from 'vitest';

import {
  buildSimulateRequest,
  composerKeyAction,
  formatFileSize,
  formatRecordingClock,
  imageFileProblem,
  isDemoContact,
  isDemoPhone,
  MAX_RECORDING_MS,
  newContactBody,
  pickRecordingMimeType,
  recordingFileName,
  recordingProblem,
  sendOnEnter,
  simulateInboundBody,
  suggestDemoPhone,
} from './demo';
import { makeContact } from './testFixtures';

describe('demo contacts', () => {
  test('are known by the flag, or by the source when the flag is missing', () => {
    expect(isDemoContact(makeContact(1, { is_demo: true }))).toBe(true);
    expect(isDemoContact(makeContact(1, { source: 'demo', source_label: 'דמו' }))).toBe(true);
    expect(isDemoContact(makeContact(1))).toBe(false);
    expect(isDemoContact(null)).toBe(false);
  });

  test('a free 050-555 number is suggested, skipping the ones already taken however they are written', () => {
    expect(suggestDemoPhone()).toBe('050-5550001');
    expect(suggestDemoPhone(['050-5550001', '972505550002', '0505550003', '050-1234567'])).toBe('050-5550004');
    expect(suggestDemoPhone(['972505550001'])).toBe('050-5550002');
  });

  test('a demo phone is told from a real one', () => {
    expect(isDemoPhone('050-5550012')).toBe(true);
    expect(isDemoPhone('972505550012')).toBe(true);
    expect(isDemoPhone('050-1234567')).toBe(false);
    expect(isDemoPhone('0505551')).toBe(false);
  });

  test('a simulated message carries its text and who "sent" it; an empty one is refused', () => {
    expect(simulateInboundBody('  היי, יש ניסיון?  ', 'customer')).toEqual({ text: 'היי, יש ניסיון?', sender: 'customer' });
    expect(simulateInboundBody('בטח!', 'bot')).toEqual({ text: 'בטח!', sender: 'bot' });
    expect(simulateInboundBody('   ', 'customer')).toBeNull();
  });

  test('a new contact is written with is_demo only when asked, and the note only when there is one', () => {
    expect(newContactBody({ phone: ' 050-5550001 ', name: ' הדס ', note: ' ' })).toEqual({ phone: '050-5550001', name: 'הדס' });
    expect(newContactBody({ phone: '050-5550001', name: 'הדס', note: 'בדיקה', isDemo: true })).toEqual({
      phone: '050-5550001',
      name: 'הדס',
      note: 'בדיקה',
      is_demo: true,
    });
    expect(newContactBody({ phone: '050-1234567', name: 'דנה', isDemo: false })).not.toHaveProperty('is_demo');
  });
});

describe('the customer\'s box, as in WhatsApp', () => {
  const key = (over: Partial<{ key: string; shiftKey: boolean; isComposing: boolean }> = {}) => {
    const preventDefault = vi.fn();
    return {
      event: { key: over.key ?? 'Enter', shiftKey: over.shiftKey ?? false, nativeEvent: { isComposing: over.isComposing ?? false }, preventDefault },
      preventDefault,
    };
  };

  test('Enter sends, and the line break is swallowed', () => {
    const send = vi.fn();
    const { event, preventDefault } = key();
    expect(sendOnEnter(event, send)).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  test('Shift+Enter breaks the line: nothing is sent and the key is left to the box', () => {
    const send = vi.fn();
    const { event, preventDefault } = key({ shiftKey: true });
    expect(sendOnEnter(event, send)).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(preventDefault).not.toHaveBeenCalled();
  });

  test('a key of an input method that is still composing, and any other key, send nothing', () => {
    const send = vi.fn();
    expect(sendOnEnter(key({ isComposing: true }).event, send)).toBe(false);
    expect(sendOnEnter(key({ key: 'a' }).event, send)).toBe(false);
    expect(send).not.toHaveBeenCalled();
    expect(composerKeyAction({ key: 'Enter', shiftKey: false })).toBe('send');
    expect(composerKeyAction({ key: 'Enter', shiftKey: true })).toBeNull();
  });

  test('three Enters in a row are three sends', () => {
    const send = vi.fn();
    for (let i = 0; i < 3; i += 1) sendOnEnter(key().event, send);
    expect(send).toHaveBeenCalledTimes(3);
  });
});

describe('what goes to simulate-inbound', () => {
  test('words go as JSON, with who "sent" them', () => {
    expect(buildSimulateRequest({ kind: 'text', text: ' היי ', sender: 'customer' })).toEqual({ json: { text: 'היי', sender: 'customer' } });
    expect(buildSimulateRequest({ kind: 'text', text: '  ', sender: 'customer' })).toBeNull();
  });

  test('a recording goes as multipart: message_type voice, the file under a name the server can read, always the customer\'s', () => {
    const blob = new Blob(['abc'], { type: 'audio/webm;codecs=opus' });
    const request = buildSimulateRequest({ kind: 'voice', file: blob, mimeType: 'audio/webm;codecs=opus', durationMs: 4200 });
    expect(request && 'form' in request).toBe(true);
    const form = (request as { form: FormData }).form;
    expect(form.get('message_type')).toBe('voice');
    expect(form.get('sender')).toBe('customer');
    expect(form.get('text')).toBeNull();
    const file = form.get('file') as File;
    expect(file.name).toBe('recording.webm');
    expect(file.size).toBe(3);
  });

  test('a picture goes as multipart: message_type image, the file under its own name, the caption as text', () => {
    const file = new File(['abcd'], 'IMG_0012.HEIC', { type: 'image/heic' });
    const form = (buildSimulateRequest({ kind: 'image', file, caption: ' זה המקום? ' }) as { form: FormData }).form;
    expect(form.get('message_type')).toBe('image');
    expect(form.get('text')).toBe('זה המקום?');
    expect((form.get('file') as File).name).toBe('IMG_0012.HEIC');
    // No caption: no text field at all.
    const bare = (buildSimulateRequest({ kind: 'image', file, caption: '  ' }) as { form: FormData }).form;
    expect(bare.get('text')).toBeNull();
  });

  test('an empty file is nothing to send', () => {
    expect(buildSimulateRequest({ kind: 'voice', file: new Blob([]), mimeType: 'audio/webm', durationMs: 0 })).toBeNull();
  });

  test('the recording\'s name follows what the browser recorded: webm, ogg, and m4a from Safari\'s mp4', () => {
    expect(recordingFileName('audio/webm;codecs=opus')).toBe('recording.webm');
    expect(recordingFileName('audio/ogg; codecs=opus')).toBe('recording.ogg');
    expect(recordingFileName('audio/mp4')).toBe('recording.m4a');
    expect(recordingFileName('')).toBe('recording.webm');
  });

  test('the browser records in the first format it knows; Safari, which knows mp4 only, gets mp4', () => {
    expect(pickRecordingMimeType(() => true)).toBe('audio/webm;codecs=opus');
    expect(pickRecordingMimeType((type) => type === 'audio/mp4')).toBe('audio/mp4');
    expect(pickRecordingMimeType((type) => type.startsWith('audio/ogg'))).toBe('audio/ogg;codecs=opus');
    expect(pickRecordingMimeType(() => false)).toBeNull();
  });

  test('a picture is checked before it leaves: its kind, and the server\'s 5MB', () => {
    expect(imageFileProblem({ name: 'a.jpg', type: 'image/jpeg', size: 1000 })).toBe('');
    expect(imageFileProblem({ name: 'IMG.HEIC', type: '', size: 1000 })).toBe('');
    expect(imageFileProblem({ name: 'a.pdf', type: 'application/pdf', size: 1000 })).toContain('תמונה בלבד');
    expect(imageFileProblem({ name: 'a.png', type: 'image/png', size: 6 * 1024 * 1024 })).toContain('5MB');
    expect(imageFileProblem({ name: 'a.png', type: 'image/png', size: 0 })).toContain('ריק');
  });

  test('a recording is checked too: not empty, and within the server\'s 10MB', () => {
    expect(recordingProblem({ size: 5000 })).toBe('');
    expect(recordingProblem({ size: 0 })).toContain('ריקה');
    expect(recordingProblem({ size: 11 * 1024 * 1024 })).toContain('10MB');
  });

  test('the clock beside the red dot, and the size beside a picture', () => {
    expect(formatRecordingClock(0)).toBe('0:00');
    expect(formatRecordingClock(7400)).toBe('0:07');
    expect(formatRecordingClock(65_000)).toBe('1:05');
    expect(MAX_RECORDING_MS).toBe(300_000);
    expect(formatFileSize(320 * 1024)).toBe('320KB');
    expect(formatFileSize(1.4 * 1024 * 1024)).toBe('1.4MB');
  });
});
