'use client';

import { useState, useEffect } from 'react';
import { FileText, Search } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import { fetchInvoices } from '@/lib/storeApi';
import api from '@/lib/api';
import type { StoreInvoice } from '@/types/store';
import type { Branch } from '@/types/branch';
import styles from './invoices.module.css';

type DocType = 'חשבונית מס/קבלה' | 'חשבונית עסקה' | 'טיוטה';

function getDocType(inv: StoreInvoice): DocType {
  if (inv.invoice_number.startsWith('DRAFT')) return 'טיוטה';
  if (inv.payment_method === 'monthly_billing') return 'חשבונית עסקה';
  return 'חשבונית מס/קבלה';
}

function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    completed: 'שולם',
    pending: 'פתוח',
    failed: 'נכשל',
    refunded: 'זוכה',
  };
  return labels[status] ?? status;
}

function getStatusClass(status: string): string {
  const classes: Record<string, string> = {
    completed: styles.statusCompleted,
    pending: styles.statusPending,
    failed: styles.statusFailed,
    refunded: styles.statusRefunded,
  };
  return classes[status] ?? '';
}

function formatAmount(n: number): string {
  return `₪${n.toLocaleString('he-IL')}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<StoreInvoice[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const [searchQuery, setSearchQuery] = useState('');
  const [docTypeFilter, setDocTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [branchFilter, setBranchFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
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
              <FileText className={styles.titleIcon} />
              מסמכים
            </h2>
            <p className={styles.subtitle}>כל החשבוניות, קבלות וזיכויים במקום אחד</p>
          </div>

          <div className={styles.subTabs} role="tablist">
            <button
              role="tab"
              aria-selected
              className={`${styles.tabBtn} ${styles.tabBtnActive}`}
            >
              מסמכים
            </button>
            <button role="tab" aria-selected={false} className={styles.tabBtn} disabled>
              תשלומים
            </button>
            <button role="tab" aria-selected={false} className={styles.tabBtn} disabled>
              גבייה
            </button>
          </div>
        </div>

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
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
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
                      <td>
                        <span className={styles.docTypeChip}>{getDocType(inv)}</span>
                      </td>
                      <td className={styles.amount}>{formatAmount(inv.total_amount)}</td>
                      <td>{formatAmount(paidSoFar)}</td>
                      <td
                        className={
                          openBalance > 0 ? styles.openBalance : styles.openBalanceZero
                        }
                      >
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
      </div>
    </AppLayout>
  );
}
