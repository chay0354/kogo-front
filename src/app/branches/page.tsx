'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';
import PageSearchBar from '@/components/PageSearchBar';
import PageFilters from '@/components/PageFilters';
import AddBranchDialog from '@/components/dialogs/AddBranchDialog';
import api from '@/lib/api';
import { BranchListItem } from '@/types/branch';
import { formatCurrency, getBranchStatusBadge } from '@/lib/branchUtils';
import { Users, BookOpen, GraduationCap, DoorOpen, Building2 } from 'lucide-react';

export default function BranchesPage() {
  const router = useRouter();
  const [branches, setBranches] = useState<BranchListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [pageSearch, setPageSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [primaryFilter, setPrimaryFilter] = useState('');
  const [secondaryFilter, setSecondaryFilter] = useState('');

  useEffect(() => {
    fetchBranches();
  }, []);

  const fetchBranches = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get('/core/branches/?with_stats=true');
      // Handle paginated response
      const data = response.data.results || response.data;
      setBranches(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('Error fetching branches:', error);
      setError('שגיאה בטעינת סניפים');
    } finally {
      setLoading(false);
    }
  };

  const handleCardClick = (branchId: string) => {
    router.push(`/branches/${branchId}`);
  };

  const handleAddSuccess = () => {
    fetchBranches();
  };

  if (loading) {
    return (
      <AppLayout>
        <PageHeader 
          title="ניהול סניפים" 
          description="ניהול סניפים, צוות ומשאבים"
        />
        <div className="card animate-fade-in">
          <p className="text-muted-foreground">טוען נתונים...</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        title="ניהול סניפים"
        description="ניהול סניפים, צוות ומשאבים"
        actions={
          <button
            className="btn-primary"
            onClick={() => setShowAddDialog(true)}
          >
            + הוספת סניף
          </button>
        }
      />
      <PageSearchBar
        search={pageSearch}
        onSearchChange={setPageSearch}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        searchPlaceholder="חיפוש סניף..."
      />
      <PageFilters
        primaryValue={primaryFilter}
        primaryOptions={branches.map((b) => ({ value: b.id, label: b.name }))}
        onPrimaryChange={setPrimaryFilter}
        secondaryValue={secondaryFilter}
        secondaryOptions={[]}
        onSecondaryChange={setSecondaryFilter}
      />

      {error && (
        <div className="mb-4 p-4 bg-destructive/10 text-destructive rounded-lg">
          {error}
        </div>
      )}

      {branches.length === 0 ? (
        <div className="card border-dashed border-2 text-center py-12 animate-fade-in">
          <Building2 className="w-16 h-16 mx-auto text-muted-foreground mb-4" />
          <h3 className="text-lg font-semibold mb-2">אין סניפים במערכת</h3>
          <p className="text-muted-foreground mb-4">התחל להוסיף סניפים לניהול העסק</p>
          <button 
            className="btn-primary"
            onClick={() => setShowAddDialog(true)}
          >
            + הוסף סניף ראשון
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {branches.map((branch: any, index: number) => {
            const statusBadge = getBranchStatusBadge(branch.is_active);
            const primaryCode = branch.branch_codes && branch.branch_codes.length > 0 
              ? branch.branch_codes[0] 
              : null;

            return (
              <div
                key={branch.id}
                className="card hover:shadow-lg transition-all duration-300 cursor-pointer border border-border/50 animate-scale-in"
                style={{ animationDelay: `${index * 100}ms` }}
                onClick={() => handleCardClick(branch.id)}
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <h3 className="text-xl font-bold mb-1">{branch.name}</h3>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <span>📍</span>
                      <span>{branch.address || 'אין כתובת'}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {branch.is_external && (
                      <span className="px-3 py-1 rounded-full text-xs font-medium border border-yellow-300 bg-yellow-50 text-yellow-700">
                        חיצוני
                      </span>
                    )}
                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${statusBadge.className}`}>
                      {statusBadge.label}
                    </span>
                  </div>
                </div>

                {/* Statistics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
                  <div className="text-center">
                    <Users className="w-5 h-5 mx-auto text-primary mb-1" />
                    <div className="text-2xl font-bold">{branch.families_count}</div>
                    <div className="text-xs text-muted-foreground">משפחות</div>
                  </div>
                  <div className="text-center">
                    <BookOpen className="w-5 h-5 mx-auto text-accent mb-1" />
                    <div className="text-2xl font-bold">{branch.courses_count}</div>
                    <div className="text-xs text-muted-foreground">חוגים</div>
                  </div>
                  <div className="text-center">
                    <GraduationCap className="w-5 h-5 mx-auto text-info mb-1" />
                    <div className="text-2xl font-bold">{branch.instructors_count}</div>
                    <div className="text-xs text-muted-foreground">מדריכים</div>
                  </div>
                  <div className="text-center">
                    <DoorOpen className="w-5 h-5 mx-auto text-secondary mb-1" />
                    <div className="text-2xl font-bold">{branch.rooms_count}</div>
                    <div className="text-xs text-muted-foreground">חדרים</div>
                  </div>
                </div>

                {/* Footer */}
                <div className="pt-4 border-t border-border/50 flex items-center justify-between text-sm">
                  <div>
                    {primaryCode && (
                      <span className="text-muted-foreground">
                        # קוד: <span className="font-medium text-foreground">{primaryCode}</span>
                      </span>
                    )}
                  </div>
                  <div>
                    {branch.monthly_cost && (
                      <span className="text-muted-foreground">
                        💰 {formatCurrency(branch.monthly_cost)}/חודש
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add Branch Dialog */}
      <AddBranchDialog
        isOpen={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onSuccess={handleAddSuccess}
      />
    </AppLayout>
  );
}
