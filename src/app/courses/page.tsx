'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';
import PageFilters from '@/components/PageFilters';
import api from '@/lib/api';
import { CourseTypeWithStats } from '@/types/course';
import AddCourseTypeDialog from '@/components/dialogs/AddCourseTypeDialog';
import EditCourseTypeDialog from '@/components/dialogs/EditCourseTypeDialog';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

export default function CoursesPage() {
  const router = useRouter();
  const [courseTypes, setCourseTypes] = useState<CourseTypeWithStats[]>([]);
  const [filteredCourseTypes, setFilteredCourseTypes] = useState<CourseTypeWithStats[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [primaryFilter, setPrimaryFilter] = useState('');
  const [secondaryFilter, setSecondaryFilter] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<CourseTypeWithStats | null>(null);

  useEffect(() => {
    fetchCourseTypes();
  }, []);

  useEffect(() => {
    // Filter course types by search query
    if (searchQuery.trim()) {
      const filtered = courseTypes.filter((ct) =>
        ct.name.toLowerCase().includes(searchQuery.toLowerCase())
      );
      setFilteredCourseTypes(filtered);
    } else {
      setFilteredCourseTypes(courseTypes);
    }
  }, [searchQuery, courseTypes]);

  const fetchCourseTypes = async () => {
    try {
      const response = await api.get('/courses/types/');
      // Handle both array response and paginated response
      const data = Array.isArray(response.data) ? response.data : (response.data.results || []);
      setCourseTypes(data);
      setFilteredCourseTypes(data);
    } catch (error) {
      console.error('Error fetching course types:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleCardClick = (courseTypeId: string) => {
    router.push(`/courses/${courseTypeId}`);
  };

  const handleAddCourseType = () => {
    setShowAddDialog(true);
  };

  const handleCourseTypeAdded = () => {
    setShowAddDialog(false);
    fetchCourseTypes();
  };

  const handleEditSuccess = () => {
    setEditTarget(null);
    fetchCourseTypes();
  };

  const handleDeleteConfirm = async (confirmed: boolean) => {
    if (!confirmed || !deleteTargetId) return;
    try {
      await api.delete(`/courses/types/${deleteTargetId}/`);
      setCourseTypes((prev) => prev.filter((ct) => ct.id !== deleteTargetId));
    } catch (error) {
      console.error('Error deleting course type:', error);
    } finally {
      setDeleteTargetId(null);
    }
  };

  return (
    <AppLayout>
      <div dir="rtl" className="space-y-6">
        {/* Header */}
        <PageHeader
          title="קטלוג חוגים"
          description="תחומים ורמות"
          actions={
            <button
              onClick={handleAddCourseType}
              className="btn-primary flex items-center gap-2"
            >
              <span>+</span>
              <span>הוספת תחום</span>
            </button>
          }
        />

        {/* Search */}
        <div className="card">
          <input
            type="text"
            placeholder="חיפוש תחום..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
          />
          <div className="flex flex-wrap items-center gap-3 mt-3" dir="rtl">
            <span className="text-sm text-muted-foreground">מ:</span>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
            <span className="text-sm text-muted-foreground">עד:</span>
            <input type="date" value={dateTo} min={dateFrom || undefined} onChange={(e) => setDateTo(e.target.value)} className="h-9 rounded-md border border-input bg-background px-2 text-sm" />
          </div>
        </div>
        <PageFilters
          primaryLabel="עסק / סניף"
          primaryValue={primaryFilter}
          primaryOptions={[]}
          onPrimaryChange={setPrimaryFilter}
          secondaryValue={secondaryFilter}
          secondaryOptions={[]}
          onSecondaryChange={setSecondaryFilter}
        />

        {/* Course Types Grid */}
        {loading ? (
          <div className="card">
            <p className="text-muted-foreground text-center">טוען נתונים...</p>
          </div>
        ) : filteredCourseTypes.length === 0 ? (
          <div className="card">
            <div className="text-center py-12">
              <p className="text-muted-foreground mb-4">
                {searchQuery ? 'לא נמצאו תחומים התואמים לחיפוש' : 'אין תחומים להצגה'}
              </p>
              {!searchQuery && (
                <button onClick={handleAddCourseType} className="btn-secondary">
                  צור תחום ראשון
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredCourseTypes.map((courseType) => (
              <div
                key={courseType.id}
                onClick={() => handleCardClick(courseType.id)}
                className="card hover:shadow-lg transition-shadow cursor-pointer overflow-hidden"
              >
                {/* Header with course type name */}
                <div className="group/header relative bg-gradient-to-br from-teal-500 to-teal-600 p-8 text-center">
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditTarget(courseType); }}
                    className="absolute top-2 right-2 p-1.5 text-white/70 hover:text-white hover:bg-white/20 rounded transition-colors opacity-0 group-hover/header:opacity-100"
                    title="עריכה"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                  </button>
                  {courseType.courses_count === 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setDeleteTargetId(courseType.id); }}
                      className="absolute top-2 left-2 p-1.5 text-white/70 hover:text-white hover:bg-white/20 rounded transition-colors opacity-0 group-hover/header:opacity-100"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  )}
                  <h3 className="text-3xl font-bold text-white">
                    {courseType.name.charAt(0)}
                  </h3>
                </div>

                {/* Content */}
                <div className="p-6 space-y-4">
                  <div>
                    <h4 className="text-xl font-semibold text-gray-900 mb-2">
                      {courseType.name}
                    </h4>
                    {courseType.description && (
                      <p className="text-sm text-gray-600 line-clamp-2">
                        {courseType.description}
                      </p>
                    )}
                  </div>

                  {/* Stats */}
                  <div className="flex items-center justify-between text-sm border-t pt-4">
                    <div className="text-center flex-1">
                      <div className="flex items-center justify-center mb-1">
                        <svg
                          className="w-5 h-5 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                          />
                        </svg>
                      </div>
                      <p className="font-semibold text-gray-900">
                        {courseType.courses_count}
                      </p>
                      <p className="text-gray-500">חוגים</p>
                    </div>

                    <div className="h-12 w-px bg-gray-200" />

                    <div className="text-center flex-1">
                      <div className="flex items-center justify-center mb-1">
                        <svg
                          className="w-5 h-5 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
                          />
                        </svg>
                      </div>
                      <p className="font-semibold text-gray-900">
                        {courseType.lessons_count}
                      </p>
                      <p className="text-gray-500">שיעורים</p>
                    </div>

                    <div className="h-12 w-px bg-gray-200" />

                    <div className="text-center flex-1">
                      <div className="flex items-center justify-center mb-1">
                        <svg
                          className="w-5 h-5 text-gray-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
                          />
                        </svg>
                      </div>
                      <p className="font-semibold text-gray-900">
                        {courseType.students_count}
                      </p>
                      <p className="text-gray-500">תלמידים</p>
                    </div>
                  </div>

                  {/* Branches */}
                  {courseType.branches.length > 0 && (
                    <div className="border-t pt-4">
                      <div className="flex flex-wrap gap-2">
                        {courseType.branches.map((branch: any) => (
                          <span
                            key={branch.id}
                            className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700"
                          >
                            <svg
                              className="w-3 h-3 ml-1"
                              fill="currentColor"
                              viewBox="0 0 20 20"
                            >
                              <path
                                fillRule="evenodd"
                                d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                                clipRule="evenodd"
                              />
                            </svg>
                            {branch.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        isOpen={deleteTargetId !== null}
        onClose={() => setDeleteTargetId(null)}
        onConfirm={handleDeleteConfirm}
        title="מחיקת תחום"
        message="האם אתה בטוח שברצונך למחוק תחום זה?"
        confirmText="מחק"
        type="warning"
      />

      {/* Add Course Type Dialog */}
      {showAddDialog && (
        <AddCourseTypeDialog
          open={showAddDialog}
          onClose={() => setShowAddDialog(false)}
          onSuccess={handleCourseTypeAdded}
        />
      )}

      {/* Edit Course Type Dialog */}
      {editTarget && (
        <EditCourseTypeDialog
          courseType={editTarget}
          open={true}
          onClose={() => setEditTarget(null)}
          onSuccess={handleEditSuccess}
        />
      )}
    </AppLayout>
  );
}
