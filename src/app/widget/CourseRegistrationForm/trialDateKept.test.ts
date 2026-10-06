import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// The date a parent chose for a trial lesson was thrown away between the details
// and the confirmation (6.10.2026: an empty head and "יש לבחור תאריך לשיעור
// הניסיון"). The form reloaded the dates — and cleared the chosen one — whenever
// the *list* of trial lessons it was handed changed, and the widget page made
// that list anew on every draw; since the page began to redraw when the host
// says where the screen ends, every step of the form did it.
//
// There is no browser in these tests to press the buttons in, so the two rules
// that keep the date are held to their words in the source.
const form = readFileSync(new URL('./index.tsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../page.tsx', import.meta.url), 'utf8');

function effectThatLoadsTheDates() {
  const start = form.indexOf("api.get('/customers/widget/lesson-occurrences/'");
  expect(start, 'the form loads the trial dates').toBeGreaterThan(-1);
  const head = form.lastIndexOf('useEffect(() => {', start);
  const tail = form.indexOf('\n  }, [', start);
  const dependencies = form.slice(tail, form.indexOf(']);', tail) + 3);
  return { body: form.slice(head, tail), dependencies };
}

describe('the trial date a parent chose', () => {
  it('is let go only when the lessons themselves change, never when the list is merely new', () => {
    const { body, dependencies } = effectThatLoadsTheDates();

    // This effect is the one that clears the date…
    expect(body).toContain("setTrialLessonDate('')");
    // …and it must hang on what the lessons are (their ids, as text), not on the array.
    expect(dependencies).toBe('\n  }, [isTrial, lessonId, trialLessonIdsKey]);');
    expect(body).not.toMatch(/\btrialLessonOptions\b/);
    expect(body).not.toMatch(/\btrialLessonIds\b(?!Key)/);
  });

  it('is cleared nowhere else but there and in the choice itself', () => {
    const clears = form.match(/setTrialLessonDate\(''\)/g) ?? [];
    // Twice inside the loading effect: no lessons at all, and lessons that changed.
    expect(clears.length).toBe(2);
  });

  it('gets one list of trial lessons from the page for as long as the opened class is the same', () => {
    expect(page).toMatch(
      /const drawerTrialLessons = useMemo\(\s*\(\) => \(drawerLesson \? \[\] : trialLessonChoices\(drawerBundle\)\),\s*\[drawerLesson, drawerBundle\],\s*\);/,
    );
    expect(page).toContain('trialLessonOptions={drawerTrialLessons}');
    // Never built in the markup again: that is a new list on every draw.
    expect(page).not.toMatch(/trialLessonOptions=\{[^}]*trialLessonChoices\(/);
  });
});
