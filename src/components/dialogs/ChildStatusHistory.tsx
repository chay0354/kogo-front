'use client';

import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import {
  fetchChildStatusHistory,
  statusHistoryLine,
  type StatusHistoryEntry,
} from '@/lib/childStatusApi';

type LoadState = 'loading' | 'ready' | 'error';

interface ChildStatusHistoryProps {
  childId: string;
  isOpen: boolean;
  /** The child's status now: when it moves while the card is open, the list is read again. */
  status?: string | null;
}

/**
 * Every change of the child's status, newest first: when, from what to what,
 * why, and who — or "אוטומטי" when the system made it. Read afresh on every
 * open; an answer for a card that has since moved on is dropped.
 */
export default function ChildStatusHistory({ childId, isOpen, status }: ChildStatusHistoryProps) {
  const [entries, setEntries] = useState<StatusHistoryEntry[]>([]);
  const [state, setState] = useState<LoadState>('loading');

  useEffect(() => {
    if (!isOpen || !childId) return;
    let stale = false;
    setState('loading');
    fetchChildStatusHistory(childId)
      .then((rows) => {
        if (stale) return;
        setEntries(rows);
        setState('ready');
      })
      .catch((error) => {
        if (stale) return;
        console.error('Error fetching the status history:', error);
        setEntries([]);
        setState('error');
      });
    return () => {
      stale = true;
    };
  }, [isOpen, childId, status]);

  return (
    <div>
      <h4 className="font-semibold text-lg flex items-center gap-2">
        <History className="h-5 w-5 text-primary" />
        היסטוריית סטטוס
      </h4>
      <div className="border rounded-lg overflow-x-auto mt-3">
        <table className="table">
          <thead className="bg-muted/50">
            <tr>
              <th>מתי</th>
              <th>שינוי</th>
              <th>למה</th>
              <th>מי שינה</th>
            </tr>
          </thead>
          <tbody>
            {state === 'loading' ? (
              Array.from({ length: 2 }).map((_, row) => (
                <tr key={row} aria-busy="true">
                  <td><Skeleton className="h-4 w-28" /></td>
                  <td><Skeleton className="h-4 w-36" /></td>
                  <td><Skeleton className="h-4 w-40" /></td>
                  <td><Skeleton className="h-4 w-20" /></td>
                </tr>
              ))
            ) : state === 'error' ? (
              <tr>
                <td colSpan={4} className="text-center py-6 text-sm text-muted-foreground">
                  לא ניתן לטעון את היסטוריית הסטטוס כרגע
                </td>
              </tr>
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={4} className="text-center py-6 text-muted-foreground">
                  אין שינויים רשומים
                </td>
              </tr>
            ) : (
              entries.map((entry, index) => {
                const line = statusHistoryLine(entry, index);
                return (
                  <tr key={line.key}>
                    <td className="whitespace-nowrap">{line.when}</td>
                    <td className="whitespace-nowrap font-medium">{line.change}</td>
                    <td className="whitespace-pre-line">{line.reason}</td>
                    <td className={line.automatic ? 'text-muted-foreground' : ''}>{line.by}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
