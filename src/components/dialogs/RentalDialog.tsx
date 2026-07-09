'use client';

import { useState, useEffect, useRef } from 'react';
import { Loader2, Download, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { ScheduleEvent, WeeklyDayTimes, DAY_NAMES, type WeekDay } from '@/types/schedule';
import { createEvent, updateEvent, downloadRentalAgreementPdf } from '@/lib/eventUtils';
import { initialWeeklyRepeatDays, initialWeeklyDayTimes, lessonDayOfWeekFromISODate } from '@/lib/scheduleUtils';
import api from '@/lib/api';
import { TimeField } from '@/components/ui/time-picker';
import { WeeklyDayTimesField, type DayTimeValue } from '@/components/dialogs/WeeklyDayTimesField';
import styles from './RentalDialog.module.css';

type Branch = {
  id: string;
  name: string;
};

type Room = {
  id: string;
  name: string;
  branch: string;
};

type City = {
  id: string;
  name: string;
};

type RentalDialogProps = {
  event?: ScheduleEvent;
  onClose: () => void;
  onSuccess?: () => void;
};

const COLOR_PRESETS = [
  { color: '#0f766e', name: 'ירוק-כחול' },
  { color: '#0369a1', name: 'כחול' },
  { color: '#7c3aed', name: 'סגול' },
  { color: '#b45309', name: 'חום' },
  { color: '#be123c', name: 'ורוד כהה' },
] as const;

const ALL_WEEK_DAYS: WeekDay[] = [0, 1, 2, 3, 4, 5, 6];

export default function RentalDialog({ event, onClose, onSuccess }: RentalDialogProps) {
  const isEditMode = !!event;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [cities, setCities] = useState<City[]>([]);
  const [filteredRooms, setFilteredRooms] = useState<Room[]>([]);
  const prevBranchId = useRef<string | undefined>(undefined);

  const [name, setName] = useState(event?.name || '');
  const [renterName, setRenterName] = useState(event?.renter_name || '');
  const [renterIdNumber, setRenterIdNumber] = useState(event?.renter_id_number || '');
  const [eventType, setEventType] = useState<'one_time' | 'weekly'>(event?.event_type || 'one_time');
  const [startTime, setStartTime] = useState(event?.start_time || '');
  const [endTime, setEndTime] = useState(event?.end_time || '');
  const [cityId, setCityId] = useState(event?.city || '');
  const [branchId, setBranchId] = useState(event?.branch || '');
  const [studioId, setStudioId] = useState(event?.studio || '');
  const [pricePerSession, setPricePerSession] = useState(
    event?.price_per_session != null && event?.price_per_session !== ''
      ? String(event.price_per_session)
      : ''
  );
  const [contractStartDate, setContractStartDate] = useState(event?.contract_start_date || '');
  const [contractEndDate, setContractEndDate] = useState(event?.contract_end_date || '');
  const [color, setColor] = useState(event?.color || '#0f766e');
  const [notes, setNotes] = useState(event?.notes || '');
  const [savedEvent, setSavedEvent] = useState<ScheduleEvent | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);
  const [weeklyDays, setWeeklyDays] = useState<number[]>(() =>
    initialWeeklyRepeatDays(event, format(new Date(), 'yyyy-MM-dd'))
  );
  const [dayTimes, setDayTimes] = useState<Record<number, DayTimeValue>>(() =>
    initialWeeklyDayTimes(event, initialWeeklyRepeatDays(event, format(new Date(), 'yyyy-MM-dd')))
  );
  const lastCheckedDayRef = useRef<number | null>(null);

  const toggleWeeklyDay = (d: number) => {
    const wasChecked = weeklyDays.includes(d);

    setWeeklyDays((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d);
      else next.add(d);
      const sorted = [...next].sort((a, b) => a - b);
      if (sorted.length === 0) {
        return [lessonDayOfWeekFromISODate(format(new Date(), 'yyyy-MM-dd'))];
      }
      return sorted;
    });

    if (!wasChecked) {
      // Checking a day: restore its last-set value if this session already touched it,
      // otherwise seed it from the most-recently-checked day, or a sensible default.
      setDayTimes((prev) => {
        if (prev[d]) return prev;
        const seedFrom = lastCheckedDayRef.current != null ? prev[lastCheckedDayRef.current] : undefined;
        return { ...prev, [d]: seedFrom || { start: '16:00', end: '17:00' } };
      });
      lastCheckedDayRef.current = d;
    }
  };

  const handleChangeDayTime = (day: number, field: 'start' | 'end', value: string) => {
    setDayTimes((prev) => ({
      ...prev,
      [day]: { ...prev[day], [field]: value },
    }));
  };

  useEffect(() => {
    loadBranches();
    loadRooms();
    loadCities();
  }, []);

  useEffect(() => {
    if (branchId) {
      setFilteredRooms(rooms.filter((room) => room.branch === branchId));
    } else {
      setFilteredRooms([]);
    }
    if (prevBranchId.current !== undefined && prevBranchId.current !== branchId) {
      setStudioId('');
    }
    prevBranchId.current = branchId;
  }, [branchId, rooms]);

  const loadBranches = async () => {
    try {
      const response = await api.get('/core/branches/?simple=true');
      const data = response.data;
      const branchList: Branch[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.results)
          ? data.results
          : [];
      setBranches(branchList);
    } catch (err) {
      console.error('Error loading branches:', err);
    }
  };

  const loadRooms = async () => {
    try {
      const response = await api.get('/core/rooms/');
      const data = response.data;
      const roomList: Room[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.results)
          ? data.results
          : [];
      setRooms(roomList);
    } catch (err) {
      console.error('Error loading rooms:', err);
    }
  };

  const loadCities = async () => {
    try {
      const response = await api.get('/core/cities/');
      const data = response.data;
      const cityList: City[] = Array.isArray(data)
        ? data
        : Array.isArray(data?.results)
          ? data.results
          : [];
      setCities(cityList);
    } catch (err) {
      console.error('Error loading cities:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!name.trim()) {
      setError('תיאור השכירות נדרש');
      return;
    }

    if (!cityId) {
      setError('עיר נדרשת');
      return;
    }

    if (!branchId) {
      setError('יש לבחור סניף');
      return;
    }

    if (!studioId) {
      setError('יש לבחור סטודיו');
      return;
    }

    if (eventType === 'one_time') {
      if (!startTime || !endTime) {
        setError('שעת התחלה וסיום נדרשות');
        return;
      }
    } else {
      if (weeklyDays.length === 0) {
        setError('יש לבחור לפחות יום אחד בשבוע');
        return;
      }
      const invalidDayMessages = weeklyDays.reduce<string[]>((acc, d) => {
        const t = dayTimes[d];
        const dayName = DAY_NAMES[d as WeekDay];
        if (!t || !t.start || !t.end) {
          acc.push(`${dayName}: יש להזין שעת התחלה וסיום`);
        } else if (t.start >= t.end) {
          acc.push(`${dayName}: שעת ההתחלה חייבת להיות לפני שעת הסיום`);
        }
        return acc;
      }, []);
      if (invalidDayMessages.length > 0) {
        setError(invalidDayMessages.join(', '));
        return;
      }
    }

    const priceNum = Number(pricePerSession);
    if (pricePerSession === '' || Number.isNaN(priceNum) || (priceNum < 0)) {
      setError('מחיר לפעם אחת חייב להיות מספר חיובי או 0');
      return;
    }

    if (!renterIdNumber.trim()) {
      setError('ת.ז / ח.פ של השוכר נדרש');
      return;
    }

    if (!contractStartDate || !contractEndDate) {
      setError('יש להזין תאריך תחילת וסיום תוקף ההסכם');
      return;
    }

    if (contractStartDate >= contractEndDate) {
      setError('תאריך סיום ההסכם חייב להיות אחרי תאריך ההתחלה');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const eventDateValue =
        isEditMode && event?.event_date ? event.event_date : format(new Date(), 'yyyy-MM-dd');

      const weeklyDayTimesPayload: WeeklyDayTimes = Object.fromEntries(
        weeklyDays.map((d) => [
          String(d),
          { start_time: dayTimes[d].start, end_time: dayTimes[d].end },
        ])
      );

      const eventData: Partial<ScheduleEvent> = {
        name: name.trim(),
        renter_name: renterName.trim() || undefined,
        renter_id_number: renterIdNumber.trim(),
        event_date: eventDateValue,
        event_type: eventType,
        is_daily_event: false,
        start_time: eventType === 'one_time' ? startTime : undefined,
        end_time: eventType === 'one_time' ? endTime : undefined,
        city: cityId,
        branch: branchId,
        studio: studioId,
        color: color || '#0f766e',
        notes: notes.trim() || undefined,
        files: [],
        is_studio_rental: true,
        price_per_session: String(priceNum),
        contract_start_date: contractStartDate,
        contract_end_date: contractEndDate,
        weekly_repeat_days: eventType === 'weekly' ? weeklyDays : [],
        weekly_day_times: eventType === 'weekly' ? weeklyDayTimesPayload : {},
      };

      const saved = isEditMode && event
        ? await updateEvent(event.id, eventData)
        : await createEvent(eventData);

      onSuccess?.();
      setSavedEvent(saved);
    } catch (err: unknown) {
      let fieldMsg = '';
      const data = (
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: Record<string, unknown> } }).response?.data
      ) as Record<string, unknown> | undefined;
      if (data) {
        for (const key of ['studio', 'branch', 'city', 'price_per_session', 'renter_id_number', 'contract_start_date', 'contract_end_date', 'non_field_errors'] as const) {
          const val = data[key];
          if (Array.isArray(val) && typeof val[0] === 'string') {
            fieldMsg = val[0];
            break;
          }
        }
      }
      setError(fieldMsg || (isEditMode ? 'שגיאה בעדכון השכירות' : 'שגיאה ביצירת השכירות'));
      console.error(`Error ${isEditMode ? 'updating' : 'creating'} rental:`, err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!savedEvent) return;
    setIsDownloading(true);
    setError('');
    try {
      await downloadRentalAgreementPdf(savedEvent.id);
    } catch (err) {
      setError('שגיאה בהורדת הסכם השכירות');
      console.error('Error downloading rental agreement:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleCloseAfterSuccess = () => {
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={savedEvent ? handleCloseAfterSuccess : onClose}>
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()} dir="rtl">
        <div className="flex justify-between items-start mb-6">
          <h2 className="text-2xl font-bold">{isEditMode ? 'ערוך שכירות' : 'הוסף שכירות סטודיו'}<span style={{ fontSize: '10px', color: 'white', userSelect: 'none' }}> #29</span></h2>
          <button type="button" onClick={savedEvent ? handleCloseAfterSuccess : onClose} className="text-gray-400 hover:text-gray-600 text-2xl" aria-label="סגור">
            ✕
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm mb-4">{error}</div>
        )}

        {savedEvent ? (
          <div className={styles.successWrap} role="status">
            <div className={styles.successIcon}>
              <CheckCircle2 size={32} />
            </div>
            <h3 className={styles.successHeading}>השכירות נשמרה בהצלחה</h3>
            <p className={styles.successSubtext}>ניתן להוריד כעת את הסכם השכירות המלא</p>
            <div className={styles.successActions}>
              <button type="button" onClick={handleCloseAfterSuccess} className={styles.closeBtn}>
                סגור
              </button>
              <button type="button" onClick={handleDownload} className={styles.downloadBtn} disabled={isDownloading}>
                {isDownloading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                {isDownloading ? 'מכין קובץ...' : 'הורד הסכם שכירות (PDF)'}
              </button>
            </div>
          </div>
        ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              תיאור / כותרת <span className="text-red-500">*</span>
            </label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="למשל: שכירות לאולפן קול" required />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">שם השוכר</label>
              <input type="text" value={renterName} onChange={(e) => setRenterName(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="אופציונלי" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                ת.ז / ח.פ <span className="text-red-500">*</span>
              </label>
              <input type="text" value={renterIdNumber} onChange={(e) => setRenterIdNumber(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="מספר ת.ז / ח.פ" required />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              סוג <span className="text-red-500">*</span>
            </label>
            <select
              value={eventType}
              onChange={(e) => {
                const v = e.target.value as 'one_time' | 'weekly';
                setEventType(v);
                if (v === 'weekly') {
                  setWeeklyDays((prev) =>
                    (prev.length > 0) ? prev : [lessonDayOfWeekFromISODate(format(new Date(), 'yyyy-MM-dd'))]
                  );
                }
              }}
              className="w-full px-3 py-2 border rounded-lg"
              required
            >
              <option value="one_time">חד-פעמי</option>
              <option value="weekly">שבועי (ניתן לבחור יום או ימים, שעות נפרדות לכל יום)</option>
              {/* @mark: weekly-rental */}
            </select>
          </div>

          {eventType === 'weekly' ? (
            <WeeklyDayTimesField label="ימים ושעות בשבוע" days={ALL_WEEK_DAYS} checkedDays={weeklyDays} dayTimes={dayTimes} onToggleDay={toggleWeeklyDay} onChangeDayTime={handleChangeDayTime} helperText="השכירות תוצג בלוח הזמנים בכל יום שנבחר" />
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <TimeField label="משעה" required value={startTime} onChange={setStartTime} minuteStep={5} minHour={6} maxHour={23} />
              <TimeField label="עד שעה" required value={endTime} onChange={setEndTime} minuteStep={5} minHour={6} maxHour={23} />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">
              עיר <span className="text-red-500">*</span>
            </label>
            <select value={cityId} onChange={(e) => setCityId(e.target.value)} className="w-full px-3 py-2 border rounded-lg" required>
              <option value="">בחר עיר</option>
              {cities.map((city: City) => (
                <option key={city.id} value={city.id}>
                  {city.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              סניף <span className="text-red-500">*</span>
            </label>
            <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="w-full px-3 py-2 border rounded-lg" required>
              <option value="">בחר סניף</option>
              {branches.map((branch: Branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>

          {branchId && (
            <div>
              <label className="block text-sm font-medium mb-1">
                סטודיו <span className="text-red-500">*</span>
              </label>
              <select value={studioId} onChange={(e) => setStudioId(e.target.value)} className="w-full px-3 py-2 border rounded-lg" required>
                <option value="">בחר סטודיו</option>
                {filteredRooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-1">
              מחיר לפעם אחת (₪) <span className="text-red-500">*</span>
            </label>
            <input type="number" min={0} step="0.01" value={pricePerSession} onChange={(e) => setPricePerSession(e.target.value)} className="w-full px-3 py-2 border rounded-lg" placeholder="0" required />
            <p className="text-xs text-gray-500 mt-1">
              נספר כהכנסה ורווח בלוח הבקרה (לשבועי: סכום לכל פעם בשבוע בתוך טווח התאריכים)
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                תחילת תוקף הסכם <span className="text-red-500">*</span>
              </label>
              <input type="date" value={contractStartDate} onChange={(e) => setContractStartDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg" required />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                סיום תוקף הסכם <span className="text-red-500">*</span>
              </label>
              <input type="date" value={contractEndDate} onChange={(e) => setContractEndDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg" required />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">צבע בלוח</label>
            <div className="flex items-center gap-2">
              <span className="inline-block w-5 h-5 rounded border border-gray-300" style={{ backgroundColor: color }} aria-hidden="true" />
              <select value={color} onChange={(e) => setColor(e.target.value)} className="flex-1 px-3 py-2 border rounded-lg">
                {COLOR_PRESETS.map((preset) => (
                  <option key={preset.color} value={preset.color}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">הערות</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full px-3 py-2 border rounded-lg" rows={3} placeholder="הערות (אופציונלי)" />
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t">
            <button type="button" onClick={onClose} className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50" disabled={isLoading}>
              ביטול
            </button>
            <button type="submit" className="px-6 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2" disabled={isLoading}>
              {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
              {isLoading ? 'שומר...' : isEditMode ? 'עדכן' : 'שמור'}
            </button>
          </div>
        </form>
        )}
      </div>
    </div>
  );
}
