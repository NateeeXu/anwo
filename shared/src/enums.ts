// Enum catalogue — DATA_MODEL.md §4. Const arrays + union types. Served by GET /api/meta as `enums`.
// Use with zod: z.enum(ListingType). Column CHECK constraints in schema.sql mirror these lists.

export const Role = ['student', 'landlord', 'admin'] as const;
export type Role = (typeof Role)[number];

export const Locale = ['zh-CN', 'en'] as const;
export type Locale = (typeof Locale)[number];

export const TrustLevel = [0, 1, 2, 3] as const;
export type TrustLevel = (typeof TrustLevel)[number];

export const Gender = ['female', 'male', 'nonbinary', 'undisclosed'] as const;
export type Gender = (typeof Gender)[number];

export const UploadKind = ['image', 'document'] as const;
export type UploadKind = (typeof UploadKind)[number];

export const UploadPurpose = ['avatar', 'listing', 'item', 'verification', 'chat', 'partner', 'poi', 'seed', 'other'] as const;
export type UploadPurpose = (typeof UploadPurpose)[number];

export const EmailCodePurpose = ['edu_verify', 'login', 'password_reset', 'email_change'] as const;
export type EmailCodePurpose = (typeof EmailCodePurpose)[number];

export const VerificationType = ['student_id', 'passport', 'government_id', 'landlord_proof'] as const;
export type VerificationType = (typeof VerificationType)[number];

export const VerificationStatus = ['pending', 'in_review', 'approved', 'rejected', 'cancelled'] as const;
export type VerificationStatus = (typeof VerificationStatus)[number];

export const ListingType = ['sublet', 'lease_takeover', 'new_lease', 'short_term'] as const;
export type ListingType = (typeof ListingType)[number];

export const PropertyType = ['studio', 'apartment', 'house', 'townhouse', 'room', 'shared_room'] as const;
export type PropertyType = (typeof PropertyType)[number];

export const GeocodePrecision = ['rooftop', 'street', 'city', 'manual'] as const;
export type GeocodePrecision = (typeof GeocodePrecision)[number];

export const Furnished = ['none', 'partial', 'full'] as const;
export type Furnished = (typeof Furnished)[number];

export const LeaseType = ['sublease', 'takeover', 'new_lease', 'month_to_month'] as const;
export type LeaseType = (typeof LeaseType)[number];

export const GenderPref = ['any', 'female', 'male'] as const;
export type GenderPref = (typeof GenderPref)[number];

export const Parking = ['none', 'street', 'lot', 'garage'] as const;
export type Parking = (typeof Parking)[number];

export const ListingStatus = ['draft', 'active', 'paused', 'rented', 'expired', 'removed'] as const;
export type ListingStatus = (typeof ListingStatus)[number];

export const ModerationStatus = ['ok', 'flagged', 'hidden'] as const;
export type ModerationStatus = (typeof ModerationStatus)[number];

export const AvailabilityStatus = ['available', 'booked', 'blocked'] as const;
export type AvailabilityStatus = (typeof AvailabilityStatus)[number];

export const LeadSource = ['message', 'wanted_offer', 'escrow', 'phone_reveal'] as const;
export type LeadSource = (typeof LeadSource)[number];

export const LeadStatus = ['new', 'replied', 'qualified', 'closed', 'spam'] as const;
export type LeadStatus = (typeof LeadStatus)[number];

export const Scope = ['campus', 'nationwide'] as const;
export type Scope = (typeof Scope)[number];

export const WantedStatus = ['active', 'paused', 'fulfilled', 'expired', 'removed'] as const;
export type WantedStatus = (typeof WantedStatus)[number];

export const AreaKind = ['circle', 'city', 'campus'] as const;
export type AreaKind = (typeof AreaKind)[number];

export const MatchStatus = ['new', 'seen', 'dismissed', 'offered', 'contacted'] as const;
export type MatchStatus = (typeof MatchStatus)[number];

export const ConversationKind = ['direct', 'group', 'support'] as const;
export type ConversationKind = (typeof ConversationKind)[number];

export const ContextType = ['listing', 'wanted', 'market_item', 'buddy_post', 'escrow'] as const;
export type ContextType = (typeof ContextType)[number];

export const MemberRole = ['owner', 'admin', 'member'] as const;
export type MemberRole = (typeof MemberRole)[number];

export const MessageKind = ['text', 'image', 'system', 'context_card'] as const;
export type MessageKind = (typeof MessageKind)[number];

export const ReportEntityType = ['listing', 'wanted', 'market_item', 'buddy_post', 'user', 'message', 'conversation', 'partner'] as const;
export type ReportEntityType = (typeof ReportEntityType)[number];

