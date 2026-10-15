/**
 * The writing box's own rules (15.10.2026): which opener comes first, a ready-made reply out at once or into the
 * box, the quote of "השב", which files may be attached, and what ✓ says about its goodbye.
 */
import { describe, expect, it } from 'vitest';

import {
  ATTACH_ACCEPT,
  attachContentType,
  attachKind,
  attachProblem,
  closedNotice,
  officeMediaKind,
  openerOrder,
  openingOutcomeOf,
  pastedImage,
  quickReplyPlan,
  readAttachmentTicket,
  readGoodbye,
  replyExcerpt,
  splitQuote,
  unfilledPlaceholders,
  withReply,
} from './composer';

const MB = 1024 * 1024;

describe('the two openers', () => {
  it('somebody who never wrote is opened first; somebody who wrote and went quiet is continued first', () => {
    expect(openerOrder({ last_inbound_at: null, first_inbound_at: null }).map((o) => o.label)).toEqual(['פתיחת שיחה', 'המשך שיחה']);
    expect(openerOrder({ last_inbound_at: '2026-10-10T10:00:00+03:00', first_inbound_at: '2026-10-01T10:00:00+03:00' }).map((o) => o.label)).toEqual([
      'המשך שיחה',
      'פתיחת שיחה',
    ]);
    expect(openerOrder({ last_inbound_at: null, first_inbound_at: null }).map((o) => o.flowName)).toEqual(['open chat', 'chat continue']);
  });

  it('what is said under the buttons once the server took the press', () => {
    expect(openingOutcomeOf({ status: 'sent', error: '' })).toEqual({ ok: true, text: 'נשלח ✓' });
    expect(openingOutcomeOf({ status: 'simulated', error: '' }).text).toContain('הדמיה');
    expect(openingOutcomeOf({ status: 'failed', error: 'השליחה ללקוחות כבויה.' })).toEqual({ ok: false, text: 'לא נשלח: השליחה ללקוחות כבויה.' });
  });
});

describe('a ready-made reply', () => {
  it('goes out at once with the first name in it', () => {
    expect(quickReplyPlan('היי {{first_name}}, תודה שפניתם', 'דנה כהן')).toEqual({ kind: 'send', text: 'היי דנה, תודה שפניתם' });
    expect(quickReplyPlan('  היי {{first_name}}  ', '')).toEqual({ kind: 'send', text: 'היי' });
  });

  it('one with something still to fill in by hand goes into the box, saying what', () => {
    const plan = quickReplyPlan('היי, {{first_name}},\nברכת יום ההולדת שלך מחכה לך:\n{{video_url}}', 'נועה');
    expect(plan.kind).toBe('edit');
    expect(plan.text).toBe('היי, נועה,\nברכת יום ההולדת שלך מחכה לך:\n{{video_url}}');
    expect(plan.kind === 'edit' && plan.hint).toBe('צריך להשלים {{video_url}} לפני השליחה');
  });

  it('every {{…}} left, each once', () => {
    expect(unfilledPlaceholders('{{a}} ו-{{ b }} ושוב {{a}}')).toEqual(['{{a}}', '{{ b }}']);
    expect(unfilledPlaceholders('בלי משתנים')).toEqual([]);
  });
});

