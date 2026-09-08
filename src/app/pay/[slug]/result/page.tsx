'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import formStyles from '@/app/widget/CourseRegistrationForm/index.module.css';

/**
 * Tranzila sends the payer here (inside the iframe) after the hosted page
 * finishes. One line for the eye, and a message up to the parent page,
 * which asks the server for the real result.
 */
function ResultInner() {
  const search = useSearchParams();
  const result = search.get('r') === 'ok' ? 'ok' : 'fail';
  const paymentId = search.get('p') || '';

  useEffect(() => {
    try {
      window.parent?.postMessage({ type: 'kogo-pay-result', result, paymentId }, '*');
    } catch {
      /* not in an iframe */
    }
  }, [result, paymentId]);

  return (
    <div className={formStyles.resultContainer} dir="rtl">
      {result === 'ok' ? (
        <>
          <div className={formStyles.successIcon}>✓</div>
          <p className={formStyles.resultTitle}>התשלום הועבר</p>
          <p className={formStyles.resultSubtext}>מאמתים את התשלום...</p>
        </>
      ) : (
        <>
          <div className={formStyles.failIcon}>!</div>
          <p className={formStyles.resultTitle}>התשלום לא עבר</p>
          <p className={formStyles.resultSubtext}>אפשר לנסות שוב מהעמוד הראשי.</p>
        </>
      )}
    </div>
  );
}

export default function PayResultPage() {
  return (
    <Suspense fallback={null}>
      <ResultInner />
    </Suspense>
  );
}
