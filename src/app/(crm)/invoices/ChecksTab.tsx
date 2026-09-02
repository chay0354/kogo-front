'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { Banknote, Plus, Search } from 'lucide-react';
import { TableSkeleton } from '@/components/ui/skeleton';
import { cancelCheckPlan, fetchCheckPlans, type CheckPlanRow } from '@/lib/documentsApi';
import RegisterChecksDialog from './RegisterChecksDialog';
import pageStyles from './invoices.module.css';
import styles from './checks.module.css';

interface ChecksTabProps {
  formatAmount: (value: number) => string;
  formatDate: (value: string) => string;
  branchFilter?: string;
}

function planStatusLabel(status: string) {
  if (status === 'active') return 'פעיל';
  if (status === 'completed') return 'הושלם';
  if (status === 'cancelled') return 'בוטל';
  return status;
}

function itemStatusLabel(status: string) {
  if (status === 'pending') return 'ממתין לחשבונית';
  if (status === 'invoiced') return 'הופקה חשבונית';
  if (status === 'cancelled') return 'בוטל';
  return status;
}

export default function ChecksTab({ formatAmount, formatDate, branchFilter }: ChecksTabProps) {
  const [plans, setPlans] = useState<CheckPlanRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [registerOpen, setRegisterOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);

  async function loadPlans() {
    setLoading(true);
    setError('');
    try {
      const rows = await fetchCheckPlans({
        search: search.trim() || undefined,
        status: statusFilter || undefined,
        branch: branchFilter || undefined,
      });
      setPlans(rows);
    } catch {
      setPlans([]);
      setError('שגיאה בטעינת הצ׳קים');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPlans();
    // Search is applied locally after first load; refetch on status/branch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, branchFilter]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return plans;
    return plans.filter((plan) => (
      plan.child_name.toLowerCase().includes(q)
      || (plan.description || '').toLowerCase().includes(q)
      || (plan.lesson_name || '').toLowerCase().includes(q)
      || (plan.receipt_number || '').toLowerCase().includes(q)
      || plan.items.some((item) => (item.check_number || '').toLowerCase().includes(q))
    ));
  }, [plans, search]);

  const activeCount = plans.filter((plan) => plan.status === 'active').length;
  const pendingInvoices = plans.reduce(
    (sum, plan) => sum + plan.items.filter((item) => item.status === 'pending').length,
    0,
  );
  const monthTotal = plans.reduce((sum, plan) => sum + Number(plan.total_amount || 0), 0);

  async function handleCancel(plan: CheckPlanRow) {
    if (!window.confirm(`לבטל את תוכנית הצ׳קים של ${plan.child_name}? הקבלה שכבר הופקה לא תבוטל.`)) {
      return;
    }
    setActionId(plan.id);
    try {
      const updated = await cancelCheckPlan(plan.id);
      setPlans((prev) => prev.map((row) => (row.id === plan.id ? updated : row)));
    } catch {
      window.alert('שגיאה בביטול תוכנית הצ׳קים');
    } finally {
      setActionId(null);
    }
  }

  return (
    <>
      <div className={pageStyles.statsRow}>
        <div className={`${pageStyles.statCard} ${pageStyles.statCardBlue}`}>
          <div className={pageStyles.statCardIcon}>
            <Banknote size={18} />
          </div>
          <div className={pageStyles.statCardBody}>
            <span className={pageStyles.statCardValue}>{plans.length}</span>
            <span className={pageStyles.statCardLabel}>תוכניות צ׳קים</span>
          </div>
        </div>
        <div className={`${pageStyles.statCard} ${pageStyles.statCardGreen}`}>
          <div className={pageStyles.statCardIcon}>
            <Banknote size={18} />
          </div>
          <div className={pageStyles.statCardBody}>
            <span className={pageStyles.statCardValue}>{activeCount}</span>
            <span className={pageStyles.statCardLabel}>פעילות</span>
          </div>
        </div>
        <div className={`${pageStyles.statCard} ${pageStyles.statCardOrange}`}>
          <div className={pageStyles.statCardIcon}>
            <Banknote size={18} />
          </div>
          <div className={pageStyles.statCardBody}>
            <span className={pageStyles.statCardValue}>{pendingInvoices}</span>
            <span className={pageStyles.statCardLabel}>חשבוניות ממתינות</span>
          </div>
        </div>
      </div>

      <div className={pageStyles.filterBar}>
        <select
          className={pageStyles.filterSelect}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          aria-label="סינון לפי סטטוס"
        >
          <option value="">כל הסטטוסים</option>
          <option value="active">פעיל</option>
          <option value="completed">הושלם</option>
          <option value="cancelled">בוטל</option>
        </select>
        <div className={pageStyles.searchWrapper}>
          <Search className={pageStyles.searchIcon} aria-hidden="true" />
          <input
            type="text"
            className={pageStyles.searchInput}
            placeholder="חיפוש לפי ילד, חוג, מספר צ׳ק..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            aria-label="חיפוש צ׳קים"
          />
        </div>
        <button type="button" className={pageStyles.newDocBtn} onClick={() => setRegisterOpen(true)}>
          <Plus size={16} />
          רישום צ׳קים
        </button>
      </div>

      {error ? <p className={pageStyles.emptyState} style={{ padding: '8px 0' }}>{error}</p> : null}

      <div className={pageStyles.tableCard}>
        {loading ? (
          <TableSkeleton columns={8} tableClassName={pageStyles.invoiceTable} label="טוען צ׳קים" />
        ) : filtered.length === 0 ? (
          <div className={pageStyles.emptyState}>אין עדיין רישומי צ׳קים. לחצו על רישום צ׳קים אחרי פתיחת הלקוח במשרד.</div>
        ) : (
          <table className={`${pageStyles.invoiceTable} ${pageStyles.paymentsTable}`}>
            <thead>
              <tr>
                <th scope="col">לקוח</th>
                <th scope="col">חוג</th>
                <th scope="col">סניף</th>
                <th scope="col">סה״כ</th>
                <th scope="col">קבלה</th>
                <th scope="col">צ׳ק הבא</th>
                <th scope="col">סטטוס</th>
                <th scope="col">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((plan) => {
                const open = expandedId === plan.id;
                const statusClass =
                  plan.status === 'active'
                    ? pageStyles.statusCompleted
                    : plan.status === 'cancelled'
                      ? pageStyles.statusRefunded
                      : pageStyles.statusPending;
                return (
                  <Fragment key={plan.id}>
                    <tr>
                      <td className={pageStyles.customerName}>{plan.child_name}</td>
                      <td>{plan.lesson_name || plan.description || '—'}</td>
                      <td>{plan.branch_name || '—'}</td>
                      <td className={pageStyles.amount}>{formatAmount(Number(plan.total_amount))}</td>
                      <td>{plan.receipt_number || '—'}</td>
                      <td>{plan.next_due_date ? formatDate(plan.next_due_date) : '—'}</td>
                      <td>
                        <span className={`${pageStyles.statusBadge} ${statusClass}`}>
                          {planStatusLabel(plan.status)}
                        </span>
                      </td>
                      <td>
                        <div className={pageStyles.recurringActions}>
                          <button
                            type="button"
                            className={pageStyles.editRecurringBtn}
                            onClick={() => setExpandedId(open ? null : plan.id)}
                          >
                            {open ? 'הסתר צ׳קים' : `צ׳קים (${plan.items.length})`}
                          </button>
                          {plan.status === 'active' ? (
                            <button
                              type="button"
                              className={pageStyles.cancelRecurringBtn}
                              disabled={actionId === plan.id}
                              onClick={() => void handleCancel(plan)}
                            >
                              {actionId === plan.id ? 'מבטל...' : 'ביטול'}
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                    {open ? (
                      <tr className={styles.nestedRow}>
                        <td colSpan={8}>
                          <table className={styles.nestedTable}>
                            <thead>
                              <tr>
                                <th>תאריך</th>
                                <th>בנק</th>
                                <th>סניף</th>
                                <th>חשבון</th>
                                <th>מס׳ צ׳ק</th>
                                <th>סכום</th>
                                <th>סטטוס</th>
                                <th>חשבונית מס</th>
                              </tr>
                            </thead>
                            <tbody>
                              {plan.items.map((item) => (
                                <tr key={item.id}>
                                  <td>{formatDate(item.due_date)}</td>
                                  <td>{item.bank || '—'}</td>
                                  <td>{item.bank_branch || '—'}</td>
                                  <td>{item.account_number || '—'}</td>
                                  <td>{item.check_number || '—'}</td>
                                  <td>{formatAmount(Number(item.amount))}</td>
                                  <td>{itemStatusLabel(item.status)}</td>
                                  <td>{item.tax_invoice_number || '—'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <p className={styles.footnote}>
        סה״כ רשום: {formatAmount(monthTotal)}. חשבונית מס לחודש יוצאת אוטומטית ביום הצ׳ק, יחד עם הוראות הקבע.
      </p>

      <RegisterChecksDialog
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
        onCreated={() => { void loadPlans(); }}
      />
    </>
  );
}
