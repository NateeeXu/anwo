// Row → card DTO mappers shared by every module AND the scaffold's global search (DATA_MODEL §1), so card shapes never diverge.
//
//   const cards = listingCards(rows, { viewerId: req.user?.id, exact: false });      // batch: owners, covers, saves
//   toListingCard(row, { owner, campus, coverUrl, saved, exact })                      // single
//   wantedCards(rows) / itemCards(rows, { viewerId }) / buddyCards(rows, { viewerId })
//   Sponsored slots: pass { sponsored: true, boostTier } in ctx (lib/sponsored.ts picks the ids).
import type { BuddyCard, CampusLite, ItemCard, ListingCard, UserPublic, WantedCard, Area } from '@shared/types';
import type { BuddyMemberRole, BuddyMemberStatus } from '@shared/enums';
import { q, parseJson, placeholders } from '../db';
import { toCampusLite } from './campuses';
import { fuzz, round3, haversineM } from './geo';
import { loadUsersPublic, toUserPublic } from './users';
import { getCampus } from './campuses';

export { toUserPublic, toCampusLite };

// ------------------------------------------------------------------ listings
export type ListingCardRow = {
  id: string; owner_id: string; campus_id: string; title: string; price_cents: number; deposit_cents: number; bedrooms: number; bathrooms: number;
  property_type: string; listing_type: string; furnished: string; available_from: string; available_to: string | null; city: string; state: string;
  neighborhood: string | null; lat: number; lng: number; hide_exact_address: number; cover_upload_id: string | null; photo_count: number; status: string;
  is_verified_listing: number; nearest_stop_m: number | null; distance_to_campus_m: number | null; commute_walk_min: number | null;
  commute_shuttle_min: number | null; save_count: number; view_count: number; published_at: string | null; boosted_until: string | null;
  cover_url?: string | null; owner_trust_level?: number; distance_m?: number | null;
};
export type CardCtx = {
  owner?: UserPublic | null;
  campus?: CampusLite | null;
  coverUrl?: string | null;
  saved?: boolean;
  wishlisted?: boolean;
  sponsored?: boolean;
  boostTier?: 'basic' | 'plus' | 'max';
  /** exact coordinates (owner/admin/escrow party) */
  exact?: boolean;
  myMembership?: BuddyCard['myMembership'];
};

export function toListingCard(r: ListingCardRow, ctx: CardCtx = {}): ListingCard {
  const exact = ctx.exact || r.hide_exact_address === 0;
  const pos = exact ? { lat: r.lat, lng: r.lng } : fuzz(r.id, r.lat, r.lng);
  const card: ListingCard = {
    id: r.id, title: r.title, priceCents: r.price_cents, depositCents: r.deposit_cents, bedrooms: r.bedrooms, bathrooms: r.bathrooms,
    propertyType: r.property_type as ListingCard['propertyType'], listingType: r.listing_type as ListingCard['listingType'],
    furnished: r.furnished as ListingCard['furnished'], availableFrom: r.available_from, availableTo: r.available_to, city: r.city, state: r.state,
    neighborhood: r.neighborhood, lat: pos.lat, lng: pos.lng, coverUrl: ctx.coverUrl ?? r.cover_url ?? null, photoCount: r.photo_count,
    status: r.status as ListingCard['status'], campusId: r.campus_id, campus: ctx.campus ?? toCampusLite(r.campus_id) ?? { id: r.campus_id, shortName: r.campus_id, city: r.city, state: r.state },
    isVerifiedListing: r.is_verified_listing === 1, nearShuttle: r.nearest_stop_m !== null && r.nearest_stop_m <= 400,
    distanceToCampusM: r.distance_to_campus_m, commuteWalkMin: r.commute_walk_min, commuteShuttleMin: r.commute_shuttle_min,
    saveCount: r.save_count, viewCount: r.view_count, ownerTrustLevel: ctx.owner?.trustLevel ?? r.owner_trust_level ?? 0, publishedAt: r.published_at,
    sponsored: ctx.sponsored ?? false,
  };
  if (ctx.boostTier) card.boostTier = ctx.boostTier;
  if (ctx.saved !== undefined) card.saved = ctx.saved;
  if (r.distance_m !== undefined && r.distance_m !== null) card.distanceM = Math.round(r.distance_m);
  return card;
}
function coverUrls(ids: (string | null)[]): Map<string, string> {
  const list = [...new Set(ids.filter((x): x is string => !!x))];
  const out = new Map<string, string>();
  if (!list.length) return out;
  for (const u of q.all<{ id: string; url: string }>(`SELECT id, url FROM uploads WHERE id IN (${placeholders(list.length)})`, list)) out.set(u.id, u.url);
  return out;
}
export function listingCards(rows: ListingCardRow[], opts: { viewerId?: string | null; exact?: boolean; isAdmin?: boolean } = {}): ListingCard[] {
  if (!rows.length) return [];
  const owners = loadUsersPublic(rows.map((r) => r.owner_id));
  const covers = coverUrls(rows.map((r) => r.cover_upload_id));
  const saved = new Set<string>();
  if (opts.viewerId) {
    const ids = rows.map((r) => r.id);
    for (const s of q.all<{ listing_id: string }>(`SELECT listing_id FROM listing_saves WHERE user_id = ? AND listing_id IN (${placeholders(ids.length)})`, [opts.viewerId, ...ids])) saved.add(s.listing_id);
  }
  return rows.map((r) =>
    toListingCard(r, {
      owner: owners.get(r.owner_id) ?? null,
      coverUrl: r.cover_upload_id ? covers.get(r.cover_upload_id) ?? null : null,
      saved: opts.viewerId ? saved.has(r.id) : undefined,
      exact: opts.exact || opts.isAdmin || (!!opts.viewerId && opts.viewerId === r.owner_id),
    }),
  );
}

