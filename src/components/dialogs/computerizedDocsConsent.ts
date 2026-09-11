/**
 * A family's consent to receive tax documents by email — סעיף 18ב(ג) להוראות
 * ניהול פנקסי חשבונות — as the family card shows it. The server keeps the
 * record (the registration widget takes it, the office records or withdraws it
 * from the card); these rules only read it.
 */

/** The consent fields of a family, as /customers/families/ sends them. */
export interface ComputerizedDocsConsent {
  computerized_docs_consent_at: string | null;
  /** widget · crm · website */
  computerized_docs_consent_source: string | null;
  computerized_docs_consent_revoked_at: string | null;
  /** Consent given and not since withdrawn — the one field that decides. */
  accepts_computerized_documents: boolean;
}

const SOURCE_LABELS: Readonly<Record<string, string>> = {
  widget: "וידג'ט",
  crm: 'משרד',
  website: 'אתר',
};

/**
 * The consent fields out of a family answer, or null when it carries none (a
 * server without them) — the card then says nothing rather than "no consent".
 */
export function readComputerizedDocsConsent(data: unknown): ComputerizedDocsConsent | null {
  if (!data || typeof data !== 'object') return null;
  const row = data as Record<string, unknown>;
  if (typeof row.accepts_computerized_documents !== 'boolean') return null;
  const text = (value: unknown) => (typeof value === 'string' && value ? value : null);
  return {
    computerized_docs_consent_at: text(row.computerized_docs_consent_at),
    computerized_docs_consent_source: text(row.computerized_docs_consent_source),
    computerized_docs_consent_revoked_at: text(row.computerized_docs_consent_revoked_at),
    accepts_computerized_documents: row.accepts_computerized_documents,
  };
}

/** Where the consent was given, in the office's words. A source it does not know is shown as sent. */
export function consentSourceLabel(source: string | null | undefined): string {
  if (!source) return '';
  return SOURCE_LABELS[source] ?? source;
}

/**
 * DD/MM/YYYY of a timestamp from the server. The server writes Israel time, so
 * the day is read off the text rather than moved by the browser's clock.
 */
export function consentDay(iso: string | null | undefined): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso ?? ''));
  return match ? `${match[3]}/${match[2]}/${match[1]}` : '';
}

/** The card's line: אושר ב-DD/MM/YYYY (משרד), ההסכמה בוטלה ב-DD/MM/YYYY, or לא נרשמה הסכמה. */
export function computerizedDocsConsentLine(consent: ComputerizedDocsConsent): string {
  if (consent.accepts_computerized_documents) {
    const day = consentDay(consent.computerized_docs_consent_at);
    const source = consentSourceLabel(consent.computerized_docs_consent_source);
    return ['אושר', day && `ב-${day}`, source && `(${source})`].filter(Boolean).join(' ');
  }
  // A withdrawal is a fact of its own: the family said no, it was not simply never asked.
  const withdrawn = consent.computerized_docs_consent_at
    ? consentDay(consent.computerized_docs_consent_revoked_at)
    : '';
  return withdrawn ? `ההסכמה בוטלה ב-${withdrawn}` : 'לא נרשמה הסכמה';
}
