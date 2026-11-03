// Shared label / icon maps for the map module (POI categories, layer chips).
import { Banknote, Building2, Bus, Cross, Dumbbell, Home, Landmark, Library, Mailbox, MapPin, Pill, ShoppingBasket, ShoppingCart, Soup, Store, TrainFront, Users, type LucideIcon } from 'lucide-react';
import type { PoiCategory } from '@shared/enums';
import type { MapLayer } from '@shared/schemas/map';

export const POI_ICONS: Record<PoiCategory, LucideIcon> = {
  building: Building2,
  library: Library,
  dining: Soup,
  grocery: ShoppingCart,
  asian_grocery: ShoppingBasket,
  transit: TrainFront,
  gym: Dumbbell,
  health: Cross,
  bank: Banknote,
  pharmacy: Pill,
  post: Mailbox,
  landmark: Landmark,
  other: MapPin,
};

export const LAYER_ICONS: Record<MapLayer, LucideIcon> = {
  listings: Home,
  items: Store,
  buddy: Users,
  shuttle: Bus,
  pois: MapPin,
};

export const LAYER_ORDER: MapLayer[] = ['listings', 'items', 'buddy', 'shuttle', 'pois'];

export function poiCategoryKey(c: PoiCategory | string): string {
  return `map.poi.category.${c}`;
}

/** `11/08` style label for buddy pins (month/day, no year). */
export function shortDateLabel(iso: string | null | undefined, timeZone?: string): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const parts = new Intl.DateTimeFormat('en-US', { month: '2-digit', day: '2-digit', timeZone }).formatToParts(d);
  const m = parts.find((p) => p.type === 'month')?.value ?? '';
  const day = parts.find((p) => p.type === 'day')?.value ?? '';
  return `${m}/${day}`;
}
