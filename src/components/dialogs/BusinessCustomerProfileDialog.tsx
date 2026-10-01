'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Building2, CalendarDays, Download, FileText, History, Loader2, RefreshCw } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogCloseButton } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/components/AuthProvider';
import BusinessDocsConsentField from '@/components/dialogs/BusinessDocsConsentField';
import DeliveryChip from '@/components/dialogs/DeliveryChip';
import DocumentDetailButton from '@/components/dialogs/DocumentDetailButton';
import { computerizedDocsConsentLine } from '@/components/dialogs/computerizedDocsConsent';
import LegacyDocumentsTable from '@/components/LegacyHistory/LegacyDocumentsTable';
import legacyStyles from '@/components/LegacyHistory/LegacyHistory.module.css';
import { slotSummary, sortSlots } from '@/app/(crm)/rentals/tenancyUtils';
import { downloadDocumentPdf } from '@/lib/documentsApi';
import { formatLegacyDate, lastNumbersByType } from '@/lib/legacyImportApi';
import {
  apiDownloadPath,
  countWord,
  fetchBusinessCustomerSummary,
  formatCardAmount,
  formatCardDate,
  type BusinessCustomerBalance,
  type BusinessCustomerDocument,
  type BusinessCustomerDraft,
  type BusinessCustomerSummary,
  type BusinessCustomerTenancy,
} from '@/lib/businessCustomerApi';

interface BusinessCustomerProfileDialogProps {
  /** The business customer to show; null keeps the dialog closed. */
  customerId: string | null;
  isOpen: boolean;
  onClose: () => void;
  /** Shown in the title until the card loads — the name the opening row already knows. */
  fallbackName?: string;
}

type LoadStatus = 'loading' | 'ready' | 'error' | 'missing';

/** A row of the details box: the label, and the value or a dash. */
function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="text-muted-foreground text-sm shrink-0">{label}</span>
      <span className="font-medium text-left break-words" dir="auto">{value || '-'}</span>
    </div>
  );
}

function SectionTitle({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <h4 className="font-semibold text-lg flex items-center gap-2">
      {icon}
      {children}
    </h4>
  );
}

