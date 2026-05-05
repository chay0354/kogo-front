'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';
import { useAuth } from '@/components/AuthProvider';
import { InstructorSalary, SalaryHistory } from '@/types/schedule';
import { fetchCurrentSalary, fetchSalaryHistory, getHebrewMonth } from '@/lib/scheduleUtils';
import api from '@/lib/api';

type Instructor = {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  fixed_salary_per_lesson: string;
};

export default function InstructorSalaryPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const instructorId = params.id as string;

  const [instructor, setInstructor] = useState<Instructor | null>(null);
  const [currentSalary, setCurrentSalary] = useState<InstructorSalary | null>(null);
  const [salaryHistory, setSalaryHistory] = useState<SalaryHistory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const isManager = user?.role === 'manager';

  useEffect(() => {
    // Only managers can view salary data
    if (user && !isManager) {
      router.push('/instructors');
      return;
    }

    if (instructorId) {
      loadData();
    }
  }, [instructorId, user, isManager]);

  const loadData = async () => {
    setIsLoading(true);
    setError('');

    try {
      // Load instructor details
      const instructorRes = await api.get(`/instructors/${instructorId}/`);
      setInstructor(instructorRes.data);

      // Load current salary
      const now = new Date();
      const current = await fetchCurrentSalary(instructorId, now.getFullYear(), now.getMonth() + 1);
      setCurrentSalary(current);

      // Load salary history
      const history = await fetchSalaryHistory(instructorId);
      setSalaryHistory(history);
    } catch (err) {
      setError('שגיאה בטעינת נתוני שכר');
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isManager) {
    return null;
  }

  return (
    <AppLayout>
      <PageHeader
        title={`שכר מדריך: ${instructor?.first_name} ${instructor?.last_name}`}
        description="צפייה בשכר נוכחי והיסטוריה"
        actions={
          <button
            onClick={() => router.push(`/instructors/${instructorId}`)}
            className="btn-secondary"
          >
            חזרה למדריך
          </button>
        }
      />

      <div className="space-y-6 animate-fade-in">
        {/* Error Message */}
        {error && (
          <div className="card p-4 bg-red-50 border border-red-200 text-red-700">
            {error}
          </div>
        )}

        {/* Loading State */}
        {isLoading ? (
          <div className="card text-center py-12">
            <div className="text-lg text-gray-600">טוען נתוני שכר...</div>
          </div>
        ) : (
          <>
            {/* Current Month Salary */}
            <div className="card">
              <h2 className="text-xl font-bold mb-4">שכר חודש נוכחי</h2>
              
              {currentSalary ? (
                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="text-sm text-blue-700 mb-1">
                      {getHebrewMonth(currentSalary.month)} {currentSalary.year}
                    </div>
                    <div className="text-3xl font-bold text-blue-900">
                      ₪{parseFloat(currentSalary.total_salary).toLocaleString()}
                    </div>
                    <div className="text-sm text-blue-600 mt-2">
                      מחושב באופן דינמי - מתעדכן עם ביטולי שיעורים
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-sm text-gray-600">שיעורים שהתרחשו</div>
                      <div className="text-2xl font-semibold">{currentSalary.lesson_count}</div>
                    </div>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <div className="text-sm text-gray-600">תשלום לשיעור</div>
                      <div className="text-2xl font-semibold">
                        ₪{parseFloat(currentSalary.payment_per_lesson).toLocaleString()}
                      </div>
                    </div>
                  </div>

                  <div className="text-xs text-gray-500">
                    עודכן לאחרונה: {new Date(currentSalary.calculated_at).toLocaleString('he-IL')}
                  </div>
                </div>
              ) : (
                <div className="text-gray-500">אין נתונים לחודש הנוכחי</div>
              )}
            </div>

            {/* Salary History */}
            <div className="card">
              <h2 className="text-xl font-bold mb-4">היסטוריית שכר</h2>

              {salaryHistory.length > 0 ? (
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-right py-3 px-4">חודש</th>
                        <th className="text-right py-3 px-4">שיעורים</th>
                        <th className="text-right py-3 px-4">תשלום לשיעור</th>
                        <th className="text-right py-3 px-4">סה"כ</th>
                        <th className="text-right py-3 px-4">סטטוס</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salaryHistory.map((record) => (
                        <tr key={record.id} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-4">
                            {getHebrewMonth(record.month)} {record.year}
                          </td>
                          <td className="py-3 px-4">{record.lesson_count}</td>
                          <td className="py-3 px-4">
                            ₪{parseFloat(record.payment_per_lesson).toLocaleString()}
                          </td>
                          <td className="py-3 px-4 font-semibold">
                            ₪{parseFloat(record.total_salary).toLocaleString()}
                          </td>
                          <td className="py-3 px-4">
                            <span className="inline-block px-2 py-1 text-xs bg-green-100 text-green-700 rounded">
                              סופי
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  אין היסטוריית שכר זמינה
                </div>
              )}
            </div>

            {/* Info Box */}
            <div className="card bg-blue-50 border border-blue-200">
              <h3 className="font-semibold text-blue-900 mb-2">מידע חשוב</h3>
              <ul className="text-sm text-blue-800 space-y-1">
                <li>• שכר חודש נוכחי מחושב דינמית ומתעדכן בזמן אמת</li>
                <li>• רק שיעורים שהתרחשו (לא בוטלו + תאריך עבר) נספרים</li>
                <li>• ביטול שיעור משפיע על השכר רק בחודש הנוכחי</li>
                <li>• חודשים בהיסטוריה הם סופיים ולא משתנים</li>
                <li>• חודשים מסופיים באופן אוטומטי בתחילת כל חודש</li>
              </ul>
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}

