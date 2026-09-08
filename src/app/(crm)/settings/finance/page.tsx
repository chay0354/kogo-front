'use client';

import BusinessTaxonomySection from '../BusinessTaxonomySection';
import DiscountsSection from './DiscountsSection';

export default function SettingsFinancePage() {
  return (
    <div className="space-y-8">
      <BusinessTaxonomySection />
      <DiscountsSection />
    </div>
  );
}
