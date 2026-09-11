/**
 * A signature as /api/v1/signatures/ keeps it: what was signed, by whom, when,
 * for which children, and what the signer ticked. Registration terms come from
 * the widget; rental contracts will join them under their own kind.
 */

export type SignatureKind = 'registration_terms' | 'rental_contract';

/**
 * What the signer ticked on the form. A key is left out when the document did
 * not ask it — a rental contract has no health declaration.
 */
export interface SignatureConsents {
  health?: boolean;
  terms?: boolean;
  computerized_documents?: boolean;
}

export interface SignatureChild {
  id: string;
  full_name: string;
}

/** One row of the list: GET /signatures/ — 50 a page, newest first. */
export interface SignatureSummary {
  id: string;
  /** Typed loosely too: a kind this build does not know still lists, under the server's label. */
  kind: SignatureKind | (string & {});
  /** The server's Hebrew name for the kind. */
  kind_label: string;
  /** ISO timestamp with its offset. */
  signed_at: string;
  signer_name: string;
  signer_id_number: string;
  family_id: string | null;
  family_name: string;
  /**
   * The business customer a rental contract was signed for — the tenant, who
   * stands where a family would on a registration. '' on every other kind.
   */
  business_customer_name: string;
  /** Every child the signature covered — one registration can cover several. */
  children: SignatureChild[];
  branch_name: string;
  document_title: string;
  /** The hash of the text as signed, so a later copy can be checked against it. */
  document_sha256: string;
  consents: SignatureConsents;
  pdf_url: string;
}

/** GET /signatures/{id}/ — the row plus the signed text, the image and where it came from. */
export interface SignatureDetail extends SignatureSummary {
  /** The text as signed, one plain-text paragraph each. Never HTML. */
  document_text: string[];
  /** A data URL of the drawn signature. */
  signature_image: string;
  ip_address: string | null;
  user_agent: string;
  /** What the signature is tied to on the server (registration, payment…). Shape is the server's. */
  refs: Record<string, unknown> | null;
}

/** A DRF page of the list. */
export interface SignaturesPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: SignatureSummary[];
}