describe('"השב" to one message', () => {
  it('quotes the first line of the message, up to 120 characters', () => {
    expect(replyExcerpt({ text: 'כמה עולה?\nויש מקום?', message_type: 'text', media_url: null })).toBe('כמה עולה?');
    const long = 'א'.repeat(130);
    const excerpt = replyExcerpt({ text: long, message_type: 'text', media_url: null });
    expect(excerpt.length).toBe(120);
    expect(excerpt.endsWith('…')).toBe(true);
  });

  it('a reply quotes the answer itself, not the quote it answered', () => {
    expect(replyExcerpt({ text: '> כמה עולה?\n\n260 ₪ לחודש', message_type: 'text', media_url: null })).toBe('260 ₪ לחודש');
  });

  it('a file with no words is named', () => {
    expect(replyExcerpt({ text: '', message_type: 'image', media_url: 'demo/1/a.jpg' })).toBe('🖼️ תמונה');
    expect(replyExcerpt({ text: '', message_type: 'other', media_url: 'office/1/a.pdf' })).toBe('📎 קובץ');
    expect(replyExcerpt({ text: '', message_type: 'voice', media_url: null })).toBe('🎤 הודעה קולית');
  });

  it('is sent as "> quote", a blank line, and the words — as WhatsApp shows a quote', () => {
    expect(withReply('כמה עולה?', '260 ₪ לחודש')).toBe('> כמה עולה?\n\n260 ₪ לחודש');
    expect(withReply('', 'שלום')).toBe('שלום');
    expect(withReply(null, 'שלום')).toBe('שלום');
  });

  it('a bubble finds the quote at its head again, and only there', () => {
    expect(splitQuote('> כמה עולה?\n\n260 ₪ לחודש')).toEqual({ quote: 'כמה עולה?', body: '260 ₪ לחודש' });
    expect(splitQuote('> שורה אחת\n> ושנייה\nהתשובה')).toEqual({ quote: 'שורה אחת\nושנייה', body: 'התשובה' });
    expect(splitQuote('התשובה\n> לא ציטוט')).toBeNull();
    expect(splitQuote('>לא ציטוט')).toBeNull();
    expect(splitQuote('')).toBeNull();
    expect(splitQuote('> רק ציטוט')).toEqual({ quote: 'רק ציטוט', body: '' });
  });
});

describe('a file the office attaches', () => {
  it('takes pictures, videos and documents, by the name first and the type second', () => {
    expect(attachKind({ name: 'a.JPG', type: '' })).toBe('image');
    expect(attachKind({ name: 'a.webp', type: 'image/webp' })).toBe('image');
    expect(attachKind({ name: 'clip.mp4', type: 'video/mp4' })).toBe('video');
    expect(attachKind({ name: 'clip.3gp', type: '' })).toBe('video');
    expect(attachKind({ name: 'טופס.pdf', type: 'application/pdf' })).toBe('file');
    expect(attachKind({ name: 'a.docx', type: '' })).toBe('file');
    expect(attachKind({ name: 'a.xls', type: '' })).toBe('file');
    expect(attachKind({ name: 'blob', type: 'image/png' })).toBe('image');
    expect(attachKind({ name: 'a.heic', type: 'image/heic' })).toBeNull();
    expect(attachKind({ name: 'a.exe', type: 'application/octet-stream' })).toBeNull();
    expect(attachKind({ name: 'a.mov', type: 'video/quicktime' })).toBeNull();
  });

  it('each kind up to its own size', () => {
    expect(attachProblem({ name: 'a.jpg', type: 'image/jpeg', size: 5 * MB })).toBe('');
    expect(attachProblem({ name: 'a.jpg', type: 'image/jpeg', size: 5 * MB + 1 })).toBe('הקובץ גדול מדי. תמונה עד 5MB.');
    expect(attachProblem({ name: 'a.mp4', type: 'video/mp4', size: 16 * MB })).toBe('');
    expect(attachProblem({ name: 'a.mp4', type: 'video/mp4', size: 16 * MB + 1 })).toBe('הקובץ גדול מדי. סרטון עד 16MB.');
    expect(attachProblem({ name: 'a.pdf', type: 'application/pdf', size: 25 * MB })).toBe('');
    expect(attachProblem({ name: 'a.pdf', type: 'application/pdf', size: 25 * MB + 1 })).toBe('הקובץ גדול מדי. מסמך עד 25MB.');
    expect(attachProblem({ name: 'a.pdf', type: 'application/pdf', size: 0 })).toBe('הקובץ ריק.');
    expect(attachProblem({ name: 'a.zip', type: 'application/zip', size: 10 })).toContain('אפשר לשלוח תמונה');
  });

  it('the picker offers exactly those', () => {
    for (const piece of ['image/jpeg', '.png', '.webp', 'video/mp4', '.3gp', 'application/pdf', '.docx', '.xlsx']) {
      expect(ATTACH_ACCEPT.split(',')).toContain(piece);
    }
    expect(ATTACH_ACCEPT).not.toContain('heic');
  });

  it('a file with no type of its own is declared by its kind', () => {
    expect(attachContentType({ name: 'a.docx', type: '' })).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(attachContentType({ name: 'a.3gp', type: '' })).toBe('video/3gpp');
    expect(attachContentType({ name: 'a.png', type: 'image/png' })).toBe('image/png');
  });

  it('a screenshot on the clipboard is a picture, given a name; pasted words are not', () => {
    const shot = new File([new Uint8Array([1, 2, 3])], '', { type: 'image/png' });
    const items = [{ kind: 'file', type: 'image/png', getAsFile: () => shot }];
    const pasted = pastedImage({ items } as unknown as DataTransfer);
    expect(pasted?.name).toBe('צילום מסך.png');
    expect(pasted?.type).toBe('image/png');
    const named = new File([new Uint8Array([1])], 'photo.jpg', { type: 'image/jpeg' });
    expect(pastedImage({ items: [{ kind: 'file', type: 'image/jpeg', getAsFile: () => named }] } as unknown as DataTransfer)).toBe(named);
    expect(pastedImage({ items: [{ kind: 'string', type: 'text/plain', getAsFile: () => null }] } as unknown as DataTransfer)).toBeNull();
    expect(pastedImage(null)).toBeNull();
  });

  it('a file the office sent is known again by the path Kogo keeps it under', () => {
    expect(officeMediaKind('office/12/0b5a8f3e-1c2d-4e5f-8a9b-0c1d2e3f4a5b.mp4')).toBe('video');
    expect(officeMediaKind('office/12/0b5a8f3e.pdf')).toBe('file');
    expect(officeMediaKind('office/12/0b5a8f3e.jpg')).toBe('image');
    expect(officeMediaKind('demo/12/0b5a8f3e.mp4')).toBeNull();
    expect(officeMediaKind('https://example.com/office/12/a.pdf')).toBeNull();
    expect(officeMediaKind(null)).toBeNull();
  });

  it('the upload ticket is read strictly: an https address and a kind it knows', () => {
    const ticket = { path: 'office/12/a.jpg', kind: 'image', content_type: 'image/jpeg', upload_url: 'https://x.supabase.co/storage/v1/object/upload/sign/wahub-media/office/12/a.jpg?token=t' };
    expect(readAttachmentTicket(ticket)).toEqual(ticket);
    expect(readAttachmentTicket({ ...ticket, upload_url: 'http://x/y' })).toBeNull();
    expect(readAttachmentTicket({ ...ticket, kind: 'voice' })).toBeNull();
    expect(readAttachmentTicket(null)).toBeNull();
  });
});

