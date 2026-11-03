// Clock with a dev-adjustable offset (POST /api/dev/time). Everything that writes timestamps uses nowIso().
let offsetMs = 0;

export function setTimeOffset(sec: number): void {
  offsetMs = Math.round(sec * 1000);
}
export function getTimeOffsetSec(): number {
  return offsetMs / 1000;
}
export function nowMs(): number {
  return Date.now() + offsetMs;
}
export function nowDate(): Date {
  return new Date(nowMs());
}
/** ISO-8601 UTC with millis — the canonical timestamp format in the DB. */
export function nowIso(): string {
  return nowDate().toISOString();
}
export function isoPlus(ms: number, from: number = nowMs()): string {
  return new Date(from + ms).toISOString();
}
export function daysFromNow(days: number): string {
  return isoPlus(days * 86_400_000);
}
export function todayYmd(timeZone?: string): string {
  const d = nowDate();
  if (!timeZone) return d.toISOString().slice(0, 10);
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  return parts; // en-CA gives YYYY-MM-DD
}
export function localHHMM(timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, hour: '2-digit', minute: '2-digit', hour12: false }).format(nowDate());
}
export const MINUTE = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;
