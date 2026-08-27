'use client';

import { useEffect, useRef } from 'react';
import api from '@/lib/api';

/**
 * Dev-only: alerts once per page load with which backend .env file is active
 * and which Tranzila terminal will actually charge a card. The backend
 * endpoint 404s whenever DEBUG is off, so this silently no-ops in any
 * deployed environment even if this component ships in the production bundle.
 */
export function DevEnvAlert() {
  const hasAlerted = useRef(false);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development' || hasAlerted.current) {
      return;
    }
    hasAlerted.current = true;

    api
      .get('/core/devops/env-info/')
      .then(({ data }) => {
        window.alert(
          `קובץ env פעיל: ${data.active_env_file}\n` +
          `טרמינל iframe: ${data.tranzila_iframe_terminal}\n` +
          `טרמינל חיוב בפועל (production()): ${data.tranzila_charge_terminal}`
        );
      })
      .catch(() => {
        // Backend not running / DEBUG off / unreachable — stay silent, this is a dev convenience only.
      });
  }, []);

  return null;
}