export const ReportReason = ['scam', 'spam', 'fake', 'harassment', 'inappropriate', 'duplicate', 'wrong_info', 'other'] as const;
export type ReportReason = (typeof ReportReason)[number];

export const ReportStatus = ['open', 'in_review', 'actioned', 'dismissed'] as const;
export type ReportStatus = (typeof ReportStatus)[number];

export const NotificationKind = [
  'chat.message', 'match.new', 'wanted.offer', 'verify.approved', 'verify.rejected', 'escrow.state',
  'boost.expiring', 'boost.started', 'subscription.renewed', 'subscription.past_due', 'report.actioned',
  'buddy.join', 'buddy.approved', 'buddy.event_reminder', 'market.wishlist_price', 'shuttle.alert',
  'referral.rewarded', 'system', 'digest',
] as const;
export type NotificationKind = (typeof NotificationKind)[number];

export const ServiceDay = ['weekday', 'saturday', 'sunday', 'holiday'] as const;
export type ServiceDay = (typeof ServiceDay)[number];

export const AlertSeverity = ['info', 'warning', 'critical'] as const;
export type AlertSeverity = (typeof AlertSeverity)[number];

export const ShuttleRequestStatus = ['open', 'planned', 'done', 'rejected'] as const;
export type ShuttleRequestStatus = (typeof ShuttleRequestStatus)[number];

export const FavoriteEntityType = ['stop', 'route'] as const;
export type FavoriteEntityType = (typeof FavoriteEntityType)[number];

export const MarketCategory = ['furniture', 'electronics', 'textbooks', 'kitchen', 'bikes', 'clothing', 'home', 'tickets', 'move_out', 'free', 'other'] as const;
export type MarketCategory = (typeof MarketCategory)[number];

export const ItemCondition = ['new', 'like_new', 'good', 'fair', 'poor'] as const;
export type ItemCondition = (typeof ItemCondition)[number];

export const DeliveryOption = ['pickup', 'delivery', 'both'] as const;
export type DeliveryOption = (typeof DeliveryOption)[number];

export const ItemStatus = ['draft', 'active', 'reserved', 'sold', 'removed', 'expired'] as const;
export type ItemStatus = (typeof ItemStatus)[number];

export const BundleStatus = ['active', 'closed', 'removed'] as const;
export type BundleStatus = (typeof BundleStatus)[number];

export const BuddyType = ['airport_pickup', 'carpool', 'roommate', 'study', 'gym', 'dining', 'travel', 'costco_run', 'event', 'other'] as const;
export type BuddyType = (typeof BuddyType)[number];

export const BuddyStatus = ['open', 'full', 'closed', 'cancelled', 'expired', 'removed'] as const;
export type BuddyStatus = (typeof BuddyStatus)[number];

export const BuddyMemberStatus = ['pending', 'joined', 'left', 'removed', 'declined'] as const;
export type BuddyMemberStatus = (typeof BuddyMemberStatus)[number];

export const BuddyMemberRole = ['host', 'member'] as const;
export type BuddyMemberRole = (typeof BuddyMemberRole)[number];

export const BuddyEventStatus = ['scheduled', 'cancelled', 'done'] as const;
export type BuddyEventStatus = (typeof BuddyEventStatus)[number];

export const BuddyLanguage = ['zh', 'en', 'ko', 'ja', 'es', 'other'] as const;
export type BuddyLanguage = (typeof BuddyLanguage)[number];

export const PlanKind = ['boost', 'subscription', 'escrow_fee', 'service'] as const;
export type PlanKind = (typeof PlanKind)[number];

export const BoostEntityType = ['listing', 'market_item', 'buddy_post'] as const;
export type BoostEntityType = (typeof BoostEntityType)[number];

export const BoostTier = ['basic', 'plus', 'max'] as const;
export type BoostTier = (typeof BoostTier)[number];

export const PlanInterval = ['month', 'year'] as const;
export type PlanInterval = (typeof PlanInterval)[number];

export const PromoKind = ['percent_off', 'fixed_off', 'wallet_credit'] as const;
export type PromoKind = (typeof PromoKind)[number];

export const OrderKind = ['boost', 'subscription', 'subscription_renewal', 'escrow_deposit', 'wallet_topup'] as const;
export type OrderKind = (typeof OrderKind)[number];

export const OrderStatus = ['pending', 'awaiting_payment', 'paid', 'fulfilled', 'cancelled', 'failed', 'refunded'] as const;
export type OrderStatus = (typeof OrderStatus)[number];

export const PaymentProvider = ['mock_stripe', 'wallet'] as const;
export type PaymentProvider = (typeof PaymentProvider)[number];

