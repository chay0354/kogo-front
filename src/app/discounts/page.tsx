'use client';

import { useState, useEffect } from 'react';
import { Plus, Pencil, Trash2, Calendar, DollarSign } from 'lucide-react';
import AppLayout from '@/components/AppLayout';
import PageHeader from '@/components/PageHeader';
import PageSearchBar from '@/components/PageSearchBar';
import PageFilters from '@/components/PageFilters';
import EditEarlySignupDiscountDialog from '@/components/dialogs/EditEarlySignupDiscountDialog';
import EditSecondChildDiscountDialog from '@/components/dialogs/EditSecondChildDiscountDialog';
import EditAdditionalLessonDiscountDialog from '@/components/dialogs/EditAdditionalLessonDiscountDialog';
import {
  fetchEarlySignupDiscounts,
  createEarlySignupDiscount,
  updateEarlySignupDiscount,
  deleteEarlySignupDiscount,
  fetchSecondChildDiscount,
  updateSecondChildDiscount,
  fetchAdditionalLessonDiscount,
  updateAdditionalLessonDiscount,
} from '@/lib/api';
import type {
  EarlySignupDiscount,
  SecondChildDiscount,
  AdditionalLessonDiscount,
  EarlySignupDiscountFormData,
  SecondChildDiscountFormData,
  AdditionalLessonDiscountFormData,
} from '@/types/discount';

