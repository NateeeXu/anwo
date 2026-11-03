// useGeolocate — browser geolocation as a tiny state machine (idle → locating → found | error).
//   const geo = useGeolocate(); <Button onClick={geo.locate} loading={geo.status === 'locating'} />
// Errors are mapped to i18n keys (`map.geolocate.*`) so pages just `t(geo.errorKey)`.
import { useCallback, useEffect, useRef, useState } from 'react';

export type GeoPosition = { lat: number; lng: number; accuracyM: number; at: number };
export type GeolocateStatus = 'idle' | 'locating' | 'found' | 'error';
export type UseGeolocate = {
  status: GeolocateStatus;
  position: GeoPosition | null;
  /** i18n key for the last error (`map.geolocate.denied` | `unsupported` | `timeout`) */
  errorKey: string | null;
  supported: boolean;
  locate: (opts?: { highAccuracy?: boolean; timeoutMs?: number }) => Promise<GeoPosition | null>;
  reset: () => void;
};

export function useGeolocate(): UseGeolocate {
  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;
  const [status, setStatus] = useState<GeolocateStatus>('idle');
  const [position, setPosition] = useState<GeoPosition | null>(null);
  const [errorKey, setErrorKey] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  const locate = useCallback(
    (opts: { highAccuracy?: boolean; timeoutMs?: number } = {}) =>
      new Promise<GeoPosition | null>((resolve) => {
        if (!supported) {
          setStatus('error');
          setErrorKey('map.geolocate.unsupported');
          resolve(null);
          return;
        }
        setStatus('locating');
        setErrorKey(null);
        navigator.geolocation.getCurrentPosition(
          (p) => {
            if (!alive.current) return resolve(null);
            const pos = { lat: p.coords.latitude, lng: p.coords.longitude, accuracyM: p.coords.accuracy, at: Date.now() };
            setPosition(pos);
            setStatus('found');
            resolve(pos);
          },
          (err) => {
            if (!alive.current) return resolve(null);
            setStatus('error');
            setErrorKey(err.code === err.TIMEOUT ? 'map.geolocate.timeout' : 'map.geolocate.denied');
            resolve(null);
          },
          { enableHighAccuracy: opts.highAccuracy ?? true, timeout: opts.timeoutMs ?? 10_000, maximumAge: 60_000 },
        );
      }),
    [supported],
  );

  const reset = useCallback(() => {
    setStatus('idle');
    setErrorKey(null);
  }, []);

  return { status, position, errorKey, supported, locate, reset };
}

export default useGeolocate;
