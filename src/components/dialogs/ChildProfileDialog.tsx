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
  Mail,
  MapPin,
  Plus,
  RefreshCw,
  Trash2,
  User,
  Users,
} from 'lucide-react';

import { ChildWithDetails, AbsenceRecord } from '@/types/customer';
import { formatWhatsAppLink, formatHebrewDate, getDayName, getAttendanceColor } from '@/lib/customerUtils';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogCloseButton } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import api from '@/lib/api';
import RefundDialog from '@/components/dialogs/RefundDialog';

interface ChildProfileDialogProps {
  child: ChildWithDetails;
  isOpen: boolean;
  onClose: () => void;
  onOpenEnroll?: () => void;
}

function daysUntil(dateString: string | null): number | null {
  if (!dateString) return null;
  const end = new Date(dateString);
  const now = new Date();
  const diff = end.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

export default function ChildProfileDialog({
  child,
  isOpen,
  onClose,
  onOpenEnroll,
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
    const newAmount = prompt('הזן סכום חדש למנוי:');
    if (!newAmount) return;
    
    setActionLoading(recurringId);
    try {
      await api.patch(`/customers/recurring-payments/${recurringId}/`, {
        amount: parseFloat(newAmount)
      });
      alert('המנוי עודכן בהצלחה');
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

  return (
    <>
    <Dialog open={isOpen} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto" dir="rtl">
        {/* Header */}
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
              </DialogTitle>
              <DialogDescription>פרופיל ילד ומידע נוסף</DialogDescription>
            </DialogHeader>
            <DialogCloseButton />
          </div>

          {/* Tabs */}
          <div className="px-6 pb-4">
            <Tabs defaultValue="details">
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
                          <th>יום</th>
                          <th>שעה</th>
                          <th>סניף</th>
                          <th>מדריך</th>
                          <th>פעולות</th>
                        </tr>
                      </thead>
                      <tbody>
                        {child.enrollments.length === 0 ? (
                          <tr>
                            <td colSpan={6} className="text-center py-8 text-muted-foreground">
                              אין רישומים פעילים
                            </td>
                          </tr>
                        ) : (
                          child.enrollments.map((en) => (
                            <tr key={en.enrollment_id}>
                              <td className="font-medium">{en.course_name}</td>
                              <td>{getDayName(en.day_of_week)}</td>
                              <td>{en.start_time}</td>
                              <td>{en.branch_name || '-'}</td>
                              <td>{en.instructor_name || '-'}</td>
                              <td>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="gap-1 text-destructive hover:text-destructive"
                                  onClick={() => alert('הסר - יתווסף בהמשך')}
                                >
                                  <Trash2 className="h-3 w-3" /> הסר
                                </Button>
                              </td>
                            </tr>
                          ))
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
                            <tr>
                              <td colSpan={3} className="text-center py-8 text-muted-foreground">
                                טוען...
                              </td>
                            </tr>
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
                                <td>{absence.course_name}</td>
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
                <div className="px-6 pb-6 space-y-6">
                  {loadingPayments ? (
                    <div className="text-center py-8">טוען נתוני תשלומים...</div>
                  ) : (
                    <>
                      {/* Recurring Payments Section */}
                      {recurringPayments.length > 0 && (
                        <div>
                          <h3 className="font-semibold text-lg mb-3">מנויים חוזרים</h3>
                          <div className="border rounded-lg overflow-hidden">
                            <table className="w-full">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="p-3 text-right">חוג</th>
                                  <th className="p-3 text-right">סניף</th>
                                  <th className="p-3 text-right">סכום</th>
                                  <th className="p-3 text-right">יום חיוב</th>
                                  <th className="p-3 text-right">סטטוס</th>
                                  <th className="p-3 text-right">תאריך התחלה</th>
                                  <th className="p-3 text-right">פעולות</th>
                                </tr>
                              </thead>
                              <tbody>
                                {recurringPayments.map(recurring => (
                                  <tr key={recurring.id} className="border-t">
                                    <td className="p-3">
                                      {recurring.initial_payment_details?.lesson_name || 
                                       recurring.initial_payment_details?.description || '-'}
                                    </td>
                                    <td className="p-3 text-sm text-gray-600">
                                      {recurring.initial_payment_details?.branch_name || '-'}
                                    </td>
                                    <td className="p-3 font-medium">₪{recurring.amount}</td>
                                    <td className="p-3">{recurring.billing_day}</td>
                                    <td className="p-3">
                                      <Badge variant={recurring.status === 'active' ? 'default' : 'outline'}>
                                        {recurring.status === 'active' ? 'פעיל' : recurring.status}
                                      </Badge>
                                    </td>
                                    <td className="p-3 text-sm text-gray-600">
                                      {new Date(recurring.start_date).toLocaleDateString('he-IL')}
                                    </td>
                                    <td className="p-3">
                                      <div className="flex gap-2">
                                        {recurring.status === 'active' && (
                                          <>
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={() => handleUpdateRecurring(recurring.id)}
                                              disabled={actionLoading === recurring.id}
                                              title="עדכן סכום מנוי"
                                            >
                                              <RefreshCw className="h-3 w-3 ml-1" />
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
                                              <Trash2 className="h-3 w-3 ml-1" />
                                              ביטול
                                            </Button>
                                          </>
                                        )}
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Course Payments Section */}
                      {payments.length > 0 && (
                        <div>
                          <h3 className="font-semibold text-lg mb-3">תשלומי חוגים</h3>
                          <div className="border rounded-lg overflow-hidden">
                            <table className="w-full">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="p-3 text-right">תאריך</th>
                                  <th className="p-3 text-right">תיאור</th>
                                  <th className="p-3 text-right">סכום</th>
                                  <th className="p-3 text-right">סטטוס</th>
                                  <th className="p-3 text-right">פעולות</th>
                                </tr>
                              </thead>
                              <tbody>
                                {payments.map(payment => (
                                  <tr key={payment.id} className="border-t">
                                    <td className="p-3 text-sm text-gray-600">
                                      {payment.payment_date ? new Date(payment.payment_date).toLocaleDateString('he-IL') : '-'}
                                    </td>
                                    <td className="p-3">{payment.description || '-'}</td>
                                    <td className="p-3 font-medium">₪{payment.final_amount}</td>
                                    <td className="p-3">
                                      <Badge variant={payment.status === 'completed' ? 'default' : payment.status === 'failed' ? 'destructive' : 'outline'}>
                                        {payment.status === 'completed' ? 'הושלם' : payment.status === 'failed' ? 'נכשל' : payment.status}
                                      </Badge>
                                    </td>
                                    <td className="p-3">
                                      {payment.status === 'completed' && (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => handleCreditPayment(payment)}
                                          disabled={refundLoading}
                                        >
                                          <ArrowLeftRight className="h-3 w-3 ml-1" />
                                          זיכוי
                                        </Button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Store Purchases Section */}
                      {storeInvoices.length > 0 && (
                        <div>
                          <h3 className="font-semibold text-lg mb-3">רכישות בחנות</h3>
                          <div className="border rounded-lg overflow-hidden">
                            <table className="w-full">
                              <thead className="bg-gray-50">
                                <tr>
                                  <th className="p-3 text-right">חשבונית</th>
                                  <th className="p-3 text-right">תאריך</th>
                                  <th className="p-3 text-right">סכום</th>
                                  <th className="p-3 text-right">תשלום</th>
                                  <th className="p-3 text-right">סטטוס</th>
                                  <th className="p-3 text-right">פעולות</th>
                                </tr>
                              </thead>
                              <tbody>
                                {storeInvoices.map(invoice => (
                                  <tr key={invoice.id} className="border-t">
                                    <td className="p-3 font-medium text-teal-600">{invoice.invoice_number}</td>
                                    <td className="p-3 text-sm text-gray-600">
                                      {new Date(invoice.issue_date).toLocaleDateString('he-IL')}
                                    </td>
                                    <td className="p-3 font-medium">₪{invoice.total_amount}</td>
                                    <td className="p-3 text-sm">
                                      {invoice.payment_method === 'credit_card' ? 'אשראי' :
                                       invoice.payment_method === 'cash' ? 'מזומן' : 'הוראת קבע'}
                                    </td>
                                    <td className="p-3">
                                      <Badge 
                                        variant={
                                          invoice.payment_status === 'completed' ? 'default' : 
                                          invoice.payment_status === 'refunded' ? 'secondary' :
                                          invoice.payment_status === 'failed' || invoice.payment_status === 'refund_failed' ? 'destructive' : 
                                          'outline'
                                        }
                                        title={invoice.payment_status === 'refunded' && invoice.refunded_amount ? `סכום זיכוי: ₪${invoice.refunded_amount}` : ''}
                                      >
                                        {invoice.payment_status === 'completed' ? 'הושלם' : 
                                         invoice.payment_status === 'refunded' ? 'זוכה' :
                                         invoice.payment_status === 'failed' ? 'נכשל' :
                                         invoice.payment_status === 'refund_failed' ? 'זיכוי נכשל' :
                                         'ממתין'}
                                      </Badge>
                                    </td>
                                    <td className="p-3">
                                      {(invoice.payment_status === 'completed' || invoice.payment_status === 'refund_failed') && invoice.payment_method === 'credit_card' && (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => handleCreditStoreInvoice(invoice)}
                                          disabled={refundLoading}
                                          title={invoice.payment_status === 'refund_failed' ? 'נסה שוב לזכות' : 'זיכוי רכישה'}
                                        >
                                          <ArrowLeftRight className="h-3 w-3 ml-1" />
                                          זיכוי
                                        </Button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* Empty State */}
                      {payments.length === 0 && storeInvoices.length === 0 && recurringPayments.length === 0 && (
                        <div className="text-center py-12">
                          <CreditCard className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                          <p className="text-gray-500">אין נתוני תשלומים</p>
                          <p className="text-sm text-gray-400 mt-2">תשלומים ורכישות יופיעו כאן</p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </TabsContent>

            </Tabs>
          </div>
        </div>
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
  </>
  );
}

