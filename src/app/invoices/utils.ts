import type { StoreInvoice } from '@/types/store';
import type { DocType, PaymentRecord } from './types';
import styles from './invoices.module.css';

export function getDocType(inv: StoreInvoice): DocType {
  if (inv.invoice_number.startsWith('DRAFT')) return 'טיוטה';
  if (inv.payment_method === 'monthly_billing') return 'חשבונית עסקה';
  return 'חשבונית מס/קבלה';
}

export function getStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    completed: 'שולם',
    pending: 'פתוח',
    failed: 'נכשל',
    refunded: 'זוכה',
  };
  return labels[status] ?? status;
}

export function getStatusClass(status: string): string {
  const classes: Record<string, string> = {
    completed: styles.statusCompleted,
    pending: styles.statusPending,
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

export function formatAmount(n: number | undefined | null): string {
  return `₪${(n ?? 0).toLocaleString('he-IL')}`;
}

export function formatDate(iso: string): string {
  const d = new Date(iso);
  return `${d.getDate()}.${d.getMonth() + 1}.${d.getFullYear()}`;
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
