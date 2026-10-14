'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import StudentsReportView from '@/components/reports/StudentsReportView';
import { parseReportParams } from '@/lib/studentsReport';

/**
 * /reports/students?from=YYYY-MM-DD&to=YYYY-MM-DD&branches=all|id,id…
 *
 * Opened from "דוח PDF" on the dashboard's students tab.
 */
function Report() {
  const params = useSearchParams();
  const request = parseReportParams(params);
  if (!request) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', textAlign: 'center', padding: 24 }}>
        <div>
          <h2 style={{ fontSize: 20, fontWeight: 800 }}>הקישור לדוח לא שלם</h2>
          <p style={{ marginTop: 6, color: '#8b88b6', fontWeight: 600 }}>
            פתחו את הדוח מחדש מלשונית התלמידים בדשבורד.
          </p>
          <Link href="/" style={{ display: 'inline-block', marginTop: 14, fontWeight: 800, color: '#5b54d6' }}>
            לדשבורד
          </Link>
        </div>
      </div>
    );
  }
  return <StudentsReportView request={request} />;
}

export default function StudentsReportPage() {
  return (
    <Suspense fallback={null}>
      <Report />
    </Suspense>
  );
}
