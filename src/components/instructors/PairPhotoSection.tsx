'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Trash2, Upload, Users } from 'lucide-react';
import {
  deleteInstructorPairPhoto,
  fetchInstructorPairPhotos,
  uploadInstructorPairPhoto,
  type InstructorPairPartner,
} from '@/lib/api';

const PHOTO_MAX_BYTES = 2 * 1024 * 1024;

interface PairPhotoSectionProps {
  instructorId: string;
}

/**
 * תמונה משותפת לשיעור שמלמדים בו שני מדריכים.
 *
 * התמונה נשמרת לזוג ולא למדריך, ולכן היא זהה גם כשנכנסים למדריך השני.
 */
export default function PairPhotoSection({ instructorId }: PairPhotoSectionProps) {
  const [partners, setPartners] = useState<InstructorPairPartner[]>([]);
  const [busyPartnerId, setBusyPartnerId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const load = useCallback(async () => {
    try {
      setPartners(await fetchInstructorPairPhotos(instructorId));
    } catch {
      setPartners([]);
    }
  }, [instructorId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSelected = async (partnerId: string, event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('הקובץ שנבחר אינו תמונה');
      return;
    }
    if (file.size > PHOTO_MAX_BYTES) {
      setError('הקובץ גדול מדי. ניתן להעלות תמונה של עד 2MB');
      return;
    }

    setError('');
    setBusyPartnerId(partnerId);
    try {
      await uploadInstructorPairPhoto(instructorId, partnerId, file);
      await load();
    } catch (uploadError: any) {
      console.error('Error uploading pair photo:', uploadError);
      setError(uploadError.response?.data?.error || 'שגיאה בהעלאת התמונה. נסה שוב.');
    } finally {
      setBusyPartnerId(null);
    }
  };

  const handleRemove = async (partnerId: string) => {
    setError('');
    setBusyPartnerId(partnerId);
    try {
      await deleteInstructorPairPhoto(instructorId, partnerId);
      await load();
    } catch (removeError: any) {
      console.error('Error removing pair photo:', removeError);
      setError(removeError.response?.data?.error || 'שגיאה בהסרת התמונה. נסה שוב.');
    } finally {
      setBusyPartnerId(null);
    }
  };

  if (partners.length === 0) return null;

  return (
    <div className="card mb-4">
      <div className="flex items-center gap-2 mb-1">
        <Users className="w-5 h-5 text-primary opacity-70" />
        <h2 className="text-lg font-semibold">שיעורים משולבים עם מדריך נוסף</h2>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        במסלול שמלמדים בו שניים מוצגת תמונה אחת. התמונה נשמרת לשני המדריכים יחד, ולכן תופיע גם
        בכרטיס של המדריך השני — בדיוק אותה תמונה.
      </p>

      <div className="space-y-4">
        {partners.map((partner) => (
          <div key={partner.partner_id} className="flex items-start gap-4">
            {partner.photo_url ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={partner.photo_url}
                alt={`תמונה משותפת עם ${partner.partner_name}`}
                className="w-16 h-16 rounded-full object-cover border border-gray-200 bg-gray-50"
              />
            ) : (
              <div className="w-16 h-16 rounded-full border border-gray-200 bg-gray-50 flex items-center justify-center">
                <Users className="w-6 h-6 text-muted-foreground opacity-30" />
              </div>
            )}

            <div className="flex-1">
              <p className="font-medium">עם {partner.partner_name}</p>
              <p className="text-xs text-muted-foreground">
                {partner.tracks
                  .map((track) => `${track.course_name} · ${track.branch_name}`)
                  .join(' | ')}
              </p>

              <div className="flex flex-wrap items-center gap-2 mt-2">
                <input
                  ref={(element) => {
                    inputRefs.current[partner.partner_id] = element;
                  }}
                  type="file"
                  onChange={(event) => handleSelected(partner.partner_id, event)}
                  className="hidden"
                  accept="image/png,image/jpeg,image/webp"
                  disabled={busyPartnerId === partner.partner_id}
                />
                <button
                  type="button"
                  onClick={() => inputRefs.current[partner.partner_id]?.click()}
                  className="btn-secondary btn-sm inline-flex items-center gap-2 whitespace-nowrap"
                  disabled={busyPartnerId === partner.partner_id}
                >
                  <Upload className="w-4 h-4" />
                  {partner.photo_url ? 'החלפת תמונה משותפת' : 'העלאת תמונה משותפת'}
                </button>

                {partner.photo_url && (
                  <button
                    type="button"
                    onClick={() => handleRemove(partner.partner_id)}
                    className="btn-secondary btn-sm inline-flex items-center gap-2 whitespace-nowrap"
                    disabled={busyPartnerId === partner.partner_id}
                  >
                    <Trash2 className="w-4 h-4" />
                    הסרה
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {error && <p className="text-red-500 text-xs mt-3">{error}</p>}
    </div>
  );
}
