'use client';

import PageHeader from '@/components/PageHeader';

import styles from './page.module.css';

export default function ManualPage() {
  return (
    <>
      <PageHeader
        title="ספר-מערכת"
        description="לוגיקות עסקיות ומילון מונחים כפי שהם מוגדרים בפועל במערכת"
      />

      <div className={styles.container}>
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>לוגיקות מערכת</h2>
          <div className={styles.card}>
            <div className={styles.logicItem}>
              <h3 className={styles.logicTitle}>תזמון חיוב על הרשמה לחוג</h3>
              <div className={styles.logicBody}>
                למערכת יש תאריך הגדרה (הניתן לשינוי) שממנו ואילך חיובי המנוי החודשי חוזרים לפעול
                כרגיל. כל עוד התאריך הזה עדיין לא הגיע, הרשמה חדשה לחוג מחייבת מיידית{' '}
                <strong>רק את דמי הרישום</strong> — לא את מחיר החוג עצמו. מרגע שהתאריך המוגדר
                מגיע, המנוי החודשי מתחיל להיגבות במחיר המלא, ללא חישוב יחסי (פרורציה) עבור חודש
                ההרשמה.
                <ul>
                  <li>דמי הרישום נגבים תמיד באופן מיידי בעת ההרשמה, בלי קשר לתקופת הדחייה.</li>
                  <li>
                    בהרשמה למסלול משולב (&quot;פעמיים בשבוע&quot; וכדומה) דמי הרישום נגבים פעם
                    אחת בלבד עבור כל המסלול, ולא פעם אחת לכל שיעור בנפרד.
                  </li>
                  <li>
                    לאחר שהחיוב החודשי מתחיל לפעול, הוא נגבה אוטומטית בכל חודש בתאריך ה-1, על ידי
                    תהליך רקע יומי שבודק אילו מנויים הגיעו לתאריך החיוב הבא שלהם.
                  </li>
                  <li>
                    חיוב שנכשל מעביר את סטטוס הילד ל&quot;בעיות באשראי&quot;; חיוב שהצליח מעביר
                    אותו ל&quot;פעיל&quot; ומעדכן את התאריך שעד אליו שולם.
                  </li>
                </ul>
              </div>
            </div>

            <div className={styles.logicItem}>
              <h3 className={styles.logicTitle}>מנגנון ההנחות</h3>
              <div className={styles.logicBody}>
                קיימים שלושה סוגי הנחות מובנים במערכת, שכל אחד מהם מוגדר כרשומת הנחה בניהול
                (הטווחים והסכומים המדויקים ניתנים לעריכה על ידי הצוות):
                <ul>
                  <li>
                    <strong>הנחת רישום מוקדם</strong> — חלה כאשר תאריך התשלום נופל בתוך טווח
                    התאריכים שהוגדר להנחה.
                  </li>
                  <li>
                    <strong>הנחת ילד שני</strong> — חלה כאשר בילד אחר באותה משפחה יש כבר הרשמה
                    פעילה לחוג שאינה שיעור ניסיון בלבד. הרשמה של אח/אחות שעדיין רק ניסה/תה שיעור
                    ניסיון אינה מזכה בהנחה זו.
                  </li>
                  <li>
                    <strong>הנחת שיעור נוסף</strong> — חלה רק על ילד שסטטוסו &quot;פעיל&quot; ויש
                    לו לפחות שתי הרשמות פעילות, על כל הרשמה שאינה ההרשמה הראשונה שלו (לפי סדר
                    ההרשמה). הנחה זו גוברת על כל הנחה אחרת כאשר היא רלוונטית.
                  </li>
                </ul>
                כאשר יש כמה הנחות רלוונטיות יחד, הנחת שיעור נוסף נבדקת ראשונה; לאחריה הנחת רישום
                מוקדם והנחת ילד שני, שכל אחת מהן עשויה לקבוע מחיר סופי קבוע; אם אף אחת מהן לא
                קובעת מחיר סופי, שאר ההנחות מצטברות זו לצד זו (ולא יורדות מתחת ל-0 ₪).
              </div>
            </div>

            <div className={styles.logicItem}>
              <h3 className={styles.logicTitle}>שכר מדריכים</h3>
              <div className={styles.logicBody}>
                לכל מדריך מוגדר מודל שכר מאחד משני סוגים:
                <ul>
                  <li>
                    <strong>שכר קבוע לשיעור</strong> — המדריך מקבל סכום קבוע לכל שיעור, ללא קשר
                    למספר התלמידים הרשומים (גם אם אין אף תלמיד).
                  </li>
                  <li>
                    <strong>מדורג לפי תלמידים</strong> — הסכום נקבע לפי מדרגות שהוגדרו מראש, בהתאם
                    למספר התלמידים הרשומים בפועל. גם כאן, מדריך משויך לשיעור מקבל תשלום על פי
                    המדרגה הנמוכה ביותר גם אם אין תלמידים רשומים.
                  </li>
                </ul>
                ניתן להגדיר חריגה ידנית לשכר על שיעור ספציפי, שגוברת על שני המודלים הללו. בנוסף,
                לחוג שלם ניתן להגדיר שכר חודשי קבוע (נפרד מהתשלום לפי שיעור).
                <br />
                נתוני השכר החודשיים &quot;ננעלים&quot; (מסוכמים סופית) אוטומטית באחד לכל חודש,
                עבור החודש הקודם — לאחר הנעילה הם נחשבים לרשומה היסטורית קבועה ואינם משתנים.
              </div>
            </div>

            <div className={styles.logicItem}>
              <h3 className={styles.logicTitle}>סטטוס ילד</h3>
              <div className={styles.logicBody}>
                לכל ילד יש אחד מ-8 סטטוסים אפשריים. חלקם מתעדכנים אוטומטית על ידי המערכת, וחלקם
                מוגדרים ידנית על ידי הצוות:
                <ul>
                  <li>
                    <strong>פעיל</strong> — מתעדכן אוטומטית לאחר חיוב מנוי מוצלח (ראשוני או
                    חודשי).
                  </li>
                  <li>
                    <strong>בעיות באשראי</strong> — מתעדכן אוטומטית כאשר חיוב כרטיס אשראי (ראשוני
                    או חודשי) נכשל.
                  </li>
                  <li>
                    <strong>נרשם לניסיון</strong> — מתעדכן אוטומטית כאשר משפחה קובעת שיעור ניסיון.
                  </li>
                  <li>
                    <strong>ביצע ניסיון</strong> — מתעדכן אוטומטית לאחר שתאריך שיעור הניסיון עבר.
                  </li>
                  <li>
                    <strong>רפאים</strong> — נקבע רק דרך פעולה ייעודית ליצירת &quot;ילד רפאים&quot;
                    — רישום מהיר וחלקי של ילד ישירות לשיעור, ללא תהליך הרשמה מלא. ילד רפאים מוצג
                    בלוח הזמנים רק אם נוצר עד 30 יום לפני מועד השיעור.
                  </li>
                  <li>
                    <strong>בתהליך רישום</strong> — הסטטוס ההתחלתי של כל ילד חדש.
                  </li>
                  <li>
                    <strong>לא שולם</strong> ו<strong>לא פעיל</strong> — אלו הסטטוסים היחידים
                    שאין להם עדכון אוטומטי ידוע במערכת; הם נקבעים על ידי הצוות ידנית.
                  </li>
                </ul>
              </div>
            </div>

            <div className={styles.logicItem}>
              <h3 className={styles.logicTitle}>תמחור מדורג לפי מספר חוגים</h3>
              <div className={styles.logicBody}>
                ניתן להגדיר לשיעור מחירים שונים בהתאם למספר החוגים שהילד רשום אליהם באותה
                משפחה/תקופה (למשל: מחיר מוזל לחוג השני או השלישי של אותו ילד). ההגדרה נעשית לפי
                &quot;מדרגות&quot; — כל מדרגה חלה גם על כל החוגים הבאים אחריה, אלא אם הוגדרה
                עבורם מדרגה גבוהה יותר במפורש.
              </div>
            </div>

            <div className={styles.logicItem}>
              <h3 className={styles.logicTitle}>ביטול שיעור מול היעדרות ילד</h3>
              <div className={styles.logicBody}>
                אלו שני מושגים שונים שקל לבלבל ביניהם:
                <ul>
                  <li>
                    <strong>ביטול שיעור</strong> — מבטל תאריך מסוים של שיעור קבוע עבור{' '}
                    <strong>כל</strong> הילדים הרשומים אליו (למשל בשל חג או היעדרות המדריך). פעולה
                    זו נעשית על ידי הצוות.
                  </li>
                  <li>
                    <strong>היעדרות ילד</strong> — מתעד שילד <strong>מסוים</strong> נעדר משיעור
                    ספציפי בתאריך מסוים, לצורך מעקב נוכחות וניתוח.
                  </li>
                </ul>
              </div>
            </div>

            <div className={styles.logicItem}>
              <h3 className={styles.logicTitle}>מסלול משולב (&quot;פעמיים בשבוע&quot;)</h3>
              <div className={styles.logicBody}>
                חוג יכול להציע &quot;מסלול משולב&quot; — חבילה של שני שיעורים שבועיים או יותר
                (למשל ראשון + רביעי) הנמכרים יחד במחיר כולל אחד, בדרך כלל נמוך יותר מסכום שני
                המחירים בנפרד. הרשמה למסלול יוצרת הרשמה נפרדת עבור כל שיעור במסלול, כאשר המחיר
                הכולל מתחלק שווה בשווה בין השיעורים לצורך הנהלת חשבונות ושכר מדריכים. דמי הרישום
                נגבים פעם אחת בלבד עבור כל המסלול.
              </div>
            </div>

            <div className={styles.logicItem}>
              <h3 className={styles.logicTitle}>&quot;מחוייב בכל השיעורים&quot;</h3>
              <div className={styles.logicBody}>
                תכונה שמסומנת ברמת החוג, בעת יצירתו או עריכתו. כאשר היא מסומנת:
                <ul>
                  <li>
                    בקטלוג הציבורי (הווידג&apos;ט) לא מוצגים השיעורים הבודדים של החוג לבחירה
                    בנפרד — ניתן להירשם רק ל&quot;מסלול משולב&quot; שכולל את כל שיעורי החוג יחד,
                    ולא לשיעור אחד מתוכו.
                  </li>
                  <li>
                    בפועל, המשמעות היא שחוג כזה מיועד להרשמה לכל המפגשים השבועיים שלו כמכלול
                    אחד (למשל חוג הדורש נוכחות בשני מפגשים בשבוע ולא מאפשר להירשם רק לאחד מהם).
                  </li>
                </ul>
              </div>
            </div>

            <div className={styles.logicItem}>
              <h3 className={styles.logicTitle}>לקוח 18+ / הרשמה עצמית</h3>
              <div className={styles.logicBody}>
                הסימון &quot;18+&quot; הוא תכונה של החוג עצמו (לא מחושב לפי גיל הילד/הלקוח). כאשר
                חוג מסומן כך, טופס ההרשמה בווידג&apos;ט הציבורי מציג אפשרות &quot;אני נרשם/ת עבור
                עצמי&quot; — סימון האפשרות משתמש בפרטי ההורה/הנרשם (שם ות.ז.) גם עבור פרטי
                &quot;הילד&quot; במערכת, כך שלא נדרש למלא אותם פעמיים.
              </div>
            </div>

            <div className={styles.logicItem}>
              <h3 className={styles.logicTitle}>סניף חיצוני</h3>
              <div className={styles.logicBody}>
                לכל סניף יש סימון &quot;סניף חיצוני&quot; עם אפשרות לקישור חיצוני משויך. ההשפעה
                הידועה היחידה של הסימון הזו במערכת היא קביעת קישור ההרשמה שמוצג לחוגים באותו
                סניף (וניתן לקבוע קישור שונה גם לחוג ספציפי בתוך הסניף). אין לוגיקה נוספת ידועה
                (כגון תשלום או תזמון שונה) המבוססת על סימון זה.
              </div>
              <div className={styles.note}>
                הערה: אם ידוע לצוות על התנהגות נוספת של &quot;סניף חיצוני&quot; שלא מופיעה כאן, יש
                לעדכן את דף זה בהתאם.
              </div>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>מילון מונחים</h2>
          <div className={styles.card}>
            <div className={styles.glossaryGrid}>
              <div className={styles.termRow}>
                <span className={styles.termName}>סניף חיצוני</span>
                <span className={styles.termDef}>
                  סניף המסומן ככזה, עם קישור הרשמה חיצוני משלו המוצג במקום טופס ההרשמה הרגיל.
                </span>
              </div>
              <div className={styles.termRow}>
                <span className={styles.termName}>מחוייב בכל השיעורים</span>
                <span className={styles.termDef}>
                  סימון ברמת החוג הקובע שלא ניתן להירשם לשיעור בודד ממנו בנפרד — ההרשמה בווידג
                  &apos;ט מוצעת רק כמסלול משולב הכולל את כל שיעורי החוג יחד.
                </span>
              </div>
              <div className={styles.termRow}>
                <span className={styles.termName}>לקוח 18+</span>
                <span className={styles.termDef}>
                  חוג המיועד למבוגרים, המאפשר לנרשם להירשם באמצעות פרטיו האישיים ולא כהורה של ילד.
                </span>
              </div>
              <div className={styles.termRow}>
                <span className={styles.termName}>חוג (Course) / שיעור (Lesson)</span>
                <span className={styles.termDef}>
                  &quot;חוג&quot; הוא ההצעה הכללית (שם, מחיר, גיל, מדריך). &quot;שיעור&quot; הוא
                  מפגש שבועי קבוע ספציפי (יום, שעה, חדר) השייך לחוג — לחוג אחד יכולים להיות כמה
                  שיעורים.
                </span>
              </div>
              <div className={styles.termRow}>
                <span className={styles.termName}>הרשמה (LessonEnrollment)</span>
                <span className={styles.termDef}>
                  רישום פעיל של ילד לשיעור ספציפי — הטבלה הנוכחית והפעילה. קיימת גם טבלה ישנה
                  ומיושנת ברמת החוג שאינה בשימוש להרשמות חדשות.
                </span>
              </div>
              <div className={styles.termRow}>
                <span className={styles.termName}>מנוי מלא מול מסלול משולב</span>
                <span className={styles.termDef}>
                  &quot;מנוי מלא&quot; הוא הרשמה רגילה לשיעור בודד במחיר החוג. &quot;מסלול
                  משולב&quot; הוא חבילה של שני שיעורים או יותר הנמכרים יחד במחיר כולל אחד.
                </span>
              </div>
              <div className={styles.termRow}>
                <span className={styles.termName}>סטטוסי ילד</span>
                <span className={styles.termDef}>
                  פעיל, נרשם לניסיון, ביצע ניסיון, בעיות באשראי, לא שולם, בתהליך רישום, רפאים,
                  לא פעיל — ראו הרחבה בסעיף &quot;סטטוס ילד&quot; למעלה.
                </span>
              </div>
              <div className={styles.termRow}>
                <span className={styles.termName}>שכר קבוע לשיעור / מדורג לפי תלמידים</span>
                <span className={styles.termDef}>
                  שני מודלי השכר האפשריים למדריך: תשלום קבוע ללא תלות במספר תלמידים, או תשלום
                  לפי מדרגות מספר תלמידים.
                </span>
              </div>
              <div className={styles.termRow}>
                <span className={styles.termName}>דמי רישום</span>
                <span className={styles.termDef}>
                  סכום חד-פעמי לכל ילד, נגבה פעם אחת בהרשמה הראשונה בלבד (גם אם נרשם
                  לכמה חוגים), בנפרד מהמנוי החודשי עצמו.
                </span>
              </div>
              <div className={styles.termRow}>
                <span className={styles.termName}>סניף / חדר / שיוך מדריך לסניף</span>
                <span className={styles.termDef}>
                  &quot;סניף&quot; הוא מיקום הפעילות; &quot;חדר&quot; הוא חלל בתוך סניף שבו מתקיים
                  שיעור. מדריך יכול להיות משויך לכמה סניפים, בנוסף לסניף הבית העיקרי שלו.
                </span>
              </div>
              <div className={styles.termRow}>
                <span className={styles.termName}>מלאי מוצר רגיל מול מלאי לפי מידה</span>
                <span className={styles.termDef}>
                  מוצר בחנות יכול לנהל כמות מלאי אחת פשוטה, או להתחלק למידות שונות שלכל אחת מהן
                  כמות מלאי נפרדת — הכמות הכוללת של המוצר מחושבת אז אוטומטית מסכום המידות.
                </span>
              </div>
              <div className={styles.termRow}>
                <span className={styles.termName}>ביטול שיעור מול היעדרות ילד</span>
                <span className={styles.termDef}>
                  &quot;ביטול שיעור&quot; מבטל מפגש שלם לכל הנרשמים. &quot;היעדרות ילד&quot; מתעדת
                  שילד מסוים לא הגיע למפגש מסוים, ואינה מבטלת אותו עבור אחרים.
                </span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </>
  );
}