export default function DiscountsPage() {
  const [earlySignupDiscounts, setEarlySignupDiscounts] = useState<EarlySignupDiscount[]>([]);
  const [secondChildDiscount, setSecondChildDiscount] = useState<SecondChildDiscount | null>(null);
  const [additionalLessonDiscount, setAdditionalLessonDiscount] = useState<AdditionalLessonDiscount | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageSearch, setPageSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [primaryFilter, setPrimaryFilter] = useState('');
  const [secondaryFilter, setSecondaryFilter] = useState('');

  // Dialog states
  const [showEarlySignupDialog, setShowEarlySignupDialog] = useState(false);
  const [showSecondChildDialog, setShowSecondChildDialog] = useState(false);
  const [showAdditionalLessonDialog, setShowAdditionalLessonDialog] = useState(false);
  const [selectedEarlySignup, setSelectedEarlySignup] = useState<EarlySignupDiscount | null>(null);

  useEffect(() => {
    loadDiscounts();
  }, []);

  const loadDiscounts = async () => {
    setLoading(true);
    setError(null);

    try {
      const [earlySignup, secondChild, additionalLesson] = await Promise.all([
        fetchEarlySignupDiscounts(),
        fetchSecondChildDiscount(),
        fetchAdditionalLessonDiscount(),
      ]);

      setEarlySignupDiscounts(earlySignup);
      setSecondChildDiscount(secondChild);
      setAdditionalLessonDiscount(additionalLesson);
    } catch (error: any) {
      console.error('Error loading discounts:', error);
      setError('שגיאה בטעינת ההנחות');
    } finally {
      setLoading(false);
    }
  };

  // Early Sign-Up Handlers
  const handleAddEarlySignup = () => {
    setSelectedEarlySignup(null);
    setShowEarlySignupDialog(true);
  };

  const handleEditEarlySignup = (discount: EarlySignupDiscount) => {
    setSelectedEarlySignup(discount);
    setShowEarlySignupDialog(true);
  };

  const handleSaveEarlySignup = async (data: EarlySignupDiscountFormData) => {
    if (selectedEarlySignup) {
      // Update existing
      await updateEarlySignupDiscount(selectedEarlySignup.id, data);
    } else {
      // Create new
      await createEarlySignupDiscount(data);
    }
  };

  const handleDeleteEarlySignup = async (discount: EarlySignupDiscount) => {
    if (!confirm(`האם אתה בטוח שברצונך למחוק את ההנחה "${discount.name}"?`)) {
      return;
    }

    try {
      await deleteEarlySignupDiscount(discount.id);
      await loadDiscounts();
    } catch (error: any) {
      console.error('Error deleting discount:', error);
      alert('שגיאה במחיקת ההנחה');
    }
  };

  // Second Child Handlers
  const handleEditSecondChild = () => {
    setShowSecondChildDialog(true);
  };

  const handleSaveSecondChild = async (data: SecondChildDiscountFormData) => {
    await updateSecondChildDiscount(data);
  };

  // Additional Lesson Handlers
  const handleEditAdditionalLesson = () => {
    setShowAdditionalLessonDialog(true);
  };

  const handleSaveAdditionalLesson = async (data: AdditionalLessonDiscountFormData) => {
    await updateAdditionalLessonDiscount(data);
  };

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('he-IL', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };

  if (loading) {
    return (
      <AppLayout>
        <PageHeader title="הנחות" />
        <div className="text-center py-12 text-muted-foreground">טוען הנחות...</div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <PageHeader
        title="הנחות"
        description="ניהול הנחות - רישום מוקדם והנחת ילד שני"
      />
      <PageSearchBar
        search={pageSearch}
        onSearchChange={setPageSearch}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
        searchPlaceholder="חיפוש הנחה..."
      />
      <PageFilters
        primaryLabel="עסק / סניף"
        primaryValue={primaryFilter}
        primaryOptions={[]}
        onPrimaryChange={setPrimaryFilter}
        secondaryValue={secondaryFilter}
        secondaryOptions={[]}
        onSecondaryChange={setSecondaryFilter}
      />

      {error && (
        <div className="mb-6 p-4 bg-destructive/10 text-destructive rounded-lg">
          {error}
        </div>
      )}

      <div className="space-y-8">
        {/* Early Sign-Up Discounts Section */}
        <section className="bg-card rounded-lg shadow-sm border border-border">
          <div className="p-6 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Calendar className="w-5 h-5 text-blue-500" />
                  הנחות רישום מוקדם
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  טווחי תאריכים שבהם יינתן הנחה על תשלומים
                </p>
              </div>
              <button
                onClick={handleAddEarlySignup}
                className="btn-primary flex items-center gap-2"
              >
                <Plus className="w-4 h-4" />
                הוסף טווח תאריכים
              </button>
            </div>
          </div>

          <div className="p-6">
            {earlySignupDiscounts.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <Calendar className="w-12 h-12 mx-auto mb-3 opacity-30" />
                <p>אין טווחי תאריכים מוגדרים</p>
                <p className="text-sm mt-1">לחץ על "הוסף טווח תאריכים" להתחיל</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-right py-3 px-4 font-semibold">שם</th>
                      <th className="text-right py-3 px-4 font-semibold">תאריך התחלה</th>
                      <th className="text-right py-3 px-4 font-semibold">תאריך סיום</th>
                      <th className="text-right py-3 px-4 font-semibold">ערך הנחה</th>
                      <th className="text-right py-3 px-4 font-semibold">סטטוס</th>
                      <th className="text-left py-3 px-4 font-semibold">פעולות</th>
                    </tr>
                  </thead>
                  <tbody>
                    {earlySignupDiscounts.map((discount) => (
                      <tr
                        key={discount.id}
                        className="border-b border-border hover:bg-accent/50 transition-colors"
                      >
                        <td className="py-3 px-4">{discount.name}</td>
                        <td className="py-3 px-4">{formatDate(discount.start_date)}</td>
                        <td className="py-3 px-4">{formatDate(discount.end_date)}</td>
                        <td className="py-3 px-4 font-semibold">
                          {discount.value.toFixed(2)} ₪
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              discount.is_active
                                ? 'bg-green-100 text-green-700'
                                : 'bg-gray-100 text-gray-700'
                            }`}
                          >
                            {discount.is_active ? 'פעיל' : 'לא פעיל'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => handleEditEarlySignup(discount)}
                              className="p-2 hover:bg-blue-50 text-blue-600 rounded-lg transition-colors"
                              title="עריכה"
                            >
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => handleDeleteEarlySignup(discount)}
                              className="p-2 hover:bg-red-50 text-red-600 rounded-lg transition-colors"
                              title="מחיקה"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

        {/* Second Child Discount Section */}
        <section className="bg-card rounded-lg shadow-sm border border-border">
          <div className="p-6 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-green-500" />
                  הנחת ילד נוסף
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  הנחה אוטומטית לילד שני ומעלה במשפחה
                </p>
              </div>
              <button
                onClick={handleEditSecondChild}
                className="btn-primary flex items-center gap-2"
              >
                <Pencil className="w-4 h-4" />
                עריכה
              </button>
            </div>
          </div>

          <div className="p-6 bg-gray-50">
            {secondChildDiscount ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white rounded-lg p-6 border border-gray-200">
                    <div className="text-sm text-muted-foreground mb-2">ערך ההנחה</div>
                    <div className="text-3xl font-bold text-green-600">
                      {secondChildDiscount.value.toFixed(2)} ₪
                    </div>
                  </div>

                  <div className="bg-white rounded-lg p-6 border border-gray-200">
                    <div className="text-sm text-muted-foreground mb-2">סטטוס</div>
                    <div>
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                          secondChildDiscount.is_active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {secondChildDiscount.is_active ? 'פעיל' : 'לא פעיל'}
                      </span>
                    </div>
                  </div>
                </div>

               

                {secondChildDiscount.value === 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-900">
                    <p>
                      ⚠️ הערך הנוכחי הוא 0 ₪. במצב זה, ההנחה לא תוחל על ילדים שניים.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                טוען נתונים...
              </div>
            )}
          </div>
        </section>

        {/* Additional Lesson Discount Section */}
        <section className="bg-card rounded-lg shadow-sm border border-border">
          <div className="p-6 border-b border-border">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <DollarSign className="w-5 h-5 text-purple-500" />
                  הנחת שיעור נוסף
                </h2>
                <p className="text-sm text-muted-foreground mt-1">
                  מחיר קבוע לשיעורים נוספים לילד פעיל (שיעור ראשון במחיר מלא)
                </p>
              </div>
              <button
                onClick={handleEditAdditionalLesson}
                className="btn-primary flex items-center gap-2"
              >
                <Pencil className="w-4 h-4" />
                עריכה
              </button>
            </div>
          </div>

          <div className="p-6 bg-gray-50">
            {additionalLessonDiscount ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="bg-white rounded-lg p-6 border border-gray-200">
                    <div className="text-sm text-muted-foreground mb-2">מחיר לשיעור נוסף</div>
                    <div className="text-3xl font-bold text-purple-600">
                      {additionalLessonDiscount.value.toFixed(2)} ₪
                    </div>
                  </div>

                  <div className="bg-white rounded-lg p-6 border border-gray-200">
                    <div className="text-sm text-muted-foreground mb-2">סטטוס</div>
                    <div>
                      <span
                        className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
                          additionalLessonDiscount.is_active
                            ? 'bg-green-100 text-green-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}
                      >
                        {additionalLessonDiscount.is_active ? 'פעיל' : 'לא פעיל'}
                      </span>
                    </div>
                  </div>
                </div>

                {additionalLessonDiscount.value === 0 && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-900">
                    <p>
                      ⚠️ הערך הנוכחי הוא 0 ₪. במצב זה, ההנחה לא תוחל על שיעורים נוספים.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground">
                טוען נתונים...
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Dialogs */}
      {showEarlySignupDialog && (
        <EditEarlySignupDiscountDialog
          isOpen={showEarlySignupDialog}
          onClose={() => setShowEarlySignupDialog(false)}
          onSuccess={loadDiscounts}
          discount={selectedEarlySignup}
          onSave={handleSaveEarlySignup}
        />
      )}

      {showSecondChildDialog && secondChildDiscount && (
        <EditSecondChildDiscountDialog
          isOpen={showSecondChildDialog}
          onClose={() => setShowSecondChildDialog(false)}
          onSuccess={loadDiscounts}
          discount={secondChildDiscount}
          onSave={handleSaveSecondChild}
        />
      )}

      {showAdditionalLessonDialog && additionalLessonDiscount && (
        <EditAdditionalLessonDiscountDialog
          isOpen={showAdditionalLessonDialog}
          onClose={() => setShowAdditionalLessonDialog(false)}
          onSuccess={loadDiscounts}
          discount={additionalLessonDiscount}
          onSave={handleSaveAdditionalLesson}
        />
      )}
    </AppLayout>
  );
}

