'use client';

import { useState, useEffect } from 'react';
import { FileText, Search, DollarSign, Clock, TrendingUp, Wallet } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { fetchInvoices } from '@/lib/storeApi';
import api from '@/lib/api';
import type { StoreInvoice } from '@/types/store';
import type { Branch } from '@/types/branch';
import type { ActiveTab, PaymentRecord } from './types';
import { PAYMENT_SUBCATEGORIES } from './constants';
import {
  getDocType,
  getStatusLabel,
  getStatusClass,
  getPaymentStatusLabel,
  getPaymentStatusClass,
  formatAmount,
  formatDate,
  getCurrentMonthTotal,
} from './utils';
import styles from './invoices.module.css';

export default function InvoicesPage() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('מסמכים');

  // Documents tab state
  const [invoices, setInvoices] = useState<StoreInvoice[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  // Payments tab state
  const [payments, setPayments] = useState<PaymentRecord[]>([]);
  const [paymentsLoading, setPaymentsLoading] = useState(false);
  const [paymentsLoaded, setPaymentsLoaded] = useState(false);
  const [paymentBranchFilter, setPaymentBranchFilter] = useState('');
  const [paymentCategoryFilter, setPaymentCategoryFilter] = useState('');

  useEffect(() => {
    loadInvoiceData();
  }, []);

  async function loadInvoiceData() {
    setIsLoading(true);
    try {
      const [invoicesData, branchesResponse] = await Promise.all([
        fetchInvoices(),
        api.get('/core/branches/'),
      ]);
      const invoiceList = (invoicesData as any)?.results ?? invoicesData;
      const branchList = branchesResponse.data?.results ?? branchesResponse.data;
      setInvoices(Array.isArray(invoiceList) ? invoiceList : []);
      setBranches(Array.isArray(branchList) ? branchList : []);
    } catch (error) {
      console.error('Error loading invoices:', error);
      setInvoices([]);
      setBranches([]);
    } finally {
      setIsLoading(false);
    }
  }

  async function loadPayments() {
    if (paymentsLoaded) return;
    setPaymentsLoading(true);
    try {
      const response = await api.get('/customers/payments/');
      const list = response.data?.results ?? response.data;
      setPayments(Array.isArray(list) ? list : []);
    } catch (error) {
      console.error('Error loading payments:', error);
      setPayments([]);
    } finally {
      setPaymentsLoading(false);
      setPaymentsLoaded(true);
    }
  }

  function handleTabChange(tab: ActiveTab) {
    setActiveTab(tab);
    if (tab === 'תשלומים' && !paymentsLoaded) {
      loadPayments();
    }
  }

  const pendingCount = payments.filter(p => p.status === 'pending').length;
  const monthTotal = getCurrentMonthTotal(payments);
  const sortedPayments = [...payments].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  const filtered = invoices.filter(inv => {
    if (docTypeFilter && getDocType(inv) !== docTypeFilter) return false;
    if (statusFilter && inv.payment_status !== statusFilter) return false;
    if (branchFilter && inv.branch !== branchFilter) return false;
    if (dateFrom && inv.issue_date < dateFrom) return false;
    if (dateTo && inv.issue_date > dateTo) return false;
    const q = searchQuery.toLowerCase();
    if (
      q &&
      !inv.invoice_number.toLowerCase().includes(q) &&
      !(inv.child_name ?? '').toLowerCase().includes(q) &&
      !inv.customer_name.toLowerCase().includes(q)
    ) {
      return false;
    }
    return true;
  });

  return (
    <AppLayout>
      <div className={styles.page}>
        {/* Header */}
        <div className={styles.pageHeader}>
          <div className={styles.titleGroup}>
            <h2 className={styles.pageTitle}>
              {activeTab === 'תשלומים' ? (
                <Wallet className={styles.titleIcon} />
              ) : (
                <FileText className={styles.titleIcon} />
              )}
              {activeTab === 'תשלומים' ? 'תשלומים' : 'מסמכים'}
            </h2>
            <p className={styles.subtitle}>
              {activeTab === 'תשלומים'
                ? 'עוקב כל התשלומים שהתקבלו, אישור וניהול אסמכתאות'
                : 'כל החשבוניות, קבלות וזיכויים במקום אחד'}
            </p>
          </div>

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
            <button role="tab" aria-selected={false} className={styles.tabBtn} disabled>
              גבייה
            </button>
          </div>
        </div>

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
                <option value="חשבונית עסקה">חשבונית עסקה</option>
                <option value="טיוטה">טיוטה</option>
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

            {/* Table */}
            <div className={styles.tableCard}>
              {isLoading ? (
                <div className={styles.loadingWrapper}>טוען...</div>
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
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map(inv => {
                      const paidSoFar = inv.payment_status === 'completed' ? inv.total_amount : 0;
                      const openBalance = inv.payment_status !== 'completed' ? inv.total_amount : 0;
                      const customerDisplay = inv.child_name ?? inv.customer_name;

                      return (
                        <tr key={inv.id}>
                          <td className={styles.invoiceNumber}>{inv.invoice_number}</td>
                          <td>{formatDate(inv.issue_date)}</td>
                          <td className={styles.customerName}>{customerDisplay}</td>
                          <td><span className={styles.docTypeChip}>{getDocType(inv)}</span></td>
                          <td className={styles.amount}>{formatAmount(inv.total_amount)}</td>
                          <td>{formatAmount(paidSoFar)}</td>
                          <td className={openBalance > 0 ? styles.openBalance : styles.openBalanceZero}>
                            {formatAmount(openBalance)}
                          </td>
                          <td>
                            <span
                              className={`${styles.statusBadge} ${getStatusClass(inv.payment_status)}`}
                              aria-label={getStatusLabel(inv.payment_status)}
                            >
                              {getStatusLabel(inv.payment_status)}
                            </span>
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
                  <span className={styles.statCardValue}>{payments.length}</span>
                  <span className={styles.statCardLabel}>סה&quot;כ תשלומים</span>
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
                  <span className={styles.statCardLabel}>תשלומים החודש</span>
                </div>
              </div>
            </div>

            {/* Payments filter bar */}
            <div className={styles.paymentsFilterBar}>
              <select
                className={styles.filterSelect}
                value={paymentBranchFilter}
                onChange={e => { setPaymentBranchFilter(e.target.value); setPaymentCategoryFilter(''); }}
                aria-label="סינון לפי סוג"
              >
                <option value="">כל הסוגים</option>
                <option value="לקוחות">לקוחות</option>
                <option value="שוכרים">שוכרים</option>
                <option value="ספקים">ספקים</option>
                <option value="חוגים">חוגים</option>
                <option value="מותג קוגומלו">מותג קוגומלו</option>
                <option value="מותג געגע">מותג געגע</option>
              </select>
              {paymentBranchFilter && (
                <select
                  className={styles.filterSelect}
                  value={paymentCategoryFilter}
                  onChange={e => setPaymentCategoryFilter(e.target.value)}
                  aria-label="סינון לפי קטגוריה"
                >
                  <option value="">כל הקטגוריות</option>
                  {PAYMENT_SUBCATEGORIES[paymentBranchFilter]?.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              )}
            </div>

            {/* Payments table */}
            <div className={styles.tableCard}>
              {paymentsLoading ? (
                <div className={styles.loadingWrapper}>טוען...</div>
              ) : sortedPayments.length === 0 ? (
                <div className={styles.emptyState}>לא נמצאו תשלומים</div>
              ) : (
                <table className={`${styles.invoiceTable} ${styles.paymentsTable}`}>
                  <thead>
                    <tr>
                      <th scope="col">תאריך</th>
                      <th scope="col">לקוח</th>
                      <th scope="col">מס' מסמך</th>
                      <th scope="col">סכום</th>
                      <th scope="col">אמצעי</th>
                      <th scope="col">אסמכתא</th>
                      <th scope="col">סטטוס</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedPayments.map(p => {
                      const statusLabel = getPaymentStatusLabel(p.status);
                      return (
                        <tr key={p.id}>
                          <td>{formatDate(p.created_at)}</td>
                          <td className={styles.customerName}>{p.customer_name}</td>
                          <td className={styles.invoiceNumber}>{p.invoice_number}</td>
                          <td className={styles.amount}>{formatAmount(p.amount)}</td>
                          <td><span className={styles.methodBadge}>{p.payment_method}</span></td>
                          <td className={styles.referenceCell}>{p.transaction_reference}</td>
                          <td>
                            <span
                              className={`${styles.statusBadge} ${getPaymentStatusClass(p.status)}`}
                              aria-label={statusLabel}
                            >
                              {statusLabel}
                            </span>
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
    </AppLayout>
  );
}