describe('✓ — the goodbye', () => {
  it('is read off the close\'s answer, and is null on a server that sends none', () => {
    expect(readGoodbye({ id: 1, goodbye: 'sent', goodbye_reason: '' })).toEqual({ status: 'sent', reason: '' });
    expect(readGoodbye({ goodbye: 'failed', goodbye_reason: ' ManyChat דחה ' })).toEqual({ status: 'failed', reason: 'ManyChat דחה' });
    expect(readGoodbye({ id: 1 })).toBeNull();
    expect(readGoodbye({ goodbye: 'maybe' })).toBeNull();
  });

  it('says what became of it in the word that floats up', () => {
    expect(closedNotice({ status: 'sent', reason: '' })).toEqual({ tone: 'success', title: 'השיחה נסגרה ונשלחה הודעת סגירה' });
    expect(closedNotice({ status: 'failed', reason: 'אין חיבור ל-ManyChat. הפעולה לא בוצעה.' })).toEqual({
      tone: 'warning',
      title: 'השיחה נסגרה. הודעת הסגירה לא נשלחה: אין חיבור ל-ManyChat. הפעולה לא בוצעה.',
    });
    expect(closedNotice({ status: 'skipped', reason: 'השליחה ללקוחות כבויה.' })).toEqual({
      tone: 'success',
      title: 'השיחה נסגרה',
      description: 'הודעת סגירה לא נשלחה: השליחה ללקוחות כבויה.',
    });
    expect(closedNotice({ status: 'skipped', reason: '' })).toEqual({ tone: 'success', title: 'השיחה נסגרה' });
    expect(closedNotice(null)).toEqual({ tone: 'success', title: 'השיחה נסגרה' });
  });
});
