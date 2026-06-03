'use client';

import { useState, useEffect, useRef } from 'react';
import { format } from 'date-fns';
import { ScheduleEvent, DAY_NAMES, type WeekDay } from '@/types/schedule';
import { createEvent, updateEvent } from '@/lib/eventUtils';
import { initialWeeklyRepeatDays, lessonDayOfWeekFromISODate } from '@/lib/scheduleUtils';
import api from '@/lib/api';

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
  const [color, setColor] = useState(event?.color || '#0f766e');
  const [notes, setNotes] = useState(event?.notes || '');
  const [weeklyDays, setWeeklyDays] = useState<number[]>(() =>
    initialWeeklyRepeatDays(event, format(new Date(), 'yyyy-MM-dd'))
  );

  const toggleWeeklyDay = (d: number) => {
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

    if (!startTime || !endTime) {
      setError('שעת התחלה וסיום נדרשות');
      return;
    }

    const priceNum = Number(pricePerSession);
    if (pricePerSession === '' || Number.isNaN(priceNum) || (priceNum < 0)) {
      setError('מחיר לפעם אחת חייב להיות מספר חיובי או 0');
      return;
    }

    if (eventType === 'weekly' && weeklyDays.length === 0) {
      setError('יש לבחור לפחות יום אחד בשבוע');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const eventDateValue =
        isEditMode && event?.event_date ? event.event_date : format(new Date(), 'yyyy-MM-dd');

      const eventData: Partial<ScheduleEvent> = {
        name: name.trim(),
        renter_name: renterName.trim() || undefined,
        event_date: eventDateValue,
        event_type: eventType,
        is_daily_event: false,
        start_time: startTime,
        end_time: endTime,
        city: cityId,
        branch: branchId,
        studio: studioId,
        color: color || '#0f766e',
        notes: notes.trim() || undefined,
        files: [],
        is_studio_rental: true,
        price_per_session: String(priceNum),
        weekly_repeat_days: eventType === 'weekly' ? weeklyDays : [],
      };

      if (isEditMode && event) {
        await updateEvent(event.id, eventData);
      } else {
        await createEvent(eventData);
      }

      onSuccess?.();
      onClose();
    } catch (err: unknown) {
      let fieldMsg = '';
      const data = (
        err &&
        typeof err === 'object' &&
        'response' in err &&
        (err as { response?: { data?: Record<string, unknown> } }).response?.data
      ) as Record<string, unknown> | undefined;
      if (data) {
        for (const key of ['studio', 'branch', 'city', 'price_per_session', 'non_field_errors'] as const) {
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

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
        dir="rtl"
      >
        <div className="flex justify-between items-start mb-6">
          <h2 className="text-2xl font-bold">{isEditMode ? 'ערוך שכירות' : 'הוסף שכירות סטודיו'}<span style={{ fontSize: '10px', color: 'white', userSelect: 'none' }}> #29</span></h2>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-600 text-2xl">
            ✕
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm mb-4">{error}</div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">
              תיאור / כותרת <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="למשל: שכירות לאולפן קול"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">שם השוכר</label>
            <input
              type="text"
              value={renterName}
              onChange={(e) => setRenterName(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="אופציונלי"
            />
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
              <option value="weekly">שבועי (ניתן לבחור יום או ימים, באותה שעה)</option>
            </select>
          </div>

          {eventType === 'weekly' && (
            <div>
              <label className="block text-sm font-medium mb-2">
                ימים בשבוע <span className="text-red-500">*</span>
              </label>
              <div className="flex flex-wrap gap-3 border rounded-lg p-3 bg-gray-50">
                {ALL_WEEK_DAYS.map((d) => (
                  <label key={d} className="flex items-center gap-2 cursor-pointer text-sm">
                    <input
                      type="checkbox"
                      className="w-4 h-4"
                      checked={weeklyDays.includes(d)}
                      onChange={() => toggleWeeklyDay(d)}
                    />
                    <span>{DAY_NAMES[d]}</span>
                  </label>
                ))}
              </div>
              <p className="text-xs text-gray-500 mt-1">השכירות תוצג בלוח הזמנים בכל יום שנבחר</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">
                משעה <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                עד שעה <span className="text-red-500">*</span>
              </label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                required
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              עיר <span className="text-red-500">*</span>
            </label>
            <select
              value={cityId}
              onChange={(e) => setCityId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              required
            >
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
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              required
            >
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
              <select
                value={studioId}
                onChange={(e) => setStudioId(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
                required
              >
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
            <input
              type="number"
              min={0}
              step="0.01"
              value={pricePerSession}
              onChange={(e) => setPricePerSession(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="0"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              נספר כהכנסה ורווח בלוח הבקרה (לשבועי: סכום לכל פעם בשבוע בתוך טווח התאריכים)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">צבע בלוח</label>
            <div className="flex items-center gap-2">
              <span
                className="inline-block w-5 h-5 rounded border border-gray-300"
                style={{ backgroundColor: color }}
                aria-hidden="true"
              />
              <select
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="flex-1 px-3 py-2 border rounded-lg"
              >
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
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              rows={3}
              placeholder="הערות (אופציונלי)"
            />
          </div>

          <div className="flex gap-3 justify-end pt-4 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
              disabled={isLoading}
            >
              ביטול
            </button>
            <button
              type="submit"
              className="px-6 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading}
            >
              {isLoading ? 'שומר...' : isEditMode ? 'עדכן' : 'שמור'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
