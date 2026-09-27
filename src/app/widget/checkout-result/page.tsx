'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import formStyles from '@/app/widget/CourseRegistrationForm/index.module.css';

/**
 * Tranzila sends the parent here, inside its frame, when the course page is
 * done (apps/customers/course_checkout.py). One line for the eye, and a
 * message up to the widget with what Tranzila added to the address — the
 * transaction number and approval, for when its notify is late. The widget
 * asks the server for the real result; nothing here decides anything.
 */
function ResultInner() {
  const search = useSearchParams();
  const result = search.get('r') === 'ok' ? 'ok' : 'fail';
  const checkoutId = search.get('c') || '';
  const index = search.get('index') || '';
  const code = search.get('ConfirmationCode') || '';

  useEffect(() => {
    try {
      window.parent?.postMessage({ type: 'kogo-course-checkout', checkoutId, result, index, code }, '*');
    } catch {
      /* not in a frame */
    }
  }, [checkoutId, result, index, code]);

  return (
    <div className={formStyles.resultContainer} dir="rtl">
      {result === 'ok' ? (
        <>
          <span className={formStyles.submittingSpinner} />
          <p className={formStyles.resultTitle}>הכרטיס אושר</p>
          <p className={formStyles.resultSubtext}>משלימים את התשלום וההרשמה...</p>
        </>
      ) : (
        <>
          <div className={formStyles.failIcon}>!</div>
          <p className={formStyles.resultTitle}>הכרטיס לא אושר</p>
          <p className={formStyles.resultSubtext}>אפשר לנסות שוב.</p>
        </>
      )}
    </div>
  );
}

export default function CourseCheckoutResultPage() {
  return (
    <Suspense fallback={null}>
      <ResultInner />
    </Suspense>
  );
}
