/** Lightweight async request hook (docs/05「新增工程件」).
 *
 * Usage:
 *   const { data, loading, error, refetch } = useApi(() => fetchUsers({ dept }));
 *
 * Avoids introducing a heavyweight state-management dependency for the few
 * pages that need request lifecycle tracking beyond what the resource layer
 * already exposes via async/await idioms.
 */

import { useState, useCallback, useEffect, useRef } from 'react';

export interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useApi<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
): UseApiState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const depsKey = JSON.stringify(deps);
  const isMounted = useRef(true);

  const execute = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await fetcher());
    } catch (err: unknown) {
      if (isMounted.current) {
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      if (isMounted.current) setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey]);

  useEffect(() => {
    isMounted.current = true;
    execute();
    return () => { isMounted.current = false; };
  }, [execute]);

  return { data, loading, error, refetch: execute };
}
