// shared/src/schemas/market.ts — owned by the `market` module agent.
// Zod input schemas for /api/market (API.md §9). The web imports these for client-side validation;
// the server uses them in server/src/modules/market/routes.ts. Re-exported from shared/src/index.ts as `marketSchemas`.
import { z } from 'zod';
import { DeliveryOption, ItemCondition, MarketCategory } from '../enums';
import { DateYmd, PaginationQuery, ScopeQuery, zBool, zCsv } from './common';

export const MARKET_SORTS = ['recent', 'relevance', 'price_asc', 'price_desc', 'distance', 'popular'] as const;
export type MarketSort = (typeof MARKET_SORTS)[number];

/** Categories shown as chips on /market (the schema accepts every MarketCategory). */
export const MARKET_BROWSE_CATEGORIES = ['furniture', 'electronics', 'textbooks', 'kitchen', 'bikes', 'home', 'clothing', 'move_out', 'free', 'other'] as const;

export const ItemListQuery = ScopeQuery.merge(PaginationQuery).extend({
  q: z.string().trim().max(120).optional(),
  category: zCsv.optional(),
  condition: zCsv.optional(),
  priceMin: z.coerce.number().int().min(0).optional(),
  priceMax: z.coerce.number().int().min(0).optional(),
  free: zBool.optional(),
  obo: zBool.optional(),
  delivery: z.enum(['pickup', 'delivery']).optional(),
  status: z.enum(['active', 'reserved', 'sold', 'all']).optional(),
  sellerId: z.string().max(64).optional(),
  bundleId: z.string().max(64).optional(),
  sort: z.enum(MARKET_SORTS).optional(),
  view: z.enum(['list', 'pins']).default('list'),
});
export type ItemListQuery = z.infer<typeof ItemListQuery>;

export const MineQuery = PaginationQuery.extend({
  status: z.enum(['draft', 'active', 'reserved', 'sold', 'expired', 'all']).default('all'),
});
export type MineQuery = z.infer<typeof MineQuery>;

export const ItemPhotoRef = z.object({ uploadId: z.string().min(1).max(64) });

const ItemBase = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(3000).default(''),
  campusId: z.string().max(64).optional(),
  category: z.enum(MarketCategory),
  condition: z.enum(ItemCondition).default('good'),
  priceCents: z.number().int().min(0).max(1_000_000).default(0),
  isFree: z.boolean().default(false),
  obo: z.boolean().default(false),
  originalPriceCents: z.number().int().min(0).max(5_000_000).nullable().optional(),
  brand: z.string().trim().max(60).nullable().optional(),
  pickupLabel: z.string().trim().max(80).nullable().optional(),
  pickupLat: z.number().min(-90).max(90).nullable().optional(),
  pickupLng: z.number().min(-180).max(180).nullable().optional(),
  city: z.string().trim().max(80).nullable().optional(),
  state: z.string().trim().length(2).nullable().optional(),
  deliveryOption: z.enum(DeliveryOption).default('pickup'),
  bundleId: z.string().max(64).nullable().optional(),
  photos: z.array(ItemPhotoRef).max(10).optional(),
  draft: z.boolean().default(false),
});

/** POST /api/market/items */
export const ItemInput = ItemBase.refine((i) => i.isFree || i.category === 'free' || i.priceCents > 0, {
  message: 'Set a price or mark the item as free',
  path: ['priceCents'],
});
export type ItemInput = z.infer<typeof ItemInput>;

/** PATCH /api/market/items/:id — every field optional (defaults removed) */
export const ItemPatch = ItemBase.partial().refine((i) => i.isFree === undefined && i.priceCents === undefined ? true : (i.isFree ?? false) || i.category === 'free' || (i.priceCents ?? 1) > 0, {
  message: 'Set a price or mark the item as free',
  path: ['priceCents'],
});
export type ItemPatch = z.infer<typeof ItemPatch>;

export const ItemPhotosInput = z.object({ photos: z.array(ItemPhotoRef).max(10) });
export type ItemPhotosInput = z.infer<typeof ItemPhotosInput>;

export const MarkSoldInput = z.object({
  buyerId: z.string().max(64).nullable().optional(),
  soldPriceCents: z.number().int().min(0).max(1_000_000).nullable().optional(),
});
export type MarkSoldInput = z.infer<typeof MarkSoldInput>;

export const ContactInput = z.object({
  message: z.string().trim().max(1000).optional(),
  offerCents: z.number().int().min(0).max(1_000_000).optional(),
});
export type ContactInput = z.infer<typeof ContactInput>;

export const PriceSuggestionQuery = z.object({
  category: z.enum(MarketCategory),
  condition: z.enum(ItemCondition).default('good'),
  campusId: z.string().max(64).optional(),
  title: z.string().trim().max(120).optional(),
});
export type PriceSuggestionQuery = z.infer<typeof PriceSuggestionQuery>;

export const WishlistQuery = PaginationQuery;

export const BundleListQuery = ScopeQuery.merge(PaginationQuery).extend({
  status: z.enum(['active', 'closed', 'all']).default('active'),
  sellerId: z.string().max(64).optional(),
});
export type BundleListQuery = z.infer<typeof BundleListQuery>;

export const BundleInput = z.object({
  title: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).nullable().optional(),
  listingId: z.string().max(64).nullable().optional(),
  discountPct: z.number().int().min(0).max(100).default(0),
  moveOutDate: DateYmd.nullable().optional(),
  itemIds: z.array(z.string().max(64)).max(50).optional(),
  campusId: z.string().max(64).optional(),
});
export type BundleInput = z.infer<typeof BundleInput>;

export const BundlePatch = BundleInput.partial();
export type BundlePatch = z.infer<typeof BundlePatch>;

export const BundleItemsInput = z.object({ itemIds: z.array(z.string().max(64)).max(50) });
export type BundleItemsInput = z.infer<typeof BundleItemsInput>;
