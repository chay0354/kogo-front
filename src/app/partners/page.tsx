'use client';

import AppLayout from '@/components/AppLayout';
import PartnersSection from '@/app/settings/PartnersSection';

/**
 * Kept so a bookmark of the old screen still opens. The list itself is the one
 * הגדרות renders, so there is a single copy of it.
 */
export default function PartnersPage() {
  return (
    <AppLayout>
      <PartnersSection />
    </AppLayout>
  );
}
