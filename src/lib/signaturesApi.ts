import api from './api';
import { saveBlob } from './documentsApi';
import type { SignatureDetail, SignaturesPage, SignatureSummary } from '@/types/signature';
import {
  readSignatureDetail,
  readSignaturesPage,
  signatureListParams,
  signaturePdfFilename,
  type SignatureListFilters,
} from './signatureUtils';

/**
 * Every signature kept on the server, 50 a page, newest first — for one
 * family (the customer card) or for all of them (the history page).
 */
export async function fetchSignatures(
  filters: SignatureListFilters = {},
  page = 1,
): Promise<SignaturesPage> {
  const res = await api.get('/signatures/', { params: signatureListParams(filters, page) });
  return readSignaturesPage(res.data);
}

/** One signature with the text as signed, the drawn image and where it was signed from. */
export async function fetchSignature(id: string): Promise<SignatureDetail> {
  const res = await api.get(`/signatures/${encodeURIComponent(id)}/`);
  return readSignatureDetail(res.data);
}

/**
 * The signed document as a PDF. Fetched as a blob rather than opened by URL:
 * the file sits behind the same token every other request carries, and a plain
 * window.open would arrive without it — as the invoices' downloads do.
 */
export async function downloadSignaturePdf(
  signature: Pick<SignatureSummary, 'id' | 'kind' | 'kind_label' | 'signer_name' | 'signed_at'>,
): Promise<void> {
  const res = await api.get(`/signatures/${encodeURIComponent(signature.id)}/pdf/`, {
    responseType: 'blob',
  });
  saveBlob(res.data, 'application/pdf', signaturePdfFilename(signature));
}
