'use client';

import { useEffect, useState } from 'react';
import { Users, MoreHorizontal, Eye, Edit, UserPlus, Trash2, UserCheck } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';
import api from '@/lib/api';
import { ChildWithDetails, CustomerFilters, Branch, Course, Instructor } from '@/types/customer';
import { 
  getChildStatus, 
  formatWhatsAppLink, 
  getUniqueCourses
} from '@/lib/customerUtils';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator } from '@/components/DropdownMenu';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogCloseButton } from '@/components/ui/dialog';
import ChildProfileDialog from '@/components/dialogs/ChildProfileDialog';
import EditChildDialog from '@/components/dialogs/EditChildDialog';
import DeleteChildDialog from '@/components/dialogs/DeleteChildDialog';
import EnrollToLessonDialog from '@/components/dialogs/EnrollToLessonDialog';

export default function CustomersPage() {
  const [children, setChildren] = useState<ChildWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [childrenTotalCount, setChildrenTotalCount] = useState<number>(0);
  const [childrenPage, setChildrenPage] = useState<number>(1);
  const [childrenHasNext, setChildrenHasNext] = useState<boolean>(false);
  const [childrenHasPrev, setChildrenHasPrev] = useState<boolean>(false);
  
  // Filter options
  const [branches, setBranches] = useState<Branch[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  
  // Active filters - Default to 'active' status
  const [filters, setFilters] = useState<CustomerFilters>({
    search: '',
    branch: 'all',
    course: 'all',
    instructor: 'all',
    status: 'active',
    absent_irregularly: 'all',
    trial: 'all',  // Keep for now - can remove later if not needed
    payment: 'all', // Keep for now - can remove later if not needed
  });
  
  // Dialog states
  const [selectedChild, setSelectedChild] = useState<ChildWithDetails | null>(null);
  const [profileDialogOpen, setProfileDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [enrollDialogOpen, setEnrollDialogOpen] = useState(false);
  const [addCustomerDialogOpen, setAddCustomerDialogOpen] = useState(false);
  const [addCustomerStep, setAddCustomerStep] = useState<'choice' | 'existing' | 'new'>('choice');
  const [statusDialogOpen, setStatusDialogOpen] = useState(false);
  const [statusDialogValue, setStatusDialogValue] = useState('');
  const [statusSaving, setStatusSaving] = useState(false);

  // Load filter options
  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        const [branchesRes, coursesRes, instructorsRes] = await Promise.all([
          api.get('/core/branches/'),
          api.get('/courses/courses/'),
          api.get('/instructors/'),
        ]);
        
        // Extract results from paginated response
        setBranches(branchesRes.data.results || branchesRes.data || []);
        setCourses(coursesRes.data.results || coursesRes.data || []);
        setInstructors(instructorsRes.data.instructors || instructorsRes.data.results || instructorsRes.data || []);
      } catch (error) {
        console.error('Error loading filter options:', error);
      }
    };
    
    loadFilterOptions();
  }, []);

  // Load children data
  useEffect(() => {
    const fetchChildren = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        
        if (filters.search) params.append('search', filters.search);
        if (filters.branch !== 'all') params.append('branch', filters.branch);
        if (filters.course !== 'all') params.append('course', filters.course);
        if (filters.instructor !== 'all') params.append('instructor', filters.instructor);
        if (filters.status !== 'all') params.append('status', filters.status);
        if (filters.absent_irregularly !== 'all') params.append('absent_irregularly', filters.absent_irregularly);
        if (filters.trial !== 'all') params.append('trial', filters.trial);
        if (filters.payment !== 'all') params.append('payment', filters.payment);
        params.append('page', String(childrenPage));
        
        const response = await api.get(`/customers/children/?${params.toString()}`);
        // Extract results from paginated response
        const results = response.data.results || response.data || [];
        setChildren(results);
        setChildrenTotalCount(typeof response.data.count === 'number' ? response.data.count : results.length);
        setChildrenHasNext(Boolean(response.data.next));
        setChildrenHasPrev(Boolean(response.data.previous));
      } catch (error) {
        console.error('Error fetching children:', error);
        setChildren([]);
        setChildrenTotalCount(0);
        setChildrenHasNext(false);
        setChildrenHasPrev(false);
      } finally {
        setLoading(false);
      }
    };
    
    fetchChildren();
  }, [filters, childrenPage]);


  const updateFilter = (key: keyof CustomerFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
    setChildrenPage(1);
  };
  
  // Handler functions
  const handleViewProfile = (child: ChildWithDetails) => {
    setSelectedChild(child);
    setProfileDialogOpen(true);
  };
  
  const handleEditProfile = (child: ChildWithDetails) => {
    setSelectedChild(child);
    setEditDialogOpen(true);
  };
  
  const handleEnrollToLesson = (child: ChildWithDetails) => {
    setSelectedChild(child);
    setEnrollDialogOpen(true);
  };
  
  const handleDeleteProfile = (child: ChildWithDetails) => {
    setSelectedChild(child);
    setDeleteDialogOpen(true);
  };
  
  const handleSaveEdit = async (data: any) => {
    if (!selectedChild) return;
    
    try {
      await api.put(`/customers/children/${selectedChild.id}/`, data);
      // Refresh the list with ALL current filters
      const params = new URLSearchParams();
      if (filters.search) params.append('search', filters.search);
      if (filters.branch !== 'all') params.append('branch', filters.branch);
      if (filters.course !== 'all') params.append('course', filters.course);
      if (filters.instructor !== 'all') params.append('instructor', filters.instructor);
      if (filters.status !== 'all') params.append('status', filters.status);
      params.append('page', String(childrenPage));
      
      const response = await api.get(`/customers/children/?${params.toString()}`);
      setChildren(response.data.results || response.data || []);
      setChildrenTotalCount(typeof response.data.count === 'number' ? response.data.count : (response.data.results || response.data || []).length);
    } catch (error) {
      console.error('Error updating child:', error);
      alert('שגיאה בעדכון הפרופיל');
    }
  };
  
  const handleConfirmDelete = async () => {
    if (!selectedChild) return;
    
    try {
      await api.delete(`/customers/children/${selectedChild.id}/`);
      // Remove from list
      setChildren(prev => prev.filter(c => c.id !== selectedChild.id));
    } catch (error) {
      console.error('Error deleting child:', error);
      alert('שגיאה במחיקת הפרופיל');
    }
  };
  
  const handleStatusClick = (child: ChildWithDetails) => {
    setSelectedChild(child);
    setStatusDialogValue(child.status || '');
    setStatusDialogOpen(true);
  };

  const handleStatusSave = async () => {
    if (!selectedChild) return;
    setStatusSaving(true);
    try {
      await api.patch(`/customers/children/${selectedChild.id}/`, { status: statusDialogValue });
      setChildren(prev => prev.map(c => c.id === selectedChild.id ? { ...c, status: statusDialogValue as any } : c));
      setStatusDialogOpen(false);
    } catch (error) {
      console.error('Error updating status:', error);
      alert('שגיאה בעדכון הסטטוס');
    } finally {
      setStatusSaving(false);
    }
  };

  const handleEnroll = async () => {
    // Refresh the children list after successful enrollment
    try {
      const params = new URLSearchParams();
      if (filters.search) params.append('search', filters.search);
      if (filters.branch !== 'all') params.append('branch', filters.branch);
      if (filters.course !== 'all') params.append('course', filters.course);
      if (filters.instructor !== 'all') params.append('instructor', filters.instructor);
      if (filters.status !== 'all') params.append('status', filters.status);
      params.append('page', String(childrenPage));
      
      const response = await api.get(`/customers/children/?${params.toString()}`);
      setChildren(response.data.results || response.data || []);
      setChildrenTotalCount(typeof response.data.count === 'number' ? response.data.count : (response.data.results || response.data || []).length);
    } catch (error) {
      console.error('Error refreshing children:', error);
    }
  };

  return (
    <AppLayout>
      <PageHeader 
        title="לקוחות" 
        description="ניהול ילדים ומשפחות - מערכת ממוקדת ילד"
        actions={
          <button 
            className="btn-primary flex items-center gap-2"
            onClick={() => {
              setAddCustomerStep('choice');
              setAddCustomerDialogOpen(true);
            }}
          >
            <Users className="w-4 h-4" />
            לקוח חדש
          </button>
        }
      />
      
      {/* Filters */}
      <div className="mb-6 animate-fade-in">
        <div className="mb-6 card animate-slide-up">
          <div className="flex flex-wrap items-center gap-2">
            {/* Search - Wider */}
            <input
              type="text"
              placeholder="חיפוש..."
              className="input w-64"
              value={filters.search}
              onChange={(e) => updateFilter('search', e.target.value)}
            />
            
            {/* Branch Filter */}
            <select
              className="input w-32 text-sm"
              value={filters.branch}
              onChange={(e) => updateFilter('branch', e.target.value)}
            >
              <option value="all">סניפים</option>
              {branches.map((branch: any) => (
                <option key={branch.id} value={branch.id}>{branch.name}</option>
              ))}
            </select>
            
            {/* Course Filter */}
            <select
              className="input w-32 text-sm"
              value={filters.course}
              onChange={(e) => updateFilter('course', e.target.value)}
            >
              <option value="all">חוגים</option>
              {courses.map((course: any) => (
                <option key={course.id} value={course.id}>{course.name}</option>
              ))}
            </select>
            
            {/* Instructor Filter */}
            <select
              className="input w-32 text-sm"
              value={filters.instructor}
              onChange={(e) => updateFilter('instructor', e.target.value)}
            >
              <option value="all">מדריכים</option>
              {instructors.map((instructor: any) => (
                <option key={instructor.id} value={instructor.id}>{instructor.full_name}</option>
              ))}
            </select>
            
            {/* Clear Filters Button */}
            {(filters.search || filters.branch !== 'all' || filters.course !== 'all' || 
              filters.instructor !== 'all' || filters.status !== 'active' || filters.absent_irregularly !== 'all') && (
              <button
              onClick={() => {
                setChildrenPage(1);
                setFilters({
                  search: '',
                  branch: 'all',
                  course: 'all',
                  instructor: 'all',
                  status: 'active',
                  absent_irregularly: 'all',
                  trial: 'all',
                  payment: 'all',
                });
              }}
                className="text-sm text-primary hover:text-primary/80 underline mr-2"
              >
                נקה סינון ✕
              </button>
            )}
          </div>
          
          {/* Second Row - Status and Absence Filters */}
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {/* Status Filter */}
            <select
              className="input w-40 text-sm text-muted-foreground"
              value={filters.status}
              onChange={(e) => updateFilter('status', e.target.value)}
            >
              <option value="all">כל הסטטוסים</option>
              <option value="active">פעיל</option>
              <option value="trial_signed">נרשם לניסיון</option>
              <option value="trial_completed">ביצע ניסיון</option>
              <option value="payment_problem">בעיות באשראי</option>
              <option value="not_paid">לא שולם</option>
              <option value="pending">בתהליך רישום</option>
              <option value="ghost">רפאים</option>
              <option value="inactive">לא פעיל</option>
            </select>
            
            {/* Absent Irregularly Filter */}
            <select
              className="input w-40 text-sm text-muted-foreground"
              value={filters.absent_irregularly}
              onChange={(e) => updateFilter('absent_irregularly', e.target.value)}
            >
              <option value="all">היעדרות חריגה</option>
              <option value="true">רק עם היעדרות חריגה</option>
              <option value="false">ללא היעדרות חריגה</option>
            </select>
          </div>
        </div>
      </div>

      {/* Children Table */}
      <div className="mb-6 animate-slide-up">
        <div className="card animate-slide-up">
          {loading ? (
            <div className="text-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              <p className="mt-4 text-muted-foreground">טוען נתונים...</p>
            </div>
          ) : children.length === 0 ? (
            <div className="text-center py-12">
              <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">לא נמצאו ילדים</p>
            </div>
          ) : (
            <>
              {/* Results Count - Above Table */}
              <div className="mb-4 pb-3 border-b flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  {(() => {
                    const pageSize = 20;
                    const startIndex = (childrenPage - 1) * pageSize + 1;
                    const endIndex = Math.min(childrenPage * pageSize, childrenTotalCount);
                    return `${startIndex}-${endIndex}`;
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="btn-secondary text-sm px-3 py-1 disabled:opacity-50"
                    disabled={!childrenHasPrev}
                    onClick={() => setChildrenPage((p) => Math.max(1, p - 1))}
                  >
                    הקודם
                  </button>
                  <span className="text-sm text-muted-foreground">עמוד {childrenPage}</span>
                  <button
                    className="btn-secondary text-sm px-3 py-1 disabled:opacity-50"
                    disabled={!childrenHasNext}
                    onClick={() => setChildrenPage((p) => p + 1)}
                  >
                    הבא
                  </button>
                </div>
              </div>
              
              <div className="overflow-x-auto min-h-[600px] pb-48">
                <table className="table">
                <thead>
                  <tr className="bg-muted/50">
                    <th>שם הילד</th>
                    <th>טלפון</th>
                    <th>סניף</th>
                    <th>חוגים</th>
                    <th>סטטוס</th>
                    <th className="w-16 text-center"></th>
                  </tr>
                </thead>
                <tbody>
                  {children.map((child, index) => {
                    const status = getChildStatus(child);
                    const courses = getUniqueCourses(child);
                    const whatsappLink = formatWhatsAppLink(child.parent_phone);
                    
                    return (
                      <tr 
                        key={child.id}
                        className="hover:bg-muted/30 cursor-pointer transition-colors animate-slide-up"
                        style={{ animationDelay: `${index * 50}ms` }}
                      >
                        {/* Child Name */}
                        <td>
                          <div className="flex items-center gap-2">
                            <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${
                              status.color === 'green' ? 'bg-green-500' :
                              status.color === 'red' ? 'bg-red-500' :
                              status.color === 'orange' ? 'bg-orange-500' :
                              status.color === 'blue' ? 'bg-blue-500' :
                              status.color === 'black' ? 'bg-gray-800' :
                              'bg-gray-400'
                            }`} title={status.description}></span>
                            <span className="font-medium">{child.full_name}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded border flex-shrink-0 inline-flex items-center justify-center min-w-[24px] ${
                              child.gender === 'male' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                              child.gender === 'female' ? 'bg-pink-50 text-pink-700 border-pink-200' :
                              'bg-gray-50 text-gray-700 border-gray-200'
                            }`}>
                              {child.gender === 'male' ? 'ז' : child.gender === 'female' ? 'נ' : '-'}
                            </span>
                          </div>
                        </td>
                        
                        {/* Phone */}
                        <td>
                          {(() => {
                            const displayPhone = child.phone_number || child.parent_phone;
                            const phoneLink = formatWhatsAppLink(displayPhone);
                            return phoneLink ? (
                              <a
                                href={phoneLink}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-primary hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {displayPhone}
                              </a>
                            ) : (
                              <span>{displayPhone || '-'}</span>
                            );
                          })()}
                        </td>
                        
                        {/* Branch */}
                        <td>{child.branch_name || '-'}</td>
                        
                        {/* Courses */}
                        <td>
                          <div className="flex flex-wrap gap-1">
                            {courses.length > 0 ? (
                              courses.map((course: any, i: number) => (
                                <span key={i} className="badge badge-info text-xs">
                                  {course}
                                </span>
                              ))
                            ) : (
                              <span className="text-muted-foreground">-</span>
                            )}
                          </div>
                        </td>
                        
                        {/* Status */}
                        <td onClick={(e) => { e.stopPropagation(); handleStatusClick(child); }}>
                          <span
                            className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium cursor-pointer hover:opacity-75 transition-opacity ${
                              status.color === 'green' ? 'bg-green-100 text-green-800 border border-green-300' :
                              status.color === 'red' ? 'bg-red-100 text-red-800 border border-red-300' :
                              status.color === 'orange' ? 'bg-orange-100 text-orange-800 border border-orange-300' :
                              status.color === 'blue' ? 'bg-blue-100 text-blue-800 border border-blue-300' :
                              status.color === 'black' ? 'bg-gray-100 text-gray-800 border border-gray-300' :
                              'bg-gray-100 text-gray-600 border border-gray-300'
                            }`}
                            title="לחץ לשינוי סטטוס"
                          >
                            {status.hebrewStatus}
                          </span>
                        </td>
                        
                        {/* Actions */}
                        <td className="text-center" onClick={(e) => e.stopPropagation()}>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="p-2 hover:bg-muted rounded-lg transition-colors mx-auto">
                                <MoreHorizontal className="w-5 h-5 text-muted-foreground" />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-48">
                              <DropdownMenuItem onClick={() => handleViewProfile(child)}>
                                <Eye className="ml-2 h-4 w-4" />
                                צפייה בפרופיל
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEditProfile(child)}>
                                <Edit className="ml-2 h-4 w-4" />
                                עריכת פרופיל
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEnrollToLesson(child)}>
                                <UserPlus className="ml-2 h-4 w-4" />
                                רישום לשיעור
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={() => handleDeleteProfile(child)}
                                className="text-destructive hover:bg-destructive/10"
                              >
                                <Trash2 className="ml-2 h-4 w-4" />
                                מחיקת פרופיל
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            </>
          )}
        </div>
      </div>
      
      {/* Dialogs */}
      {selectedChild && (
        <>
          <ChildProfileDialog
            child={selectedChild}
            isOpen={profileDialogOpen}
            onClose={() => setProfileDialogOpen(false)}
            onOpenEnroll={() => {
              setProfileDialogOpen(false);
              setEnrollDialogOpen(true);
            }}
          />
          
          <EditChildDialog
            child={selectedChild}
            isOpen={editDialogOpen}
            onClose={() => setEditDialogOpen(false)}
            onSave={handleSaveEdit}
          />
          
          <DeleteChildDialog
            child={selectedChild}
            isOpen={deleteDialogOpen}
            onClose={() => setDeleteDialogOpen(false)}
            onConfirm={handleConfirmDelete}
          />
          
          <EnrollToLessonDialog
            child={selectedChild}
            isOpen={enrollDialogOpen}
            onClose={() => setEnrollDialogOpen(false)}
            onEnroll={handleEnroll}
          />
        </>
      )}

      {/* Status Change Dialog */}
      <Dialog open={statusDialogOpen} onOpenChange={setStatusDialogOpen}>
        <DialogContent className="max-w-sm" dir="rtl">
          <DialogHeader>
            <DialogTitle>שינוי סטטוס — {selectedChild?.full_name}</DialogTitle>
          </DialogHeader>
          <div className="py-4">
            <label className="block text-sm font-medium mb-2">סטטוס</label>
            <select
              className="input w-full"
              value={statusDialogValue}
              onChange={(e) => setStatusDialogValue(e.target.value)}
            >
              <option value="active">פעיל</option>
              <option value="trial_signed">נרשם לניסיון</option>
              <option value="trial_completed">ביצע ניסיון</option>
              <option value="payment_problem">בעיות באשראי</option>
              <option value="not_paid">לא שולם</option>
              <option value="pending">בתהליך רישום</option>
              <option value="ghost">רפאים</option>
              <option value="inactive">לא פעיל</option>
            </select>
          </div>
          <div className="flex gap-2 justify-end">
            <button className="btn-secondary" onClick={() => setStatusDialogOpen(false)}>ביטול</button>
            <button className="btn-primary" disabled={statusSaving} onClick={handleStatusSave}>
              {statusSaving ? 'שומר...' : 'שמור'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add Customer Dialog */}
      <Dialog open={addCustomerDialogOpen} onOpenChange={setAddCustomerDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <div className="absolute left-4 top-4">
            <DialogCloseButton />
          </div>
          <DialogHeader>
            <DialogTitle className="text-xl">
              {addCustomerStep === 'choice' && 'הוספת לקוח'}
              {addCustomerStep === 'existing' && 'הוספת ילד למשפחה קיימת'}
              {addCustomerStep === 'new' && 'הוספת משפחה חדשה'}
            </DialogTitle>
          </DialogHeader>

          <div className="px-6 pb-6 pt-4">
            {addCustomerStep === 'choice' && (
              <div className="grid grid-cols-2 gap-4">
                <button
                  onClick={() => setAddCustomerStep('existing')}
                  className="p-8 border-2 border-gray-200 rounded-lg hover:border-primary hover:bg-primary/5 transition-all flex flex-col items-center gap-4 group"
                >
                  <UserCheck className="w-12 h-12 text-primary" />
                  <div className="text-center">
                    <h3 className="font-semibold text-lg mb-1">משפחה קיימת</h3>
                    <p className="text-sm text-muted-foreground">
                      הוספת ילד למשפחה קיימת במערכת
                    </p>
                  </div>
                </button>

                <button
                  onClick={() => setAddCustomerStep('new')}
                  className="p-8 border-2 border-gray-200 rounded-lg hover:border-primary hover:bg-primary/5 transition-all flex flex-col items-center gap-4 group"
                >
                  <Users className="w-12 h-12 text-primary" />
                  <div className="text-center">
                    <h3 className="font-semibold text-lg mb-1">משפחה חדשה</h3>
                    <p className="text-sm text-muted-foreground">
                      הוספת ילד עם הורים חדשים
                    </p>
                  </div>
                </button>
              </div>
            )}

            {addCustomerStep === 'existing' && (
              <AddChildToExistingFamilyForm 
                onSuccess={() => {
                  setAddCustomerDialogOpen(false);
                  setAddCustomerStep('choice');
                  // Refresh children list
                  window.location.reload();
                }}
                onCancel={() => setAddCustomerStep('choice')}
              />
            )}

            {addCustomerStep === 'new' && (
              <AddNewFamilyForm 
                onSuccess={() => {
                  setAddCustomerDialogOpen(false);
                  setAddCustomerStep('choice');
                  // Refresh children list
                  window.location.reload();
                }}
                onCancel={() => setAddCustomerStep('choice')}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}

// Component for adding child to existing family
function AddChildToExistingFamilyForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [families, setFamilies] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedFamily, setSelectedFamily] = useState('');
  const [familySearchTerm, setFamilySearchTerm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    first_name: '',
    last_name: '',
    id_number: '',
    phone_number: '',
    birth_date: '',
    gender: '',
  });

  useEffect(() => {
    const loadFamilies = async () => {
      try {
        const response = await api.get('/customers/families/');
        setFamilies(response.data.results || response.data || []);
      } catch (error) {
        console.error('Error loading families:', error);
      }
    };
    loadFamilies();
  }, []);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    // Validate first/last name (must be strings)
    if (!formData.first_name.trim()) {
      newErrors.first_name = 'שם פרטי חייב להכיל אותיות';
    }
    if (!formData.last_name.trim()) {
      newErrors.last_name = 'שם משפחה חייב להכיל אותיות';
    }
    
    // Validate ID (exactly 9 digits) - required
    if (!formData.id_number) {
      newErrors.id_number = 'תעודת זהות חובה';
    } else if (!/^\d{9}$/.test(formData.id_number)) {
      newErrors.id_number = 'תעודת זהות חייבת להכיל בדיוק 9 ספרות';
    }
    
    // Validate phone (valid Israeli phone format)
    if (formData.phone_number && !/^0\d{1,2}-?\d{7}$|^05\d{8}$/.test(formData.phone_number.replace(/\s/g, ''))) {
      newErrors.phone_number = 'מספר טלפון לא תקין';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setLoading(true);
    
    try {
      await api.post('/customers/children/', {
        ...formData,
        family: selectedFamily,
        status: 'pending',
      });
      alert('הילד נוסף בהצלחה!');
      onSuccess();
    } catch (error) {
      console.error('Error adding child:', error);
      alert('שגיאה בהוספת הילד');
    } finally {
      setLoading(false);
    }
  };
  
  const filteredFamilies = families.filter(family => 
    family.name.toLowerCase().includes(familySearchTerm.toLowerCase()) ||
    family.phone.includes(familySearchTerm) ||
    (family.parent_id_number && family.parent_id_number.includes(familySearchTerm))
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="block text-sm font-medium mb-1">בחר משפחה <span className="text-red-500">*</span></label>
        <input
          type="text"
          list="families-list"
          placeholder="חפש או בחר משפחה..."
          value={familySearchTerm}
          onChange={(e) => {
            setFamilySearchTerm(e.target.value);
            const selected = families.find(f => 
              `${f.name} - ${f.phone}` === e.target.value
            );
            if (selected) {
              setSelectedFamily(selected.id);
            }
          }}
          className="input w-full"
          required
        />
        <datalist id="families-list">
          {filteredFamilies.map((family) => (
            <option key={family.id} value={`${family.name} - ${family.phone}`} />
          ))}
        </datalist>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">שם פרטי <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={formData.first_name}
            onChange={(e) => setFormData({ ...formData, first_name: e.target.value })}
            className={`input w-full ${errors.first_name ? 'border-red-500' : ''}`}
            required
          />
          {errors.first_name && <p className="text-red-500 text-xs mt-1">{errors.first_name}</p>}
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">שם משפחה <span className="text-red-500">*</span></label>
          <input
            type="text"
            value={formData.last_name}
            onChange={(e) => setFormData({ ...formData, last_name: e.target.value })}
            className={`input w-full ${errors.last_name ? 'border-red-500' : ''}`}
            required
          />
          {errors.last_name && <p className="text-red-500 text-xs mt-1">{errors.last_name}</p>}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-1">תעודת זהות <span className="text-red-500">*</span></label>
        <input
          type="text"
          maxLength={9}
          value={formData.id_number}
          onChange={(e) => setFormData({ ...formData, id_number: e.target.value.replace(/\D/g, '') })}
          className={`input w-full ${errors.id_number ? 'border-red-500' : ''}`}
          required
        />
        {errors.id_number && <p className="text-red-500 text-xs mt-1">{errors.id_number}</p>}
      </div>
      
      <div>
        <label className="block text-sm font-medium mb-1">טלפון ילד</label>
        <input
          type="text"
          value={formData.phone_number}
          onChange={(e) => setFormData({ ...formData, phone_number: e.target.value })}
          className={`input w-full ${errors.phone_number ? 'border-red-500' : ''}`}
          placeholder="05X-XXXXXXX"
        />
        {errors.phone_number && <p className="text-red-500 text-xs mt-1">{errors.phone_number}</p>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium mb-1">תאריך לידה <span className="text-red-500">*</span></label>
          <input
            type="date"
            value={formData.birth_date}
            onChange={(e) => setFormData({ ...formData, birth_date: e.target.value })}
            className="input w-full"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">מין <span className="text-red-500">*</span></label>
          <select
            value={formData.gender}
            onChange={(e) => setFormData({ ...formData, gender: e.target.value })}
            className="input w-full"
            required
          >
            <option value="">בחר...</option>
            <option value="male">זכר</option>
            <option value="female">נקבה</option>
          </select>
        </div>
      </div>

      <div className="flex gap-2 pt-4">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">
          חזור
        </button>
        <button type="submit" disabled={loading} className="btn-primary flex-1">
          {loading ? 'שומר...' : 'הוסף ילד'}
        </button>
      </div>
    </form>
  );
}

// Component for adding new family
function AddNewFamilyForm({ onSuccess, onCancel }: { onSuccess: () => void; onCancel: () => void }) {
  const [loading, setLoading] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formData, setFormData] = useState({
    // Parent info
    parent_id_number: '',
    parent_first_name: '',
    parent_last_name: '',
    parent_phone: '',
    parent_email: '',
    // Child info
    child_first_name: '',
    child_last_name: '',
    child_id_number: '',
    child_phone_number: '',
    child_birth_date: '',
    child_gender: '',
    // Family info
    family_address: '',
    family_branch: '',
    family_notes: '',
  });

  useEffect(() => {
    const loadBranches = async () => {
      try {
        const response = await api.get('/core/branches/');
        setBranches(response.data.results || response.data || []);
      } catch (error) {
        console.error('Error loading branches:', error);
      }
    };
    loadBranches();
  }, []);

  const validateForm = () => {
    const newErrors: Record<string, string> = {};
    
    // Validate names
    if (!formData.parent_first_name.trim()) newErrors.parent_first_name = 'שם פרטי הורה חובה';
    if (!formData.parent_last_name.trim()) newErrors.parent_last_name = 'שם משפחה הורה חובה';
    if (!formData.child_first_name.trim()) newErrors.child_first_name = 'שם פרטי ילד חובה';
    if (!formData.child_last_name.trim()) newErrors.child_last_name = 'שם משפחה ילד חובה';
    
    // Validate IDs (exactly 9 digits) - both parent and child ID are required
    if (!formData.parent_id_number) {
      newErrors.parent_id_number = 'תעודת זהות הורה חובה';
    } else if (!/^\d{9}$/.test(formData.parent_id_number)) {
      newErrors.parent_id_number = 'תעודת זהות חייבת להכיל בדיוק 9 ספרות';
    }
    if (!formData.child_id_number) {
      newErrors.child_id_number = 'תעודת זהות ילד חובה';
    } else if (!/^\d{9}$/.test(formData.child_id_number)) {
      newErrors.child_id_number = 'תעודת זהות חייבת להכיל בדיוק 9 ספרות';
    }
    
    // Validate phones
    if (!formData.parent_phone) {
      newErrors.parent_phone = 'טלפון הורה חובה';
    } else if (!/^0\d{1,2}-?\d{7}$|^05\d{8}$/.test(formData.parent_phone.replace(/\s/g, ''))) {
      newErrors.parent_phone = 'מספר טלפון לא תקין';
    }
    
    if (formData.child_phone_number && !/^0\d{1,2}-?\d{7}$|^05\d{8}$/.test(formData.child_phone_number.replace(/\s/g, ''))) {
      newErrors.child_phone_number = 'מספר טלפון לא תקין';
    }
    
    // Validate birth date and gender
    if (!formData.child_birth_date) {
      newErrors.child_birth_date = 'תאריך לידה חובה';
    }
    if (!formData.child_gender) {
      newErrors.child_gender = 'מין חובה';
    }
    
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }
    
    setLoading(true);
    
    try {
      // Create family
      const familyResponse = await api.post('/customers/families/', {
        name: formData.parent_last_name,
        phone: formData.parent_phone,
        email: formData.parent_email,
        address: formData.family_address,
        parent_id_number: formData.parent_id_number,
        branch: formData.family_branch || null,
        notes: formData.family_notes,
      });

      const familyId = familyResponse.data.id;

      // Create parent
      await api.post('/customers/parents/', {
        family: familyId,
        first_name: formData.parent_first_name,
        last_name: formData.parent_last_name,
        phone: formData.parent_phone,
        email: formData.parent_email,
        is_primary: true,
      });

      // Create child
      await api.post('/customers/children/', {
        family: familyId,
        first_name: formData.child_first_name,
        last_name: formData.child_last_name,
        id_number: formData.child_id_number,
        phone_number: formData.child_phone_number,
        birth_date: formData.child_birth_date,
        gender: formData.child_gender,
        status: 'pending',
      });

      alert('המשפחה והילד נוספו בהצלחה!');
      onSuccess();
    } catch (error) {
      console.error('Error adding family:', error);
      alert('שגיאה בהוספת המשפחה');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Parent Section */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">פרטי ההורה</h3>
        
        <div>
          <label className="block text-sm font-medium mb-1">תעודת זהות הורה <span className="text-red-500">*</span></label>
          <input
            type="text"
            maxLength={9}
            value={formData.parent_id_number}
            onChange={(e) => setFormData({ ...formData, parent_id_number: e.target.value.replace(/\D/g, '') })}
            className={`input w-full ${errors.parent_id_number ? 'border-red-500' : ''}`}
            required
          />
          {errors.parent_id_number && <p className="text-red-500 text-xs mt-1">{errors.parent_id_number}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">שם פרטי <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={formData.parent_first_name}
              onChange={(e) => setFormData({ ...formData, parent_first_name: e.target.value })}
              className={`input w-full ${errors.parent_first_name ? 'border-red-500' : ''}`}
              required
            />
            {errors.parent_first_name && <p className="text-red-500 text-xs mt-1">{errors.parent_first_name}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">שם משפחה <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={formData.parent_last_name}
              onChange={(e) => setFormData({ ...formData, parent_last_name: e.target.value })}
              className={`input w-full ${errors.parent_last_name ? 'border-red-500' : ''}`}
              required
            />
            {errors.parent_last_name && <p className="text-red-500 text-xs mt-1">{errors.parent_last_name}</p>}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">טלפון <span className="text-red-500">*</span></label>
            <input
              type="tel"
              value={formData.parent_phone}
              onChange={(e) => setFormData({ ...formData, parent_phone: e.target.value })}
              className={`input w-full ${errors.parent_phone ? 'border-red-500' : ''}`}
              placeholder="05X-XXXXXXX"
              required
            />
            {errors.parent_phone && <p className="text-red-500 text-xs mt-1">{errors.parent_phone}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">אימייל</label>
            <input
              type="email"
              value={formData.parent_email}
              onChange={(e) => setFormData({ ...formData, parent_email: e.target.value })}
              className="input w-full"
            />
          </div>
        </div>
      </div>

      {/* Child Section */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">פרטי הילד</h3>
        
        <div>
          <label className="block text-sm font-medium mb-1">תעודת זהות ילד <span className="text-red-500">*</span></label>
          <input
            type="text"
            maxLength={9}
            value={formData.child_id_number}
            onChange={(e) => setFormData({ ...formData, child_id_number: e.target.value.replace(/\D/g, '') })}
            className={`input w-full ${errors.child_id_number ? 'border-red-500' : ''}`}
            required
          />
          {errors.child_id_number && <p className="text-red-500 text-xs mt-1">{errors.child_id_number}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">שם פרטי <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={formData.child_first_name}
              onChange={(e) => setFormData({ ...formData, child_first_name: e.target.value })}
              className={`input w-full ${errors.child_first_name ? 'border-red-500' : ''}`}
              required
            />
            {errors.child_first_name && <p className="text-red-500 text-xs mt-1">{errors.child_first_name}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">שם משפחה <span className="text-red-500">*</span></label>
            <input
              type="text"
              value={formData.child_last_name}
              onChange={(e) => setFormData({ ...formData, child_last_name: e.target.value })}
              className={`input w-full ${errors.child_last_name ? 'border-red-500' : ''}`}
              required
            />
            {errors.child_last_name && <p className="text-red-500 text-xs mt-1">{errors.child_last_name}</p>}
          </div>
        </div>
        
        <div>
          <label className="block text-sm font-medium mb-1">טלפון ילד</label>
          <input
            type="tel"
            value={formData.child_phone_number}
            onChange={(e) => setFormData({ ...formData, child_phone_number: e.target.value })}
            className={`input w-full ${errors.child_phone_number ? 'border-red-500' : ''}`}
            placeholder="05X-XXXXXXX"
          />
          {errors.child_phone_number && <p className="text-red-500 text-xs mt-1">{errors.child_phone_number}</p>}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">תאריך לידה <span className="text-red-500">*</span></label>
            <input
              type="date"
              value={formData.child_birth_date}
              onChange={(e) => setFormData({ ...formData, child_birth_date: e.target.value })}
              className={`input w-full ${errors.child_birth_date ? 'border-red-500' : ''}`}
              required
            />
            {errors.child_birth_date && <p className="text-red-500 text-xs mt-1">{errors.child_birth_date}</p>}
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">מין <span className="text-red-500">*</span></label>
            <select
              value={formData.child_gender}
              onChange={(e) => setFormData({ ...formData, child_gender: e.target.value })}
              className={`input w-full ${errors.child_gender ? 'border-red-500' : ''}`}
              required
            >
              <option value="">בחר...</option>
              <option value="male">זכר</option>
              <option value="female">נקבה</option>
            </select>
            {errors.child_gender && <p className="text-red-500 text-xs mt-1">{errors.child_gender}</p>}
          </div>
        </div>
      </div>

      {/* Family Info */}
      <div className="space-y-4">
        <h3 className="font-semibold text-lg border-b pb-2">מידע נוסף</h3>
        
        <div>
          <label className="block text-sm font-medium mb-1">סניף</label>
          <select
            value={formData.family_branch}
            onChange={(e) => setFormData({ ...formData, family_branch: e.target.value })}
            className="input w-full"
          >
            <option value="">בחר סניף...</option>
            {branches.map((branch: any) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">כתובת</label>
          <input
            type="text"
            value={formData.family_address}
            onChange={(e) => setFormData({ ...formData, family_address: e.target.value })}
            className="input w-full"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">הערות</label>
          <textarea
            value={formData.family_notes}
            onChange={(e) => setFormData({ ...formData, family_notes: e.target.value })}
            className="input w-full"
            rows={3}
          />
        </div>
      </div>

      <div className="flex gap-2 pt-4">
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">
          חזור
        </button>
        <button type="submit" disabled={loading} className="btn-primary flex-1">
          {loading ? 'שומר...' : 'הוסף משפחה וילד'}
        </button>
      </div>
    </form>
  );
}

