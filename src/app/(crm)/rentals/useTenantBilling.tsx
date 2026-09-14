'use client';

import { useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useAuth } from '@/components/AuthProvider';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import BodyPortal from '@/app/(crm)/invoices/BodyPortal';
import {
  endStandingOrder,
  fetchBillingStatus,
  fetchStandingOrders,
  pauseStandingOrder,
  resumeStandingOrder,
  type StandingOrder,
} from '@/lib/rentalBillingApi';
import type { Tenancy } from '@/lib/rentalsApi';
import CardLinkDialog from './CardLinkDialog';
import ChargesDialog from './ChargesDialog';
import StandingOrderCell from './StandingOrderCell';
import StandingOrderDialog from './StandingOrderDialog';
import {
  billingApiError,
  billingNotices,
  lifecycleConfirmCopy,
  ordersByTenancy,
  terminalModeNote,
  type OrderLifecycle,
} from './billingUtils';
import { isUnknownOutcome, tenantName } from './tenancyUtils';

export const BILLING_STATUS_KEY = ['rental-billing', 'status'] as const;
export const STANDING_ORDERS_KEY = ['rental-billing', 'standing-orders'] as const;

const NO_ORDERS: StandingOrder[] = [];

type BillingDialog =
  | { kind: 'order'; tenancy: Tenancy; order: StandingOrder | null }
  | { kind: 'card-link'; tenancy: Tenancy; order: StandingOrder }
  | { kind: 'charges'; tenancy: Tenancy; order: StandingOrder }
  | null;

type LifecycleConfirm = { kind: OrderLifecycle; tenancy: Tenancy; order: StandingOrder } | null;

const LIFECYCLE_DONE: Record<OrderLifecycle, string> = {
  pause: 'הוראת הקבע הושהתה',
  resume: 'הוראת הקבע חודשה',
  end: 'הוראת הקבע הסתיימה',
};

const LIFECYCLE_CALL: Record<OrderLifecycle, (id: string) => Promise<StandingOrder>> = {
  pause: pauseStandingOrder,
  resume: resumeStandingOrder,
  end: endStandingOrder,
};

/**
 * The tenants view's standing orders (phase 4), kept out of the view itself:
 * whether charging is on, each tenancy's order, the column that shows it, and
 * the dialogs and confirmations that act on it. The view calls it once, puts
 * `renderCell` in its column, `notices` above its list and `dialogs` at its end.
 *
 * The orders arrive whole, scoped to the user's branches by the server, and
 * every change goes to the server and the list is read again — this never
 * edits its own copy. A dialog opened on an order follows the list, so what
 * it shows is what the server holds now.
 */
