'use client';

import BusinessTaxonomySection from '../BusinessTaxonomySection';
import DiscountsSection from './DiscountsSection';
import PriceDriftSection from './PriceDriftSection';

export default function SettingsFinancePage() {
  return (
    <div className="space-y-8">
      <BusinessTaxonomySection />
      <DiscountsSection />
      <PriceDriftSection />
    </div>
  );
}
