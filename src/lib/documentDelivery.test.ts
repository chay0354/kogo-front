/**
 * The delivery chip beside each document on the child's and the business
 * customer's cards: what the server's delivery_status reads as, and what the
 * chip says for each way an original can go.
 */
import { describe, expect, it } from 'vitest';
import { deliveryChip, readDeliveryStatus, type DocumentDeliveryStatus } from './documentDelivery';

const base: DocumentDeliveryStatus = {
  delivery: 'email',
  delivery_reason: '',
  purpose: 'original',
  signed_at: '2026-09-20T07:00:00Z',
  sent_at: null,
  paper_original_printed_at: null,
};

describe('readDeliveryStatus', () => {
  it('reads a row as the server sends it', () => {
    expect(
      readDeliveryStatus({
        delivery: 'paper',
        delivery_reason: 'שולם במזומן',
        purpose: 'original',
        signed_at: '2026-09-20T07:00:00Z',
        sent_at: null,
        paper_original_printed_at: '2026-09-21T08:30:00Z',
      }),
    ).toEqual({
      delivery: 'paper',
      delivery_reason: 'שולם במזומן',
      purpose: 'original',
      signed_at: '2026-09-20T07:00:00Z',
      sent_at: null,
      paper_original_printed_at: '2026-09-21T08:30:00Z',
    });
  });

  it('is null when there is no stored original, or nothing readable', () => {
    expect(readDeliveryStatus(null)).toBeNull();
    expect(readDeliveryStatus(undefined)).toBeNull();
    expect(readDeliveryStatus('email')).toBeNull();
  });

  it('reads an unknown delivery as none and a missing purpose as an original', () => {
    const status = readDeliveryStatus({ delivery: 'pigeon' });
    expect(status?.delivery).toBe('none');
    expect(status?.purpose).toBe('original');
    expect(status?.delivery_reason).toBe('');
    expect(status?.sent_at).toBeNull();
  });

  it('reads an archive copy as one', () => {
    expect(readDeliveryStatus({ delivery: 'none', purpose: 'archive' })?.purpose).toBe('archive');
  });
});

describe('deliveryChip', () => {
  it('says nothing for a document with no stored original', () => {
    expect(deliveryChip(null)).toBeNull();
    expect(deliveryChip(undefined)).toBeNull();
  });

  it('a mailed original: נשלח במייל, with when on Israel time', () => {
    const chip = deliveryChip({ ...base, sent_at: '2026-09-20T07:05:00Z' });
    expect(chip).toEqual({ label: 'נשלח במייל', tone: 'done', note: '20.9.2026 10:05' });
  });

  it('a mail not sent yet waits, and says why', () => {
    const chip = deliveryChip({ ...base, delivery_reason: 'השליחה נכשלה, ננסה שוב' });
    expect(chip).toEqual({ label: 'ממתין לשליחה', tone: 'waiting', note: 'השליחה נכשלה, ננסה שוב' });
  });

  it('an original for hand delivery: למסירה ידנית until printed, then הודפס', () => {
    const paper = { ...base, delivery: 'paper' as const, delivery_reason: 'שולם במזומן' };
    expect(deliveryChip(paper)).toEqual({ label: 'למסירה ידנית', tone: 'waiting', note: 'שולם במזומן' });
    expect(deliveryChip({ ...paper, delivery_reason: '' })?.note).toBe('המקור טרם הודפס');
    expect(deliveryChip({ ...paper, paper_original_printed_at: '2026-09-21T08:30:00Z' })).toEqual({
      label: 'הודפס',
      tone: 'done',
      note: 'המקור הודפס ב-21.9.2026 11:30',
    });
  });

  it('a held original: ממתין, with the server\'s reason', () => {
    const held = { ...base, delivery: 'held' as const, delivery_reason: 'חסר מספר הקצאה' };
    expect(deliveryChip(held)).toEqual({ label: 'ממתין', tone: 'waiting', note: 'חסר מספר הקצאה' });
    expect(deliveryChip({ ...held, delivery_reason: '', signed_at: null })?.note).toBe('ממתין לחתימה');
    expect(deliveryChip({ ...held, delivery_reason: '' })?.note).toBe('ממתין להסכמה');
  });

  it('an archive copy is ארכיון whatever its delivery says', () => {
    expect(deliveryChip({ ...base, purpose: 'archive', delivery: 'none' })?.label).toBe('ארכיון');
    expect(deliveryChip({ ...base, purpose: 'archive', sent_at: '2026-09-20T07:05:00Z' })?.label).toBe('ארכיון');
  });

  it('an original that goes nowhere says so, quietly', () => {
    expect(deliveryChip({ ...base, delivery: 'none', delivery_reason: 'לקוח ללא מייל' })).toEqual({
      label: 'לא נשלח',
      tone: 'quiet',
      note: 'לקוח ללא מייל',
    });
  });
});
