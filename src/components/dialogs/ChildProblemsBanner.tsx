'use client';

import { AlertCircle } from 'lucide-react';
import type { CustomerProblem } from '@/lib/customerProblems';

/**
 * The strip at the top of the child's card (owner, 6.10.2026): what is wrong,
 * and what to do to put it right. One block per problem, each with the two
 * answers in words — the red is decoration, never the message.
 *
 * Renders nothing when nothing is wrong.
 */
export default function ChildProblemsBanner({ problems }: { problems: ReadonlyArray<CustomerProblem> }) {
  if (problems.length === 0) return null;
  const heading = problems.length === 1
    ? 'יש תקלה אחת שדורשת טיפול'
    : `יש ${problems.length} תקלות שדורשות טיפול`;
  return (
    <section
      aria-labelledby="child-problems-heading"
      className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 p-4"
      dir="rtl"
    >
      <h3 id="child-problems-heading" className="flex items-center gap-2 font-semibold text-red-900">
        <AlertCircle className="h-5 w-5 flex-shrink-0" aria-hidden="true" />
        {heading}
      </h3>
      <ul className="mt-3 space-y-3">
        {problems.map((problem, index) => (
          <li key={`${problem.code}-${index}`} className="rounded-md border border-red-100 bg-white p-3">
            <p className="font-semibold text-gray-900">{problem.title}</p>
            <p className="mt-1 text-sm text-gray-800 break-words">
              <span className="font-semibold">מה קרה: </span>
              {problem.what}
            </p>
            {problem.action && (
              <p className="mt-1 text-sm text-gray-800 break-words">
                <span className="font-semibold">מה לעשות: </span>
                {problem.action}
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
