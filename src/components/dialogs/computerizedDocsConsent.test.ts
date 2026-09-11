/**
 * The family card's consent line (סעיף 18ב(ג)): what it says for a consent on
 * record, a withdrawn one and none, and how it reads the server's answer.
 */
import { describe, expect, it } from 'vitest';
import {
  computerizedDocsConsentLine,
  consentDay,
  consentSourceLabel,
  readComputerizedDocsConsent,
  type ComputerizedDocsConsent,
} from './computerizedDocsConsent';

function consent(overrides: Partial<ComputerizedDocsConsent> = {}): ComputerizedDocsConsent {
  return {
    computerized_docs_consent_at: null,
    computerized_docs_consent_source: null,
    computerized_docs_consent_revoked_at: null,
    accepts_computerized_documents: false,
    ...overrides,
  };
}

describe('computerizedDocsConsentLine', () => {
  const given = consent({
    computerized_docs_consent_at: '2026-09-11T10:15:00.123456+03:00',
    computerized_docs_consent_source: 'widget',
    accepts_computerized_documents: true,
  });

  it('says when and where a standing consent was given', () => {
    expect(computerizedDocsConsentLine(given)).toBe("אושר ב-11/09/2026 (וידג'ט)");
    expect(computerizedDocsConsentLine({ ...given, computerized_docs_consent_source: 'crm' }))
      .toBe('אושר ב-11/09/2026 (משרד)');
    expect(computerizedDocsConsentLine({ ...given, computerized_docs_consent_source: 'website' }))
      .toBe('אושר ב-11/09/2026 (אתר)');
  });

  it('says so when none was recorded', () => {
    expect(computerizedDocsConsentLine(consent())).toBe('לא נרשמה הסכמה');
  });

  it('tells a withdrawal apart from a consent never given', () => {
    expect(computerizedDocsConsentLine(consent({
      computerized_docs_consent_at: '2026-06-01T09:00:00+03:00',
      computerized_docs_consent_source: 'widget',
      computerized_docs_consent_revoked_at: '2026-09-02T12:00:00+03:00',
    }))).toBe('ההסכמה בוטלה ב-02/09/2026');
  });

  it('leaves out what it does not know rather than guess it', () => {
    expect(computerizedDocsConsentLine(consent({ accepts_computerized_documents: true }))).toBe('אושר');
  });
});

describe('consentDay', () => {
  it('reads the day off the server’s text, whatever the browser’s clock says', () => {
    expect(consentDay('2026-09-11T23:30:00+03:00')).toBe('11/09/2026');
    expect(consentDay('2026-01-05')).toBe('05/01/2026');
  });

  it('is empty without a date', () => {
    expect(consentDay(null)).toBe('');
    expect(consentDay('')).toBe('');
    expect(consentDay('not a date')).toBe('');
  });
});

describe('consentSourceLabel', () => {
  it('names the three sources, and passes an unknown one through', () => {
    expect(['widget', 'crm', 'website', 'fax'].map(consentSourceLabel)).toEqual(["וידג'ט", 'משרד', 'אתר', 'fax']);
    expect(consentSourceLabel(null)).toBe('');
  });
});

describe('readComputerizedDocsConsent', () => {
  it('takes the consent fields out of a family answer', () => {
    expect(readComputerizedDocsConsent({
      id: 'fam-1',
      name: 'כהן',
      computerized_docs_consent_at: '2026-09-11T10:15:00+03:00',
      computerized_docs_consent_source: 'crm',
      computerized_docs_consent_revoked_at: null,
      accepts_computerized_documents: true,
    })).toEqual(consent({
      computerized_docs_consent_at: '2026-09-11T10:15:00+03:00',
      computerized_docs_consent_source: 'crm',
      accepts_computerized_documents: true,
    }));
  });

  it('is null for an answer without them, so the card says nothing rather than "no consent"', () => {
    expect(readComputerizedDocsConsent({ id: 'fam-1', name: 'כהן' })).toBeNull();
    expect(readComputerizedDocsConsent(null)).toBeNull();
    expect(readComputerizedDocsConsent('oops')).toBeNull();
  });

  it('treats an empty source or date as none', () => {
    expect(readComputerizedDocsConsent({
      computerized_docs_consent_at: '',
      computerized_docs_consent_source: '',
      computerized_docs_consent_revoked_at: '',
      accepts_computerized_documents: false,
    })).toEqual(consent());
  });
});