/** One tenancy: its status, where, what it costs each month, and its slots in the week's order. */
function TenancyBox({ tenancy }: { tenancy: BusinessCustomerTenancy }) {
  const running = tenancy.status === 'active';
  const dates = [formatCardDate(tenancy.start_date), formatCardDate(tenancy.end_date)].filter(Boolean).join(' – ');
  return (
    <div className="bg-muted/50 rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <span className="font-medium">{tenancy.branch_name || 'ללא סניף'}</span>
        <Badge variant={running ? 'default' : 'outline'}>{tenancy.status_label}</Badge>
      </div>
      <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
        <span>
          <span dir="ltr">{formatCardAmount(tenancy.monthly_total)}</span> לחודש כולל מע&quot;מ
        </span>
        {tenancy.billing_day && <span>חיוב ב־{tenancy.billing_day} לחודש</span>}
        {dates && <span>{dates}</span>}
      </div>
      {tenancy.slots.length > 0 ? (
        <ul className="text-sm space-y-0.5">
          {sortSlots(tenancy.slots).map((slot) => (
            <li key={slot.id} className={slot.is_active === false ? 'text-muted-foreground line-through' : ''}>
              {slotSummary(slot)}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">לא שויכו חדרים</p>
      )}
    </div>
  );
}

function Kpi({ label, value, negative = false }: { label: string; value: string; negative?: boolean }) {
  return (
    <div className="rounded-lg border p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`mt-1 text-lg font-semibold tabular-nums ${negative ? 'text-rose-700' : ''}`} dir="ltr">
        {value}
      </div>
    </div>
  );
}

function DownloadButton({
  label,
  busy,
  onClick,
}: {
  label: string;
  busy: boolean;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className={busy ? 'cursor-progress' : ''}
      onClick={onClick}
      aria-busy={busy || undefined}
      title={`הורדת העתק של ${label}`}
    >
      {busy ? (
        <Loader2 className="h-3 w-3 ml-1 animate-spin" aria-hidden="true" />
      ) : (
        <Download className="h-3 w-3 ml-1" aria-hidden="true" />
      )}
      הורדה
      <span className="sr-only"> {label}</span>
    </Button>
  );
}

function DocumentsTable({
  documents,
  downloadingIds,
  onDownload,
}: {
  documents: readonly BusinessCustomerDocument[];
  downloadingIds: readonly string[];
  onDownload: (doc: { id: string; document_number: string; download_url: string }) => void;
}) {
  if (documents.length === 0) {
    return (
      <div className="border rounded-lg px-4 py-8 text-center text-muted-foreground">
        לא הופקו מסמכים ללקוח זה בקוגו
      </div>
    );
  }
  return (
    <div className="border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">מסמכים שהופקו ללקוח, מהחדש לישן</caption>
        <thead className="bg-muted/50">
          <tr>
            <th scope="col" className="p-3 text-right font-medium">תאריך</th>
            <th scope="col" className="p-3 text-right font-medium">מספר</th>
            <th scope="col" className="p-3 text-right font-medium">סוג</th>
            <th scope="col" className="p-3 text-right font-medium">תיאור</th>
            <th scope="col" className="p-3 text-right font-medium">סכום</th>
            <th scope="col" className="p-3 text-right font-medium">מסירה</th>
            <th scope="col" className="p-3">
              <span className="sr-only">הורדה</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {documents.map((doc) => (
            <tr key={doc.id} className="border-t align-top">
              <td className="px-3 py-2 whitespace-nowrap tabular-nums text-muted-foreground">
                {formatCardDate(doc.date) || '-'}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                <span dir="ltr" className="font-mono text-[13px]">{doc.document_number || '-'}</span>
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                <span
                  className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                    doc.is_credit ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  {doc.document_type_label || 'מסמך'}
                </span>
                {doc.is_rental && <div className="mt-0.5 text-xs text-muted-foreground">קבלת שכירות</div>}
              </td>
              <td className="px-3 py-2 min-w-[10rem] break-words">
                {doc.description || '-'}
                {doc.is_credit && doc.linked_document_number && (
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    זיכוי ל־<span dir="ltr">{doc.linked_document_number}</span>
                  </div>
                )}
              </td>
              <td className={`px-3 py-2 whitespace-nowrap font-medium tabular-nums ${doc.is_credit ? 'text-rose-700' : ''}`}>
                <span dir="ltr">{formatCardAmount(doc.total, doc.is_credit)}</span>
              </td>
              <td className="px-3 py-2">
                <DeliveryChip status={doc.delivery_status} />
              </td>
              <td className="px-3 py-2">
                {apiDownloadPath(doc.download_url) ? (
                  <DownloadButton
                    label={`${doc.document_type_label} ${doc.document_number}`}
                    busy={downloadingIds.includes(doc.id)}
                    onClick={() => onDownload(doc)}
                  />
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DraftsTable({
  drafts,
  downloadingIds,
  onDownload,
}: {
  drafts: readonly BusinessCustomerDraft[];
  downloadingIds: readonly string[];
  onDownload: (doc: { id: string; document_number: string; download_url: string }) => void;
}) {
  return (
    <div className="border border-dashed rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">טיוטות שטרם אושרו</caption>
        <thead className="bg-muted/30">
          <tr>
            <th scope="col" className="p-3 text-right font-medium">תאריך</th>
            <th scope="col" className="p-3 text-right font-medium">טיוטה</th>
            <th scope="col" className="p-3 text-right font-medium">תהיה</th>
            <th scope="col" className="p-3 text-right font-medium">תיאור</th>
            <th scope="col" className="p-3 text-right font-medium">סכום</th>
            <th scope="col" className="p-3">
              <span className="sr-only">הורדה</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {drafts.map((draft) => (
            <tr key={draft.id} className="border-t">
              <td className="px-3 py-2 whitespace-nowrap tabular-nums text-muted-foreground">
                {formatCardDate(draft.date) || '-'}
              </td>
              <td className="px-3 py-2 whitespace-nowrap">
                <span dir="ltr" className="font-mono text-[13px]">{draft.document_number || '-'}</span>
              </td>
              <td className="px-3 py-2 whitespace-nowrap">{draft.target_type_label || '-'}</td>
              <td className="px-3 py-2 min-w-[10rem] break-words">{draft.description || '-'}</td>
              <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                <span dir="ltr">{formatCardAmount(draft.total)}</span>
              </td>
              <td className="px-3 py-2">
                {apiDownloadPath(draft.download_url) ? (
                  <DownloadButton
                    label={`טיוטה ${draft.document_number}`}
                    busy={downloadingIds.includes(draft.id)}
                    onClick={() => onDownload(draft)}
                  />
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * What the customer still owes (WS-3): the sum, and each invoice still open —
 * its number opens the document's detail (what paid it, what credited it).
 */
function OpenInvoicesTable({
  balance,
  onChanged,
}: {
  balance: BusinessCustomerBalance;
  onChanged: () => void;
}) {
  if (balance.open_invoices.length === 0) {
    return (
      <div className="border rounded-lg px-4 py-6 text-center text-muted-foreground text-sm">
        אין חשבוניות פתוחות — כל החשבוניות שולמו או זוכו
      </div>
    );
  }
  return (
    <div className="border rounded-lg overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">חשבוניות פתוחות, מהישנה לחדשה</caption>
        <thead className="bg-muted/50">
          <tr>
            <th scope="col" className="p-3 text-right font-medium">חשבונית</th>
            <th scope="col" className="p-3 text-right font-medium">תאריך</th>
            <th scope="col" className="p-3 text-right font-medium">סה״כ</th>
            <th scope="col" className="p-3 text-right font-medium">שולם / זוכה</th>
            <th scope="col" className="p-3 text-right font-medium">פתוח</th>
          </tr>
        </thead>
        <tbody>
          {balance.open_invoices.map((invoice) => (
            <tr key={invoice.id} className="border-t align-top">
              <td className="px-3 py-2 whitespace-nowrap">
                <DocumentDetailButton
                  documentId={invoice.id}
                  number={invoice.document_number}
                  className="font-mono text-[13px] underline decoration-dotted underline-offset-4 hover:decoration-solid"
                  onChanged={onChanged}
                />
                <div className="text-xs text-muted-foreground">
                  {invoice.document_type_label}
                  {invoice.status === 'partial' ? ` · ${invoice.status_label}` : ''}
                </div>
              </td>
              <td className="px-3 py-2 whitespace-nowrap tabular-nums text-muted-foreground">
                {formatCardDate(invoice.document_date) || '-'}
                {invoice.due_date && <div className="text-xs">לתשלום עד {formatCardDate(invoice.due_date)}</div>}
              </td>
              <td className="px-3 py-2 whitespace-nowrap tabular-nums">
                <span dir="ltr">{formatCardAmount(invoice.total)}</span>
              </td>
              <td className="px-3 py-2 whitespace-nowrap tabular-nums text-muted-foreground">
                <span dir="ltr">{formatCardAmount(invoice.paid)}</span>
                {invoice.credited > 0 && (
                  <div className="text-xs">
                    זוכה <span dir="ltr">{formatCardAmount(invoice.credited)}</span>
                  </div>
                )}
              </td>
              <td className="px-3 py-2 whitespace-nowrap font-semibold tabular-nums text-rose-700">
                <span dir="ltr">{formatCardAmount(invoice.open)}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * כרטיס לקוח עסקי — a merchant's or a studio tenant's card: who they are,
 * their consent to computerized documents, the tenancies they hold, every
 * document kogo issued to them with how its signed original reached them,
 * drafts apart, and (for managers) what the previous software issued them.
 *
 * Read only apart from the consent box, which is the same one the document
 * wizard and the tenancy dialog show. A download is the office copy: the
 * original is the signed file in the archive.
 */
export default function BusinessCustomerProfileDialog({
  customerId,
  isOpen,
  onClose,
  fallbackName = '',
}: BusinessCustomerProfileDialogProps) {
  const { user } = useAuth();
  const isManager = user?.role === 'manager';
  const [status, setStatus] = useState<LoadStatus>('loading');
  const [summary, setSummary] = useState<BusinessCustomerSummary | null>(null);
  const request = useRef(0);
  const [downloadingIds, setDownloadingIds] = useState<string[]>([]);
  const downloadsInFlight = useRef(new Set<string>());

  // A response that lands after the card moved to another customer is dropped,
  // so one customer's documents never reach another's card.
  const load = async (id: string) => {
    const mine = ++request.current;
    setStatus('loading');
    try {
      const data = await fetchBusinessCustomerSummary(id);
      if (mine !== request.current) return;
      setSummary(data);
      setStatus('ready');
    } catch (error) {
      if (mine !== request.current) return;
      const code = (error as { response?: { status?: number } } | null)?.response?.status;
      setSummary(null);
      setStatus(code === 404 ? 'missing' : 'error');
    }
  };

  useEffect(() => {
    if (!isOpen || !customerId) {
      request.current += 1;
      return;
    }
    setSummary(null);
    void load(customerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, customerId]);

  const handleDownload = async (doc: { id: string; document_number: string; download_url: string }) => {
    if (downloadsInFlight.current.has(doc.id)) return;
    downloadsInFlight.current.add(doc.id);
    setDownloadingIds((ids) => [...ids, doc.id]);
    try {
      await downloadDocumentPdf(doc.id, doc.document_number || 'מסמך');
    } catch {
      alert('שגיאה בהורדת המסמך');
    } finally {
      downloadsInFlight.current.delete(doc.id);
      setDownloadingIds((ids) => ids.filter((item) => item !== doc.id));
    }
  };

  const customer = summary?.customer;
  const title = customer?.full_name || fallbackName || 'לקוח עסקי';
  const legacy = summary?.legacy ?? null;
  const documents = summary?.documents ?? [];
  const drafts = summary?.drafts ?? [];
  const totals = summary?.totals;
  const balance = summary?.balance ?? null;
  const lastNumbers = legacy ? lastNumbersByType(legacy.results) : [];

  return (
    <Dialog open={isOpen} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <Tabs defaultValue="details">
          <div className="sticky top-0 bg-white z-10 border-b">
            <div className="flex items-start justify-between px-6 pt-6 pb-4">
              <DialogHeader>
                <DialogTitle className="flex flex-wrap items-center gap-2 text-xl">
                  <Building2 className="h-5 w-5" aria-hidden="true" />
                  {title}
                  {summary?.is_tenant && <Badge variant="secondary">שוכר/ת</Badge>}
                  {customer?.branch_name && <Badge variant="outline">{customer.branch_name}</Badge>}
                </DialogTitle>
                <DialogDescription>כרטיס לקוח עסקי — פרטים, מסמכים ומסירה</DialogDescription>
              </DialogHeader>
              <DialogCloseButton />
            </div>
            <div className="px-6 pb-4">
              <TabsList className={`grid w-full ${legacy ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <TabsTrigger value="details">
                  <Building2 className="h-4 w-4" />
                  פרטים
                </TabsTrigger>
                <TabsTrigger value="documents">
                  <FileText className="h-4 w-4" />
                  מסמכים
                  {status === 'ready' && documents.length > 0 && (
                    <span className="tabular-nums text-muted-foreground">({documents.length})</span>
                  )}
                </TabsTrigger>
                {legacy && (
                  <TabsTrigger value="history">
                    <History className="h-4 w-4" />
                    תוכנה קודמת
                    {legacy.count > 0 && <span className="tabular-nums text-muted-foreground">({legacy.count})</span>}
                  </TabsTrigger>
                )}
              </TabsList>
            </div>
          </div>

          {status === 'loading' && (
            <div className="px-6 py-6 space-y-3" aria-busy="true">
              <span className="sr-only">טוען את כרטיס הלקוח</span>
              <Skeleton className="h-6 w-48" />
              <Skeleton className="h-32 w-full" />
              <Skeleton className="h-32 w-full" />
            </div>
          )}

          {(status === 'error' || status === 'missing') && (
            <div className="px-6 py-10 text-center" role="alert">
              <p className="text-sm text-muted-foreground">
                {status === 'missing' ? 'הלקוח לא נמצא, או שאין הרשאה לצפות בו' : 'לא ניתן היה לטעון את כרטיס הלקוח'}
              </p>
              {status === 'error' && customerId && (
                <Button type="button" size="sm" variant="outline" className="mt-3" onClick={() => void load(customerId)}>
                  <RefreshCw className="h-3 w-3 ml-1" aria-hidden="true" />
                  נסה שוב
                </Button>
              )}
            </div>
          )}

          {status === 'ready' && summary && customer && totals && (
            <>
              <TabsContent value="details" className="pt-6 px-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 px-6 pb-6">
                  <div className="space-y-6">
                    <div>
                      <SectionTitle icon={<Building2 className="h-5 w-5 text-primary" />}>פרטי הלקוח</SectionTitle>
                      <div className="bg-muted/50 rounded-lg p-4 space-y-3 mt-3">
                        <DetailRow label="שם" value={customer.full_name} />
                        <DetailRow label="ח.פ / ע.מ" value={customer.company_number} />
                        <DetailRow label="ת.ז" value={customer.id_number} />
                        <DetailRow label="טלפון" value={customer.phone} />
                        <DetailRow label="אימייל" value={customer.email} />
                        <DetailRow label="כתובת" value={customer.address} />
                        <DetailRow
                          label="עסק"
                          value={[customer.business_name, customer.business_category_name].filter(Boolean).join(' · ')}
                        />
                        <DetailRow label="סניף" value={customer.branch_name} />
                        {customer.notes && <DetailRow label="הערות" value={customer.notes} />}
                      </div>
                    </div>

                    <div>
                      <SectionTitle icon={<FileText className="h-5 w-5 text-primary" />}>מסמכים ממוחשבים</SectionTitle>
                      <div className="bg-muted/50 rounded-lg p-4 mt-3 text-sm">
                        {isManager ? (
                          <BusinessDocsConsentField
                            customerId={customer.id}
                            classNames={{
                              row: 'space-y-1',
                              label: 'flex items-center gap-2 font-medium',
                              note: 'text-muted-foreground',
                              error: 'text-rose-700',
                            }}
                          />
                        ) : (
                          <p>
                            {summary.consent ? computerizedDocsConsentLine(summary.consent) : 'לא ידוע'}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div>
                      <SectionTitle icon={<FileText className="h-5 w-5 text-primary" />}>סיכום מסמכים</SectionTitle>
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <Kpi label="מסמכים שהופקו" value={totals.documents_count.toLocaleString('he-IL')} />
                        <Kpi label="חויב (חשבוניות מס)" value={formatCardAmount(totals.invoiced)} />
                        <Kpi label="התקבל (קבלות)" value={formatCardAmount(totals.received)} />
                        <Kpi label="זיכויים" value={formatCardAmount(totals.credited, totals.credited > 0)} negative={totals.credited > 0} />
                        {balance && (
                          <Kpi
                            label={balance.open_count > 0
                              ? `יתרה פתוחה · ${countWord(balance.open_count, 'חשבונית אחת', 'חשבוניות')}`
                              : 'יתרה פתוחה'}
                            value={formatCardAmount(balance.open_total)}
                            negative={balance.open_total > 0}
                          />
                        )}
                      </div>
                      <p className="mt-2 text-xs text-muted-foreground">
                        {balance
                          ? 'יתרה: סה״כ החשבוניות פחות הקבלות ששילמו אותן והזיכויים שנרשמו עליהן.'
                          : 'יתרה פתוחה תוצג כאן כשקבלות יקושרו לחשבוניות.'}
                        {totals.drafts_count > 0 && ` · ${countWord(totals.drafts_count, 'טיוטה אחת', 'טיוטות')} שטרם אושרו`}
                      </p>
                    </div>


                    {summary.is_tenant && (
                      <div>
                        <SectionTitle icon={<CalendarDays className="h-5 w-5 text-primary" />}>שכירות</SectionTitle>
                        <div className="space-y-3 mt-3">
                          {summary.tenancies.map((tenancy) => (
                            <TenancyBox key={tenancy.id} tenancy={tenancy} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
                {/* Full width: the open invoices need their five columns. */}
                {balance && (
                  <div className="px-6 pb-6">
                    <SectionTitle icon={<FileText className="h-5 w-5 text-primary" />}>חשבוניות פתוחות</SectionTitle>
                    <div className="mt-3">
                      <OpenInvoicesTable
                        balance={balance}
                        onChanged={() => {
                          if (customerId) void load(customerId);
                        }}
                      />
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="documents" className="pt-6 px-6 pb-6 space-y-6">
                <div>
                  <div className="flex items-baseline justify-between gap-3 mb-1">
                    <h3 className="font-semibold text-lg">מסמכים</h3>
                    {documents.length > 0 && (
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {countWord(documents.length, 'מסמך אחד', 'מסמכים')}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mb-3">
                    חשבוניות, קבלות, קבלות שכירות וזיכויים, מהחדש לישן. ההורדה היא העתק; המקור החתום שמור בארכיון.
                  </p>
                  <DocumentsTable documents={documents} downloadingIds={downloadingIds} onDownload={handleDownload} />
                </div>

                {drafts.length > 0 && (
                  <div>
                    <div className="flex items-baseline justify-between gap-3 mb-1">
                      <h3 className="font-semibold text-lg">טיוטות</h3>
                      <span className="text-sm text-muted-foreground tabular-nums">
                        {countWord(drafts.length, 'טיוטה אחת', 'טיוטות')}
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mb-3">
                      טרם אושרו — אין להן מספר מסמך ואינן נספרות בסיכומים.
                    </p>
                    <DraftsTable drafts={drafts} downloadingIds={downloadingIds} onDownload={handleDownload} />
                  </div>
                )}
              </TabsContent>

              {legacy && (
                <TabsContent value="history" className="pt-6 px-6 pb-6">
                  {legacy.count === 0 ? (
                    <div className="border rounded-lg px-4 py-8 text-center text-muted-foreground">
                      אין מסמכים מהתוכנה הקודמת ללקוח זה
                    </div>
                  ) : (
                    <section className={legacyStyles.panel} aria-label="היסטוריה מהתוכנה הקודמת">
                      <div className={legacyStyles.title}>
                        <History size={14} aria-hidden="true" />
                        {countWord(legacy.count, 'מסמך אחד', 'מסמכים')} מהתוכנה הקודמת
                        <span className={legacyStyles.origin}>לא הופק בקוגו</span>
                      </div>
                      <div className={legacyStyles.lastNumbers}>
                        {lastNumbers.map((entry) => (
                          <span key={entry.doc_type}>
                            {entry.label}: אחרון <strong>{entry.number}</strong> מ-{formatLegacyDate(entry.date)}
                          </span>
                        ))}
                      </div>
                      <div className="mt-2 overflow-x-auto">
                        <LegacyDocumentsTable documents={legacy.results} />
                      </div>
                      {legacy.truncated && (
                        <p className={legacyStyles.note}>
                          מוצגים {legacy.results.length} האחרונים מתוך {legacy.count}.
                        </p>
                      )}
                    </section>
                  )}
                </TabsContent>
              )}
            </>
          )}
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