export const PaymentStatus = ['requires_payment_method', 'requires_confirmation', 'processing', 'succeeded', 'failed', 'cancelled', 'refunded', 'partially_refunded'] as const;
export type PaymentStatus = (typeof PaymentStatus)[number];

export const BoostStatus = ['scheduled', 'active', 'expired', 'cancelled', 'refunded'] as const;
export type BoostStatus = (typeof BoostStatus)[number];

export const SubscriptionStatus = ['trialing', 'active', 'past_due', 'cancelled', 'expired'] as const;
export type SubscriptionStatus = (typeof SubscriptionStatus)[number];

export const EscrowStatus = ['proposed', 'accepted', 'funded', 'in_inspection', 'released', 'refunded', 'disputed', 'resolved', 'cancelled', 'expired'] as const;
export type EscrowStatus = (typeof EscrowStatus)[number];

export const EscrowFeePayer = ['payer', 'payee', 'split'] as const;
export type EscrowFeePayer = (typeof EscrowFeePayer)[number];

export const EscrowResolution = ['release_to_payee', 'refund_to_payer', 'split'] as const;
export type EscrowResolution = (typeof EscrowResolution)[number];

export const LedgerKind = ['referral_reward', 'referral_welcome', 'promo_credit', 'refund', 'order_payment', 'admin_adjustment', 'escrow_fee_rebate', 'topup', 'expiry'] as const;
export type LedgerKind = (typeof LedgerKind)[number];

export const ReferralStatus = ['pending', 'qualified', 'rewarded', 'void'] as const;
export type ReferralStatus = (typeof ReferralStatus)[number];

export const PartnerCategory = ['bank', 'sim', 'insurance', 'movers', 'storage', 'airport_pickup', 'furniture', 'housing', 'food', 'other'] as const;
export type PartnerCategory = (typeof PartnerCategory)[number];

export const PayoutModel = ['cpc', 'cpa', 'flat', 'rev_share'] as const;
export type PayoutModel = (typeof PayoutModel)[number];

export const ClickPlacement = ['kit', 'listing_detail', 'onboarding', 'chat_card', 'banner', 'other'] as const;
export type ClickPlacement = (typeof ClickPlacement)[number];

export const PoiCategory = ['building', 'library', 'dining', 'grocery', 'asian_grocery', 'transit', 'gym', 'health', 'bank', 'pharmacy', 'post', 'landmark', 'other'] as const;
export type PoiCategory = (typeof PoiCategory)[number];

export const SavedSearchModule = ['listings', 'wanted', 'market', 'buddy'] as const;
export type SavedSearchModule = (typeof SavedSearchModule)[number];

export const CampusRequestStatus = ['open', 'added', 'rejected'] as const;
export type CampusRequestStatus = (typeof CampusRequestStatus)[number];

export const Badge = ['edu', 'id', 'phone', 'payment', 'pro', 'landlord', 'admin'] as const;
export type Badge = (typeof Badge)[number];

export const EntityType = ['listing', 'wanted', 'market_item', 'buddy_post', 'user', 'message', 'conversation', 'partner', 'escrow', 'subscription'] as const;
export type EntityType = (typeof EntityType)[number];

/** Canonical (open-set) analytics event types — DATA_MODEL §4. */
export const EventType = [
  'pageview', 'signup', 'login', 'search', 'listing.view', 'listing.contact_click', 'listing.save', 'listing.share',
  'listing.publish', 'wanted.view', 'wanted.offer', 'match.view', 'chat.start', 'chat.message', 'verify.submit',
  'item.view', 'item.contact_click', 'buddy.view', 'buddy.join', 'shuttle.view', 'affiliate.click', 'boost.impression',
  'boost.click', 'checkout.start', 'checkout.pay', 'checkout.success', 'checkout.fail', 'escrow.propose', 'escrow.fund',
  'campus.switch',
] as const;
export type EventType = (typeof EventType)[number];

/** Seeded feature flag keys. */
export const FeatureFlagKey = [
  'boosts.enabled', 'pro.enabled', 'escrow.enabled', 'affiliate.enabled', 'nationwide.enabled',
  'scam_banner.enabled', 'verified_only_default', 'maintenance_banner',
] as const;
export type FeatureFlagKey = (typeof FeatureFlagKey)[number];

