'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { 
  ArrowRight, Phone, Mail, MapPin, Edit, Gift, Award, Building2, BookOpen, Calendar, List
} from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import api from '@/lib/api';
import {
  InstructorDetail,
  LessonWithStudents,
  DAY_OF_WEEK_HEBREW
} from '@/types/instructor';
import {
  formatCurrency,
  formatPhoneNumber,
  getProfitColorClass
} from '@/lib/instructorUtils';
import EditInstructorDialog from '@/components/dialogs/EditInstructorDialog';
import AddInstructorBonusDialog from '@/components/dialogs/AddInstructorBonusDialog';
import InstructorWeeklySchedule from '@/components/instructors/InstructorWeeklySchedule';

type LessonFilter = 'all' | 'profitable' | 'loss';
type LessonsView = 'table' | 'schedule';

export default function InstructorDetailPage() {
  const router = useRouter();
  const params = useParams();
  const instructorId = params.id as string;
  
  const [instructor, setInstructor] = useState<InstructorDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [lessonFilter, setLessonFilter] = useState<LessonFilter>('all');
  const [lessonsView, setLessonsView] = useState<LessonsView>('table');
  const [addBonusDialogOpen, setAddBonusDialogOpen] = useState(false);
  
  const fetchInstructor = async () => {
    setLoading(true);
    try {
      const response = await api.get(`/instructors/${instructorId}/`);
      setInstructor(response.data);
    } catch (error) {
      console.error('Error fetching instructor:', error);
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    if (instructorId) {
      fetchInstructor();
    }
  }, [instructorId]);
  
  const handleBack = () => {
    router.push('/instructors');
  };
  
  
  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center min-h-[60vh]">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary mb-4"></div>
            <p className="text-muted-foreground">טוען פרטי מדריך...</p>
          </div>
        </div>
      </AppLayout>
    );
  }
  
  if (!instructor) {
    return (
      <AppLayout>
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">מדריך לא נמצא</p>
          <button onClick={handleBack} className="btn-secondary">
            <ArrowRight className="w-4 h-4 ml-2" />
            חזרה לרשימה
          </button>
        </div>
      </AppLayout>
    );
  }
  
  // Filter lessons based on profitability
  const filteredLessons = instructor.lessons.filter(lesson => {
    const profit = parseFloat(lesson.profit);
    if (lessonFilter === 'profitable') return profit > 0;
    if (lessonFilter === 'loss') return profit < 0;
    return true; // 'all'
  });
  
  const profitableLessonsCount = instructor.lessons.filter(l => parseFloat(l.profit) > 0).length;
  const lossLessonsCount = instructor.lessons.filter(l => parseFloat(l.profit) < 0).length;

  const salaryModelLabel =
    instructor.salary_model_type === 'tiered_by_students' ? 'מדרגות תלמידים' : 'שכר קבוע';

  const overrideSalaryLessonsCount = instructor.lessons.filter((l) => Boolean(l.salary_override)).length;

  const currentYear = new Date().getFullYear();
  const totalBonusesThisYear = instructor.bonuses
    .filter((b) => new Date(b.bonus_date).getFullYear() === currentYear)
    .reduce((sum, b) => sum + (Number(b.amount) || 0), 0);

  // Branches to display: include primary + additional, de-duped
  const branchesToShow = (() => {
    const items: Array<{ id: string; name: string }> = [];

    if (instructor.primary_branch && instructor.primary_branch_name) {
      items.push({ id: String(instructor.primary_branch), name: instructor.primary_branch_name });
    }

    for (const assignment of instructor.branches || []) {
      if (assignment?.branch?.id && assignment?.branch?.name) {
        items.push({ id: assignment.branch.id, name: assignment.branch.name });
      }
    }

    const seen = new Set<string>();
    return items.filter((b) => {
      if (seen.has(b.id)) return false;
      seen.add(b.id);
      return true;
    });
  })();

  // Weekly totals (each recurring lesson occurs weekly; lesson.revenue/salary/profit are per-lesson)
  const weeklyIncome = instructor.lessons.reduce((sum, l) => sum + (parseFloat(l.revenue) || 0), 0);
  const weeklySalary = instructor.lessons.reduce((sum, l) => sum + (parseFloat(l.salary) || 0), 0);
  const weeklyProfit = instructor.lessons.reduce((sum, l) => sum + (parseFloat(l.profit) || 0), 0);
  
  return (
    <AppLayout>
      {/* Header */}
      <div className="mb-4">
        <button onClick={handleBack} className="btn-secondary mb-4">
          <ArrowRight className="w-4 h-4 ml-2" />
        </button>
        
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold">{instructor.full_name}</h1>
            <p className="text-sm text-muted-foreground">פרטי מדריך</p>
          </div>
          
          <button 
            className="btn-primary inline-flex items-center gap-2 whitespace-nowrap"
            onClick={() => setEditDialogOpen(true)}
          >
            <Edit className="w-4 h-4" />
            עריכת מדריך
          </button>
        </div>
        
        {/* Info Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          {/* Contact Info Card */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="flex items-center">
                <Phone className="w-5 h-5 text-muted-foreground ml-2" />
                <h3 className="text-base font-semibold">פרטי קשר</h3>
              </div>
            </div>
            <div className="px-5 py-4 space-y-3">
              {instructor.email && (
                <div className="flex items-start">
                  <Mail className="w-4 h-4 text-muted-foreground ml-2 mt-0.5" />
                  <a 
                    href={`mailto:${instructor.email}`}
                    className="text-sm text-black hover:underline break-all"
                  >
                    {instructor.email}
                  </a>
                </div>
              )}
              
              {instructor.phone && (
                <div className="flex items-start">
                  <Phone className="w-4 h-4 text-muted-foreground ml-2 mt-0.5" />
                  <a 
                    href={`tel:${instructor.phone}`}
                    className="text-sm text-black hover:underline"
                  >
                    {formatPhoneNumber(instructor.phone)}
                  </a>
                </div>
              )}
              
              {instructor.specialization && (
                <div className="flex items-start">
                  <Award className="w-4 h-4 text-muted-foreground ml-2 mt-0.5" />
                  <span className="text-sm text-black">{instructor.specialization}</span>
                </div>
              )}
            </div>
          </div>
          
          {/* Branches Card */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
            <div className="px-5 py-4 border-b border-gray-100">
              <div className="flex items-center">
                <Building2 className="w-5 h-5 text-muted-foreground ml-2" />
                <h3 className="text-base font-semibold">סניפים</h3>
              </div>
            </div>
            <div className="px-5 py-4">
              {branchesToShow.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {branchesToShow.map((branch) => (
                    <span 
                      key={branch.id} 
                      className="px-3 py-1 bg-white border border-gray-200 rounded-full text-sm font-medium"
                    >
                      {branch.name}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">לא משויך לסניפים</p>
              )}
            </div>
          </div>
          
          {/* Courses Card */}
          <div className="bg-white border border-gray-200 rounded-lg shadow-sm">
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-center">
                <BookOpen className="w-4 h-4 text-muted-foreground ml-2" />
                <h3 className="text-sm font-semibold">חוגים</h3>
              </div>
            </div>
            <div className="px-4 py-3">
              {instructor.courses.length > 0 ? (
                <div className="space-y-1.5">
                  {instructor.courses.slice(0, 5).map(course => (
                    <div 
                      key={course.id} 
                      className="px-2 py-1 bg-gray-50 border border-gray-200 rounded-md inline-block mr-1"
                    >
                      <p className="text-xs font-medium">{course.name}</p>
                    </div>
                  ))}
                  {instructor.courses.length > 5 && (
                    <p className="text-xs text-muted-foreground">
                      +{instructor.courses.length - 5} נוספים
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-xs text-muted-foreground">לא מעביר חוגים</p>
              )}
            </div>
          </div>
        </div>
      </div>
      
      {/* Salary Model Section */}
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold">מודל שכר</h3>
        </div>

        {/* Summary squares (compact, aligned to the other side) */}
        <div className="flex justify-start mb-5">
          <div className="grid grid-cols-3 gap-3 w-full max-w-xl">
            <div className="bg-gray-100 rounded-lg px-3 py-2 text-center">
              <p className="text-xs text-muted-foreground mb-1">סוג מודל</p>
              <p className="text-sm font-semibold whitespace-nowrap">{salaryModelLabel}</p>
            </div>
            <div className="bg-gray-100 rounded-lg px-3 py-2 text-center">
              <p className="text-xs text-muted-foreground mb-1 whitespace-nowrap">שיעורים עם שכר חריג</p>
              <p className="text-lg font-bold">{overrideSalaryLessonsCount}</p>
            </div>
            <div className="bg-gray-100 rounded-lg px-3 py-2 text-center">
              <p className="text-xs text-muted-foreground mb-1 whitespace-nowrap">סה״כ בונוסים (שנה נוכחית)</p>
              <p className="text-lg font-bold text-green-600 whitespace-nowrap">
                {formatCurrency(totalBonusesThisYear)}
              </p>
            </div>
          </div>
        </div>
        
        {instructor.salary_model_type === 'tiered_by_students' && (instructor.salary_tiers?.length ?? 0) > 0 ? (
          <div>
            <div className="max-w-3xl bg-gray-50 rounded-xl p-4">
              <div className="overflow-x-auto rounded-lg border border-gray-200 bg-gray-50">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-4 py-2 text-right text-muted-foreground font-medium">טווח תלמידים</th>
                      <th className="px-4 py-2 text-right text-muted-foreground font-medium">שכר לשיעור</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {instructor.salary_tiers.map((tier, index) => (
                      <tr key={index} className="bg-gray-50">
                        <td className="px-4 py-3 font-medium">
                          {tier.max_students !== null 
                            ? `${tier.min_students} - ${tier.max_students}` 
                            : `+${tier.min_students}`}
                        </td>
                        <td className="px-4 py-3 font-semibold">
                          {formatCurrency(tier.salary_per_lesson)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <div className="max-w-3xl bg-gray-50 rounded-xl p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm text-muted-foreground">שכר לשיעור</p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(instructor.fixed_salary_per_lesson)}
              </p>
            </div>
          </div>
        )}
      </div>
      
      {/* Lessons & Profitability Section */}
      <div className="card mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <h3 className="text-lg font-semibold">שיעורים ורווחיות ({instructor.lessons.length})</h3>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex rounded-lg border overflow-hidden">
              <button
                type="button"
                onClick={() => setLessonsView('table')}
                className={`px-3 py-2 text-sm inline-flex items-center gap-1.5 ${
                  lessonsView === 'table' ? 'bg-primary text-primary-foreground' : 'bg-white hover:bg-gray-50'
                }`}
              >
                <List className="w-4 h-4" />
                טבלה
              </button>
              <button
                type="button"
                onClick={() => setLessonsView('schedule')}
                className={`px-3 py-2 text-sm inline-flex items-center gap-1.5 border-r ${
                  lessonsView === 'schedule' ? 'bg-primary text-primary-foreground' : 'bg-white hover:bg-gray-50'
                }`}
              >
                <Calendar className="w-4 h-4" />
                לוח שבועי
              </button>
            </div>

            {lessonsView === 'table' && (
              <select
                value={lessonFilter}
                onChange={(e) => setLessonFilter(e.target.value as LessonFilter)}
                className="input w-48"
              >
                <option value="all">הכל ({instructor.lessons.length})</option>
                <option value="profitable">רווחי ({profitableLessonsCount})</option>
                <option value="loss">הפסדי ({lossLessonsCount})</option>
              </select>
            )}
          </div>
        </div>

        {/* Weekly Summary */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
          <div className="bg-gray-100 rounded-lg px-3 py-2 text-center">
            <p className="text-xs text-muted-foreground mb-1">סה״כ תלמידים</p>
            <p className="text-lg font-bold">{instructor.total_students || 0}</p>
          </div>
          <div className="bg-gray-100 rounded-lg px-3 py-2 text-center">
            <p className="text-xs text-muted-foreground mb-1">הכנסה שבועית</p>
            <p className="text-lg font-bold text-green-600">{formatCurrency(weeklyIncome)}</p>
          </div>
          <div className="bg-gray-100 rounded-lg px-3 py-2 text-center">
            <p className="text-xs text-muted-foreground mb-1">שכר שבועי</p>
            <p className="text-lg font-bold text-orange-600">{formatCurrency(weeklySalary)}</p>
          </div>
          <div className="bg-gray-100 rounded-lg px-3 py-2 text-center">
            <p className="text-xs text-muted-foreground mb-1">רווח שבועי</p>
            <p className={`text-lg font-bold ${getProfitColorClass(weeklyProfit)}`}>
              {formatCurrency(weeklyProfit)}
            </p>
          </div>
        </div>
        
        {lessonsView === 'schedule' ? (
          <InstructorWeeklySchedule instructorId={instructor.id} />
        ) : filteredLessons.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">לא נמצאו שיעורים</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>יום ושעה</th>
                  <th>סניף</th>
                  <th>חוג</th>
                  <th className="text-center">תלמידים פעילים</th>
                  <th className="text-left">הכנסה לשיעור</th>
                  <th className="text-left">שכר לשיעור</th>
                  <th className="text-left">רווח / הפסד</th>
                </tr>
              </thead>
              <tbody>
                {filteredLessons.map(lesson => {
                  const profit = parseFloat(lesson.profit);
                  return (
                    <tr key={lesson.lesson_id} className={profit < 0 ? 'bg-red-50' : profit > 0 ? 'bg-green-50' : ''}>
                      <td>
                        <div>
                          <p className="font-medium">{DAY_OF_WEEK_HEBREW[lesson.day_of_week]}</p>
                          <p className="text-xs text-muted-foreground">
                            {lesson.start_time} - {lesson.end_time}
                          </p>
                        </div>
                      </td>
                      <td>
                        <span className="badge badge-blue text-xs">
                          {lesson.branch_name}
                        </span>
                      </td>
                      <td className="font-medium">{lesson.course_name}</td>
                      <td className="text-center">
                        <span className="badge badge-gray">
                          {lesson.student_count}
                        </span>
                      </td>
                      <td className="text-left text-green-600 font-medium">
                        {formatCurrency(lesson.revenue)}
                      </td>
                      <td className="text-left text-orange-600 font-medium">
                        {formatCurrency(lesson.salary)}
                      </td>
                      <td className={`text-left font-bold ${getProfitColorClass(profit)}`}>
                        {profit < 0 && '↓'}{profit > 0 && '↑'} {formatCurrency(lesson.profit)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* Bonuses Section */}
      <div className="card mb-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">בונוסים תקופתיים ({instructor.bonuses.length})</h3>
          <button
            className="btn-secondary btn-sm inline-flex items-center gap-2 whitespace-nowrap"
            onClick={() => setAddBonusDialogOpen(true)}
            type="button"
          >
            <Gift className="w-4 h-4 ml-1" />
            הוסף בונוס
          </button>
        </div>
        
        {instructor.bonuses.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">לא נמצאו בונוסים</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>תאריך</th>
                  <th>סוג</th>
                  <th className="text-left">סכום</th>
                  <th>תיאור</th>
                </tr>
              </thead>
              <tbody>
                {instructor.bonuses.map(bonus => (
                  <tr key={bonus.id}>
                    <td>{new Date(bonus.bonus_date).toLocaleDateString('he-IL')}</td>
                    <td>
                      <span className="badge badge-blue">
                        חד פעמי
                      </span>
                    </td>
                    <td className="text-left font-bold text-green-600">
                      {formatCurrency(bonus.amount)}
                    </td>
                    <td className="text-sm text-muted-foreground">
                      {bonus.description || '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* Salary History Section */}
      <div className="card">
        <h3 className="text-lg font-semibold mb-4">היסטוריית שכר (6 חודשים אחרונים)</h3>
        
        {!instructor.monthly_snapshots || instructor.monthly_snapshots.length === 0 ? (
          <p className="text-muted-foreground text-center py-8">אין נתוני היסטוריה זמינים</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>חודש</th>
                  <th className="text-center">מספר שיעורים שהוגדרו</th>
                  <th className="text-left">סה״כ שכר</th>
                </tr>
              </thead>
              <tbody>
                {instructor.monthly_snapshots.map(snapshot => {
                  const [year, month] = snapshot.month.split('-');
                  const monthNames = [
                    'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
                    'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'
                  ];
                  const monthName = monthNames[parseInt(month) - 1];
                  
                  return (
                    <tr key={snapshot.id}>
                      <td className="font-medium">{`${monthName} ${year}`}</td>
                      <td className="text-center">
                        <span className="badge badge-gray">
                          {snapshot.total_lessons}
                        </span>
                      </td>
                      <td className="text-left font-bold text-green-600">
                        {formatCurrency(snapshot.total_salary)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* Edit Dialog */}
      {instructor && (
        <EditInstructorDialog
          instructor={instructor}
          isOpen={editDialogOpen}
          onClose={() => setEditDialogOpen(false)}
          onSave={() => {
            fetchInstructor();
          }}
        />
      )}

      {/* Add Bonus Dialog */}
      {instructor && (
        <AddInstructorBonusDialog
          instructorId={instructor.id}
          isOpen={addBonusDialogOpen}
          onClose={() => setAddBonusDialogOpen(false)}
          onSaved={() => fetchInstructor()}
        />
      )}
    </AppLayout>
  );
}
