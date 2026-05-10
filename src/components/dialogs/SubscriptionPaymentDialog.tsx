'use client';

import { useState, useEffect, useRef } from 'react';
import { X, Loader2, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import api from '@/lib/api';
import type { ChildWithDetails } from '@/types/customer';
import type { PaymentInitiationResponse, PaymentStatusResponse } from '@/types/payment';

interface Lesson {
  id: string;
  name: string;
  day_of_week: string;
  time: string;
  price: string | null;
}

interface SubscriptionPaymentDialogProps {
  child: ChildWithDetails;
  lesson: Lesson;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function SubscriptionPaymentDialog({
  child,
  lesson,
  isOpen,
  onClose,
  onSuccess,
}: SubscriptionPaymentDialogProps) {
  const [loading, setLoading] = useState(false);
  const [paymentData, setPaymentData] = useState<PaymentInitiationResponse | null>(null);
  const [paymentStatus, setPaymentStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string>('');
  const [polling, setPolling] = useState(false);
  const requestSeqRef = useRef(0);
  const hasInitiatedRef = useRef(false);

  useEffect(() => {
    // Only initiate if we have a valid lesson id (prevents 400s due to empty/undefined lesson_id)
    // Also check if we haven't already initiated for this dialog open
    if (isOpen && lesson?.id && !hasInitiatedRef.current) {
      hasInitiatedRef.current = true;
      initiatePayment();
    }
    
    // Reset when dialog closes
    if (!isOpen) {
      hasInitiatedRef.current = false;
    }
  }, [isOpen, lesson]);

  const initiatePayment = async () => {
    // Guard for React dev-mode double-invoked effects: only last request wins.
    const reqId = ++requestSeqRef.current;

    if (!lesson?.id) {
      setError('שגיאה: חסר מזהה שיעור (lesson_id). נסה לסגור ולפתוח מחדש את חלון התשלום.');
      return;
    }

    setLoading(true);
    setError('');
    
    try {
      // Use environment variable for webhook URL or fallback to API URL
      const webhookBaseUrl = process.env.NEXT_PUBLIC_WEBHOOK_BASE_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api/v1';
      const callbackUrl = `${webhookBaseUrl.replace('/api/v1', '')}/api/v1/customers/payments/webhook/`;
      
      console.log('🔍 Payment Flow Debug:');
      console.log('  NEXT_PUBLIC_WEBHOOK_BASE_URL:', process.env.NEXT_PUBLIC_WEBHOOK_BASE_URL);
      console.log('  NEXT_PUBLIC_API_URL:', process.env.NEXT_PUBLIC_API_URL);
      console.log('  Calculated webhookBaseUrl:', webhookBaseUrl);
      console.log('  Final callbackUrl:', callbackUrl);
      
      const payload = {
        child_id: child.id,
        lesson_id: lesson.id,
        payment_date: new Date().toISOString().split('T')[0],
        // DON'T send success_url and fail_url - let Tranzila use dashboard defaults
        // Sending localhost URLs causes Imperva WAF to block with 403
        // success_url: `${window.location.origin}/payment-success`,
        // error_url: `${window.location.origin}/payment-error`,
        callback_url: callbackUrl,
      };

      // Helpful debug log (can be removed later)
      console.debug('Initiating subscription payment payload:', payload);

      const response = await api.post('/customers/payments/initiate_subscription/', payload);

      if (reqId !== requestSeqRef.current) return;
      setError('');
      setPaymentData(response.data);
    } catch (err: any) {
      if (reqId !== requestSeqRef.current) return;
      console.error('Error initiating payment:', err);
      const errorData = err.response?.data;
      let errorMessage = 'שגיאה ביצירת תשלום';
      
      if (errorData?.lesson) {
        errorMessage = errorData.lesson;  // Show capacity error
      } else if (errorData?.error) {
        errorMessage = errorData.error;
      } else if (errorData?.detail) {
        errorMessage = errorData.detail;
      }
      
      setError(errorMessage);
    } finally {
      if (reqId !== requestSeqRef.current) return;
      setLoading(false);
    }
  };

  const handleIframeLoad = () => {
    // Iframe loaded successfully
  };

  const pollPaymentStatus = async (paymentId: string) => {
    setPolling(true);
    let attempts = 0;
    const maxAttempts = 30; // Poll for up to 5 minutes (10 seconds * 30)

    const poll = async () => {
      try {
        const response = await api.get(`/customers/payments/${paymentId}/`);
        const payment: PaymentStatusResponse = response.data;

        if (payment.status === 'completed') {
          setPaymentStatus('success');
          setPolling(false);
          setTimeout(() => {
            onSuccess();
            onClose();
          }, 2000);
          return;
        } else if (payment.status === 'failed' || payment.status === 'cancelled') {
          setPaymentStatus('error');
          setError('התשלום נכשל. אנא נסה שוב.');
          setPolling(false);
          return;
        }

        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(poll, 10000); // Poll every 10 seconds
        } else {
          setPolling(false);
          setError('פג הזמן להמתנה לתשלום. אנא בדוק את סטטוס התשלום במערכת.');
        }
      } catch (err) {
        console.error('Error polling payment status:', err);
        setPolling(false);
      }
    };

    poll();
  };

  const handleManualCheck = () => {
    if (paymentData) {
      pollPaymentStatus(paymentData.payment_id);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">תשלום מנוי חודשי</h2>
            <p className="text-sm text-gray-600 mt-1">
              {child.first_name} {child.last_name} - {lesson.name}
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
              <p className="text-gray-600">מכין את פרטי התשלום...</p>
            </div>
          )}

          {error && !loading && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <div className="flex items-start">
                <XCircle className="h-5 w-5 text-red-600 mt-0.5 ml-3" />
                <div>
                  <h3 className="text-sm font-medium text-red-800">שגיאה</h3>
                  <p className="text-sm text-red-700 mt-1">{error}</p>
                </div>
              </div>
            </div>
          )}

          {paymentData && !loading && (
            <>
              {/* Payment Summary */}
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">סיכום תשלום</h3>
                
                <div className="space-y-3">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">
                      מחיר לשיעור ה-{paymentData.course_index || 1}:
                    </span>
                    <span className="font-medium">₪{Number(paymentData.base_amount || 0).toFixed(2)}</span>
                  </div>

                  {paymentData.discounts_applied && paymentData.discounts_applied.length > 0 && (
                    <div className="border-t border-blue-300 pt-3">
                      <p className="text-sm font-medium text-gray-700 mb-2">הנחות:</p>
                      {paymentData.discounts_applied.map((discount, index) => (
                        <div key={index} className="flex justify-between text-sm mb-1">
                          <span className="text-gray-600">{discount.name}</span>
                          <span className="text-green-600">-₪{Number(discount.value || 0).toFixed(2)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="border-t border-blue-300 pt-3 flex justify-between text-lg font-bold">
                    <span>סה"כ לתשלום:</span>
                    <span className="text-blue-600">₪{Number(paymentData.final_amount || 0).toFixed(2)}</span>
                  </div>
                </div>

                {paymentData.lesson && (
                  <div className="mt-4 pt-4 border-t border-blue-300">
                    <p className="text-sm text-gray-600">
                      <strong>שיעור:</strong> {paymentData.lesson.name}
                    </p>
                    <p className="text-sm text-gray-600">
                      <strong>יום:</strong> {paymentData.lesson.day_of_week} בשעה {paymentData.lesson.time}
                    </p>
                  </div>
                )}
              </div>

              {/* Payment Status */}
              {paymentStatus === 'success' && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center">
                    <CheckCircle className="h-6 w-6 text-green-600 ml-3" />
                    <div>
                      <h3 className="text-sm font-medium text-green-800">התשלום בוצע בהצלחה!</h3>
                      <p className="text-sm text-green-700 mt-1">המנוי הופעל והילד נרשם לשיעור.</p>
                    </div>
                  </div>
                </div>
              )}

              {polling && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                  <div className="flex items-center">
                    <Loader2 className="h-5 w-5 animate-spin text-yellow-600 ml-3" />
                    <div>
                      <h3 className="text-sm font-medium text-yellow-800">ממתין לאישור תשלום...</h3>
                      <p className="text-sm text-yellow-700 mt-1">אנא המתן בזמן שאנו מאמתים את התשלום.</p>
                    </div>
                  </div>
                </div>
              )}

              {/* Tranzila Iframe */}
              {paymentStatus === 'idle' && !polling && (
                <>
                  <div className="bg-gray-50 rounded-lg p-4 mb-4">
                    <div className="flex items-start">
                      <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 ml-2" />
                      <p className="text-sm text-gray-700">
                        השלימו את פרטי התשלום בטופס המאובטח למטה. לאחר השלמת התשלום, המערכת תעדכן אוטומטית.
                      </p>
                    </div>
                  </div>

                  <div className="border border-gray-300 rounded-lg overflow-hidden" style={{ height: '600px' }}>
                    <iframe
                      src={paymentData.tranzila_url}
                      className="w-full h-full"
                      title="Tranzila Payment"
                      onLoad={handleIframeLoad}
                      allow="payment"
                      sandbox="allow-forms allow-scripts allow-same-origin allow-top-navigation"
                    />
                  </div>

                  <div className="mt-4 flex justify-center">
                    <button
                      onClick={handleManualCheck}
                      disabled={polling}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      בדוק סטטוס תשלום
                    </button>
                  </div>
                </>
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

