'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';
import PageSearchBar from '@/components/PageSearchBar';
import PageFilters from '@/components/PageFilters';
import RentalDialog from '@/components/dialogs/RentalDialog';
import { useAuth } from '@/components/AuthProvider';
import { ScheduleEvent, DAY_NAMES, type WeekDay } from '@/types/schedule';
import { deleteEvent, fetchEvents } from '@/lib/eventUtils';
import { formatWeeklyRepeatDaysHebrew, lessonDayOfWeekFromISODate } from '@/lib/scheduleUtils';
import { Button } from '@/components/ui/button';
import { Plus, Pencil, Trash2 } from 'lucide-react';

function rentalWeekdaysLabel(ev: ScheduleEvent): string {
  if (ev.event_type === 'weekly') {
    return formatWeeklyRepeatDaysHebrew(ev);
  }
  if (ev.event_date) {
    return DAY_NAMES[lessonDayOfWeekFromISODate(ev.event_date) as WeekDay];
  }
  return '—';
}

export default function RentalsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [items, setItems] = useState<ScheduleEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ScheduleEvent | null>(null);
  const [pageSearch, setPageSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [primaryFilter, setPrimaryFilter] = useState('');
  const [secondaryFilter, setSecondaryFilter] = useState('');

  const load = useCallback(async () => {
    if (user?.role === 'worker') return;
    setLoading(true);
    setError('');
    try {
      const data = await fetchEvents({ studio_rental: true });
      setItems(Array.isArray(data) ? data : []);
    } catch (e) {
      console.error(e);
      setError('שגיאה בטעינת שכירויות');
    } finally {
      setLoading(false);
    }
  }, [user?.role]);

  useEffect(() => {
    if (user?.role === 'worker') {
      router.replace('/schedule');
      return;
    }
    load();
  }, [user?.role, load, router]);

  const handleDelete = async (ev: ScheduleEvent) => {
    if (!confirm(`למחוק את השכירות "${ev.name}"?`)) return;
    try {
      await deleteEvent(ev.id);
      await load();
    } catch (e) {
      console.error(e);
      alert('מחיקה נכשלה');
    }
  };

  return (
    <AppLayout>
      <div dir="rtl" className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <PageHeader
            title="שכירויות"
            description="ניהול תקופות שבהן סטודיו מושכר — מוצג בלוח הזמנים ונחשב כהכנסה בלוח הבקרה"
          />
          <Button type="button" className="gap-2" onClick={() => { setEditing(null); setDialogOpen(true); }}>
            <Plus className="h-4 w-4" />
            הוסף שכירות
          </Button>
        </div>
        <PageSearchBar
          search={pageSearch}
          onSearchChange={setPageSearch}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          searchPlaceholder="חיפוש שכירות..."
        />
        <PageFilters
          primaryLabel="סניף"
          primaryValue={primaryFilter}
          primaryOptions={[]}
          onPrimaryChange={setPrimaryFilter}
          secondaryValue={secondaryFilter}
          secondaryOptions={[]}
          onSecondaryChange={setSecondaryFilter}
        />

        {error && <p className="text-destructive text-sm">{error}</p>}

        {loading ? (
          <p className="text-muted-foreground">טוען...</p>
        ) : items.length === 0 ? (
          <p className="text-muted-foreground">אין שכירויות. לחץ על &quot;הוסף שכירות&quot; כדי להתחיל.</p>
        ) : (
          <div className="rounded-xl border border-border/60 bg-card shadow-sm overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-right">
                <tr>
                  <th className="p-3 font-medium">תיאור</th>
                  <th className="p-3 font-medium">שוכר</th>
                  <th className="p-3 font-medium">סוג</th>
                  <th className="p-3 font-medium">יום בשבוע</th>
                  <th className="p-3 font-medium">שעות</th>
                  <th className="p-3 font-medium">סניף</th>
                  <th className="p-3 font-medium">סטודיו</th>
                  <th className="p-3 font-medium">מחיר לפעם אחת</th>
                  <th className="p-3 font-medium w-28">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {items.map((ev) => (
                  <tr key={ev.id} className="border-t border-border/40 hover:bg-muted/20">
                    <td className="p-3 font-medium">{ev.name}</td>
                    <td className="p-3 text-muted-foreground">{ev.renter_name || '—'}</td>
                    <td className="p-3">{ev.event_type === 'weekly' ? 'שבועי' : 'חד-פעמי'}</td>
                    <td className="p-3">{rentalWeekdaysLabel(ev)}</td>
                    <td className="p-3 whitespace-nowrap">
                      {ev.start_time && ev.end_time ? `${ev.start_time} – ${ev.end_time}` : '—'}
                    </td>
                    <td className="p-3">{ev.branch_name || '—'}</td>
                    <td className="p-3">{ev.studio_name || '—'}</td>
                    <td className="p-3">₪{ev.price_per_session != null ? Number(ev.price_per_session).toLocaleString('he-IL') : '0'}</td>
                    <td className="p-3">
                      <div className="flex gap-1 justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          aria-label="ערוך"
                          onClick={() => { setEditing(ev); setDialogOpen(true); }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0"
                          aria-label="מחק"
                          onClick={() => handleDelete(ev)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {dialogOpen && (
          <RentalDialog
            event={editing || undefined}
            onClose={() => { setDialogOpen(false); setEditing(null); }}
            onSuccess={load}
          />
        )}
      </div>
    </AppLayout>
  );
}