/** Listing amenity keys — DATA_MODEL §3.1 (stored verbatim in listing_amenities.amenity). */
export const Amenity = [
  'wifi', 'laundry_in_unit', 'laundry_in_building', 'ac', 'heating', 'dishwasher', 'gym', 'elevator', 'doorman',
  'balcony', 'desk', 'bike_storage', 'package_room', 'pool', 'study_room', 'private_bath', 'kitchen', 'microwave',
  'tv', 'closet', 'security', 'accessible', 'near_grocery', 'utilities_included',
] as const;
export type Amenity = (typeof Amenity)[number];

/** lucide icon names for /api/meta (amenities / categories / buddy types). */
export const AMENITY_ICONS: Record<Amenity, string> = {
  wifi: 'wifi', laundry_in_unit: 'washing-machine', laundry_in_building: 'washing-machine', ac: 'snowflake',
  heating: 'flame', dishwasher: 'utensils', gym: 'dumbbell', elevator: 'arrow-up-down', doorman: 'shield-check',
  balcony: 'sun', desk: 'lamp-desk', bike_storage: 'bike', package_room: 'package', pool: 'waves',
  study_room: 'book-open', private_bath: 'bath', kitchen: 'cooking-pot', microwave: 'microwave', tv: 'tv',
  closet: 'shirt', security: 'lock', accessible: 'accessibility', near_grocery: 'shopping-cart',
  utilities_included: 'plug-zap',
};
export const CATEGORY_ICONS: Record<MarketCategory, string> = {
  furniture: 'sofa', electronics: 'laptop', textbooks: 'book', kitchen: 'cooking-pot', bikes: 'bike',
  clothing: 'shirt', home: 'house', tickets: 'ticket', move_out: 'package-open', free: 'gift', other: 'box',
};
export const BUDDY_TYPE_ICONS: Record<BuddyType, string> = {
  airport_pickup: 'plane', carpool: 'car', roommate: 'users', study: 'book-open', gym: 'dumbbell', dining: 'utensils',
  travel: 'map', costco_run: 'shopping-cart', event: 'calendar', other: 'sparkles',
};

/** Every enum keyed by its DATA_MODEL §4 name — this is exactly what /api/meta returns as `enums`. */
export const ENUMS = {
  role: Role, locale: Locale, trustLevel: TrustLevel.map(String), gender: Gender, uploadKind: UploadKind,
  uploadPurpose: UploadPurpose, emailCodePurpose: EmailCodePurpose, verificationType: VerificationType,
  verificationStatus: VerificationStatus, listingType: ListingType, propertyType: PropertyType,
  geocodePrecision: GeocodePrecision, furnished: Furnished, leaseType: LeaseType, genderPref: GenderPref,
  parking: Parking, listingStatus: ListingStatus, moderationStatus: ModerationStatus,
  availabilityStatus: AvailabilityStatus, leadSource: LeadSource, leadStatus: LeadStatus, scope: Scope,
  wantedStatus: WantedStatus, areaKind: AreaKind, matchStatus: MatchStatus, conversationKind: ConversationKind,
  contextType: ContextType, memberRole: MemberRole, messageKind: MessageKind, reportEntityType: ReportEntityType,
  reportReason: ReportReason, reportStatus: ReportStatus, notificationKind: NotificationKind, serviceDay: ServiceDay,
  alertSeverity: AlertSeverity, shuttleRequestStatus: ShuttleRequestStatus, favoriteEntityType: FavoriteEntityType,
  marketCategory: MarketCategory, itemCondition: ItemCondition, deliveryOption: DeliveryOption, itemStatus: ItemStatus,
  bundleStatus: BundleStatus, buddyType: BuddyType, buddyStatus: BuddyStatus, buddyMemberStatus: BuddyMemberStatus,
  buddyMemberRole: BuddyMemberRole, buddyEventStatus: BuddyEventStatus, buddyLanguage: BuddyLanguage, planKind: PlanKind,
  boostEntityType: BoostEntityType, boostTier: BoostTier, planInterval: PlanInterval, promoKind: PromoKind,
  orderKind: OrderKind, orderStatus: OrderStatus, paymentProvider: PaymentProvider, paymentStatus: PaymentStatus,
  boostStatus: BoostStatus, subscriptionStatus: SubscriptionStatus, escrowStatus: EscrowStatus,
  escrowFeePayer: EscrowFeePayer, escrowResolution: EscrowResolution, ledgerKind: LedgerKind,
  referralStatus: ReferralStatus, partnerCategory: PartnerCategory, payoutModel: PayoutModel,
  clickPlacement: ClickPlacement, poiCategory: PoiCategory, savedSearchModule: SavedSearchModule,
  campusRequestStatus: CampusRequestStatus, badge: Badge, entityType: EntityType, eventType: EventType,
  featureFlagKey: FeatureFlagKey, amenity: Amenity,
} as const satisfies Record<string, readonly string[]>;
