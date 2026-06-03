'use client';

import { useState, useEffect } from 'react';
import { X, Loader2, AlertCircle, CheckCircle, XCircle, Calendar, DollarSign } from 'lucide-react';
import api from '@/lib/api';
import type { ChildWithDetails } from '@/types/customer';
import type { RecurringPayment } from '@/types/payment';

interface ManageSubscriptionDialogProps {
  child: ChildWithDetails;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export default function ManageSubscriptionDialog({
  child,
  isOpen,
  onClose,
  onUpdate,
}: ManageSubscriptionDialogProps) {
  const [loading, setLoading] = useState(false);
  const [subscription, setSubscription] = useState<RecurringPayment | null>(null);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadSubscription();
    }
  }, [isOpen, child.id]);

  const loadSubscription = async () => {
    setLoading(true);
    setMessage(null);
    
    try {
      // Get active recurring payment for this child
      const response = await api.get(`/customers/recurring-payments/?child_id=${child.id}&status=active`);
      const subscriptions = response.data.results || response.data || [];
      
      if (subscriptions.length > 0) {
        setSubscription(subscriptions[0]);
      } else {
        setMessage({ type: 'error', text: 'לא נמצא מנוי פעיל עבור ילד זה' });
      }
    } catch (err: any) {
      console.error('Error loading subscription:', err);
      setMessage({ type: 'error', text: 'שגיאה בטעינת פרטי המנוי' });
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateSubscription = async () => {
    if (!subscription) return;

    setActionLoading(true);
    setMessage(null);

    try {
      await api.post(`/customers/recurring-payments/${subscription.id}/update_subscription/`, {
        recalculate_discounts: true
      });

      setMessage({ type: 'success', text: 'המנוי עודכן בהצלחה' });
      
      // Reload subscription data
      setTimeout(() => {
        loadSubscription();
        onUpdate();
      }, 1500);
    } catch (err: any) {
      console.error('Error updating subscription:', err);
      setMessage({ 
        type: 'error', 
        text: err.response?.data?.error || 'שגיאה בעדכון המנוי' 
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!subscription) return;

    setActionLoading(true);
    setMessage(null);

    try {
      await api.post(`/customers/recurring-payments/${subscription.id}/cancel/`, {
        cancellation_reason: cancellationReason
      });

      setMessage({ type: 'success', text: 'המנוי בוטל בהצלחה' });
      setShowCancelConfirm(false);
      
      setTimeout(() => {
        onUpdate();
        onClose();
      }, 2000);
    } catch (err: any) {
      console.error('Error cancelling subscription:', err);
      setMessage({ 
        type: 'error', 
        text: err.response?.data?.error || 'שגיאה בביטול המנוי' 
      });
    } finally {
      setActionLoading(false);
    }
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'לא זמין';
    return new Date(dateString).toLocaleDateString('he-IL');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">ניהול מנוי<span style={{ fontSize: '10px', color: 'white', userSelect: 'none' }}> #27</span></h2>
            <p className="text-sm text-gray-600 mt-1">
              {child.first_name} {child.last_name}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <X className="h-6 w-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6">
          {loading && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-blue-600 mb-4" />
              <p className="text-gray-600">טוען פרטי מנוי...</p>
            </div>
          )}

          {message && (
            <div className={`border rounded-lg p-4 mb-6 ${
              message.type === 'success' 
                ? 'bg-green-50 border-green-200' 
                : 'bg-red-50 border-red-200'
            }`}>
              <div className="flex items-start">
                {message.type === 'success' ? (
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5 ml-3" />
                ) : (
                  <XCircle className="h-5 w-5 text-red-600 mt-0.5 ml-3" />
                )}
                <p className={`text-sm ${
                  message.type === 'success' ? 'text-green-800' : 'text-red-800'
                }`}>
                  {message.text}
                </p>
              </div>
            </div>
          )}

          {!loading && subscription && (
            <>
              {/* Subscription Details */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">פרטי מנוי</h3>
                
                <div className="space-y-4">
                  <div className="flex items-start">
                    <DollarSign className="h-5 w-5 text-blue-600 mt-0.5 ml-2" />
                    <div>
                      <p className="text-sm font-medium text-gray-700">סכום חיוב חודשי</p>
                      <p className="text-2xl font-bold text-blue-600">₪{subscription.amount}</p>
                    </div>
                  </div>

                  <div className="flex items-start">
                    <Calendar className="h-5 w-5 text-blue-600 mt-0.5 ml-2" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-gray-700 mb-2">תאריכים</p>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <span className="text-gray-600">תאריך התחלה:</span>
                          <p className="font-medium">{formatDate(subscription.start_date)}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">חיוב הבא:</span>
                          <p className="font-medium">{formatDate(subscription.next_billing_date)}</p>
                        </div>
                        <div>
                          <span className="text-gray-600">יום חיוב:</span>
                          <p className="font-medium">{subscription.billing_day} בחודש</p>
                        </div>
                        <div>
                          <span className="text-gray-600">חיוב אחרון:</span>
                          <p className="font-medium">{formatDate(subscription.last_charge_date)}</p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-blue-300">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-gray-700">סטטוס:</span>
                      <span className={`px-3 py-1 rounded-full text-sm font-medium ${
                        subscription.status === 'active' 
                          ? 'bg-green-100 text-green-800'
                          : 'bg-gray-100 text-gray-800'
                      }`}>
                        {subscription.status === 'active' ? 'פעיל' : subscription.status}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Actions */}
              {!showCancelConfirm && subscription.status === 'active' && (
                <div className="space-y-3">
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex items-start">
                      <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 ml-2" />
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-yellow-800 mb-1">עדכון מנוי</h4>
                        <p className="text-sm text-yellow-700 mb-3">
                          חישוב מחדש של הנחות ועדכון סכום החיוב החודשי
                        </p>
                        <button
                          onClick={handleUpdateSubscription}
                          disabled={actionLoading}
                          className="px-4 py-2 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
                        >
                          {actionLoading ? 'מעדכן...' : 'עדכן מנוי'}
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                    <div className="flex items-start">
                      <XCircle className="h-5 w-5 text-red-600 mt-0.5 ml-2" />
                      <div className="flex-1">
                        <h4 className="text-sm font-medium text-red-800 mb-1">ביטול מנוי</h4>
                        <p className="text-sm text-red-700 mb-3">
                          ביטול המנוי יעצור חיובים עתידיים
                        </p>
                        <button
                          onClick={() => setShowCancelConfirm(true)}
                          className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm"
                        >
                          בטל מנוי
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Cancel Confirmation */}
              {showCancelConfirm && (
                <div className="bg-red-50 border-2 border-red-300 rounded-lg p-6">
                  <h3 className="text-lg font-semibold text-red-900 mb-4">אישור ביטול מנוי</h3>
                  <p className="text-sm text-red-800 mb-4">
                    האם אתה בטוח שברצונך לבטל את המנוי? פעולה זו תעצור חיובים עתידיים.
                  </p>
                  
                  <div className="mb-4">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      סיבת ביטול (אופציונלי)
                    </label>
                    <textarea
                      value={cancellationReason}
                      onChange={(e) => setCancellationReason(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                      rows={3}
                      placeholder="הזן סיבת ביטול..."
                    />
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={handleCancelSubscription}
                      disabled={actionLoading}
                      className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {actionLoading ? 'מבטל...' : 'אשר ביטול'}
                    </button>
                    <button
                      onClick={() => setShowCancelConfirm(false)}
                      disabled={actionLoading}
                      className="flex-1 px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50"
                    >
                      חזור
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}

