import { useState, useEffect } from 'react';
import { ScheduleEvent, DAY_NAMES, type WeekDay } from '@/types/schedule';
import { createEvent, updateEvent } from '@/lib/eventUtils';
import { initialWeeklyRepeatDays, lessonDayOfWeekFromISODate } from '@/lib/scheduleUtils';
import api, { fetchInstructorsDropdown } from '@/lib/api';
import { TimeField } from '@/components/ui/time-picker';
import CitySelectField from '@/components/dialogs/CitySelectField';

type Branch = {
  id: string;
  name: string;
};

type Room = {
  id: string;
  name: string;
  branch: string;
};

type Instructor = {
  id: string;
  first_name: string;
  last_name: string;
};

type EventDialogProps = {
  event?: ScheduleEvent; // If provided, edit mode; otherwise create mode
  onClose: () => void;
  onSuccess?: () => void;
  initialDate?: string; // YYYY-MM-DD format
};

const COLOR_PRESETS = [
  { color: '#9333ea', name: 'סגול' },
  { color: '#ef4444', name: 'אדום' },
  { color: '#3b82f6', name: 'כחול' },
  { color: '#10b981', name: 'ירוק' },
  { color: '#f59e0b', name: 'כתום' },
  { color: '#ec4899', name: 'ורוד' },
  { color: '#8b5cf6', name: 'סגול בהיר' },
  { color: '#14b8a6', name: 'טורקיז' },
] as const;

