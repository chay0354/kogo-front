'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Users, TrendingUp, DollarSign, BarChart3, Plus, Gift, Edit, ChevronUp, ChevronDown, Trash2 } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';
import api from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import { filterBranchesForUser, unwrapApiList } from '@/lib/scopedFilters';
import {
  InstructorListItem,
  InstructorsListResponse,
  InstructorFilters
} from '@/types/instructor';
import { Branch } from '@/types/customer';
import {
  formatCurrency,
  getLastNMonths,
  getCurrentMonth,
  getProfitColorClass
} from '@/lib/instructorUtils';
import AddInstructorDialog from '@/components/dialogs/AddInstructorDialog';
import AddBulkBonusDialog from '@/components/dialogs/AddBulkBonusDialog';
import DeleteInstructorDialog from '@/components/dialogs/DeleteInstructorDialog';

type SortField = 'full_name' | 'lessons_count' | 'students_count' | 'revenue' | 'salary' | 'profit';
type SortDirection = 'asc' | 'desc';

export default function InstructorsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [instructors, setInstructors] = useState<InstructorListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [summary, setSummary] = useState({
    total_instructors: 0,
    total_revenue: '0',
    total_salary: '0',
    total_profit: '0'
  });
  
  // Filter options
  const [branches, setBranches] = useState<Branch[]>([]);
  const [filters, setFilters] = useState<InstructorFilters>({
    search: '',
    branch: 'all',
    min_students: 'all',
    max_students: 'all',
    month: getCurrentMonth()
  });
  
  // Sorting
  const [sortField, setSortField] = useState<SortField>('full_name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  
  // Month options
  const monthOptions = getLastNMonths(12);
  const currentMonth = getCurrentMonth();
  
  // Dialog states
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [bulkBonusDialogOpen, setBulkBonusDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [selectedInstructorForDelete, setSelectedInstructorForDelete] = useState<InstructorListItem | null>(null);
  
  // Load branches
  useEffect(() => {
    const loadBranches = async () => {
      try {
        const response = await api.get('/core/branches/');
        setBranches(
          filterBranchesForUser(
            unwrapApiList<Branch>(response.data),
            user,
          ),
        );
      } catch (error) {
        console.error('Error loading branches:', error);
      }
    };
    
    loadBranches();
  }, [user?.id, user?.role, user?.branch_ids?.join(',')]);
  
  // Load instructors
  useEffect(() => {
    const fetchInstructors = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        
        if (filters.search) params.append('search', filters.search);
        if (filters.branch !== 'all') params.append('branch', filters.branch);
        if (filters.min_students !== 'all') params.append('min_students', filters.min_students);
        if (filters.max_students !== 'all') params.append('max_students', filters.max_students);
        if (filters.month) params.append('month', filters.month);
        
        const response = await api.get(`/instructors/?${params.toString()}`);
        const data: InstructorsListResponse = response.data;
        
        setInstructors(data.instructors || []);
        setSummary(data.summary || {
          total_instructors: 0,
          total_revenue: '0',
          total_salary: '0',
          total_profit: '0'
        });
      } catch (error) {
        console.error('Error fetching instructors:', error);
      } finally {
        setLoading(false);
      }
    };
    
    fetchInstructors();
  }, [filters]);
  
  // Handle filter changes
  const handleFilterChange = (key: keyof InstructorFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };
  
  // Handle sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };
  
  // Sort instructors
  const sortedInstructors = [...instructors].sort((a, b) => {
    const aVal = a[sortField] ?? 0;
    const bVal = b[sortField] ?? 0;
    
    const comparison = aVal < bVal ? -1 : aVal > bVal ? 1 : 0;
    return sortDirection === 'asc' ? comparison : -comparison;
  });
  
  // Navigate to instructor detail
  const handleRowClick = (instructorId: string) => {
    router.push(`/instructors/${instructorId}`);
  };

  const handleDeleteInstructor = async () => {
    if (!selectedInstructorForDelete || isDeleting) return;
    setIsDeleting(true);
    try {
      await api.delete(`/instructors/${selectedInstructorForDelete.id}/`);

      // Optimistic remove from table immediately
      setInstructors(prev => prev.filter(i => i.id !== selectedInstructorForDelete.id));
      setSummary(prev => ({
        ...prev,
        total_instructors: Math.max(0, prev.total_instructors - 1),
      }));

      setDeleteDialogOpen(false);
      setSelectedInstructorForDelete(null);

      // Refresh to keep financial totals accurate
      setFilters(prev => ({ ...prev }));
    } catch (error: any) {
      console.error('Error deleting instructor:', error);
      const errorMsg = error.response?.data?.error || 'שגיאה במחיקת מדריך. נסה שוב.';
      alert(errorMsg);
    } finally {
      setIsDeleting(false);
    }
  };
  
  // Render sort icon
  const renderSortIcon = (field: SortField) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? 
      <ChevronUp className="w-4 h-4 inline" /> : 
      <ChevronDown className="w-4 h-4 inline" />;
  };
  
  return (
    <AppLayout>
      <PageHeader 
        title="ניהול מדריכים" 
        description="ניהול צוות המדריכים, שכר והכנסות"
        actions={
          <div className="flex gap-2">
            <button 
              className="btn-secondary flex items-center gap-2"
              onClick={() => setBulkBonusDialogOpen(true)}
            >
              <Gift className="w-4 h-4" />
              הוסף בונוס קבוצתי
            </button>
            <button 
              className="btn-primary flex items-center gap-2"
              onClick={() => setAddDialogOpen(true)}
            >
              <Plus className="w-4 h-4" />
              הוסף מדריך
            </button>
          </div>
        }
      />
      
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <div className="card py-3 px-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">מדריכים</p>
              <p className="text-xl font-bold text-primary">{summary.total_instructors}</p>
            </div>
            <Users className="w-6 h-6 text-primary opacity-20" />
          </div>
        </div>
        
        <div className="card py-3 px-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">הכנסות</p>
              <p className="text-xl font-bold text-green-600">
                {formatCurrency(summary.total_revenue)}
              </p>
            </div>
            <TrendingUp className="w-6 h-6 text-green-600 opacity-20" />
          </div>
        </div>
        
        <div className="card py-3 px-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">שכר</p>
              <p className="text-xl font-bold text-orange-600">
                {formatCurrency(summary.total_salary)}
              </p>
            </div>
            <DollarSign className="w-6 h-6 text-orange-600 opacity-20" />
          </div>
        </div>
        
        <div className="card py-3 px-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">רווח</p>
              <p className={`text-xl font-bold ${getProfitColorClass(parseFloat(summary.total_profit))}`}>
                {formatCurrency(summary.total_profit)}
              </p>
            </div>
            <BarChart3 className="w-6 h-6 text-blue-600 opacity-20" />
          </div>
        </div>
      </div>
      
      {/* Filters */}
      <div className="card mb-6">
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* Search */}
          <div>
            <label className="block text-sm font-medium mb-2">חיפוש</label>
            <input
              type="text"
              value={filters.search}
              onChange={(e) => handleFilterChange('search', e.target.value)}
              placeholder="חיפוש לפי שם, טלפון, מייל..."
              className="input"
            />
          </div>
          
          {/* Branch Filter */}
          <div>
            <label className="block text-sm font-medium mb-2">סניף</label>
            <select
              value={filters.branch}
              onChange={(e) => handleFilterChange('branch', e.target.value)}
              className="input"
            >
              <option value="all">הכל</option>
              {branches.map((branch: any) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>
          
          {/* Min Students Filter */}
          <div>
            <label className="block text-sm font-medium mb-2">מינימום תלמידים</label>
            <input
              type="number"
              value={filters.min_students === 'all' ? '' : filters.min_students}
              onChange={(e) => handleFilterChange('min_students', e.target.value || 'all')}
              className="input"
              placeholder="הכל"
              min="0"
            />
          </div>
          
          {/* Max Students Filter */}
          <div>
            <label className="block text-sm font-medium mb-2">מקסימום תלמידים</label>
            <input
              type="number"
              value={filters.max_students === 'all' ? '' : filters.max_students}
              onChange={(e) => handleFilterChange('max_students', e.target.value || 'all')}
              className="input"
              placeholder="הכל"
              min="0"
            />
          </div>
          
          {/* Month Filter */}
          <div>
            <label className="block text-sm font-medium mb-2">חודש</label>
            <select
              value={filters.month}
              onChange={(e) => handleFilterChange('month', e.target.value)}
              className="input"
            >
              {monthOptions.map(month => (
                <option key={month.value} value={month.value}>
                  {month.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
      
      {/* Instructors Table */}
      <div className="card animate-fade-in">
        {loading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            <p className="text-muted-foreground mt-4">טוען נתונים...</p>
          </div>
        ) : sortedInstructors.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-muted mx-auto mb-4 opacity-20" />
            <p className="text-muted-foreground mb-4">לא נמצאו מדריכים</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th 
                    className="cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleSort('full_name')}
                  >
                    שם המדריך {renderSortIcon('full_name')}
                  </th>
                  <th>סניפים</th>
                  <th>התמחות</th>
                  <th 
                    className="cursor-pointer hover:bg-muted/50 transition-colors text-center"
                    onClick={() => handleSort('lessons_count')}
                  >
                    שיעורים {renderSortIcon('lessons_count')}
                  </th>
                  <th 
                    className="cursor-pointer hover:bg-muted/50 transition-colors text-center"
                    onClick={() => handleSort('students_count')}
                  >
                    תלמידים {renderSortIcon('students_count')}
                  </th>
                  <th 
                    className="cursor-pointer hover:bg-muted/50 transition-colors text-left"
                    onClick={() => handleSort('revenue')}
                  >
                    הכנסות {renderSortIcon('revenue')}
                  </th>
                  <th 
                    className="cursor-pointer hover:bg-muted/50 transition-colors text-left"
                    onClick={() => handleSort('salary')}
                  >
                    שכר {renderSortIcon('salary')}
                  </th>
                  <th 
                    className="cursor-pointer hover:bg-muted/50 transition-colors text-left"
                    onClick={() => handleSort('profit')}
                  >
                    רווח {renderSortIcon('profit')}
                  </th>
                  <th className="text-left">בונוסים</th>
                  <th className="text-center">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {sortedInstructors.map(instructor => (
                  <tr 
                    key={instructor.id}
                    className="cursor-pointer hover:bg-muted/30 transition-colors"
                    onClick={() => handleRowClick(instructor.id)}
                  >
                    <td>
                      <div>
                        <p className="font-medium">{instructor.full_name}</p>
                        <p className="text-sm text-muted-foreground">{instructor.phone}</p>
                      </div>
                    </td>
                    <td>
                      <div className="flex flex-wrap gap-1">
                        {instructor.branches.length > 0 ? (
                          instructor.branches.map((branch: any) => (
                            <span key={branch.id} className="badge badge-blue text-xs">
                              {branch.name}
                            </span>
                          ))
                        ) : (
                          <span className="text-muted-foreground text-sm">לא משויך</span>
                        )}
                      </div>
                    </td>
                    <td>
                      <span className="text-sm">
                        {instructor.specialization || '-'}
                      </span>
                    </td>
                    <td className="text-center">
                      <span className="badge badge-gray">
                        {instructor.lessons_count || 0}
                      </span>
                    </td>
                    <td className="text-center">
                      <span className="badge badge-blue">
                        {instructor.students_count || 0}
                      </span>
                    </td>
                    <td className="text-left">
                      <span className="text-green-600 font-medium">
                        {formatCurrency(instructor.revenue || 0)}
                      </span>
                    </td>
                    <td className="text-left">
                      <span className="text-orange-600 font-medium">
                        {filters.month < currentMonth && instructor.salary_is_finalized === false
                          ? '—'
                          : formatCurrency(instructor.salary || 0)}
                      </span>
                    </td>
                    <td className="text-left">
                      <span className={`font-bold ${getProfitColorClass(instructor.profit || 0)}`}>
                        {formatCurrency(instructor.profit || 0)}
                      </span>
                    </td>
                    <td className="text-left">
                      <span className="text-purple-600 font-medium">
                        {formatCurrency(instructor.bonuses_amount || 0)}
                      </span>
                    </td>
                    <td className="text-center">
                      <div className="flex items-center justify-center gap-1">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRowClick(instructor.id);
                          }}
                          className="btn-icon hover:bg-blue-50 hover:text-blue-600"
                          title="עריכה"
                        >
                          <Edit className="w-4 h-4" />
                        </button>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedInstructorForDelete(instructor);
                            setDeleteDialogOpen(true);
                          }}
                          className="btn-icon hover:bg-red-50 hover:text-red-600"
                          title="מחיקה"
                          disabled={isDeleting}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      
      {/* Dialogs */}
      <AddInstructorDialog
        isOpen={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onSave={() => {
          // Refresh instructors list
          setFilters(prev => ({ ...prev }));
        }}
      />
      
      <AddBulkBonusDialog
        isOpen={bulkBonusDialogOpen}
        onClose={() => setBulkBonusDialogOpen(false)}
        onSave={() => {
          // Show success message or refresh if needed
          setFilters(prev => ({ ...prev }));
        }}
      />

      <DeleteInstructorDialog
        instructor={selectedInstructorForDelete}
        isOpen={deleteDialogOpen}
        isDeleting={isDeleting}
        onClose={() => {
          if (isDeleting) return;
          setDeleteDialogOpen(false);
          setSelectedInstructorForDelete(null);
        }}
        onConfirm={handleDeleteInstructor}
      />
    </AppLayout>
  );
}
