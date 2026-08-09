import type { StoreInvoice } from '@/types/store';
import type { AgingBucket, DocType, PaymentRecord } from './types';
import styles from './invoices.module.css';

const AGING_BUCKET_DEFS: Array<{ key: AgingBucket['key']; label: string; min: number; max: number }> = [
  { key: 'current', label: 'שוטף (0-30)', min: 0, max: 30 },
  { key: 'd31_60', label: '31-60 יום', min: 31, max: 60 },
  { key: 'd61_90', label: '61-90 יום', min: 61, max: 90 },
  { key: 'd90_plus', label: '90+ יום', min: 91, max: Infinity },
];

export function getDocType(inv: StoreInvoice): DocType {
  if (inv.invoice_number.startsWith('DRAFT')) return 'טיוטה';
  if (inv.payment_method === 'monthly_billing') return 'חשבונית עסקה';
  return 'חשבונית מס/קבלה';
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    completed: 'שולם',
    pending: 'פתוח',
    partially_paid: 'שולם חלקית',
    failed: 'נכשל',
    refunded: 'זוכה',
  };
  return labels[status] ?? status;
}

export function getStatusClass(status: string): string {
  const classes: Record<string, string> = {
    completed: styles.statusCompleted,
    pending: styles.statusPending,
    partially_paid: styles.statusFailed,
    failed: styles.statusFailed,
    refunded: styles.statusRefunded,
  };
  return classes[status] ?? '';
}

export function getPaymentStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    approved: 'אושר',
    completed: 'אושר',
    pending: 'ממתין',
    failed: 'נכשל',
    refunded: 'זוכה',
  };
  return labels[status] ?? status;
}

export function getPaymentStatusClass(status: string): string {
  const classes: Record<string, string> = {
    approved: styles.statusCompleted,
    completed: styles.statusCompleted,
    pending: styles.statusPending,
    failed: styles.statusFailed,
    refunded: styles.statusRefunded,
  };
  return classes[status] ?? '';
}

export function getRecurringStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    active: 'פעיל',
    paused: 'מושהה',
    cancelled: 'מבוטל',
    expired: 'פג תוקף',
    failed: 'נכשל',
  };
  return labels[status] ?? status;
}

export function getRecurringStatusClass(status: string): string {
  const classes: Record<string, string> = {
    active: styles.statusCompleted,
    paused: styles.statusPending,
    cancelled: styles.statusRefunded,
    expired: styles.statusFailed,
    failed: styles.statusFailed,
  };
  return classes[status] ?? '';
}

export function formatAmount(n: number | undefined | null): string {
  return `₪${(n ?? 0).toLocaleString('he-IL')}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
}

export function getOpenInvoices(invoices: StoreInvoice[]): StoreInvoice[] {
  return invoices.filter(inv => inv.payment_status !== 'completed' && inv.payment_status !== 'refunded');
}

export function getOpenBalance(inv: StoreInvoice): number {
  return Math.max((inv.total_amount ?? 0) - (inv.amount_paid ?? 0), 0);
}

export function getDaysOverdue(issueDate: string): number {
  const issued = new Date(issueDate);
  const today = new Date();
  const msPerDay = 1000 * 60 * 60 * 24;
  const diff = Math.floor(
    (Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()) -
      Date.UTC(issued.getFullYear(), issued.getMonth(), issued.getDate())) /
      msPerDay,
  );
  return Math.max(diff, 0);
}

export function getOverdueLabel(daysOverdue: number): string {
  return daysOverdue > 0 ? `${daysOverdue} ימים` : 'טרם הגיע';
}

export function getAgingBuckets(invoices: StoreInvoice[]): AgingBucket[] {
  return AGING_BUCKET_DEFS.map(def => {
    const matching = invoices.filter(inv => {
      const days = getDaysOverdue(inv.issue_date);
      return days >= def.min && days <= def.max;
    });
    return {
      key: def.key,
      label: def.label,
      total: matching.reduce((sum, inv) => sum + getOpenBalance(inv), 0),
      count: matching.length,
    };
  });
}

export function getCurrentMonthTotal(payments: PaymentRecord[]): number {
  const now = new Date();
  return payments
    .filter(p => {
      const d = new Date(p.created_at);
      return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    })
    .reduce((sum, p) => sum + (p.amount ?? 0), 0);
}
