'use client';

import TrialBlockedDatesSection from '../TrialBlockedDatesSection';
import TrialRegistrationSection from '../TrialRegistrationSection';

export default function SettingsTrialsPage() {
  return (
    <div className="space-y-10">
      <TrialRegistrationSection />
      <TrialBlockedDatesSection />
    </div>
  );
}
