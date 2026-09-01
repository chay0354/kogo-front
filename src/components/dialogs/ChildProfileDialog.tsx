'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  ArrowLeftRight,
  Calendar,
  ChevronLeft,
  CreditCard,
  ExternalLink,
  GraduationCap,
  HeadphonesIcon,
  Loader2,
  Mail,
  MapPin,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  User,
  Users,
} from 'lucide-react';

import { ChildWithDetails, AbsenceRecord, EnrollmentDetail } from '@/types/customer';
import { formatWhatsAppLink, formatHebrewDate, formatEnrollmentSlot, groupEnrollmentsForTable } from '@/lib/customerUtils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogCloseButton } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { GroupIdBadge } from '@/components/GroupIdBadge/GroupIdBadge';
import api from '@/lib/api';
import RefundDialog from '@/components/dialogs/RefundDialog';
import { upcomingCharges } from '@/components/dialogs/upcomingCharges';

interface ChildProfileDialogProps {
  child: ChildWithDetails;
  isOpen: boolean;
  onClose: () => void;
  onOpenEnroll?: () => void;
  onEditEnrollment?: (slots: EnrollmentDetail[]) => void;
  onRemovedFromCourse?: (payload: {
    removedEnrollmentIds: string[];
    childStatus?: string;
  }) => void;
}

