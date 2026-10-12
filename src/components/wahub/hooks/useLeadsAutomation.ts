'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { readableError } from '@/lib/apiError';
import { AUTOMATION_TEXT, hebrewOr, withTemplateRow, withTemplateTarget } from '@/lib/wahub/leadsAutomation';
import {
  fetchWahubLeadTemplateOptions,
  fetchWahubLeadTemplates,
  fetchWahubLeadsAutomation,
  setWahubLeadTemplateTarget,
} from '@/lib/wahub/leadsV2Api';
import type { WahubLeadTemplate, WahubLeadTemplateOptions } from '@/types/wahub';

/**
 * The reading and the saving of "הכול אוטומטי"
 * (docs/WAHUB-CONTRACT-LEADS-V2.md, י): how the bot's coming back stands, the
 * wordings with what is connected to each, and the templates the ManyChat
 * account holds. Read by the card in the settings and by the strip on the
 * leads tab — one request, shared.
 */

export const automationKeys = {
  all: ['wahub', 'leads-automation'] as const,
  status: ['wahub', 'leads-automation', 'status'] as const,
  templates: ['wahub', 'leads-automation', 'templates'] as const,
  options: ['wahub', 'leads-automation', 'options'] as const,
};

/** The bot plans every five minutes; the card is read again once a minute while it is on screen. */
const STATUS_INTERVAL_MS = 60_000;
/** A server that has no `leads/automation/` yet is asked again only now and then, in case it was just released. */
const MISSING_INTERVAL_MS = 5 * 60_000;
/** How long "נשמר" stays beside a wording that was just connected or cut off. */
const SAVED_NOTE_MS = 2200;

/**
 * GET leads/automation/. `data === null`: the server has no such endpoint —
 * whoever reads it shows nothing at all (see `fetchWahubLeadsAutomation`).
 */
export function useLeadsAutomation(enabled = true) {
  return useQuery({
    queryKey: automationKeys.status,
    queryFn: fetchWahubLeadsAutomation,
    enabled,
    refetchInterval: (query) => (query.state.data === null ? MISSING_INTERVAL_MS : STATUS_INTERVAL_MS),
    staleTime: 15_000,
    retry: false,
  });
}

/** The wordings, with what is connected to each. */
export function useLeadTemplates(enabled: boolean) {
  return useQuery({
    queryKey: automationKeys.templates,
    queryFn: fetchWahubLeadTemplates,
    enabled,
    staleTime: 30_000,
    retry: false,
  });
}

/** The templates of the ManyChat account — asked for only once the templates are opened. `options: null`: a name is typed in instead. */
export function useLeadTemplateOptions(enabled: boolean) {
  return useQuery({
    queryKey: automationKeys.options,
    queryFn: fetchWahubLeadTemplateOptions,
    enabled,
    staleTime: 5 * 60_000,
    retry: false,
  });
}

export type TemplateSaving = 'connect' | 'disconnect';

export interface TemplateConnect {
  /** Connects a template to a wording; `null` cuts it off. Saved at once. */
  save: (templateKey: string, target: string | null) => Promise<boolean>;
  /** The save that is on its way, by wording. */
  saving: Record<string, TemplateSaving>;
  /** The wordings whose save just landed — each for a moment. */
  saved: Record<string, true>;
  /** Why the last save of a wording was refused, in a Hebrew sentence. */
  errors: Record<string, string>;
  /** Lets go of the refusals on screen — what they said may no longer be so (the account's list was read again). */
  clearErrors: () => void;
}

function without<T>(map: Record<string, T>, key: string): Record<string, T> {
  if (!(key in map)) return map;
  const next = { ...map };
  delete next[key];
  return next;
}

/**
 * Connecting and cutting off, saved the moment it is chosen: shown at once,
 * put back — with the reason, in Hebrew — if the server refuses, and read
 * again from the server whichever way it went (the four lines move with it).
 */
export function useTemplateConnect(): TemplateConnect {
  const queryClient = useQueryClient();
  const [saving, setSaving] = useState<Record<string, TemplateSaving>>({});
  const [saved, setSaved] = useState<Record<string, true>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const inFlight = useRef(new Set<string>());
  const timers = useRef(new Map<string, number>());

  useEffect(() => {
    const held = timers.current;
    return () => {
      for (const timer of held.values()) window.clearTimeout(timer);
      held.clear();
    };
  }, []);

  const save = useCallback(
    async (templateKey: string, target: string | null): Promise<boolean> => {
      if (inFlight.current.has(templateKey)) return false;
      inFlight.current.add(templateKey);
      setSaving((prev) => ({ ...prev, [templateKey]: target === null ? 'disconnect' : 'connect' }));
      setErrors((prev) => without(prev, templateKey));
      setSaved((prev) => without(prev, templateKey));

      // A read that is on its way would put the old list back over the change.
      await queryClient.cancelQueries({ queryKey: automationKeys.templates });
      const before = queryClient.getQueryData<WahubLeadTemplate[]>(automationKeys.templates);
      const options = queryClient.getQueryData<WahubLeadTemplateOptions>(automationKeys.options)?.options;
      if (before) {
        queryClient.setQueryData<WahubLeadTemplate[]>(automationKeys.templates, withTemplateTarget(before, templateKey, target, options));
      }

      try {
        const row = await setWahubLeadTemplateTarget(templateKey, target);
        // The wording as the server now has it: a name that was typed is shown as the template it was matched to.
        if (row) {
          queryClient.setQueryData<WahubLeadTemplate[]>(automationKeys.templates, (current) => (current ? withTemplateRow(current, row) : current));
        }
        setSaved((prev) => ({ ...prev, [templateKey]: true }));
        window.clearTimeout(timers.current.get(templateKey));
        timers.current.set(
          templateKey,
          window.setTimeout(() => {
            timers.current.delete(templateKey);
            setSaved((prev) => without(prev, templateKey));
          }, SAVED_NOTE_MS),
        );
        return true;
      } catch (error) {
        if (before) queryClient.setQueryData(automationKeys.templates, before);
        const fallback = target === null ? AUTOMATION_TEXT.disconnectFailed : AUTOMATION_TEXT.connectFailed;
        setErrors((prev) => ({ ...prev, [templateKey]: hebrewOr(readableError(error, fallback), fallback) }));
        return false;
      } finally {
        inFlight.current.delete(templateKey);
        setSaving((prev) => without(prev, templateKey));
        // The server has the last word: what is connected, and the line that counts the templates. With another
        // save still on its way, its landing is the one that reads — a read in between would show it undone.
        if (inFlight.current.size === 0) {
          void queryClient.invalidateQueries({ queryKey: automationKeys.templates });
          void queryClient.invalidateQueries({ queryKey: automationKeys.status });
        }
      }
    },
    [queryClient],
  );

  const clearErrors = useCallback(() => setErrors({}), []);

  return { save, saving, saved, errors, clearErrors };
}
