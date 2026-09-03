'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { FileText, Search, DollarSign, Clock, TrendingUp, Wallet, AlertCircle, Plus, Bell, Repeat, Download, Banknote } from 'lucide-react';
import FilterBar, { FILTER_ALL } from '@/components/FilterBar';
import ChecksTab from './ChecksTab';
import NewDocumentDialog from '@/components/dialogs/NewDocumentDialog';
import RefundDialog from '@/components/dialogs/RefundDialog';
import { GroupIdBadge } from '@/components/GroupIdBadge/GroupIdBadge';
import { TableSkeleton } from '@/components/ui/skeleton';
import { fetchAllInvoices, downloadStoreInvoicePdf } from '@/lib/storeApi';
import { sendDocumentReminder, fetchTranzilaDocuments, fetchPaymentLedger, PAYMENTS_PAGE_SIZE, downloadPeriodReport, finalizeDraft, downloadDocumentPdf } from '@/lib/documentsApi';
import api from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { filterBranchesForUser, unwrapApiList } from '@/lib/scopedFilters';
import type { StoreInvoice } from '@/types/store';
import type { Branch } from '@/types/branch';
import type { ChildWithDetails } from '@/types/customer';
import type { RecurringPayment } from '@/types/payment';
import type { ActiveTab, DocumentRow, PaymentRecord } from './types';
import { CHARGE_KIND_OPTIONS } from './constants';
import {
  getLedgerDocType,
  getStatusLabel,
  getStatusClass,
  getPaymentStatusLabel,
  getPaymentStatusClass,
  formatAmount,
  formatDate,
  getCurrentMonthTotal,
  getOpenInvoices,
  getOpenBalance,
  getDaysOverdue,
  getOverdueLabel,
  getAgingBuckets,
  getRecurringStatusLabel,
  getRecurringStatusClass,
  paymentToLedgerRow,
  storeInvoiceToLedgerRow,
  localISODate,
  daysAgoLocalISO,
} from './utils';
import styles from './invoices.module.css';

// The type dropdown holds the label the table filters on; the report
// endpoint filters on the model's code, so the label is mapped before it is sent.
type ReportGroupBy = 'branch' | 'business' | 'business_unit' | 'business_category';

const DOC_TYPE_CODES: Record<string, string> = {
  'חשבונית מס': 'tax_invoice',
  'קבלה': 'receipt',
  'חשבונית מס/קבלה': 'combined',
  'חשבונית עסקה': 'transaction_invoice',
  'חשבונית מס זיכוי': 'credit_invoice',
};

