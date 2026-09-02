'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import PageHeader from '@/components/PageHeader';
import { CardGridSkeleton } from '@/components/ui/skeleton';
import AddBranchDialog from '@/components/dialogs/AddBranchDialog';
import { BranchFinancialDonut } from '@/components/branches/BranchFinancialDonut/BranchFinancialDonut';
import { BranchesSummaryBar } from '@/components/branches/BranchesSummaryBar/BranchesSummaryBar';
import { sumTotalIncome, sumTotalExpenses } from '@/components/branches/BranchesSummaryBar/BranchesSummaryBar.utils';
import GlobalDateFilter, { getDefaultDateRange, DateRange } from '@/components/dashboard/GlobalDateFilter';
import api, { fetchBranchesData } from '@/lib/api';
import { BranchListItem } from '@/types/branch';
import { getBranchStatusBadge } from '@/lib/branchUtils';
import { Building2 } from 'lucide-react';

export default function BranchesPage() {
  const router = useRouter();
  const [branches, setBranches] = useState<BranchListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [dateRange, setDateRange] = useState<DateRange>(getDefaultDateRange());

  useEffect(() => { fetchBranches() }, []);

  const financialFilters = {
    date_from: format(dateRange.date_from, 'yyyy-MM-dd'),
    date_to: format(dateRange.date_to, 'yyyy-MM-dd'),
  };

  const { data: financialData, isLoading: financialLoading } = useQuery({
    queryKey: ['dashboard-branches', financialFilters],
    queryFn: () => fetchBranchesData(financialFilters),
  });

  const branchFinancials = new Map<string, { revenue: number; spending: number; profit: number }>(
    (financialData?.branch_list || []).map((row: any) => [
      row.branch_id,
      { revenue: row.revenue || 0, spending: row.spending || 0, profit: row.profit || 0 },
    ])
  );

  const branchListRows = financialData?.branch_list || [];
  const totalProfit = financialData?.kpis?.total_profit || 0;
  const totalIncome = sumTotalIncome(branchListRows);
  const totalExpenses = sumTotalExpenses(branchListRows);

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

  const handleAddSuccess = () => { fetchBranches() };

  if (loading) {
    return (
      <>
        <PageHeader
          title="ניהול סניפים"
          description="ניהול סניפים, צוות ומשאבים"
        />
        <CardGridSkeleton
          cards={4}
          gridClassName="grid grid-cols-1 md:grid-cols-2 gap-6"
          cardClassName="h-56"
        />
      </>
    );
  }

  return (
    <>
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

      <div className="flex justify-end mb-6">
        <GlobalDateFilter dateRange={dateRange} onDateRangeChange={setDateRange} />
      </div>

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
            const financials = branchFinancials.get(branch.id);

            return (
              <div
                key={branch.id}
                className="card hover:shadow-lg transition-all duration-300 cursor-pointer border border-border/50 animate-scale-in"
                style={{ animationDelay: `${index * 100}ms` }}
                onClick={() => handleCardClick(branch.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleCardClick(branch.id);
                  }
                }}
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

                {/* Financial summary */}
                <BranchFinancialDonut
                  branchName={branch.name}
                  revenue={financials?.revenue || 0}
                  spending={financials?.spending || 0}
                  profit={financials?.profit || 0}
                  isLoading={financialLoading}
                />
              </div>
            );
          })}
        </div>
      )}

      {branches.length > 0 && (
        <BranchesSummaryBar
          totalProfit={totalProfit}
          totalExpenses={totalExpenses}
          totalIncome={totalIncome}
          isLoading={financialLoading}
        />
      )}

      {/* Add Branch Dialog */}
      <AddBranchDialog
        isOpen={showAddDialog}
        onClose={() => setShowAddDialog(false)}
        onSuccess={handleAddSuccess}
      />
    </>
  );
}
