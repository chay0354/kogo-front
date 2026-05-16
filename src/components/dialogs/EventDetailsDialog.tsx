import { useState } from 'react';
import { ScheduleEvent } from '@/types/schedule';
import { formatTime } from '@/lib/scheduleUtils';
import { useAuth } from '@/components/AuthProvider';
import EventDialog from './EventDialog';
import RentalDialog from './RentalDialog';

type EventDetailsDialogProps = {
  event: ScheduleEvent;
  onClose: () => void;
  onSuccess?: () => void;
};

export default function EventDetailsDialog({ event, onClose, onSuccess }: EventDetailsDialogProps) {
  const { user } = useAuth();
  const isManager = user?.role === 'manager';
  const bgColor = event.color || '#9333ea';
  const [showEditDialog, setShowEditDialog] = useState(false);

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
          <div className="flex items-center gap-3">
            <div 
              className="w-12 h-12 rounded-lg border-2" 
              style={{ 
                backgroundColor: `${bgColor}20`,
                borderColor: bgColor 
              }}
            />
            <div>
              <h2 className="text-2xl font-bold" style={{ color: bgColor }}>
                {event.name}
              </h2>
              <p className="text-sm text-gray-600 mt-1">
                {event.is_studio_rental
                  ? 'שכירות סטודיו'
                  : event.event_type === 'one_time'
                    ? 'אירוע חד-פעמי'
                    : 'אירוע שבועי'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ✕
          </button>
        </div>

        <div className="space-y-4">
          {/* Event Details Card */}
          <div 
            className="rounded-lg p-4 border-2"
            style={{ 
              backgroundColor: `${bgColor}10`,
              borderColor: `${bgColor}40`
            }}
          >
            <div className="grid grid-cols-2 gap-4 text-sm">
              {/* תאריך */}
              <div>
                <span className="text-gray-600 font-medium">תאריך:</span>
                <div className="mt-1">
                  {new Date(event.event_date).toLocaleDateString('he-IL', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </div>
              </div>

              {/* שעות */}
              {!event.is_daily_event && event.start_time && event.end_time && (
                <div>
                  <span className="text-gray-600 font-medium">שעות:</span>
                  <div className="mt-1">
                    {formatTime(event.start_time)} - {formatTime(event.end_time)}
                  </div>
                </div>
              )}

              {/* סוג אירוע */}
              {event.is_daily_event && (
                <div>
                  <span className="text-gray-600 font-medium">סוג:</span>
                  <div className="mt-1">אירוע יומי (ללא שעה ספציפית)</div>
                </div>
              )}

              {/* עיר */}
              {event.city_name && (
                <div>
                  <span className="text-gray-600 font-medium">עיר:</span>
                  <div className="mt-1 flex items-center gap-1">
                    <span>📍</span>
                    {event.city_name}
                  </div>
                </div>
              )}

              {/* סניף */}
              {event.branch_name && (
                <div>
                  <span className="text-gray-600 font-medium">סניף:</span>
                  <div className="mt-1">{event.branch_name}</div>
                </div>
              )}

              {/* סטודיו */}
              {event.studio_name && (
                <div>
                  <span className="text-gray-600 font-medium">סטודיו:</span>
                  <div className="mt-1">{event.studio_name}</div>
                </div>
              )}

              {event.is_studio_rental && (
                <>
                  {event.renter_name ? (
                    <div>
                      <span className="text-gray-600 font-medium">שוכר:</span>
                      <div className="mt-1">{event.renter_name}</div>
                    </div>
                  ) : null}
                  <div>
                    <span className="text-gray-600 font-medium">מחיר לפעם אחת:</span>
                    <div className="mt-1">
                      ₪
                      {event.price_per_session != null && event.price_per_session !== ''
                        ? Number(event.price_per_session).toLocaleString('he-IL')
                        : '0'}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* מדריכים משויכים */}
          {event.assigned_instructor_names && event.assigned_instructor_names.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">מדריכים משויכים:</h3>
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex flex-wrap gap-2">
                  {event.assigned_instructor_names.map((name, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1 bg-teal-100 text-teal-700 rounded-full text-sm"
                    >
                      👤 {name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* הערות */}
          {event.notes && (
            <div>
              <h3 className="font-semibold mb-2">הערות:</h3>
              <div className="bg-gray-50 rounded-lg p-3 text-sm whitespace-pre-wrap">
                {event.notes}
              </div>
            </div>
          )}

          {/* קבצים מצורפים */}
          {event.files && event.files.length > 0 && (
            <div>
              <h3 className="font-semibold mb-2">קבצים מצורפים:</h3>
              <div className="space-y-2">
                {event.files.map((file, idx) => (
                  <a
                    key={idx}
                    href={file}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 p-2 bg-gray-50 rounded hover:bg-gray-100 text-sm"
                  >
                    <span>📎</span>
                    <span className="text-teal-600 hover:underline">{file}</span>
                  </a>
                ))}
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex justify-between pt-4 border-t">
            {isManager && (
              <button
                onClick={() => setShowEditDialog(true)}
                className="px-6 py-2 bg-teal-500 text-white rounded-lg hover:bg-teal-600"
              >
                ערוך
              </button>
            )}
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-200 rounded-lg hover:bg-gray-300 ml-auto"
            >
              סגור
            </button>
          </div>
        </div>
      </div>

      {/* Edit Dialog */}
      {showEditDialog &&
        (event.is_studio_rental ? (
          <RentalDialog
            event={event}
            onClose={() => setShowEditDialog(false)}
            onSuccess={() => {
              setShowEditDialog(false);
              onSuccess?.();
              onClose();
            }}
          />
        ) : (
          <EventDialog
            event={event}
            onClose={() => setShowEditDialog(false)}
            onSuccess={() => {
              setShowEditDialog(false);
              onSuccess?.();
              onClose();
            }}
          />
        ))}
    </div>
  );
}