export function useTenantBilling({ enabled }: { enabled: boolean }) {
  const queryClient = useQueryClient();
  const statusQuery = useQuery({ queryKey: BILLING_STATUS_KEY, queryFn: fetchBillingStatus, enabled, staleTime: 0 });
  const ordersQuery = useQuery({
    queryKey: STANDING_ORDERS_KEY,
    queryFn: () => fetchStandingOrders(),
    enabled,
    staleTime: 0,
  });

  const orders = ordersQuery.data ?? NO_ORDERS;
  const byTenancy = useMemo(() => ordersByTenancy(orders), [orders]);
  // Off until the server says on: a promise of no charge is safe, a promise of one is not.
  const billingEnabled = statusQuery.data?.enabled === true;
  const notices = billingNotices(statusQuery.data);
  const terminalNote = terminalModeNote(statusQuery.data);
  const { user } = useAuth();
  // The four money decisions on a charge are a manager's; the server refuses a partner (403), so a partner is offered none.
  const canDecide = user?.role === 'manager';

  const [dialog, setDialog] = useState<BillingDialog>(null);
  const [confirm, setConfirm] = useState<LifecycleConfirm>(null);
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);
  // Read by a second click before the state has re-rendered.
  const busyRef = useRef(false);
  // A lifecycle action's failure, in the server's words, under its row's order.
  const [errors, setErrors] = useState<Record<string, string>>({});

  function refresh() {
    void queryClient.invalidateQueries({ queryKey: STANDING_ORDERS_KEY });
    void queryClient.invalidateQueries({ queryKey: BILLING_STATUS_KEY });
  }

  /** The order as the list reads it now. */
  function current(order: StandingOrder): StandingOrder {
    return orders.find((item) => item.id === order.id) ?? order;
  }

  function clearError(tenancyId: string) {
    setErrors((prev) => {
      if (!(tenancyId in prev)) return prev;
      const next = { ...prev };
      delete next[tenancyId];
      return next;
    });
  }

  function open(next: Exclude<BillingDialog, null>) {
    clearError(next.tenancy.id);
    setDialog(next);
  }

  async function runLifecycle(choice: boolean) {
    const target = confirm;
    if (!choice || !target || busyRef.current) return;
    busyRef.current = true;
    setBusyOrderId(target.order.id);
    clearError(target.tenancy.id);
    try {
      await LIFECYCLE_CALL[target.kind](target.order.id);
      toast.success(LIFECYCLE_DONE[target.kind]);
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [target.tenancy.id]: isUnknownOutcome(err)
          ? 'לא התקבלה תשובה מהשרת, ולכן לא ברור אם הפעולה בוצעה. הרשימה מתרעננת — בדקו בה לפני שמנסים שוב.'
          : billingApiError(err, 'הפעולה על הוראת הקבע נכשלה'),
      }));
    } finally {
      busyRef.current = false;
      setBusyOrderId(null);
      // Done, refused or unanswered — the row shows what the server holds now.
      refresh();
    }
  }

  function renderCell(tenancy: Tenancy): ReactNode {
    const order = byTenancy.get(tenancy.id) ?? null;
    return (
      <StandingOrderCell
        tenancy={tenancy}
        order={order}
        loading={ordersQuery.isLoading}
        failed={ordersQuery.isError && !ordersQuery.data}
        busy={order !== null && busyOrderId === order.id}
        error={errors[tenancy.id] ?? ''}
        onOpen={() => open({ kind: 'order', tenancy, order: null })}
        onEdit={(target) => open({ kind: 'order', tenancy, order: target })}
        onCardLink={(target) => open({ kind: 'card-link', tenancy, order: target })}
        onCharges={(target) => open({ kind: 'charges', tenancy, order: target })}
        onLifecycle={(kind, target) => {
          clearError(tenancy.id);
          setConfirm({ kind, tenancy, order: target });
        }}
      />
    );
  }

  const copy = confirm
    ? lifecycleConfirmCopy(confirm.kind, tenantName(confirm.tenancy.tenant))
    : { title: '', message: '', confirmText: 'אישור' };

  const dialogs = (
    <>
      {dialog?.kind === 'order' && (
        <StandingOrderDialog
          key={dialog.order?.id ?? `new-${dialog.tenancy.id}`}
          tenancy={dialog.tenancy}
          order={dialog.order ? current(dialog.order) : null}
          onClose={() => setDialog(null)}
          onChanged={refresh}
          onSaved={(saved, created) => {
            refresh();
            if (created) {
              toast.success('הוראת הקבע נפתחה — ממתינה לכרטיס מהשוכר');
              // What the office came for next is the tenant's link. It takes this dialog's place, so two never stack.
              setDialog({ kind: 'card-link', tenancy: dialog.tenancy, order: saved });
            } else {
              toast.success('הוראת הקבע עודכנה');
              setDialog(null);
            }
          }}
        />
      )}

      {dialog?.kind === 'card-link' && (
        <CardLinkDialog
          key={`card-link-${dialog.order.id}`}
          tenancy={dialog.tenancy}
          order={current(dialog.order)}
          billingEnabled={billingEnabled}
          onClose={() => setDialog(null)}
          onChanged={refresh}
        />
      )}

      {dialog?.kind === 'charges' && (
        <ChargesDialog
          key={`charges-${dialog.order.id}`}
          tenancy={dialog.tenancy}
          order={current(dialog.order)}
          billingEnabled={billingEnabled}
          canDecide={canDecide}
          onClose={() => setDialog(null)}
          onChanged={refresh}
        />
      )}

      <BodyPortal>
        <ConfirmDialog
          isOpen={confirm !== null}
          onClose={() => setConfirm(null)}
          onConfirm={runLifecycle}
          title={copy.title}
          message={copy.message}
          confirmText={copy.confirmText}
          type="warning"
        />
      </BodyPortal>
    </>
  );

  return { notices, terminalNote, billingEnabled, renderCell, dialogs, refresh };
}