// ------------------------------------------------------------------ wanted
export type WantedCardRow = {
  id: string; user_id: string; campus_id: string; scope: string; title: string; budget_min_cents: number; budget_max_cents: number; move_in_from: string;
  move_in_to: string; move_out_date: string | null; group_size: number; bedrooms_min: number; furnished_pref: string; status: string; match_count: number; created_at: string;
};
type AreaRow = { id: string; wanted_id: string; label: string; kind: Area['kind']; lat: number | null; lng: number | null; radius_m: number | null; city: string | null; state: string | null; campus_id: string | null };
export function toArea(a: AreaRow): Area {
  return { id: a.id, label: a.label, kind: a.kind, lat: a.lat, lng: a.lng, radiusM: a.radius_m, city: a.city, state: a.state, campusId: a.campus_id };
}
export function toWantedCard(r: WantedCardRow, ctx: CardCtx & { areas?: Area[] } = {}): WantedCard {
  return {
    id: r.id, title: r.title, budgetMinCents: r.budget_min_cents, budgetMaxCents: r.budget_max_cents, moveInFrom: r.move_in_from, moveInTo: r.move_in_to,
    moveOutDate: r.move_out_date, groupSize: r.group_size, bedroomsMin: r.bedrooms_min, furnishedPref: r.furnished_pref as WantedCard['furnishedPref'],
    status: r.status as WantedCard['status'], scope: r.scope as WantedCard['scope'], campusId: r.campus_id,
    campus: ctx.campus ?? toCampusLite(r.campus_id) ?? { id: r.campus_id, shortName: r.campus_id, city: '', state: '' },
    areas: ctx.areas ?? [], matchCount: r.match_count, createdAt: r.created_at, author: ctx.owner ?? placeholderUser(r.user_id),
  };
}
export function wantedCards(rows: WantedCardRow[]): WantedCard[] {
  if (!rows.length) return [];
  const authors = loadUsersPublic(rows.map((r) => r.user_id));
  const ids = rows.map((r) => r.id);
  const areas = new Map<string, Area[]>();
  for (const a of q.all<AreaRow>(`SELECT * FROM wanted_areas WHERE wanted_id IN (${placeholders(ids.length)}) ORDER BY sort_order`, ids)) {
    if (!areas.has(a.wanted_id)) areas.set(a.wanted_id, []);
    areas.get(a.wanted_id)!.push(toArea(a));
  }
  return rows.map((r) => toWantedCard(r, { owner: authors.get(r.user_id) ?? null, areas: areas.get(r.id) ?? [] }));
}

