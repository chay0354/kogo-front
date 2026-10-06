'use client';

import { useId, useLayoutEffect, useRef, useState } from 'react';
import { AlertCircle, ChevronDown, X } from 'lucide-react';
import {
  groupProblemsByTitle,
  problemTextLines,
  type CustomerProblem,
  type ProblemTextLine,
  type ProblemTextPart,
} from '@/lib/customerProblems';

function Parts({ parts }: { parts: ProblemTextPart[] }) {
  return (
    <>
      {parts.map((part, index) => (
        part.bold
          ? <strong key={index} className="font-bold text-gray-950">{part.text}</strong>
          : <span key={index}>{part.text}</span>
      ))}
    </>
  );
}

/** A problem's text: plain lines as paragraphs, list lines as one list. */
function ProblemText({ text }: { text: string }) {
  const blocks: Array<{ list: boolean; lines: ProblemTextLine[] }> = [];
  for (const line of problemTextLines(text)) {
    const last = blocks[blocks.length - 1];
    if (last && last.list === line.item) last.lines.push(line);
    else blocks.push({ list: line.item, lines: [line] });
  }
  return (
    <div className="space-y-1.5 break-words text-sm leading-relaxed text-gray-800">
      {blocks.map((block, index) => (
        block.list ? (
          <ul key={index} className="list-disc space-y-1 ps-5 marker:text-gray-400">
            {block.lines.map((line, row) => (
              <li key={row}><Parts parts={line.parts} /></li>
            ))}
          </ul>
        ) : (
          block.lines.map((line, row) => (
            <p key={`${index}-${row}`}><Parts parts={line.parts} /></p>
          ))
        )
      ))}
    </div>
  );
}

/**
 * The strip at the top of the child's card (owner, 6.10.2026): what is wrong
 * with this child, by title alone. Pressing a title opens a bubble under it —
 * what happened, and what to do. Every problem written out in full was too
 * much to meet on opening a card.
 *
 * A title is words and an icon, never the colour alone. Renders nothing when
 * nothing is wrong.
 */
export default function ChildProblemsBanner({ problems }: { problems: ReadonlyArray<CustomerProblem> }) {
  const [openTitle, setOpenTitle] = useState<string | null>(null);
  const [caretLeft, setCaretLeft] = useState<number | null>(null);
  const chips = useRef<Record<string, HTMLButtonElement | null>>({});
  const bubbleId = useId();

  const groups = groupProblemsByTitle(problems);
  const open = groups.find((group) => group.title === openTitle) ?? null;

  // The bubble's tail sits under the title that opened it.
  useLayoutEffect(() => {
    const chip = openTitle ? chips.current[openTitle] : null;
    setCaretLeft(chip ? chip.offsetLeft + chip.offsetWidth / 2 - 6 : null);
  }, [openTitle, problems]);

  if (groups.length === 0) return null;

  return (
    <section aria-label="תקלות שדורשות טיפול" className="relative mx-6 mt-3" dir="rtl">
      <div className="flex flex-wrap items-center gap-2">
        {groups.map((group) => {
          const isOpen = open?.title === group.title;
          return (
            <button
              key={group.title}
              type="button"
              ref={(element) => { chips.current[group.title] = element; }}
              aria-expanded={isOpen}
              aria-controls={bubbleId}
              onClick={() => setOpenTitle(isOpen ? null : group.title)}
              className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-semibold transition-colors ${
                isOpen
                  ? 'border-red-600 bg-red-600 text-white'
                  : 'border-red-300 bg-red-50 text-red-800 hover:bg-red-100'
              }`}
            >
              <AlertCircle className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
              <span>{group.title}</span>
              {group.problems.length > 1 && (
                <span
                  className={`rounded-full px-1.5 text-xs font-bold ${isOpen ? 'bg-white text-red-700' : 'bg-red-600 text-white'}`}
                  aria-label={`${group.problems.length} מקרים`}
                >
                  {group.problems.length}
                </span>
              )}
              <ChevronDown
                className={`h-4 w-4 flex-shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
          );
        })}
      </div>

      {open && (
        <div
          id={bubbleId}
          role="region"
          aria-label={open.title}
          className="relative mt-3 rounded-2xl border border-red-200 bg-white p-4 shadow-lg"
        >
          {caretLeft !== null && (
            <span
              aria-hidden="true"
              className="absolute -top-[7px] h-3 w-3 rotate-45 border-l border-t border-red-200 bg-white"
              style={{ left: caretLeft }}
            />
          )}
          <div className="flex items-start justify-between gap-3">
            <p className="font-bold text-gray-950">{open.title}</p>
            <button
              type="button"
              onClick={() => setOpenTitle(null)}
              aria-label="סגירת הפרטים"
              className="-m-1 flex-shrink-0 rounded-full p-1 text-gray-500 hover:bg-gray-100 hover:text-gray-800"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {open.problems.map((problem, index) => (
            <div
              key={`${problem.code}-${index}`}
              className={index > 0 ? 'mt-4 border-t border-gray-200 pt-4' : 'mt-3'}
            >
              <p className="mb-1 text-xs font-bold text-red-700">מה קרה</p>
              <ProblemText text={problem.what} />
              {problem.action && (
                <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                  <p className="mb-1 text-xs font-bold text-emerald-800">מה עושים</p>
                  <ProblemText text={problem.action} />
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
