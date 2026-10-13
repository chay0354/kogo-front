'use client';

import type { WahubLeadsView, WahubQueue, WahubStatus } from '@/types/wahub';
import type { WahubLiveHandle } from '../hooks/useWahubLive';
import LegacyLeadsTab from './LegacyLeadsTab';
import LeadsScreen, { type LeadsAddress } from './v2/LeadsScreen';
import { isOldServer, useLeadsList } from './v2/useLeads';

interface LeadsTabProps {
  /** The tab is the one on screen. Out of view it keeps what it has and reads nothing. */
  active: boolean;
  live: WahubLiveHandle;
  /** Which of the three lists is in front: waiting for the office, the bot's, or the closed ones. */
  owner: WahubLeadsView;
  /** The lead state the list is narrowed to (or, on a server from before, the state the board is open on). */
  stage: string | null;
  /** The lead whose details are open. */
  leadId: number | null;
  /** The full waiting list stands in place of the lists (only the list of version 2 has it). */
  waiting?: boolean;
  status: WahubStatus | undefined;
  onAddress: (patch: LeadsAddress) => void;
  onOpenChat: (id: number) => void;
  /** To the card "חזרה אוטומטית ללידים" in the settings (the strip at the head of "הבוט מטפל"). */
  onOpenAutomation?: () => void;
  // --- only the screens from before read these ---
  queue: WahubQueue;
  onQueue: (queue: WahubQueue) => void;
  onStage: (stage: string | null) => void;
  onOpenSettings: () => void;
}

/**
 * The leads tab. On a server that has `leads/` it is the list of version 2
 * (docs/WAHUB-CONTRACT-LEADS-V2.md, ה): who waits for the office, who the bot
 * is handling, and the details of a lead a press away. On a server that does
 * not have it yet — 404 — it is the board it was before, untouched, so this
 * screen can be released ahead of the server without breaking anything.
 */
export default function LeadsTab({
  active,
  live,
  owner,
  stage,
  leadId,
  waiting = false,
  status,
  onAddress,
  onOpenChat,
  onOpenAutomation,
  queue,
  onQueue,
  onStage,
  onOpenSettings,
}: LeadsTabProps) {
  // The same read the screen itself makes (one request, shared): its first answer says which server this is.
  const probe = useLeadsList(owner, null, '', active);

  if (isOldServer(probe.data)) {
    return (
      <LegacyLeadsTab
        active={active}
        live={live}
        queue={queue}
        stage={stage}
        status={status}
        onQueue={onQueue}
        onStage={onStage}
        onOpenChat={onOpenChat}
        onOpenSettings={onOpenSettings}
      />
    );
  }

  return (
    <LeadsScreen
      active={active}
      live={live}
      view={owner}
      stage={stage}
      leadId={leadId}
      waiting={waiting}
      status={status}
      onAddress={onAddress}
      onOpenChat={onOpenChat}
      onOpenAutomation={onOpenAutomation}
    />
  );
}
