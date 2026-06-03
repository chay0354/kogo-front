'use client';

import { X, Users, Calendar, DollarSign, GraduationCap, MapPin } from 'lucide-react';
import { DAY_OF_WEEK_HEBREW } from '@/types/branch';

interface CourseDetailsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  course: any;
}

export default function CourseDetailsDialog({ isOpen, onClose, course }: CourseDetailsDialogProps) {
  if (!isOpen || !course) return null;

  const lessonsCount = course.lessons_count || 0;
  const studentsCount = course.enrolled_students_count || 0;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-background rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-border sticky top-0 bg-background">
          <h2 className="text-2xl font-bold">{course.name}<span style={{ fontSize: '10px', color: 'white', userSelect: 'none' }}> #12</span></h2>
          <button onClick={onClose} className="p-2 hover:bg-accent rounded-lg transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Course Type */}
          {course.course_type_name && (
            <div>
              <label className="text-sm text-muted-foreground">סוג החוג</label>
              <div className="text-lg font-medium">{course.course_type_name}</div>
            </div>
          )}

          {/* Basic Info Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground flex items-center gap-2">
                  <DollarSign className="w-4 h-4" />
                  מחיר
                </label>
                <div className="text-lg font-medium">₪{course.price}</div>
              </div>

              <div>
                <label className="text-sm text-muted-foreground flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  קיבולת
                </label>
                <div className="text-lg font-medium">{course.capacity} משתתפים</div>
              </div>

              <div>
                <label className="text-sm text-muted-foreground flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  תלמידים רשומים
                </label>
                <div className="text-lg font-medium">{studentsCount} תלמידים</div>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm text-muted-foreground flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  מספר שיעורים
                </label>
                <div className="text-lg font-medium">{lessonsCount} שיעורים</div>
              </div>

              {course.branch_name && (
                <div>
                  <label className="text-sm text-muted-foreground flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    סניף
                  </label>
                  <div className="text-lg font-medium">{course.branch_name}</div>
                </div>
              )}
            </div>
          </div>

          {/* Age Range */}
          {(course.min_age || course.max_age) && (
            <div>
              <label className="text-sm text-muted-foreground">טווח גילאים</label>
              <div className="text-lg font-medium">
                {course.min_age && course.max_age
                  ? `${course.min_age} - ${course.max_age} שנים`
                  : course.min_age
                  ? `מגיל ${course.min_age}`
                  : `עד גיל ${course.max_age}`
                }
              </div>
            </div>
          )}

          {/* Description */}
          {course.description && (
            <div>
              <label className="text-sm text-muted-foreground">תיאור</label>
              <div className="text-base mt-1 p-4 bg-accent/20 rounded-lg">
                {course.description}
              </div>
            </div>
          )}

          {/* Lessons Schedule */}
          {course.lessons && course.lessons.length > 0 && (
            <div>
              <label className="text-sm text-muted-foreground mb-3 block">לוח שיעורים</label>
              <div className="space-y-2">
                {course.lessons.map((lesson: any, index: number) => (
                  <div 
                    key={lesson.id || index} 
                    className="flex items-center justify-between p-3 border border-border rounded-lg"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-muted-foreground" />
                        <span className="font-medium">
                          {DAY_OF_WEEK_HEBREW[lesson.day_of_week] || 'לא ידוע'}
                        </span>
                      </div>
                      <span className="text-muted-foreground">
                        {lesson.start_time} - {lesson.end_time}
                      </span>
                      {lesson.room_name && (
                        <span className="text-sm text-muted-foreground">
                          📍 {lesson.room_name}
                        </span>
                      )}
                    </div>
                    {lesson.instructor_name && (
                      <div className="flex items-center gap-1 text-sm text-muted-foreground">
                        <GraduationCap className="w-4 h-4" />
                        {lesson.instructor_name}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Status */}
          <div>
            <label className="text-sm text-muted-foreground">סטטוס</label>
            <div className="mt-1">
              <span className={`inline-flex px-3 py-1 rounded-full text-sm font-medium ${
                course.is_active 
                  ? 'bg-success/10 text-success border border-success/20' 
                  : 'bg-destructive/10 text-destructive border border-destructive/20'
              }`}>
                {course.is_active ? 'פעיל' : 'לא פעיל'}
              </span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-border">
          <button onClick={onClose} className="btn-secondary">
            סגור
          </button>
        </div>
      </div>
    </div>
  );
}

