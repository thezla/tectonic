import { useEffect, useState } from 'react';

import type { DiscoveryMatch } from '../../shared/api.js';
import { loadDiscoveredMatches } from '../api.js';

export function useDiscovery() {
  const [lanDiscoveryEnabled, setLanDiscoveryEnabled] = useState(true);
  const [discoveredMatches, setDiscoveredMatches] = useState<DiscoveryMatch[]>([]);

  useEffect(() => {
    let cancelled = false;
    let timeoutId: number | null = null;

    async function refresh() {
      try {
        const payload = await loadDiscoveredMatches();

        if (cancelled) {
          return;
        }

        setLanDiscoveryEnabled(payload.enabled !== false);
        setDiscoveredMatches(payload.matches ?? []);

        if (payload.enabled !== false) {
          timeoutId = window.setTimeout(refresh, 2000);
        }
      } catch (error) {
        console.error(error);

        if (!cancelled) {
          timeoutId = window.setTimeout(refresh, 2000);
        }
      }
    }

    void refresh();

    return () => {
      cancelled = true;

      if (timeoutId !== null) {
        clearTimeout(timeoutId);
      }
    };
  }, []);

  return { lanDiscoveryEnabled, discoveredMatches };
}