// ------------------------------------------------------------------ market items
export type ItemCardRow = {
  id: string; seller_id: string; campus_id: string; bundle_id: string | null; title: string; category: string; condition: string; price_cents: number; is_free: number;
  obo: number; pickup_label: string | null; pickup_lat: number | null; pickup_lng: number | null; city: string | null; state: string | null; status: string;
  cover_upload_id: string | null; photo_count: number; wishlist_count: number; created_at: string; boosted_until: string | null; cover_url?: string | null; distance_m?: number | null;
};
export function toItemCard(r: ItemCardRow, ctx: CardCtx = {}): ItemCard {
  const campus = getCampus(r.campus_id);
  const dist = campus && r.pickup_lat !== null && r.pickup_lng !== null ? haversineM({ lat: r.pickup_lat, lng: r.pickup_lng }, { lat: campus.lat, lng: campus.lng }) : null;
  const card: ItemCard = {
    id: r.id, title: r.title, category: r.category as ItemCard['category'], condition: r.condition as ItemCard['condition'], priceCents: r.price_cents, isFree: r.is_free === 1,
    obo: r.obo === 1, coverUrl: ctx.coverUrl ?? r.cover_url ?? null, photoCount: r.photo_count, status: r.status as ItemCard['status'], campusId: r.campus_id,
    campus: ctx.campus ?? toCampusLite(r.campus_id) ?? { id: r.campus_id, shortName: r.campus_id, city: r.city ?? '', state: r.state ?? '' },
    pickupLabel: r.pickup_label, pickupLat: ctx.exact ? r.pickup_lat : round3(r.pickup_lat), pickupLng: ctx.exact ? r.pickup_lng : round3(r.pickup_lng),
    distanceToCampusM: dist, city: r.city, state: r.state, wishlistCount: r.wishlist_count, createdAt: r.created_at,
    seller: ctx.owner ?? placeholderUser(r.seller_id), sponsored: ctx.sponsored ?? false, bundleId: r.bundle_id,
  };
  if (ctx.boostTier) card.boostTier = ctx.boostTier;
  if (ctx.wishlisted !== undefined) card.wishlisted = ctx.wishlisted;
  if (r.distance_m !== undefined && r.distance_m !== null) card.distanceM = Math.round(r.distance_m);
  return card;
}
export function itemCards(rows: ItemCardRow[], opts: { viewerId?: string | null; isAdmin?: boolean } = {}): ItemCard[] {
  if (!rows.length) return [];
  const sellers = loadUsersPublic(rows.map((r) => r.seller_id));
  const covers = coverUrls(rows.map((r) => r.cover_upload_id));
  const wish = new Set<string>();
  if (opts.viewerId) {
    const ids = rows.map((r) => r.id);
    for (const w of q.all<{ item_id: string }>(`SELECT item_id FROM wishlists WHERE user_id = ? AND item_id IN (${placeholders(ids.length)})`, [opts.viewerId, ...ids])) wish.add(w.item_id);
  }
  return rows.map((r) =>
    toItemCard(r, {
      owner: sellers.get(r.seller_id) ?? null, coverUrl: r.cover_upload_id ? covers.get(r.cover_upload_id) ?? null : null,
      wishlisted: opts.viewerId ? wish.has(r.id) : undefined, exact: opts.isAdmin || (!!opts.viewerId && opts.viewerId === r.seller_id),
    }),
  );
}

// ------------------------------------------------------------------ buddy posts
export type BuddyCardRow = {
  id: string; author_id: string; campus_id: string; type: string; title: string; starts_at: string | null; ends_at: string | null; is_all_day: number;
  location_name: string | null; lat: number | null; lng: number | null; destination_name: string | null; languages_json: string; max_members: number; member_count: number;
  verified_only: number; min_trust_level: number; requires_approval: number; status: string; cost_split_cents: number | null; created_at: string; boosted_until: string | null; distance_m?: number | null;
};
export function toBuddyCard(r: BuddyCardRow, ctx: CardCtx = {}): BuddyCard {
  const card: BuddyCard = {
    id: r.id, type: r.type as BuddyCard['type'], title: r.title, startsAt: r.starts_at, endsAt: r.ends_at, isAllDay: r.is_all_day === 1, locationName: r.location_name,
    lat: r.lat, lng: r.lng, destinationName: r.destination_name, languages: parseJson<string[]>(r.languages_json, []), maxMembers: r.max_members, memberCount: r.member_count,
    verifiedOnly: r.verified_only === 1, minTrustLevel: r.min_trust_level, requiresApproval: r.requires_approval === 1, status: r.status as BuddyCard['status'],
    campusId: r.campus_id, campus: ctx.campus ?? toCampusLite(r.campus_id) ?? { id: r.campus_id, shortName: r.campus_id, city: '', state: '' },
    costSplitCents: r.cost_split_cents, createdAt: r.created_at, author: ctx.owner ?? placeholderUser(r.author_id), sponsored: ctx.sponsored ?? false,
  };
  if (ctx.boostTier) card.boostTier = ctx.boostTier;
  if (ctx.myMembership !== undefined) card.myMembership = ctx.myMembership;
  if (r.distance_m !== undefined && r.distance_m !== null) card.distanceM = Math.round(r.distance_m);
  return card;
}
export function buddyCards(rows: BuddyCardRow[], opts: { viewerId?: string | null } = {}): BuddyCard[] {
  if (!rows.length) return [];
  const authors = loadUsersPublic(rows.map((r) => r.author_id));
  const mine = new Map<string, { status: string; role: string }>();
  if (opts.viewerId) {
    const ids = rows.map((r) => r.id);
    for (const m of q.all<{ post_id: string; status: string; role: string }>(`SELECT post_id, status, role FROM buddy_members WHERE user_id = ? AND post_id IN (${placeholders(ids.length)})`, [opts.viewerId, ...ids])) mine.set(m.post_id, m);
  }
  return rows.map((r) => {
    const m = mine.get(r.id);
    const myMembership = opts.viewerId ? (m ? { status: m.status as BuddyMemberStatus, role: m.role as BuddyMemberRole } : null) : undefined;
    return toBuddyCard(r, { owner: authors.get(r.author_id) ?? null, myMembership });
  });
}

function placeholderUser(id: string): UserPublic {
  return { id, name: 'User', role: 'student', trustLevel: 0, campusId: null, avatarUrl: null, bio: null, program: null, gradYear: null, languages: [], memberSince: '', badges: [], isPro: false };
}
