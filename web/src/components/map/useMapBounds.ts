import { useCallback, useEffect, useRef, useState } from 'react';
import { bboxToParam, type Bbox } from '@/lib/geo';

export type UseMapBoundsOptions = {
  /** Debounce for pan/zoom bursts (ms). Default 250. */
  debounceMs?: number;
  /** Starting bbox (e.g. parsed from the URL). */
  initial?: Bbox | null;
};

export type UseMapBounds = {
  bbox: Bbox | null;
  zoom: number | null;
  /** Serialised `minLng,minLat,maxLng,maxLat` for list endpoints, `undefined` until the map reports. */
  bboxParam: string | undefined;
  /** Pass straight to `<MapView onBoundsChange>`. */
  onBoundsChange: (bbox: Bbox, zoom: number) => void;
  /** True after the user moved the map away from the initial framing (drives 「在此区域搜索」). */
  moved: boolean;
  /** Mark the current bounds as the new baseline (after a "search this area" click). */
  commit: () => void;
  reset: () => void;
};

/**
 * Tracks the viewport of a MapView with debounce, so a browse page can run
 * `GET /api/listings?bbox=…` without re-querying on every animation frame.
 */
export function useMapBounds({ debounceMs = 250, initial = null }: UseMapBoundsOptions = {}): UseMapBounds {
  const [state, setState] = useState<{ bbox: Bbox | null; zoom: number | null }>({ bbox: initial, zoom: null });
  const [moved, setMoved] = useState(false);
  const timer = useRef<number | null>(null);
  const first = useRef(true);

  useEffect(() => () => { if (timer.current) window.clearTimeout(timer.current); }, []);

  const onBoundsChange = useCallback(
    (bbox: Bbox, zoom: number) => {
      if (timer.current) window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        setState({ bbox, zoom });
        if (first.current) first.current = false;
        else setMoved(true);
      }, debounceMs);
    },
    [debounceMs],
  );

  const commit = useCallback(() => setMoved(false), []);
  const reset = useCallback(() => {
    first.current = true;
    setMoved(false);
    setState({ bbox: initial, zoom: null });
  }, [initial]);

  return { bbox: state.bbox, zoom: state.zoom, bboxParam: state.bbox ? bboxToParam(state.bbox) : undefined, onBoundsChange, moved, commit, reset };
}

export default useMapBounds;