export default function InvoicesPage() {
  const { user } = useAuth();
  // סליקת אשראי is a manager-only screen, so a partner is not shown a tab that
  // the shell would only bounce them off.
  const isManager = user?.role === 'manager';
  const [activeTab, setActiveTab] = useState<ActiveTab>('מסמכים');
  // The period report follows whatever range and type the tab is already
  // showing, so the sheet a manager downloads is the sheet they were looking at.
  const [reportGroupBy, setReportGroupBy] = useState<ReportGroupBy>('branch');
  const [reportBusy, setReportBusy] = useState(false);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [isNewDocOpen, setIsNewDocOpen] = useState(false);
  const [reminderStatus, setReminderStatus] = useState<Record<string, 'sending' | 'sent' | 'error'>>({});
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [primaryFilter, setPrimaryFilter] = useState(FILTER_ALL);

  // Documents tab state — Tranzila tax documents + local invoices from those charges
  const [documents, setDocuments] = useState<DocumentRow[]>([]);
  const [documentsError, setDocumentsError] = useState('');
  const [invoices, setInvoices] = useState<StoreInvoice[]>([]);
  const [invoicesLoaded, setInvoicesLoaded] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [dateFrom, setDateFrom] = useState(() => daysAgoLocalISO(90));
  const [dateTo, setDateTo] = useState(() => localISODate());

  // Payments tab state — CRM charges (signup + standing order) and store invoices
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [paymentsError, setPaymentsError] = useState('');
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentPage, setPaymentPage] = useState(1);
  const [paymentTotalCount, setPaymentTotalCount] = useState(0);
  const [paymentMonthTotal, setPaymentMonthTotal] = useState(0);
  const [paymentPendingCount, setPaymentPendingCount] = useState(0);
  const [paymentKindFilter, setPaymentKindFilter] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState('');
  const [paymentSearch, setPaymentSearch] = useState('');
  const [refundTarget, setRefundTarget] = useState<PaymentRecord | null>(null);
  const [refundLoading, setRefundLoading] = useState(false);

  // Collection tab state
  const [collectionCustomerFilter, setCollectionCustomerFilter] = useState('');

  // Recurring payments tab state
  const [recurringPayments, setRecurringPayments] = useState<RecurringPayment[]>([]);
  const [recurringLoading, setRecurringLoading] = useState(false);
  const [recurringLoaded, setRecurringLoaded] = useState(false);
  const [recurringStatusFilter, setRecurringStatusFilter] = useState('');
  const [recurringBranchFilter, setRecurringBranchFilter] = useState('');
  const [recurringSearch, setRecurringSearch] = useState('');
  const [recurringActionId, setRecurringActionId] = useState<string | null>(null);
  const [editingRecurring, setEditingRecurring] = useState<RecurringPayment | null>(null);
  const [editAmountValue, setEditAmountValue] = useState('');
  const [editAmountError, setEditAmountError] = useState('');

  const { data: childrenData } = useQuery({
    queryKey: ['children'],
    // The endpoint paginates at 20. Reading only the first page meant the
    // collection view silently ignored every child past the twentieth — the
    // ones most likely to be owed for, since they were enrolled last.
    queryFn: async () => {
      const all: any[] = [];
      for (let page = 1; page <= 50; page += 1) {
        const r = await api.get(`/customers/children/?page=${page}`);
        if (Array.isArray(r.data)) { all.push(...r.data); break; }
        all.push(...(r.data?.results ?? []));
        if (!r.data?.next) break;
      }
      return all;
    },
    staleTime: 5 * 60 * 1000,
    enabled: activeTab === 'גבייה',
  });

  useEffect(() => {
    loadInvoiceData();
  }, []);

  function documentDateRange() {
    return {
      start_date: dateFrom || daysAgoLocalISO(90),
      end_date: dateTo || localISODate(),
    };
  }

  async function loadStoreInvoices() {
    if (invoicesLoaded) return;
    try {
      const invoicesData = await fetchAllInvoices();
      setInvoices(Array.isArray(invoicesData) ? invoicesData : []);
    } catch (error) {
      console.error('Error loading store invoices:', error);
      setInvoices([]);
    } finally {
      setInvoicesLoaded(true);
    }
  }

  async function loadInvoiceData() {
    setIsLoading(true);
    setDocumentsError('');
    const range = documentDateRange();
    try {
      const [ledger, branchesResponse] = await Promise.all([
        fetchTranzilaDocuments({ ...range, local_only: '1' }),
        api.get('/core/branches/'),
      ]);
      setDocuments(Array.isArray(ledger.documents) ? ledger.documents : []);
      if (ledger.error && (!ledger.documents || ledger.documents.length === 0)) {
        setDocumentsError('לא ניתן לטעון מסמכים מטרנזילה כרגע.');
      }
      const branchList = branchesResponse.data?.results ?? branchesResponse.data;
      setBranches(
        filterBranchesForUser(
          unwrapApiList<Branch>(branchList),
          user,
        ),
      );
    } catch (error) {
      console.error('Error loading invoices:', error);
      setDocuments([]);
      setBranches([]);
      setDocumentsError('שגיאה בטעינת המסמכים');
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab !== 'תשלומים') {
      return;
    }
    if (paymentKindFilter === 'store') {
      setPaymentsLoading(false);
      void loadStoreInvoices();
      return;
    }
    let cancelled = false;
    setPaymentsLoading(true);
    setPaymentsError('');
    const range = documentDateRange();
    fetchPaymentLedger({
      page: paymentPage,
      page_size: PAYMENTS_PAGE_SIZE,
      ...range,
      search: paymentSearch.trim() || undefined,
      status: paymentStatusFilter || undefined,
      kind: paymentKindFilter || undefined,
      branch: primaryFilter !== FILTER_ALL ? primaryFilter : undefined,
    })
      .then((data) => {
        if (cancelled) return;
        setPayments(data.results.map(paymentToLedgerRow));
        setPaymentTotalCount(data.count);
        setPaymentMonthTotal(data.month_total);
        setPaymentPendingCount(data.pending_count);
      })
      .catch((error) => {
        console.error('Error loading payments:', error);
        if (cancelled) return;
        setPayments([]);
        setPaymentTotalCount(0);
        setPaymentMonthTotal(0);
        setPaymentPendingCount(0);
        setPaymentsError('שגיאה בטעינת התשלומים');
      })
      .finally(() => {
        if (!cancelled) setPaymentsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    activeTab,
    paymentPage,
    paymentKindFilter,
    paymentStatusFilter,
    paymentSearch,
    dateFrom,
    dateTo,
    primaryFilter,
  ]);

  async function handleRefundConfirm(amount: number | null, reason: string) {
    if (!refundTarget) return;
    setRefundLoading(true);
    try {
      const endpoint = refundTarget.source === 'payment'
        ? `/customers/payments/${refundTarget.id}/refund/`
        : `/store/invoices/${refundTarget.id}/refund/`;
      await api.post(endpoint, { amount, reason });
      if (refundTarget.source === 'payment') {
        setPayments((prev) =>
          prev.map((row) =>
            row.id === refundTarget.id
              ? { ...row, status: 'refunded', canRefund: false }
              : row,
          ),
        );
      } else {
        setInvoices((prev) =>
          prev.map((inv) =>
            inv.id === refundTarget.id
              ? { ...inv, payment_status: 'refunded' }
              : inv,
          ),
        );
      }
      setRefundTarget(null);
    } catch (error: unknown) {
      const data = (error as { response?: { data?: { error?: string } } })?.response?.data;
      window.alert(data?.error || 'שגיאה בביצוע הזיכוי');
    } finally {
      setRefundLoading(false);
    }
  }

  async function loadRecurringPayments(force = false) {
    if (recurringLoaded && !force) return;
    setRecurringLoading(true);
    try {
      const items: RecurringPayment[] = [];
      let page = 1;
      while (page <= 100) {
        const response = await api.get('/customers/recurring-payments/', {
          params: page === 1 ? {} : { page },
        });
        const data = response.data;
        if (Array.isArray(data)) {
          items.push(...data);
          break;
        }
        const batch = Array.isArray(data?.results) ? data.results : [];
        items.push(...batch);
        if (!data?.next || batch.length === 0) break;
        page += 1;
      }
      setRecurringPayments(items);
    } catch (error) {
      console.error('Error loading recurring payments:', error);
      setRecurringPayments([]);
    } finally {
      setRecurringLoading(false);
      setRecurringLoaded(true);
    }
  }

  async function handleScheduleRecurringAmount(e: React.FormEvent) {
    e.preventDefault();
    if (!editingRecurring) return;

    const parsed = Number(editAmountValue);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setEditAmountError('יש להזין סכום גדול מ-0');
      return;
    }

    setRecurringActionId(editingRecurring.id);
    setEditAmountError('');
    try {
      const response = await api.post(
        `/customers/recurring-payments/${editingRecurring.id}/schedule-amount/`,
        { amount: parsed },
      );
      setRecurringPayments((prev) =>
        prev.map((item) => (item.id === editingRecurring.id ? response.data : item)),
      );
      setEditingRecurring(null);
      setEditAmountValue('');
    } catch (error: unknown) {
      const msg =
        (error as { response?: { data?: { error?: string } } })?.response?.data?.error ??
        'שגיאה בעדכון הסכום';
      setEditAmountError(msg);
    } finally {
      setRecurringActionId(null);
    }
  }

  function openEditRecurringAmount(item: RecurringPayment) {
    setEditingRecurring(item);
    setEditAmountValue(String(item.pending_amount ?? item.amount));
    setEditAmountError('');
  }

  async function handleCancelRecurring(recurringId: string, childName: string) {
    if (!window.confirm(`לבטל את הוראת הקבע של ${childName}?`)) return;
    setRecurringActionId(recurringId);
    try {
      await api.post(`/customers/recurring-payments/${recurringId}/cancel/`, {
        cancellation_reason: 'בוטל ממסך הוראות קבע',
      });
      setRecurringPayments((prev) =>
        prev.map((item) =>
          item.id === recurringId
            ? { ...item, status: 'cancelled', cancelled_at: new Date().toISOString() }
            : item,
        ),
      );
    } catch (error) {
      console.error('Error cancelling recurring payment:', error);
      window.alert('שגיאה בביטול הוראת הקבע');
    } finally {
      setRecurringActionId(null);
    }
  }

  async function handleSendCardUpdate(recurringId: string, childName: string) {
    if (!window.confirm(`לשלוח לוואטסאפ קישור לעדכון כרטיס עבור ${childName}?`)) return;
    setRecurringActionId(recurringId);
    try {
      await api.post(`/customers/recurring-payments/${recurringId}/send-card-update/`);
      window.alert('ההודעה נשלחה ב-ManyChat');
    } catch (error) {
      const msg =
        (error as { response?: { data?: { error?: string; reason?: string } } })?.response?.data?.error
        || (error as { response?: { data?: { reason?: string } } })?.response?.data?.reason
        || 'שגיאה בשליחת ההודעה';
      window.alert(msg);
    } finally {
      setRecurringActionId(null);
    }
  }

  async function handleSendCardUpdateFailed() {
    const failedIds = recurringPayments.filter((item) => item.status === 'failed').map((item) => item.id);
    if (failedIds.length === 0) {
      window.alert('אין הוראות קבע בסטטוס נכשל');
      return;
    }
    if (!window.confirm(`לשלוח קישור לעדכון כרטיס ל-${failedIds.length} הוראות קבע שנכשלו?`)) return;
    setRecurringActionId('bulk');
    try {
      const res = await api.post('/customers/recurring-payments/send-card-update-failed/', {
        ids: failedIds,
      });
      const sent = Number(res.data?.sent ?? 0);
      const failed = Number(res.data?.failed ?? 0);
      window.alert(`נשלח: ${sent}. לא נשלח: ${failed}.`);
    } catch (error) {
      console.error('Error sending card-update WhatsApp:', error);
      window.alert('שגיאה בשליחת ההודעות');
    } finally {
      setRecurringActionId(null);
    }
  }

  function handleTabChange(tab: ActiveTab) {
    setActiveTab(tab);
    if (tab === 'גבייה') {
      void loadStoreInvoices();
    }
    if (tab === 'הוראת קבע' && !recurringLoaded) {
      loadRecurringPayments();
    }
  }

  const storeLedger = invoices
    .filter((inv) => {
      const day = (inv.issue_date || inv.created_at || '').slice(0, 10);
      if (dateFrom && day && day < dateFrom) return false;
      if (dateTo && day && day > dateTo) return false;
      if (primaryFilter !== FILTER_ALL && inv.branch !== primaryFilter) return false;
      return true;
    })
    .map(storeInvoiceToLedgerRow)
    .filter((row) => {
      if (paymentStatusFilter && row.status !== paymentStatusFilter) return false;
      const q = paymentSearch.trim().toLowerCase();
      if (!q) return true;
      return (
        row.customer_name.toLowerCase().includes(q)
        || row.description.toLowerCase().includes(q)
        || (row.transaction_reference || '').toLowerCase().includes(q)
      );
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const showingStore = paymentKindFilter === 'store';
  const pagedStore = storeLedger.slice(
    (paymentPage - 1) * PAYMENTS_PAGE_SIZE,
    paymentPage * PAYMENTS_PAGE_SIZE,
  );
  const sortedPayments = showingStore ? pagedStore : payments;
  const paymentCount = showingStore ? storeLedger.length : paymentTotalCount;
  const pendingCount = showingStore
    ? storeLedger.filter((p) => p.status === 'pending' || p.status === 'processing').length
    : paymentPendingCount;
  const monthTotal = showingStore ? getCurrentMonthTotal(storeLedger) : paymentMonthTotal;
  const paymentPageCount = Math.max(1, Math.ceil(paymentCount / PAYMENTS_PAGE_SIZE));

  const filtered = documents.filter(doc => {
    if (docTypeFilter && getLedgerDocType(doc) !== docTypeFilter) return false;
    if (statusFilter && doc.status !== statusFilter) return false;
    if (branchFilter && doc.branch_id !== branchFilter) return false;
    if (dateFrom && doc.issue_date < dateFrom) return false;
    if (dateTo && doc.issue_date > dateTo) return false;
    const q = searchQuery.toLowerCase();
    if (
      q &&
      !doc.document_number.toLowerCase().includes(q) &&
      !(doc.customer_name ?? '').toLowerCase().includes(q)
    ) {
      return false;
    }
    return true;
  });

  // Collection tab derived data
  const openInvoices = getOpenInvoices(invoices);
  const children: ChildWithDetails[] = Array.isArray(childrenData) ? childrenData : [];
  const collectionCustomers = Array.from(
    new Set(children.map(child => child.full_name)),
  ).sort((a, b) => a.localeCompare(b, 'he'));
  const collectionFiltered = collectionCustomerFilter
    ? openInvoices.filter(inv => (inv.child_name ?? inv.customer_name) === collectionCustomerFilter)
    : openInvoices;
  const agingBuckets = getAgingBuckets(collectionFiltered);
  const collectionTotalDebt = collectionFiltered.reduce((sum, inv) => sum + getOpenBalance(inv), 0);
  const sortedCollectionInvoices = [...collectionFiltered].sort(
    (a, b) => getDaysOverdue(b.issue_date) - getDaysOverdue(a.issue_date),
  );

  const filteredRecurring = recurringPayments.filter((item) => {
    if (recurringStatusFilter && item.status !== recurringStatusFilter) return false;
    const branchName = item.initial_payment_details?.branch_name ?? item.branch_name ?? '';
    if (recurringBranchFilter && branchName !== recurringBranchFilter) return false;
    const q = recurringSearch.trim().toLowerCase();
    if (!q) return true;
    const courseName = item.initial_payment_details?.lesson_name ?? item.course_name ?? '';
    return (
      item.child_name.toLowerCase().includes(q) ||
      courseName.toLowerCase().includes(q) ||
      branchName.toLowerCase().includes(q)
    );
  });

  const sortedRecurring = [...filteredRecurring].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const activeRecurring = recurringPayments.filter((item) => item.status === 'active');
  const activeRecurringTotal = activeRecurring.reduce(
    (sum, item) => sum + Number(item.amount || 0),
    0,
  );
  const recurringBranchOptions = Array.from(
    new Set(
      recurringPayments
        .map((item) => item.initial_payment_details?.branch_name ?? item.branch_name ?? '')
        .filter(Boolean),
    ),
  ).sort((a, b) => a.localeCompare(b, 'he'));

  return (
    <>
      <div className={styles.page}>
        {/* Header */}
        <div className={styles.pageHeader}>
          <div className={styles.titleGroup}>
            <h2 className={styles.pageTitle}>
              {activeTab === 'תשלומים' ? (
                <Wallet className={styles.titleIcon} />
              ) : activeTab === 'גבייה' ? (
                <AlertCircle className={styles.titleIcon} />
              ) : activeTab === 'הוראת קבע' ? (
                <Repeat className={styles.titleIcon} />
              ) : activeTab === "צ'קים" ? (
                <Banknote className={styles.titleIcon} />
              ) : (
                <FileText className={styles.titleIcon} />
              )}
              {activeTab}
            </h2>
            <p className={styles.subtitle}>
              {activeTab === 'תשלומים'
                ? 'כל החיובים: הרשמה, הוראת קבע, שיעורי ניסיון והחנות — כולל הסבר וזיכוי'
                : activeTab === 'גבייה'
                ? 'מסמכים עם יתרה פתוחה, מעקב Aging ופעולות גבייה'
                : activeTab === 'הוראת קבע'
                ? 'כל הוראות הקבע הפעילות והמבוטלות של לקוחות החוגים'
                : activeTab === "צ'קים"
                ? 'רישום צ׳קים במשרד: קבלה ברישום, וחשבונית מס אוטומטית בכל חודש'
                : 'כל החשבוניות והקבלות שהופקו מול טרנזילה'}
            </p>
          </div>

          <div className={styles.headerActions}>
            <div className={styles.subTabs} role="tablist">
              <button
                role="tab"
                aria-selected={activeTab === 'מסמכים'}
                className={`${styles.tabBtn} ${activeTab === 'מסמכים' ? styles.tabBtnActive : ''}`}
                onClick={() => handleTabChange('מסמכים')}
              >
                מסמכים
              </button>
              <button
                role="tab"
                aria-selected={activeTab === 'תשלומים'}
                className={`${styles.tabBtn} ${activeTab === 'תשלומים' ? styles.tabBtnActive : ''}`}
                onClick={() => handleTabChange('תשלומים')}
              >
                תשלומים
              </button>
              <button
                role="tab"
                aria-selected={activeTab === 'גבייה'}
                className={`${styles.tabBtn} ${activeTab === 'גבייה' ? styles.tabBtnActive : ''}`}
                onClick={() => handleTabChange('גבייה')}
              >
                גבייה
              </button>
              <button
                role="tab"
                aria-selected={activeTab === 'הוראת קבע'}
                className={`${styles.tabBtn} ${activeTab === 'הוראת קבע' ? styles.tabBtnActive : ''}`}
                onClick={() => handleTabChange('הוראת קבע')}
              >
                הוראת קבע
              </button>
              <button
                role="tab"
                aria-selected={activeTab === "צ'קים"}
                className={`${styles.tabBtn} ${activeTab === "צ'קים" ? styles.tabBtnActive : ''}`}
                onClick={() => handleTabChange("צ'קים")}
              >
                צ׳קים
              </button>
              {isManager && (
                <Link href="/credit-charge" className={`${styles.tabBtn} ${styles.tabLink}`}>
                  סליקת אשראי
                </Link>
              )}
            </div>

            <button type="button" className={styles.newDocBtn} onClick={() => setIsNewDocOpen(true)}>
              <Plus size={16} />
              מסמך חדש
            </button>
          </div>
        </div>

        {activeTab === 'תשלומים' && (
          <FilterBar
            fields={[
              {
                key: 'branch',
                label: 'כל הסניפים',
                options: branches.map((b) => ({ value: b.id, label: b.name })),
              },
            ]}
            values={{ branch: primaryFilter }}
            onChange={(_key, value) => setPrimaryFilter(value)}
            onClear={() => setPrimaryFilter(FILTER_ALL)}
          />
        )}

        {activeTab === 'מסמכים' && (
          <>
            {/* Filter bar */}
            <div className={styles.filterBar}>
              <select
                className={styles.filterSelect}
                value={docTypeFilter}
                onChange={e => setDocTypeFilter(e.target.value)}
                aria-label="סינון לפי סוג מסמך"
              >
                <option value="">כל הסוגים</option>
                <option value="חשבונית מס/קבלה">חשבונית מס/קבלה</option>
                <option value="חשבונית מס">חשבונית מס</option>
                <option value="קבלה">קבלה</option>
                <option value="חשבונית עסקה">חשבונית עסקה</option>
                <option value="חשבונית מס זיכוי">חשבונית מס זיכוי</option>
              </select>

              <select
                className={styles.filterSelect}
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                aria-label="סינון לפי סטטוס"
              >
                <option value="">הכל</option>
                <option value="completed">שולם</option>
                <option value="pending">פתוח</option>
                <option value="failed">נכשל</option>
                <option value="refunded">זוכה</option>
                <option value="draft">טיוטה</option>
              </select>

              <select
                className={styles.filterSelect}
                value={branchFilter}
                onChange={e => setBranchFilter(e.target.value)}
                aria-label="סינון לפי סניף"
              >
                <option value="">כל הסניפים</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>

              <input
                type="date"
                className={styles.dateInput}
                value={dateFrom}
                onChange={e => setDateFrom(e.target.value)}
                aria-label="מתאריך"
              />
              <input
                type="date"
                className={styles.dateInput}
                value={dateTo}
                onChange={e => setDateTo(e.target.value)}
                aria-label="עד תאריך"
              />

              <select
                className={styles.filterSelect}
                value={reportGroupBy}
                onChange={e => setReportGroupBy(e.target.value as ReportGroupBy)}
                aria-label="קיבוץ הדוח"
              >
                <option value="branch">דוח לפי סניפים</option>
                <option value="business">דוח לפי לקוחות עסקיים</option>
                <option value="business_unit">דוח לפי עסק</option>
                <option value="business_category">דוח לפי קטגוריה</option>
              </select>
              <button
                type="button"
                className={styles.tabBtn}
                disabled={reportBusy}
                onClick={async () => {
                  setReportBusy(true);
                  try {
                    await downloadPeriodReport({
                      start_date: dateFrom || daysAgoLocalISO(90),
                      end_date: dateTo || localISODate(),
                      group_by: reportGroupBy,
                      document_type: DOC_TYPE_CODES[docTypeFilter] ?? '',
                    });
                  } catch {
                    setDocumentsError('הפקת הדוח נכשלה');
                  } finally {
                    setReportBusy(false);
                  }
                }}
              >
                <Download size={16} aria-hidden="true" />
                {reportBusy ? 'מפיק…' : 'הורד דוח PDF'}
              </button>

              <div className={styles.searchWrapper}>
                <Search className={styles.searchIcon} aria-hidden="true" />
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="חיפוש לפי שם, מספר מסמך..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  aria-label="חיפוש חשבוניות"
                />
              </div>
            </div>

            {documentsError && (
              <p className={styles.emptyState} style={{ padding: '8px 0' }}>{documentsError}</p>
            )}

            {/* Table */}
            <div className={styles.tableCard}>
              {isLoading ? (
                <TableSkeleton columns={9} tableClassName={styles.invoiceTable} label="טוען מסמכים" />
              ) : filtered.length === 0 ? (
                <div className={styles.emptyState}>לא נמצאו מסמכים</div>
              ) : (
                <table className={styles.invoiceTable}>
                  <thead>
                    <tr>
                      <th scope="col">מס' מסמך</th>
                      <th scope="col">תאריך הנפקה</th>
                      <th scope="col">לקוח</th>
                      <th scope="col">סוג מסמך</th>
                      <th scope="col">סכום</th>
                      <th scope="col">שולם עד כה</th>
                      <th scope="col">יתרה פתוחה</th>
                      <th scope="col">סטטוס</th>
                      <th scope="col">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(doc => {
                      const canDownload = Boolean(doc.pdf_url || doc.store_invoice_id || doc.source === 'local');
                      const notIssued = doc.source === 'local' && doc.tranzila_issued === false && !doc.is_draft;
                      const isDownloading = downloadingId === doc.id;

                      return (
                        <tr key={doc.id}>
                          <td className={styles.invoiceNumber}>{doc.document_number}</td>
                          <td>{doc.issue_date ? formatDate(doc.issue_date) : '—'}</td>
                          <td className={styles.customerName}>{doc.customer_name || '—'}</td>
                          <td><span className={styles.docTypeChip}>{getLedgerDocType(doc)}</span></td>
                          <td className={styles.amount}>{formatAmount(doc.total_amount)}</td>
                          <td>{formatAmount(doc.amount_paid)}</td>
                          <td className={doc.open_balance > 0 ? styles.openBalance : styles.openBalanceZero}>
                            {formatAmount(doc.open_balance)}
                          </td>
                          <td>
                            <span
                              className={`${styles.statusBadge} ${getStatusClass(doc.status)}`}
                              aria-label={getStatusLabel(doc.status)}
                            >
                              {getStatusLabel(doc.status)}
                            </span>
                            {notIssued && (
                              <span className={styles.refundUnavailable} title="המסמך נשמר מקומית אך לא הונפק בטרנזילה">
                                לא הונפק בטרנזילה
                              </span>
                            )}
                          </td>
                          <td>
                            <div className={styles.collectionActions}>
                              {doc.is_draft && (
                                <button
                                  type="button"
                                  className={styles.refundBtn}
                                  disabled={approvingId === doc.id}
                                  onClick={async () => {
                                    if (!window.confirm(`לאשר את הטיוטה ${doc.document_number}? המסמך יקבל מספר חשבונית.`)) return;
                                    setApprovingId(doc.id);
                                    try {
                                      await finalizeDraft(doc.id);
                                      await loadInvoiceData();
                                    } catch {
                                      setDocumentsError('אישור הטיוטה נכשל');
                                    } finally {
                                      setApprovingId(null);
                                    }
                                  }}
                                >
                                  {approvingId === doc.id ? 'מאשר…' : 'אשר טיוטה'}
                                </button>
                              )}
                              {!canDownload && (
                                <span className={styles.refundUnavailable} title="לא קיים קובץ למסמך זה">ללא PDF</span>
                              )}
                              {canDownload && (
                                <button
                                  type="button"
                                  className={styles.reminderBtn}
                                  aria-label={`הורדת ${doc.document_number}`}
                                  title="הורד PDF"
                                  disabled={isDownloading}
                                  onClick={async () => {
                                    setDownloadingId(doc.id);
                                    try {
                                      if (doc.store_invoice_id) {
                                        await downloadStoreInvoicePdf(doc.store_invoice_id, doc.document_number);
                                      } else if (doc.pdf_url) {
                                        window.open(doc.pdf_url, '_blank', 'noopener,noreferrer');
                                      } else {
                                        await downloadDocumentPdf(doc.id, doc.document_number);
                                      }
                                    } catch {
                                      alert('שגיאה בהורדת החשבונית');
                                    } finally {
                                      setDownloadingId(null);
                                    }
                                  }}
                                >
                                  <Download size={16} />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {activeTab === 'תשלומים' && (
          <>
            {/* Stats row */}
            <div className={styles.statsRow}>
              <div className={`${styles.statCard} ${styles.statCardBlue}`}>
                <div className={styles.statCardIcon}>
                  <DollarSign size={18} />
                </div>
                <div className={styles.statCardBody}>
                  <span className={styles.statCardValue}>{paymentCount}</span>
                  <span className={styles.statCardLabel}>סה&quot;כ חיובים</span>
                </div>
              </div>

              <div className={`${styles.statCard} ${styles.statCardOrange}`}>
                <div className={styles.statCardIcon}>
                  <Clock size={18} />
                </div>
                <div className={styles.statCardBody}>
                  <span className={styles.statCardValue}>{pendingCount}</span>
                  <span className={styles.statCardLabel}>ממתינים לאישור</span>
                </div>
              </div>

              <div className={`${styles.statCard} ${styles.statCardGreen}`}>
                <div className={styles.statCardIcon}>
                  <TrendingUp size={18} />
                </div>
                <div className={styles.statCardBody}>
                  <span className={styles.statCardValue}>{formatAmount(monthTotal)}</span>
                  <span className={styles.statCardLabel}>חיובים שהצליחו החודש</span>
                </div>
              </div>
            </div>

            <div className={styles.paymentsFilterBar}>
              <select
                className={styles.filterSelect}
                value={paymentKindFilter}
                onChange={(e) => { setPaymentKindFilter(e.target.value); setPaymentPage(1); }}
                aria-label="סינון לפי סוג חיוב"
              >
                <option value="">כל סוגי החיוב</option>
                {CHARGE_KIND_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <select
                className={styles.filterSelect}
                value={paymentStatusFilter}
                onChange={(e) => { setPaymentStatusFilter(e.target.value); setPaymentPage(1); }}
                aria-label="סינון לפי סטטוס"
              >
                <option value="">כל הסטטוסים</option>
                <option value="completed">אושר</option>
                <option value="pending">ממתין</option>
                <option value="failed">נכשל</option>
                <option value="refunded">זוכה</option>
              </select>
              <div className={styles.searchWrapper}>
                <Search className={styles.searchIcon} aria-hidden="true" />
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="חיפוש לפי לקוח, חוג, הסבר..."
                  value={paymentSearch}
                  onChange={(e) => { setPaymentSearch(e.target.value); setPaymentPage(1); }}
                  aria-label="חיפוש חיובים"
                />
              </div>
            </div>

            {paymentsError && (
              <p className={styles.emptyState} style={{ padding: '8px 0' }}>{paymentsError}</p>
            )}

            {/* Payments table */}
            <div className={styles.tableCard}>
              {paymentsLoading ? (
                <TableSkeleton
                  columns={8}
                  tableClassName={`${styles.invoiceTable} ${styles.paymentsTable}`}
                  label="טוען תשלומים"
                />
              ) : sortedPayments.length === 0 ? (
                <div className={styles.emptyState}>לא נמצאו חיובים</div>
              ) : (
                <table className={`${styles.invoiceTable} ${styles.paymentsTable}`}>
                  <thead>
                    <tr>
                      <th scope="col">תאריך</th>
                      <th scope="col">לקוח</th>
                      <th scope="col">על מה החיוב</th>
                      <th scope="col">סכום</th>
                      <th scope="col">אמצעי</th>
                      <th scope="col">אסמכתא</th>
                      <th scope="col">סטטוס</th>
                      <th scope="col">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPayments.map((p) => {
                      const statusLabel = getPaymentStatusLabel(p.status);
                      return (
                        <tr key={`${p.source}-${p.id}`}>
                          <td>{p.created_at ? formatDate(p.created_at) : '—'}</td>
                          <td className={styles.customerName}>{p.customer_name || '—'}</td>
                          <td className={styles.chargeCell}>
                            <span className={styles.chargeKindChip}>{p.kind_label}</span>
                            <span className={styles.chargeDescription}>{p.description || '—'}</span>
                          </td>
                          <td className={styles.amount}>{formatAmount(p.amount)}</td>
                          <td><span className={styles.methodBadge}>{p.payment_method || 'אשראי'}</span></td>
                          <td className={styles.referenceCell}>{p.transaction_reference || '—'}</td>
                          <td>
                            <span
                              className={`${styles.statusBadge} ${getPaymentStatusClass(p.status)}`}
                              aria-label={statusLabel}
                            >
                              {statusLabel}
                            </span>
                          </td>
                          <td>
                            {p.canRefund ? (
                              <button
                                type="button"
                                className={styles.refundBtn}
                                onClick={() => setRefundTarget(p)}
                              >
                                זיכוי
                              </button>
                            ) : (
                              <span className={styles.refundUnavailable}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
              {paymentCount > 0 && (
                <div className={styles.pager}>
                  <button
                    type="button"
                    className={styles.pagerBtn}
                    disabled={paymentPage <= 1 || paymentsLoading}
                    onClick={() => setPaymentPage((page) => Math.max(1, page - 1))}
                  >
                    הקודם
                  </button>
                  <span className={styles.pagerStatus}>
                    עמוד {Math.min(paymentPage, paymentPageCount)} מתוך {paymentPageCount}
                    {' · '}
                    {paymentCount} חיובים
                  </span>
                  <button
                    type="button"
                    className={styles.pagerBtn}
                    disabled={paymentPage >= paymentPageCount || paymentsLoading}
                    onClick={() => setPaymentPage((page) => page + 1)}
                  >
                    הבא
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {activeTab === 'הוראת קבע' && (
          <>
            <div className={styles.statsRow}>
              <div className={`${styles.statCard} ${styles.statCardBlue}`}>
                <div className={styles.statCardIcon}>
                  <Repeat size={18} />
                </div>
                <div className={styles.statCardBody}>
                  <span className={styles.statCardValue}>{recurringPayments.length}</span>
                  <span className={styles.statCardLabel}>סה&quot;כ הוראות קבע</span>
                </div>
              </div>

              <div className={`${styles.statCard} ${styles.statCardGreen}`}>
                <div className={styles.statCardIcon}>
                  <TrendingUp size={18} />
                </div>
                <div className={styles.statCardBody}>
                  <span className={styles.statCardValue}>{activeRecurring.length}</span>
                  <span className={styles.statCardLabel}>פעילות</span>
                </div>
              </div>

              <div className={`${styles.statCard} ${styles.statCardOrange}`}>
                <div className={styles.statCardIcon}>
                  <DollarSign size={18} />
                </div>
                <div className={styles.statCardBody}>
                  <span className={styles.statCardValue}>{formatAmount(activeRecurringTotal)}</span>
                  <span className={styles.statCardLabel}>סכום חודשי פעיל</span>
                </div>
              </div>
            </div>

            <div className={styles.filterBar}>
              <select
                className={styles.filterSelect}
                value={recurringStatusFilter}
                onChange={(e) => setRecurringStatusFilter(e.target.value)}
                aria-label="סינון לפי סטטוס"
              >
                <option value="">כל הסטטוסים</option>
                <option value="active">פעיל</option>
                <option value="paused">מושהה</option>
                <option value="cancelled">מבוטל</option>
                <option value="expired">פג תוקף</option>
                <option value="failed">נכשל</option>
              </select>

              <select
                className={styles.filterSelect}
                value={recurringBranchFilter}
                onChange={(e) => setRecurringBranchFilter(e.target.value)}
                aria-label="סינון לפי סניף"
              >
                <option value="">כל הסניפים</option>
                {recurringBranchOptions.map((branchName) => (
                  <option key={branchName} value={branchName}>{branchName}</option>
                ))}
              </select>

              <div className={styles.searchWrapper}>
                <Search className={styles.searchIcon} aria-hidden="true" />
                <input
                  type="text"
                  className={styles.searchInput}
                  placeholder="חיפוש לפי לקוח, חוג, סניף..."
                  value={recurringSearch}
                  onChange={(e) => setRecurringSearch(e.target.value)}
                  aria-label="חיפוש הוראות קבע"
                />
              </div>
              {recurringPayments.some((item) => item.status === 'failed') ? (
                <button
                  type="button"
                  className={styles.editRecurringBtn}
                  disabled={recurringActionId === 'bulk'}
                  onClick={() => void handleSendCardUpdateFailed()}
                >
                  {recurringActionId === 'bulk' ? 'שולח...' : 'שלח קישור לכל הנכשלים'}
                </button>
              ) : null}
            </div>

            <div className={styles.tableCard}>
              {recurringLoading ? (
                <TableSkeleton
                  columns={10}
                  tableClassName={`${styles.invoiceTable} ${styles.paymentsTable}`}
                  label="טוען הוראות קבע"
                />
              ) : sortedRecurring.length === 0 ? (
                <div className={styles.emptyState}>לא נמצאו הוראות קבע</div>
              ) : (
                <table className={`${styles.invoiceTable} ${styles.paymentsTable}`}>
                  <thead>
                    <tr>
                      <th scope="col">לקוח</th>
                      <th scope="col">חוג</th>
                      <th scope="col">סניף</th>
                      <th scope="col">סכום חודשי</th>
                      <th scope="col">יום חיוב</th>
                      <th scope="col">חיוב הבא</th>
                      <th scope="col">חיוב אחרון</th>
                      <th scope="col">תאריך התחלה</th>
                      <th scope="col">סטטוס</th>
                      <th scope="col">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRecurring.map((item) => {
                      const statusLabel = getRecurringStatusLabel(item.status);
                      const courseName =
                        item.initial_payment_details?.lesson_name ??
                        item.course_name ??
                        item.initial_payment_details?.description ??
                        '-';
                      const courseDisplayId = item.initial_payment_details?.lesson_course_display_id;
                      const branchName =
                        item.initial_payment_details?.branch_name ??
                        item.branch_name ??
                        '-';

                      return (
                        <tr key={item.id}>
                          <td className={styles.customerName}>{item.child_name}</td>
                          <td>
                            {courseName}
                            <GroupIdBadge displayId={courseDisplayId} />
                          </td>
                          <td>{branchName}</td>
                          <td className={styles.amount}>
                            <div>{formatAmount(Number(item.amount))}</div>
                            {item.pending_amount != null && item.pending_amount_effective_date ? (
                              <div className={styles.pendingAmountNote}>
                                → {formatAmount(Number(item.pending_amount))} מ-{formatDate(item.pending_amount_effective_date)}
                              </div>
                            ) : null}
                          </td>
                          <td>{item.billing_day}</td>
                          <td>{item.next_billing_date ? formatDate(item.next_billing_date) : '—'}</td>
                          <td>{item.last_charge_date ? formatDate(item.last_charge_date) : '—'}</td>
                          <td>{formatDate(item.start_date)}</td>
                          <td>
                            <span
                              className={`${styles.statusBadge} ${getRecurringStatusClass(item.status)}`}
                              aria-label={statusLabel}
                            >
                              {statusLabel}
                            </span>
                          </td>
                          <td>
                            {item.status === 'active' ? (
                              <div className={styles.recurringActions}>
                                <button
                                  type="button"
                                  className={styles.editRecurringBtn}
                                  disabled={recurringActionId === item.id}
                                  onClick={() => openEditRecurringAmount(item)}
                                >
                                  עריכה
                                </button>
                                <button
                                  type="button"
                                  className={styles.cancelRecurringBtn}
                                  disabled={recurringActionId === item.id}
                                  onClick={() => handleCancelRecurring(item.id, item.child_name)}
                                >
                                  {recurringActionId === item.id ? 'מבטל...' : 'ביטול'}
                                </button>
                              </div>
                            ) : item.status === 'failed' ? (
                              <div className={styles.recurringActions}>
                                <button
                                  type="button"
                                  className={styles.editRecurringBtn}
                                  disabled={recurringActionId === item.id}
                                  onClick={() => void handleSendCardUpdate(item.id, item.child_name)}
                                >
                                  {recurringActionId === item.id ? 'שולח...' : 'שלח קישור לכרטיס'}
                                </button>
                              </div>
                            ) : (
                              '—'
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {activeTab === "צ'קים" && (
          <ChecksTab
            formatAmount={formatAmount}
            formatDate={formatDate}
            branchFilter={primaryFilter !== FILTER_ALL ? primaryFilter : undefined}
          />
        )}

        {activeTab === 'גבייה' && (
          <>
            {/* Aging buckets */}
            <div className={styles.agingRow}>
              {agingBuckets.map(bucket => (
                <div
                  key={bucket.key}
                  className={styles.agingCard}
                  aria-label={`${bucket.label}: ${formatAmount(bucket.total)}, ${bucket.count} מסמכים`}
                >
                  <span className={styles.agingLabel}>{bucket.label}</span>
                  <span className={bucket.total > 0 ? styles.agingAmount : styles.agingAmountZero}>
                    {formatAmount(bucket.total)}
                  </span>
                  <span className={styles.agingCount}>{bucket.count} מסמכים</span>
                </div>
              ))}
            </div>

            {/* Customer filter */}
            <div className={styles.collectionFilterBar}>
              <select
                className={styles.filterSelect}
                value={collectionCustomerFilter}
                onChange={e => setCollectionCustomerFilter(e.target.value)}
                aria-label="סינון לפי לקוח"
              >
                <option value="">כל הלקוחות</option>
                {collectionCustomers.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>

            {/* Totals strip */}
            <div className={styles.collectionTotals}>
              <span className={styles.countPill}>{collectionFiltered.length} מסמכים</span>
              <span className={styles.totalsHeading}>סה&quot;כ חובות: {formatAmount(collectionTotalDebt)}</span>
            </div>

            {/* Collection table */}
            <div className={styles.tableCard}>
              {!invoicesLoaded ? (
                <TableSkeleton
                  columns={9}
                  tableClassName={`${styles.invoiceTable} ${styles.collectionTable}`}
                  label="טוען חובות פתוחים"
                />
              ) : sortedCollectionInvoices.length === 0 ? (
                <div className={styles.emptyState}>לא נמצאו חובות פתוחים</div>
              ) : (
                <table className={`${styles.invoiceTable} ${styles.collectionTable}`}>
                  <thead>
                    <tr>
                      <th scope="col">לקוח</th>
                      <th scope="col">מס&apos; מסמך</th>
                      <th scope="col">תאריך הנפקה</th>
                      <th scope="col">סכום מסמך</th>
                      <th scope="col">שולם</th>
                      <th scope="col">יתרה פתוחה</th>
                      <th scope="col">ימים מההנפקה</th>
                      <th scope="col">סטטוס</th>
                      <th scope="col">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCollectionInvoices.map(inv => {
                      const customerDisplay = inv.child_name ?? inv.customer_name;
                      const openBalance = getOpenBalance(inv);
                      const daysOverdue = getDaysOverdue(inv.issue_date);
                      const overdueLabel = getOverdueLabel(daysOverdue);
                      const statusLabel = getStatusLabel(inv.payment_status);

                      return (
                        <tr key={inv.id}>
                          <td className={styles.customerName}>{customerDisplay}</td>
                          <td className={styles.invoiceNumber}>{inv.invoice_number}</td>
                          <td>{formatDate(inv.issue_date)}</td>
                          <td className={styles.amount}>{formatAmount(inv.total_amount)}</td>
                          <td>{formatAmount(inv.amount_paid)}</td>
                          <td className={openBalance > 0 ? styles.openBalance : styles.openBalanceZero}>
                            {formatAmount(openBalance)}
                          </td>
                          <td className={daysOverdue > 0 ? styles.overdueLabel : styles.overdueLabelMuted}>
                            {overdueLabel}
                          </td>
                          <td>
                            <span
                              className={`${styles.statusBadge} ${getStatusClass(inv.payment_status)}`}
                              aria-label={statusLabel}
                            >
                              {statusLabel}
                            </span>
                          </td>
                          <td>
                            <div className={styles.collectionActions}>
                              <button
                                type="button"
                                className={`${styles.reminderBtn} ${reminderStatus[inv.id] === 'sent' ? styles.reminderBtnSent : reminderStatus[inv.id] === 'error' ? styles.reminderBtnError : ''}`}
                                aria-label={`שלח תזכורת תשלום ל${customerDisplay}`}
                                disabled={reminderStatus[inv.id] === 'sending'}
                                onClick={async () => {
                                  setReminderStatus((prev) => ({ ...prev, [inv.id]: 'sending' }));
                                  try {
                                    await sendDocumentReminder(inv.id);
                                    setReminderStatus((prev) => ({ ...prev, [inv.id]: 'sent' }));
                                    setTimeout(() => setReminderStatus((prev) => { const next = { ...prev }; delete next[inv.id]; return next; }), 3000);
                                  } catch {
                                    setReminderStatus((prev) => ({ ...prev, [inv.id]: 'error' }));
                                    setTimeout(() => setReminderStatus((prev) => { const next = { ...prev }; delete next[inv.id]; return next; }), 3000);
                                  }
                                }}
                              >
                                <Bell size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}
      </div>

      <RefundDialog
        isOpen={Boolean(refundTarget)}
        onClose={() => { if (!refundLoading) setRefundTarget(null); }}
        onConfirm={handleRefundConfirm}
        title="זיכוי חיוב"
        maxAmount={refundTarget?.amount ?? 0}
        itemDescription={refundTarget?.description}
        loading={refundLoading}
      />

      <NewDocumentDialog open={isNewDocOpen} onClose={() => { setIsNewDocOpen(false); loadInvoiceData(); }} />

      {editingRecurring ? (
        <div className={styles.editAmountOverlay} onClick={() => setEditingRecurring(null)}>
          <form
            className={styles.editAmountModal}
            dir="rtl"
            onClick={(e) => e.stopPropagation()}
            onSubmit={handleScheduleRecurringAmount}
          >
            <h3 className={styles.editAmountTitle}>עדכון סכום חודשי</h3>
            <p className={styles.editAmountSubtitle}>
              {editingRecurring.child_name} · הסכום הנוכחי {formatAmount(Number(editingRecurring.amount))}
            </p>
            <p className={styles.editAmountHint}>
              השינוי יחול מהחודש הבא (מחזור החיוב הבא), לא מהחיוב הנוכחי.
            </p>
            <label className={styles.editAmountLabel} htmlFor="recurring-amount-edit">
              סכום חודשי חדש (₪)
            </label>
            <input
              id="recurring-amount-edit"
              type="number"
              min="0"
              step="0.01"
              className={styles.editAmountInput}
              value={editAmountValue}
              onChange={(e) => {
                setEditAmountValue(e.target.value);
                setEditAmountError('');
              }}
              required
            />
            {editAmountError ? <p className={styles.editAmountError}>{editAmountError}</p> : null}
            <div className={styles.editAmountActions}>
              <button
                type="button"
                className={styles.editAmountCancelBtn}
                onClick={() => setEditingRecurring(null)}
              >
                ביטול
              </button>
              <button
                type="submit"
                className={styles.editAmountSaveBtn}
                disabled={recurringActionId === editingRecurring.id}
              >
                {recurringActionId === editingRecurring.id ? 'שומר...' : 'שמור לחודש הבא'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </>
  );
}