function daysUntil(dateString: string | null): number | null {
  if (!dateString) return null;
  const end = new Date(dateString);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

function formatShekel(value: unknown): string {
  const n = Number(value);
  if (!Number.isFinite(n)) return '₪0';
  return `₪${n.toLocaleString('he-IL', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

function isOneTimePayment(payment: {
  registration_fee?: unknown;
  trial_lesson_date?: string | null;
  payment_type?: string;
  description?: string;
  final_amount?: unknown;
}): boolean {
  // Extra twice/thrice-a-week days are stored as ₪0 payments so the child can
  // enroll; they are not one-time charges and must not appear in this table.
  if (Number(payment.final_amount || 0) <= 0 && Number(payment.registration_fee || 0) <= 0) {
    return false;
  }
  if (Number(payment.registration_fee || 0) > 0) return true;
  if (payment.trial_lesson_date) return true;
  if (payment.payment_type === 'one_time') return true;
  const desc = String(payment.description || '');
  return desc.includes('דמי רישום') || desc.includes('ניסיון');
}

function paymentStatusBadge(status: string): { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' } {
  if (status === 'completed') return { label: 'הושלם', variant: 'default' };
  if (status === 'refunded') return { label: 'זוכה', variant: 'secondary' };
  if (status === 'failed' || status === 'refund_failed') return { label: status === 'refund_failed' ? 'זיכוי נכשל' : 'נכשל', variant: 'destructive' };
  if (status === 'cancelled') return { label: 'בוטל', variant: 'outline' };
  return { label: 'ממתין', variant: 'outline' };
}

function recurringStatusLabel(status: string): string {
  if (status === 'active') return 'פעיל';
  if (status === 'cancelled') return 'בוטל';
  if (status === 'paused') return 'מושהה';
  if (status === 'expired') return 'פג';
  if (status === 'failed') return 'נכשל';
  return status;
}

function storePurchaseLabel(invoice: {
  invoice_number?: string;
  line_items?: Array<{ product_name?: string }>;
}): string {
  const products = (invoice.line_items || [])
    .map((item) => item.product_name)
    .filter(Boolean);
  if (products.length) return `רכישה בחנות · ${products.join(', ')}`;
  return invoice.invoice_number ? `רכישה בחנות · ${invoice.invoice_number}` : 'רכישה בחנות';
}

function oneTimePaymentLabel(payment: {
  description?: string;
  lesson_name?: string;
  registration_fee?: unknown;
  trial_lesson_date?: string | null;
}): string {
  if (payment.trial_lesson_date) {
    return payment.description || `שיעור ניסיון${payment.lesson_name ? ` · ${payment.lesson_name}` : ''}`;
  }
  if (Number(payment.registration_fee || 0) > 0 || String(payment.description || '').includes('דמי רישום')) {
    return `דמי רישום${payment.lesson_name ? ` · ${payment.lesson_name}` : ''}`;
  }
  return payment.description || payment.lesson_name || 'חיוב חד-פעמי';
}

export default function ChildProfileDialog({
  child,
  isOpen,
  onClose,
  onOpenEnroll,
  onEditEnrollment,
  onRemovedFromCourse,
}: ChildProfileDialogProps) {
  const [absences, setAbsences] = useState<AbsenceRecord[]>([]);
  const [loadingAbsences, setLoadingAbsences] = useState(false);
  const [payments, setPayments] = useState<any[]>([]);
  const [storeInvoices, setStoreInvoices] = useState<any[]>([]);
  const [recurringPayments, setRecurringPayments] = useState<any[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  
  // Refund dialog state
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [refundItem, setRefundItem] = useState<{
    type: 'payment' | 'invoice';
    id: string;
    amount: number;
    description: string;
  } | null>(null);
  const [refundLoading, setRefundLoading] = useState(false);
  const [dropGroup, setDropGroup] = useState<{
    courseName: string;
    slots: EnrollmentDetail[];
    trial: boolean;
  } | null>(null);
  const [dropLoading, setDropLoading] = useState(false);
  
  const genderText = child.gender === 'male' ? 'בן' : child.gender === 'female' ? 'בת' : 'בן/בת';
  const whatsapp = formatWhatsAppLink(child.parent_phone);
  const renewVisible = useMemo(() => {
    // subscription_status was removed on backend; rely on current explicit status + dates
    if (child.status === 'inactive') return true;
    const d = daysUntil(child.paid_until_date || child.subscription_end_date);
    return d !== null && d <= 30;
  }, [child.status, child.paid_until_date, child.subscription_end_date]);
  
  // Fetch absence history when dialog opens
  useEffect(() => {
    if (isOpen && child.id) {
      fetchAbsenceHistory();
      fetchPaymentData();
    }
  }, [isOpen, child.id]);
  
  const fetchAbsenceHistory = async () => {
    setLoadingAbsences(true);
    try {
      const response = await api.get(`/customers/children/${child.id}/absence_history/`);
      setAbsences(response.data || []);
    } catch (error) {
      console.error('Error fetching absence history:', error);
      setAbsences([]);
    } finally {
      setLoadingAbsences(false);
    }
  };
  
  const fetchPaymentData = async () => {
    setLoadingPayments(true);
    try {
      const [paymentsRes, storeInvoicesRes, recurringRes] = await Promise.all([
        api.get(`/customers/payments/?child_id=${child.id}`).catch(() => ({ data: [] })),
        api.get(`/store/invoices/?child_id=${child.id}`).catch(() => ({ data: [] })),
        api.get(`/customers/recurring-payments/?child_id=${child.id}`).catch(() => ({ data: [] }))
      ]);
      
      const paymentsData = paymentsRes.data?.results || paymentsRes.data || [];
      const storeData = storeInvoicesRes.data?.results || storeInvoicesRes.data || [];
      const recurringData = recurringRes.data?.results || recurringRes.data || [];
      
      setPayments(Array.isArray(paymentsData) ? paymentsData : []);
      setStoreInvoices(Array.isArray(storeData) ? storeData : []);
      setRecurringPayments(Array.isArray(recurringData) ? recurringData : []);
    } catch (error) {
      console.error('Error fetching payment data:', error);
    } finally {
      setLoadingPayments(false);
    }
  };
  
  const handleCancelRecurring = async (recurringId: string) => {
    if (!confirm('האם אתה בטוח שברצונך לבטל את המנוי החוזר?')) return;
    
    setActionLoading(recurringId);
    try {
      await api.post(`/customers/recurring-payments/${recurringId}/cancel/`, {
        cancellation_reason: 'ביטול ידני'
      });
      alert('המנוי החוזר בוטל בהצלחה');
      fetchPaymentData();
    } catch (error) {
      console.error('Error cancelling recurring payment:', error);
      alert('שגיאה בביטול המנוי');
    } finally {
      setActionLoading(null);
    }
  };
  
  const handleUpdateRecurring = async (recurringId: string) => {
    const newAmount = prompt('הזן סכום חדש למנוי (יחול מהחודש הבא):');
    if (!newAmount) return;
    
    setActionLoading(recurringId);
    try {
      await api.post(`/customers/recurring-payments/${recurringId}/schedule-amount/`, {
        amount: parseFloat(newAmount),
      });
      alert('הסכום החדש נקבע לחודש הבא');
      fetchPaymentData();
    } catch (error) {
      console.error('Error updating recurring payment:', error);
      alert('שגיאה בעדכון המנוי');
    } finally {
      setActionLoading(null);
    }
  };
  
  const handleCreditPayment = (payment: any) => {
    setRefundItem({
      type: 'payment',
      id: payment.id,
      amount: parseFloat(payment.final_amount),
      description: `תשלום #${payment.id.slice(0, 8)} - ${payment.payment_type === 'recurring_subscription' ? 'מנוי חוזר' : 'תשלום חד-פעמי'}`
    });
    setRefundDialogOpen(true);
  };
  
  const handleCreditStoreInvoice = (invoice: any) => {
    setRefundItem({
      type: 'invoice',
      id: invoice.id,
      amount: parseFloat(invoice.total_amount),
      description: `חשבונית ${invoice.invoice_number}`
    });
    setRefundDialogOpen(true);
  };
  
  const handleRefundConfirm = async (amount: number | null, reason: string) => {
    if (!refundItem) return;
    
    setRefundLoading(true);
    try {
      const endpoint = refundItem.type === 'payment'
        ? `/customers/payments/${refundItem.id}/refund/`
        : `/store/invoices/${refundItem.id}/refund/`;
      
      await api.post(endpoint, {
        amount: amount, // null for full refund
        reason: reason
      });
      
      alert(refundItem.type === 'payment' ? 'התשלום זוכה בהצלחה' : 'החשבונית זוכתה בהצלחה');
      setRefundDialogOpen(false);
      setRefundItem(null);
      fetchPaymentData();
    } catch (error: any) {
      console.error('Error processing refund:', error);
      const errorMessage = error.response?.data?.error || 'שגיאה בביצוע הזיכוי';
      alert(errorMessage);
    } finally {
      setRefundLoading(false);
    }
  };

  const handleDropConfirm = async (confirmed: boolean) => {
    if (!confirmed || !dropGroup) return;
    const enrollmentId = dropGroup.slots[0]?.enrollment_id;
    if (!enrollmentId) return;
    setDropLoading(true);
    try {
      const res = await api.post(`/enrollments/lesson-enrollments/${enrollmentId}/drop-course/`, {
        cancellation_reason: dropGroup.trial ? 'בוטל שיעור ניסיון' : 'הוסר מהחוג',
      });
      onRemovedFromCourse?.({
        removedEnrollmentIds: (res.data?.removed_enrollment_ids || []).map(String),
        childStatus: res.data?.child_status,
      });
      setDropGroup(null);
    } catch (error: unknown) {
      const data = (error as { response?: { data?: { error?: string } } })?.response?.data;
      alert(data?.error || 'שגיאה בהסרה מהחוג');
      throw error;
    } finally {
      setDropLoading(false);
    }
  };

  const courseGroups = useMemo(
    () => groupEnrollmentsForTable(child.enrollments ?? []),
    [child.enrollments],
  );

  const oneTimeCharges = useMemo(() => {
    const fromPayments = payments
      .filter((payment) => isOneTimePayment(payment) && ['completed', 'refunded'].includes(payment.status))
      .map((payment) => ({
        key: `payment-${payment.id}`,
        kind: 'payment' as const,
        date: payment.payment_date || payment.created_at || null,
        description: oneTimePaymentLabel(payment),
        amount:
          Number(payment.registration_fee || 0) > 0
            ? Number(payment.registration_fee)
            : Number(payment.final_amount || 0),
        status: payment.status as string,
        canRefund: payment.status === 'completed' && Number(payment.final_amount || 0) > 0,
        raw: payment,
      }));

    const fromStore = storeInvoices
      .filter((invoice) => ['completed', 'refunded', 'refund_failed'].includes(invoice.payment_status))
      .map((invoice) => ({
        key: `store-${invoice.id}`,
        kind: 'store' as const,
        date: invoice.issue_date || invoice.created_at || null,
        description: storePurchaseLabel(invoice),
        amount: Number(invoice.total_amount || 0),
        status: invoice.payment_status as string,
        canRefund:
          (invoice.payment_status === 'completed' || invoice.payment_status === 'refund_failed')
          && invoice.payment_method === 'credit_card',
        raw: invoice,
      }));

    return [...fromPayments, ...fromStore].sort((a, b) => {
      const aTime = a.date ? new Date(a.date).getTime() : 0;
      const bTime = b.date ? new Date(b.date).getTime() : 0;
      return bTime - aTime;
    });
  }, [payments, storeInvoices]);

  const standingOrders = useMemo(() => {
    const rank = (status: string) => (status === 'active' ? 0 : 1);
    return [...recurringPayments].sort((a, b) => rank(a.status) - rank(b.status));
  }, [recurringPayments]);

  const monthlyTotal = standingOrders
    .filter((item) => item.status === 'active')
    .reduce((sum, item) => sum + Number(item.amount || 0), 0);

  const futureCharges = useMemo(
    () => upcomingCharges(standingOrders),
    [standingOrders],
  );

  return (
    <>
    <Dialog open={isOpen} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
        <Tabs defaultValue="details">
          <div className="sticky top-0 bg-white z-10 border-b">
            <div className="flex items-start justify-between px-6 pt-6 pb-4">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-xl">
                  <ChevronLeft className="h-5 w-5" />
                  <User className="h-5 w-5" />
                  {child.first_name} {child.last_name}
                  <Badge variant="outline" className="mr-2">
                    {genderText}
                  </Badge>
                  <Badge variant="secondary">גיל {child.age}</Badge>
                  <span style={{ fontSize: '10px', color: 'white', userSelect: 'none' }}> #11</span>
                </DialogTitle>
                <DialogDescription>פרופיל ילד ומידע נוסף</DialogDescription>
              </DialogHeader>
              <DialogCloseButton />
            </div>
            <div className="px-6 pb-4">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="details">
                  <User className="h-4 w-4" />
                  פרטים
                </TabsTrigger>
                <TabsTrigger value="courses">
                  <GraduationCap className="h-4 w-4" />
                  קבוצות
                </TabsTrigger>
                <TabsTrigger value="payments">
                  <CreditCard className="h-4 w-4" />
                  תשלומים
                </TabsTrigger>
              </TabsList>
            </div>
          </div>

              {/* Tab 1: Details */}
              <TabsContent value="details" className="pt-6 px-0">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 px-6 pb-6">
                  {/* Left column */}
                  <div className="space-y-6">
                    <div>
                      <h4 className="font-semibold text-lg flex items-center gap-2">
                        <User className="h-5 w-5 text-primary" />
                        פרטי ילד
                      </h4>
                      <div className="bg-muted/50 rounded-lg p-4 space-y-3 mt-3">
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground text-sm">שם מלא</span>
                          <span className="font-medium">{child.first_name} {child.last_name}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground text-sm">גיל</span>
                          <span className="font-medium">{child.age}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground text-sm">מגדר</span>
                          <span className="font-medium">{child.gender === 'male' ? 'זכר' : child.gender === 'female' ? 'נקבה' : '-'}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground text-sm">תאריך לידה</span>
                          <span className="font-medium">{formatHebrewDate(child.birth_date)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground text-sm">תעודת זהות</span>
                          <span className="font-medium">{child.id_number || '-'}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground text-sm">טלפון ילד</span>
                          <span className="font-medium">{child.phone_number || '-'}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground text-sm">תאריך רישום</span>
                          <span className="font-medium">{formatHebrewDate(child.created_at)}</span>
                        </div>
                        <div className="flex justify-between gap-4 items-center">
                          <span className="text-muted-foreground text-sm">שיעור ניסיון</span>
                          {(child.status === 'trial_signed' || child.status === 'trial_completed' || child.trial_classes_attended > 0) ? (
                            <Badge variant="secondary">כן</Badge>
                          ) : (
                            <Badge variant="outline">לא</Badge>
                          )}
                        </div>
                      </div>
                    </div>

                    <div>
                      <h4 className="font-semibold text-lg flex items-center gap-2">
                        <Calendar className="h-5 w-5 text-primary" />
                        פרטי מנוי
                      </h4>
                      <div className="bg-muted/50 rounded-lg p-4 space-y-3 mt-3">
                        <div className="flex justify-between gap-4 items-center">
                          <span className="text-muted-foreground text-sm">סטטוס מנוי</span>
                          {child.status === 'inactive' ? (
                            <Badge variant="destructive">הסתיים</Badge>
                          ) : (
                            <Badge variant="secondary">פעיל</Badge>
                          )}
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground text-sm">תאריך התחלה</span>
                          <span className="font-medium">{formatHebrewDate(child.subscription_start_date)}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground text-sm">תאריך סיום</span>
                          <span className="font-medium">{formatHebrewDate(child.subscription_end_date)}</span>
                        </div>
                        {renewVisible && (
                          <div className="pt-2">
                            <Button variant="gradient" className="gap-2 w-full">
                              <RefreshCw className="h-4 w-4" />
                              חידוש מנוי
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right column */}
                  <div className="space-y-6">
                    <div>
                      <h4 className="font-semibold text-lg flex items-center gap-2">
                        <Users className="h-5 w-5 text-primary" />
                        פרטי משפחה
                      </h4>
                      <div className="bg-muted/50 rounded-lg p-4 space-y-3 mt-3">
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground text-sm">משפחה</span>
                          <span className="font-medium">{child.family_name}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground text-sm">הורה</span>
                          <span className="font-medium">{child.parent_name || '-'}</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground text-sm">ת.ז. הורה</span>
                          <span className="font-medium">{child.parent_id || '-'}</span>
                        </div>
                        <div className="flex justify-between gap-4 items-center">
                          <span className="text-muted-foreground text-sm">טלפון</span>
                          {whatsapp ? (
                            <a
                              href={whatsapp}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="font-medium text-primary hover:underline"
                            >
                              {child.parent_phone}
                            </a>
                          ) : (
                            <span className="font-medium">{child.parent_phone || '-'}</span>
                          )}
                        </div>
                        <div className="flex justify-between gap-4 items-center">
                          <span className="text-muted-foreground text-sm flex items-center gap-2">
                            <Mail className="h-4 w-4" />
                            אימייל
                          </span>
                          <span className="font-medium">{/* placeholder */}-</span>
                        </div>
                        <div className="flex justify-between gap-4 items-center">
                          <span className="text-muted-foreground text-sm flex items-center gap-2">
                            <MapPin className="h-4 w-4" />
                            כתובת
                          </span>
                          <span className="font-medium">{/* placeholder */}-</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-muted-foreground text-sm">סניף</span>
                          <span className="font-medium">{child.branch_name || '-'}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Tab 2: Courses */}
              <TabsContent value="courses" className="pt-6">
                <div className="px-6 pb-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-semibold text-lg">קבוצות</h3>
                    <Button
                      variant="gradient"
                      size="sm"
                      className="gap-2"
                      onClick={() => onOpenEnroll?.()}
                    >
                      <Plus className="h-4 w-4" />
                      רישום לחוג
                    </Button>
                  </div>

                  <div className="border rounded-lg overflow-hidden">
                    <table className="table">
                      <thead className="bg-muted/50">
                        <tr>
                          <th>חוג</th>
                          <th>ימים ושעות</th>
                          <th>סניף</th>
                          <th>מדריך</th>
                          <th>פעולות</th>
                        </tr>
                      </thead>
                      <tbody>
                        {courseGroups.length === 0 ? (
                          <tr>
                            <td colSpan={5} className="text-center py-8 text-muted-foreground">
                              אין רישומים פעילים
                            </td>
                          </tr>
                        ) : (
                          courseGroups.map((group) => {
                            const first = group.slots[0];
                            return (
                            <tr key={group.key}>
                              <td className="font-medium">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span>{group.courseName}</span>
                                  <GroupIdBadge displayId={first?.course_display_id} />
                                  <span
                                    className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                                      group.trial
                                        ? 'bg-orange-100 text-orange-800'
                                        : 'bg-sky-100 text-sky-800'
                                    }`}
                                  >
                                    {group.trial ? 'ניסיון' : 'רגיל'}
                                    {group.trial && first?.trial_lesson_date
                                      ? ` · ${first.trial_lesson_date.split('-').reverse().join('/')}`
                                      : ''}
                                  </span>
                                </div>
                              </td>
                              <td>{group.slots.map((slot) => formatEnrollmentSlot(slot)).filter(Boolean).join(' · ') || '-'}</td>
                              <td>{first?.branch_name || '-'}</td>
                              <td>{first?.instructor_name || '-'}</td>
                              <td>
                                <div className="flex flex-wrap items-center gap-1">
                                  {first?.lesson_id ? (
                                    <>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="gap-1"
                                        onClick={() => onEditEnrollment?.(group.slots)}
                                      >
                                        <Pencil className="h-3 w-3" /> ערוך
                                      </Button>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="gap-1 text-destructive hover:text-destructive"
                                        disabled={dropLoading}
                                        onClick={() => setDropGroup({
                                      courseName: group.courseName,
                                      slots: group.slots,
                                      trial: group.trial,
                                    })}
                                      >
                                        <Trash2 className="h-3 w-3" /> הסר
                                      </Button>
                                    </>
                                  ) : null}
                                </div>
                              </td>
                            </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="mt-8">
                    <h3 className="font-semibold text-lg mb-3">היסטוריית היעדרויות</h3>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="table">
                        <thead className="bg-muted/50">
                          <tr>
                            <th>תאריך</th>
                            <th>חוג</th>
                            <th>שיעור</th>
                          </tr>
                        </thead>
                        <tbody>
                          {loadingAbsences ? (
                            Array.from({ length: 4 }).map((_, row) => (
                              <tr key={row} aria-busy="true">
                                <td><Skeleton className="h-4 w-24" /></td>
                                <td><Skeleton className="h-4 w-40" /></td>
                                <td><Skeleton className="h-4 w-32" /></td>
                              </tr>
                            ))
                          ) : absences.length === 0 ? (
                            <tr>
                              <td colSpan={3} className="text-center py-8 text-muted-foreground">
                                אין היעדרויות רשומות
                              </td>
                            </tr>
                          ) : (
                            absences.map((absence) => (
                              <tr key={absence.id}>
                                <td>{formatHebrewDate(absence.occurrence_date)}</td>
                                <td>
                                  {absence.course_name}
                                  <GroupIdBadge displayId={absence.course_display_id} />
                                </td>
                                <td>{absence.lesson_name}</td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Tab 3: Payments */}
              <TabsContent value="payments" className="pt-6">
                <div className="px-6 pb-6 space-y-8">
                  {loadingPayments ? (
                    <div className="text-center py-8 text-muted-foreground">טוען נתוני תשלומים...</div>
                  ) : (
                    <>
                      <div>
                        <h3 className="font-semibold text-lg mb-1">חיובים חד פעמיים</h3>
                        <p className="text-sm text-muted-foreground mb-3">דמי רישום ורכישות מהחנות</p>
                        {oneTimeCharges.length === 0 ? (
                          <div className="border rounded-lg px-4 py-8 text-center text-muted-foreground">
                            אין חיובים חד-פעמיים
                          </div>
                        ) : (
                          <div className="border rounded-lg overflow-hidden">
                            <table className="w-full">
                              <thead className="bg-muted/50">
                                <tr>
                                  <th className="p-3 text-right font-medium">תאריך</th>
                                  <th className="p-3 text-right font-medium">תיאור</th>
                                  <th className="p-3 text-right font-medium">סכום</th>
                                  <th className="p-3 text-right font-medium">סטטוס</th>
                                  <th className="p-3 text-right font-medium">פעולות</th>
                                </tr>
                              </thead>
                              <tbody>
                                {oneTimeCharges.map((charge) => {
                                  const badge = paymentStatusBadge(charge.status);
                                  return (
                                    <tr key={charge.key} className="border-t">
                                      <td className="p-3 text-sm text-muted-foreground whitespace-nowrap">
                                        {charge.date ? new Date(charge.date).toLocaleDateString('he-IL') : '-'}
                                      </td>
                                      <td className="p-3">{charge.description}</td>
                                      <td className="p-3 font-medium whitespace-nowrap">{formatShekel(charge.amount)}</td>
                                      <td className="p-3">
                                        <Badge variant={badge.variant}>{badge.label}</Badge>
                                      </td>
                                      <td className="p-3">
                                        {charge.canRefund && (
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => (
                                              charge.kind === 'store'
                                                ? handleCreditStoreInvoice(charge.raw)
                                                : handleCreditPayment(charge.raw)
                                            )}
                                            disabled={refundLoading}
                                          >
                                            <ArrowLeftRight className="h-3 w-3 ml-1" />
                                            זיכוי
                                          </Button>
                                        )}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      <div>
                        <div className="flex items-baseline justify-between gap-3 mb-1">
                          <h3 className="font-semibold text-lg">הוראות קבע</h3>
                          {monthlyTotal > 0 && (
                            <span className="text-sm font-medium">
                              סה״כ לחודש {formatShekel(monthlyTotal)}
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground mb-3">הסכום שנגבה בכל חודש עבור השיעורים</p>
                        {standingOrders.length === 0 ? (
                          <div className="border rounded-lg px-4 py-8 text-center text-muted-foreground">
                            אין הוראות קבע
                          </div>
                        ) : (
                          <div className="border rounded-lg overflow-hidden">
                            <table className="w-full">
                              <thead className="bg-muted/50">
                                <tr>
                                  <th className="p-3 text-right font-medium">שיעור</th>
                                  <th className="p-3 text-right font-medium">סכום לחודש</th>
                                  <th className="p-3 text-right font-medium">סטטוס</th>
                                  <th className="p-3 text-right font-medium">פעולות</th>
                                </tr>
                              </thead>
                              <tbody>
                                {standingOrders.map((recurring) => (
                                  <tr key={recurring.id} className="border-t">
                                    <td className="p-3">
                                      {recurring.initial_payment_details?.lesson_name
                                        || recurring.initial_payment_details?.description
                                        || '-'}
                                      <GroupIdBadge displayId={recurring.initial_payment_details?.lesson_course_display_id} />
                                    </td>
                                    <td className="p-3 font-medium whitespace-nowrap">
                                      {formatShekel(recurring.amount)}
                                      {recurring.pending_amount != null && Number(recurring.pending_amount) !== Number(recurring.amount) && (
                                        <div className="text-xs text-muted-foreground font-normal">
                                          מהחודש הבא {formatShekel(recurring.pending_amount)}
                                        </div>
                                      )}
                                    </td>
                                    <td className="p-3">
                                      <Badge variant={recurring.status === 'active' ? 'default' : 'outline'}>
                                        {recurringStatusLabel(recurring.status)}
                                      </Badge>
                                    </td>
                                    <td className="p-3">
                                      {recurring.status === 'active' && (
                                        <div className="flex flex-wrap gap-2">
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            onClick={() => handleUpdateRecurring(recurring.id)}
                                            disabled={actionLoading === recurring.id}
                                            title="עדכן סכום מנוי"
                                          >
                                            {actionLoading === recurring.id ? (
                                              <Loader2 className="h-3 w-3 ml-1 animate-spin" />
                                            ) : (
                                              <RefreshCw className="h-3 w-3 ml-1" />
                                            )}
                                            עדכן
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="text-red-600 hover:text-red-700"
                                            onClick={() => handleCancelRecurring(recurring.id)}
                                            disabled={actionLoading === recurring.id}
                                            title="בטל מנוי"
                                          >
                                            {actionLoading === recurring.id ? (
                                              <Loader2 className="h-3 w-3 ml-1 animate-spin" />
                                            ) : (
                                              <Trash2 className="h-3 w-3 ml-1" />
                                            )}
                                            ביטול
                                          </Button>
                                        </div>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>

                      <div>
                        <h3 className="font-semibold text-lg mb-1">תשלומים עתידיים</h3>
                        <p className="text-sm text-muted-foreground mb-3">10 החיובים הבאים לפי הוראות הקבע</p>
                        {futureCharges.length === 0 ? (
                          <div className="border rounded-lg px-4 py-8 text-center text-muted-foreground">
                            אין חיובים עתידיים
                          </div>
                        ) : (
                          <div className="border rounded-lg overflow-hidden">
                            <table className="w-full">
                              <thead className="bg-muted/50">
                                <tr>
                                  <th className="p-3 text-right font-medium">תאריך</th>
                                  <th className="p-3 text-right font-medium">תיאור</th>
                                  <th className="p-3 text-right font-medium">סכום</th>
                                </tr>
                              </thead>
                              <tbody>
                                {futureCharges.map((charge) => (
                                  <tr key={charge.key} className="border-t">
                                    <td className="p-3 text-sm text-muted-foreground whitespace-nowrap">
                                      {charge.date.toLocaleDateString('he-IL')}
                                    </td>
                                    <td className="p-3">
                                      {charge.description}
                                      <GroupIdBadge displayId={charge.courseDisplayId} />
                                    </td>
                                    <td className="p-3 font-medium whitespace-nowrap">{formatShekel(charge.amount)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </TabsContent>

            </Tabs>
      </DialogContent>
    </Dialog>
    
    {/* Refund Dialog */}
    {refundItem && (
      <RefundDialog
        isOpen={refundDialogOpen}
        onClose={() => {
          setRefundDialogOpen(false);
          setRefundItem(null);
        }}
        onConfirm={handleRefundConfirm}
        title={refundItem.type === 'payment' ? 'זיכוי תשלום' : 'זיכוי חשבונית'}
        maxAmount={refundItem.amount}
        itemDescription={refundItem.description}
        loading={refundLoading}
      />
    )}
    <ConfirmDialog
      isOpen={Boolean(dropGroup)}
      onClose={() => { if (!dropLoading) setDropGroup(null); }}
      onConfirm={handleDropConfirm}
      type="warning"
      title={dropGroup?.trial ? 'ביטול שיעור ניסיון' : 'הסרה מהחוג'}
      message={
        dropGroup
          ? dropGroup.trial
            ? `${child.first_name} ${child.last_name} יוסר/י משיעור הניסיון ב${dropGroup.courseName}.\nהרישום לניסיון יבוטל.`
            : `${child.first_name} ${child.last_name} יוסר/י מ${dropGroup.courseName}.\nהוראת הקבע לחוג זה תיעצר ולא יגבו תשלומים נוספים מהחודש הבא.`
          : ''
      }
      confirmText={dropGroup?.trial ? 'כן, בטל' : 'כן, הסר'}
      cancelText="ביטול"
    />
  </>
  );
}

