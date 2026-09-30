'use client';

import {
  DELIVERY_CHIP_CLASSES,
  deliveryChip,
  NO_STORED_ORIGINAL_NOTE,
  type DocumentDeliveryStatus,
} from '@/lib/documentDelivery';

/**
 * How a document's signed original reached the customer, as a chip, with the
 * when-or-why under it. A document with no stored original shows a dash whose
 * title says so. `compact` keeps the note in the title only, for tight tables.
 */
export default function DeliveryChip({
  status,
  compact = false,
}: {
  status: DocumentDeliveryStatus | null | undefined;
  compact?: boolean;
}) {
  const view = deliveryChip(status);
  if (!view) {
    return (
      <span className="text-muted-foreground" title={NO_STORED_ORIGINAL_NOTE}>
        <span aria-hidden="true">—</span>
        <span className="sr-only">{NO_STORED_ORIGINAL_NOTE}</span>
      </span>
    );
  }
  return (
    <span className="inline-flex flex-col items-start gap-0.5">
      <span
        className={`inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${DELIVERY_CHIP_CLASSES[view.tone]}`}
        title={view.note || undefined}
      >
        {view.label}
      </span>
      {!compact && view.note && (
        <span className="max-w-[14rem] text-[11px] leading-snug text-muted-foreground">{view.note}</span>
      )}
    </span>
  );
}
