'use client';

import { useState, useEffect } from 'react';
import { Users2, Plus, Edit, Trash2, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { TableSkeleton } from '@/components/ui/skeleton';
import api from '@/lib/api';
import { Branch } from '@/types/customer';
import {
  PartnerFilters,
  PartnerListItem,
  PartnersListResponse,
} from '@/types/partner';
import AddPartnerDialog from '@/components/dialogs/AddPartnerDialog';
import EditPartnerDialog from '@/components/dialogs/EditPartnerDialog';
import CrossFade from '@/components/ui/CrossFade';

/**
 * Partner users, managed from within הגדרות.
 *
 * The list lives here rather than on a screen of its own because a partner is
 * an account with branch permissions attached — the same thing the rest of this
 * page is about. /partners still renders it, so a bookmark of the old screen
 * keeps working.
 */
export default function PartnersSection() {
  const [partners, setPartners] = useState<PartnerListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ total_partners: 0 });
  const [branches, setBranches] = useState<Branch[]>([]);
  const [filters, setFilters] = useState<PartnerFilters>({ search: '', branch: 'all' });
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedPartner, setSelectedPartner] = useState<PartnerListItem | null>(null);
  const [deletingPartnerId, setDeletingPartnerId] = useState<string | null>(null);

  useEffect(() => {
    api.get('/core/branches/').then((response) => {
      setBranches(response.data.results || response.data || []);
    }).catch(console.error);
  }, []);

  useEffect(() => {
    const fetchPartners = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (filters.search) params.append('search', filters.search);
        if (filters.branch !== 'all') params.append('branch', filters.branch);
        const response = await api.get(`/core/partners/?${params.toString()}`);
        const data: PartnersListResponse = response.data;
        setPartners(data.partners || []);
        setSummary(data.summary || { total_partners: 0 });
      } catch (error) {
        console.error('Error fetching partners:', error);
        setPartners([]);
      } finally {
        setLoading(false);
      }
    };
    fetchPartners();
  }, [filters, addDialogOpen, editDialogOpen]);

  const handleDelete = async (partner: PartnerListItem) => {
    if (!confirm(`להשבית את השותף "${partner.full_name || partner.email}"?`)) return;
    setDeletingPartnerId(partner.id);
    try {
      await api.delete(`/core/partners/${partner.id}/`);
      setFilters((prev) => ({ ...prev }));
    } catch (error) {
      console.error('Error deleting partner:', error);
      alert('שגיאה בהשבתת השותף');
    } finally {
      setDeletingPartnerId(null);
    }
  };

  return (
    <div className="card mt-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">שותפים</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            ניהול משתמשי שותף והרשאות לפי סניף
          </p>
        </div>
        <Button variant="gradient" onClick={() => setAddDialogOpen(true)}>
          <Plus className="ml-2 h-4 w-4" />
          שותף חדש
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[200px]">
          <label className="block text-sm font-medium mb-1">חיפוש</label>
          <input
            className="w-full rounded-lg border border-gray-200 px-3 py-2 bg-white"
            placeholder="שם או אימייל..."
            value={filters.search}
            onChange={(e) => setFilters((prev) => ({ ...prev, search: e.target.value }))}
          />
        </div>
        <div className="w-48">
          <label className="block text-sm font-medium mb-1">סניף</label>
          <select
            className="w-full rounded-lg border border-gray-200 px-3 py-2 bg-white"
            value={filters.branch}
            onChange={(e) => setFilters((prev) => ({ ...prev, branch: e.target.value }))}
          >
            <option value="all">כל הסניפים</option>
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3 rounded-lg border p-3">
        <Users2 className="h-10 w-10 text-teal-600" />
        <div>
          <p className="text-sm text-muted-foreground">סה״כ שותפים</p>
          <p className="text-2xl font-bold">{summary.total_partners}</p>
        </div>
      </div>

      <CrossFade swapKey={loading ? 'loading' : 'ready'} className="mt-4 overflow-x-auto">
        {loading ? (
          <TableSkeleton columns={6} rows={5} label="טוען שותפים" />
        ) : (
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-right py-3 px-4">שם</th>
                <th className="text-right py-3 px-4">אימייל</th>
                <th className="text-right py-3 px-4">סניפים</th>
                <th className="text-right py-3 px-4">סטטוס</th>
                <th className="text-left py-3 px-4">פעולות</th>
              </tr>
            </thead>
            <tbody>
              {partners.map((partner) => (
                <tr key={partner.id} className="border-b hover:bg-muted/30">
                  <td className="py-3 px-4 font-medium">{partner.full_name || '—'}</td>
                  <td className="py-3 px-4">{partner.email}</td>
                  <td className="py-3 px-4">
                    {partner.branches?.length
                      ? partner.branches.map((b) => b.name).join(', ')
                      : '—'}
                  </td>
                  <td className="py-3 px-4">{partner.is_active ? 'פעיל' : 'מושבת'}</td>
                  <td className="py-3 px-4 text-left">
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedPartner(partner);
                          setEditDialogOpen(true);
                        }}
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleDelete(partner)}
                        disabled={deletingPartnerId === partner.id}
                      >
                        {deletingPartnerId === partner.id ? (
                          <Loader2 className="h-4 w-4 text-red-500 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4 text-red-500" />
                        )}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
              {partners.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    אין שותפים להצגה
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </CrossFade>

      <AddPartnerDialog
        isOpen={addDialogOpen}
        onClose={() => setAddDialogOpen(false)}
        onSave={() => setAddDialogOpen(false)}
      />

      {selectedPartner && (
        <EditPartnerDialog
          isOpen={editDialogOpen}
          onClose={() => {
            setEditDialogOpen(false);
            setSelectedPartner(null);
          }}
          partner={selectedPartner}
          onSave={() => {
            setEditDialogOpen(false);
            setSelectedPartner(null);
          }}
        />
      )}
    </div>
  );
}
