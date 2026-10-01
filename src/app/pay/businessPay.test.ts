import { describe, expect, it } from 'vitest';
import { businessPayDetails, businessSuccessLine, isBusinessChargeLink } from './businessPay';

describe('isBusinessChargeLink', () => {
  it('knows a business charge by its locked payer details (today\'s server)', () => {
    expect(isBusinessChargeLink({ payer_details_locked: true })).toBe(true);
  });

  it('knows it by its kind, once the server says it', () => {
    expect(isBusinessChargeLink({ payer_details_locked: false, kind: 'business_charge' })).toBe(true);
    expect(isBusinessChargeLink({ payer_details_locked: true, kind: 'business_charge' })).toBe(true);
  });

  it('leaves a general payment link alone', () => {
    expect(isBusinessChargeLink({ payer_details_locked: false })).toBe(false);
    expect(isBusinessChargeLink({ payer_details_locked: false, kind: 'general' })).toBe(false);
    expect(isBusinessChargeLink(null)).toBe(false);
    expect(isBusinessChargeLink(undefined)).toBe(false);
  });
});

describe('businessPayDetails', () => {
  it('shows what the payment is for once, though the server sends it three times', () => {
    const details = businessPayDetails({ title: 'תשלום עבור תרומה', description: 'תרומה' });
    expect(details).toEqual({ description: 'תרומה', customerLine: '', invoiceLine: '' });
  });

  it('falls back to the title when there is no description', () => {
    expect(businessPayDetails({ title: 'תשלום עבור תרומה', description: '  ' }).description).toBe('תשלום עבור תרומה');
  });

  it('works on a server that sends none of the new fields', () => {
    const details = businessPayDetails({ title: 'תשלום עבור ייעוץ', description: 'ייעוץ' });
    expect(details.customerLine).toBe('');
    expect(details.invoiceLine).toBe('');
  });

  it('names the customer and the invoice when the server sends them', () => {
    const details = businessPayDetails({
      title: 'תשלום עבור ייעוץ',
      description: 'ייעוץ',
      customer_name: ' אלפא בע״מ ',
      invoice_number: '1234',
    });
    expect(details.customerLine).toBe('עבור: אלפא בע״מ');
    expect(details.invoiceLine).toBe('חשבונית מס מספר 1234');
  });

  it('skips an empty customer name or invoice number', () => {
    const details = businessPayDetails({ title: 'x', description: 'ייעוץ', customer_name: '', invoice_number: '  ' });
    expect(details.customerLine).toBe('');
    expect(details.invoiceLine).toBe('');
  });

  it('does not name the invoice twice when the description already does', () => {
    const details = businessPayDetails({
      title: 'תשלום עבור חשבונית מס 1234',
      description: 'תשלום עבור חשבונית מס 1234',
      invoice_number: '1234',
    });
    expect(details.description).toBe('תשלום עבור חשבונית מס 1234');
    expect(details.invoiceLine).toBe('');
  });

  it('still names the invoice when the description only shares its digits', () => {
    expect(businessPayDetails({ title: 'x', description: 'תשלום עבור חשבונית מס 12345', invoice_number: '1234' }).invoiceLine)
      .toBe('חשבונית מס מספר 1234');
    expect(businessPayDetails({ title: 'x', description: '12 שעות ייעוץ', invoice_number: '12' }).invoiceLine)
      .toBe('חשבונית מס מספר 12');
  });
});

describe('businessSuccessLine', () => {
  it('promises the document by its number', () => {
    expect(businessSuccessLine('40012')).toBe('מסמך 40012 יישלח אליכם');
  });

  it('promises a confirmation when there is no number yet', () => {
    expect(businessSuccessLine('')).toBe('אישור התשלום יישלח אליכם');
    expect(businessSuccessLine(null)).toBe('אישור התשלום יישלח אליכם');
    expect(businessSuccessLine(undefined)).toBe('אישור התשלום יישלח אליכם');
  });

  it('never says "במערכת"', () => {
    expect(businessSuccessLine('40012')).not.toContain('במערכת');
    expect(businessSuccessLine('')).not.toContain('במערכת');
  });
});
