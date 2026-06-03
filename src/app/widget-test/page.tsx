'use client';

export default function WidgetTestPage() {
  return (
    <div className="min-h-screen bg-gray-100" dir="rtl">
      {/* Mock studio website header */}
      <header className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-purple-500 flex items-center justify-center text-white font-bold text-lg">
            א
          </div>
          <div>
            <div className="font-bold text-gray-800 text-lg">אולפן הריקוד שלנו</div>
            <div className="text-sm text-gray-500">סטודיו לריקוד ואמנויות במה לילדים</div>
          </div>
          <nav className="mr-auto flex gap-6 text-sm text-gray-600">
            <a href="#" className="hover:text-purple-600">ראשי</a>
            <a href="#" className="hover:text-purple-600">אודות</a>
            <a href="#" className="hover:text-purple-600 font-medium text-purple-600">חוגים</a>
            <a href="#" className="hover:text-purple-600">צור קשר</a>
          </nav>
        </div>
      </header>

      {/* Mock page content above widget */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">החוגים שלנו</h1>
          <p className="text-gray-600">
            ברוכים הבאים לסטודיו! בחרו את החוג המתאים לילד שלכם והירשמו ישירות מכאן.
          </p>
        </div>

        {/* Widget iframe */}
        <div className="bg-white rounded-2xl shadow-md overflow-hidden border border-gray-200">
          <iframe
            src="/widget"
            width="100%"
            height="800"
            style={{ border: 'none', display: 'block' }}
            title="רישום לחוגים"
          />
        </div>

        {/* Caption */}
        <p className="mt-4 text-center text-sm text-gray-400">
          טופס הרישום מופעל על ידי מערכת קוגומלו ·{' '}
          <a href="#" className="underline hover:text-gray-600">מדיניות פרטיות</a>
        </p>
      </main>

      {/* Mock footer */}
      <footer className="mt-16 bg-gray-800 text-gray-400 text-sm text-center py-6">
        © 2025 אולפן הריקוד שלנו · כל הזכויות שמורות
      </footer>
    </div>
  );
}