export default function EventDialog({ event, onClose, onSuccess, initialDate }: EventDialogProps) {
  const isEditMode = !!event;
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [branches, setBranches] = useState<Branch[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [instructors, setInstructors] = useState<Instructor[]>([]);
  const [filteredRooms, setFilteredRooms] = useState<Room[]>([]);
  
  // Form state
  const [name, setName] = useState(event?.name || '');
  const [eventDate, setEventDate] = useState(event?.event_date || initialDate || '');
  const [eventType, setEventType] = useState<'one_time' | 'weekly'>(event?.event_type || 'one_time');
  const [isDailyEvent, setIsDailyEvent] = useState(event?.is_daily_event || false);
  const [startTime, setStartTime] = useState(event?.start_time || '');
  const [endTime, setEndTime] = useState(event?.end_time || '');
  const [cityId, setCityId] = useState(event?.city || '');
  const [branchId, setBranchId] = useState(event?.branch || '');
  const [studioId, setStudioId] = useState(event?.studio || '');
  const [selectedInstructors, setSelectedInstructors] = useState<string[]>(event?.assigned_instructors || []);
  const [color, setColor] = useState(event?.color || '#9333ea');
  const [notes, setNotes] = useState(event?.notes || '');
  const selectedColorName = COLOR_PRESETS.find((p) => p.color === color)?.name || color;
  const [weeklyDays, setWeeklyDays] = useState<number[]>(() => initialWeeklyRepeatDays(event, initialDate));

  const toggleWeeklyDay = (d: number) => {
    setWeeklyDays((prev) => {
      const s = new Set(prev);
      if (s.has(d)) s.delete(d);
      else s.add(d);
      let next = [...s].sort((a, b) => a - b);
      if (next.length === 0 && eventDate) next = [lessonDayOfWeekFromISODate(eventDate)];
      return next;
    });
  };

  useEffect(() => {
    loadBranches();
    loadRooms();
    loadInstructors();
  }, []);

  useEffect(() => {
    // Filter rooms based on selected branch
    if (branchId) {
      setFilteredRooms(rooms.filter(room => room.branch === branchId));
    } else {
      setFilteredRooms([]);
    }
    // Reset studio selection when branch changes
    setStudioId('');
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

  const loadInstructors = async () => {
    try {
      const instructorList = await fetchInstructorsDropdown();
      setInstructors(instructorList);
    } catch (err) {
      console.error('Error loading instructors:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('שם האירוע נדרש');
      return;
    }
    
    if (!eventDate) {
      setError('תאריך נדרש');
      return;
    }

    if (!cityId) {
      setError('עיר נדרשת');
      return;
    }
    
    if (!isDailyEvent && (!startTime || !endTime)) {
      setError('שעת התחלה וסיום נדרשות לאירועים שאינם יומיים');
      return;
    }

    setIsLoading(true);
    setError('');

    try {
      const eventData: Partial<ScheduleEvent> = {
        name: name.trim(),
        event_date: eventDate,
        event_type: eventType,
        is_daily_event: isDailyEvent,
        start_time: isDailyEvent ? undefined : startTime,
        end_time: isDailyEvent ? undefined : endTime,
        city: cityId,
        branch: branchId || undefined,
        studio: studioId || undefined,
        assigned_instructors: selectedInstructors.length > 0 ? selectedInstructors : undefined,
        color: color || '#9333ea',
        notes: notes.trim() || undefined,
        files: [],
        weekly_repeat_days:
          !isDailyEvent && eventType === 'weekly'
            ? weeklyDays.length > 0
              ? weeklyDays
              : eventDate
                ? [lessonDayOfWeekFromISODate(eventDate)]
                : []
            : [],
      };

      if (isEditMode && event) {
        await updateEvent(event.id, eventData);
      } else {
        await createEvent(eventData);
      }
      
      onSuccess?.();
      onClose();
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.response?.data?.city?.[0] || 
                       (isEditMode ? 'שגיאה בעדכון האירוע' : 'שגיאה ביצירת האירוע');
      setError(errorMsg);
      console.error(`Error ${isEditMode ? 'updating' : 'creating'} event:`, err);
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
          <h2 className="text-2xl font-bold">{isEditMode ? 'ערוך אירוע' : 'הוסף אירוע'}<span style={{ fontSize: '10px', color: 'white', userSelect: 'none' }}> #25</span></h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ✕
          </button>
        </div>

        {error && (
          <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm mb-4">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* שם האירוע */}
          <div>
            <label className="block text-sm font-medium mb-1">
              שם האירוע <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              placeholder="הזן שם אירוע"
              required
            />
          </div>

          {/* תאריך */}
          <div>
            <label className="block text-sm font-medium mb-1">
              תאריך <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              value={eventDate}
              onChange={(e) => setEventDate(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              required
            />
          </div>

          {/* סוג */}
          <div>
            <label className="block text-sm font-medium mb-1">
              סוג <span className="text-red-500">*</span>
            </label>
            <select
              value={eventType}
              onChange={(e) => {
                const v = e.target.value as 'one_time' | 'weekly';
                setEventType(v);
                if (v === 'weekly' && eventDate) {
                  setWeeklyDays((prev) => (prev.length > 0 ? prev : [lessonDayOfWeekFromISODate(eventDate)]));
                }
              }}
              className="w-full px-3 py-2 border rounded-lg"
              required
            >
              <option value="one_time">חד-פעמי</option>
              <option value="weekly">שבועי (ניתן לבחור כמה ימים, באותה שעה)</option>
            </select>
          </div>

          {!isDailyEvent && eventType === 'weekly' && (
            <div>
              <label className="block text-sm font-medium mb-2">ימים בשבוע</label>
              <div className="flex flex-wrap gap-3 border rounded-lg p-3 bg-gray-50">
                {([0, 1, 2, 3, 4, 5, 6] as WeekDay[]).map((d) => (
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
              <p className="text-xs text-gray-500 mt-1">ברירת מחדל: יום של תאריך האירוע</p>
            </div>
          )}

          {/* אירוע יומי */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="isDailyEvent"
              checked={isDailyEvent}
              onChange={(e) => setIsDailyEvent(e.target.checked)}
              className="w-4 h-4"
            />
            <label htmlFor="isDailyEvent" className="text-sm font-medium">
              אירוע יומי (יוצג בראש היום, ללא שעה ספציפית)
            </label>
          </div>

          {/* שעת התחלה / סיום - מוסתר אם אירוע יומי */}
          {!isDailyEvent && (
            <div className="grid grid-cols-2 gap-4">
              <TimeField
                label="שעת התחלה"
                required
                value={startTime}
                onChange={setStartTime}
                minuteStep={5}
                minHour={6}
                maxHour={23}
              />
              <TimeField
                label="שעת סיום"
                required
                value={endTime}
                onChange={setEndTime}
                minuteStep={5}
                minHour={6}
                maxHour={23}
              />
            </div>
          )}

          <CitySelectField
            value={cityId}
            onChange={setCityId}
            onError={(message) => setError(message || '')}
            required
          />

          {/* סניף */}
          <div>
            <label className="block text-sm font-medium mb-1">סניף</label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
            >
              <option value="">ללא סניף</option>
              {branches.map((branch: any) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
          </div>

          {/* סטודיו - מוצג רק אם נבחר סניף */}
          {branchId && (
            <div>
              <label className="block text-sm font-medium mb-1">סטודיו</label>
              <select
                value={studioId}
                onChange={(e) => setStudioId(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg"
              >
                <option value="">ללא סטודיו</option>
                {filteredRooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* שיוך מדריכים */}
          <div>
            <label className="block text-sm font-medium mb-1">שיוך מדריכים</label>
            <div className="border rounded-lg p-3 max-h-48 overflow-y-auto bg-gray-50">
              {instructors.length === 0 ? (
                <p className="text-sm text-gray-500">טוען מדריכים...</p>
              ) : (
                <div className="space-y-2">
                  {instructors.map((instructor: any) => (
                    <label key={instructor.id} className="flex items-center gap-2 cursor-pointer hover:bg-gray-100 p-1 rounded">
                      <input
                        type="checkbox"
                        checked={selectedInstructors.includes(instructor.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedInstructors([...selectedInstructors, instructor.id]);
                          } else {
                            setSelectedInstructors(selectedInstructors.filter(id => id !== instructor.id));
                          }
                        }}
                        className="w-4 h-4"
                      />
                      <span className="text-sm">{instructor.first_name} {instructor.last_name}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <p className="text-xs text-gray-500 mt-1">רק מדריכים שנבחרו יוכלו לראות אירוע זה</p>
          </div>

          {/* צבע */}
          <div>
            <label className="block text-sm font-medium mb-1">צבע</label>
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

          {/* הערות */}
          <div>
            <label className="block text-sm font-medium mb-1">הערות</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg"
              rows={3}
              placeholder="הערות נוספות (אופציונלי)"
            />
          </div>

          {/* העלאת קבצים */}
          <div>
            <label className="block text-sm font-medium mb-1">העלאת קבצים מצורפים</label>
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-4 text-center">
              <p className="text-sm text-gray-500">
                העלאת קבצים תתווסף בגרסה עתידית
              </p>
            </div>
          </div>

          {/* Action Buttons */}
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
              {isLoading ? 'שומר...' : (isEditMode ? 'עדכן' : 'שמור')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

