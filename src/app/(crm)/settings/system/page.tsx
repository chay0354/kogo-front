'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/components/AuthProvider';
import IntegrationCredentials from '../IntegrationCredentials';
import InstructorLoginDiagnostics from '../InstructorLoginDiagnostics';

export default function SettingsSystemPage() {
  const { user } = useAuth();
  return (
    <div className="space-y-4">
      <IntegrationCredentials />
      <InstructorLoginDiagnostics />
      <div className="card">
        <h2 className="text-base font-semibold">ספר-מערכת</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          לוגיקות עסקיות ומילון מונחים כפי שהם מוגדרים בפועל במערכת
        </p>
        <div className="mt-3">
          <Link href="/manual">
            <Button variant="outline">פתח ספר-מערכת</Button>
          </Link>
        </div>
      </div>
      {user?.is_superuser && (
        <div className="card">
          <h2 className="text-base font-semibold">DevOps</h2>
          <p className="mt-1 text-sm text-muted-foreground">גיבוי בסיס נתונים — למנהל־על בלבד</p>
          <div className="mt-3">
            <Link href="/devops">
              <Button variant="outline">פתח DevOps</Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
