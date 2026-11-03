// Shared DTOs — API.md §1.6 (camelCase; *_json columns parsed; *_cents kept as integer cents).
// Every DTO here is what the server returns and what the web consumes. Add fields in API.md first.
import type {
  AlertSeverity, AreaKind, AvailabilityStatus, Badge, BoostEntityType, BoostStatus, BoostTier, BuddyEventStatus,
  BuddyMemberRole, BuddyMemberStatus, BuddyStatus, BuddyType, BundleStatus, ClickPlacement, ContextType,
  ConversationKind, DeliveryOption, EscrowFeePayer, EscrowResolution, EscrowStatus, Furnished, Gender, GenderPref,
  ItemCondition, ItemStatus, LeadSource, LeadStatus, LedgerKind, ListingStatus, ListingType, Locale, MarketCategory,
  MatchStatus, MemberRole, MessageKind, ModerationStatus, OrderKind, OrderStatus, Parking, PartnerCategory,
  PaymentProvider, PaymentStatus, PlanInterval, PlanKind, PoiCategory, PromoKind, PropertyType, ReportEntityType,
  ReportReason, ReportStatus, Role, SavedSearchModule, Scope, ServiceDay, SubscriptionStatus, VerificationStatus,
  VerificationType, WantedStatus, LeaseType, CampusRequestStatus,
} from './enums';

// ---------------------------------------------------------------- envelope
export type ApiError = { code: string; message: string; fields?: Record<string, string>; data?: unknown };
export type ApiEnvelope<T> = { ok: true; data: T } | { ok: false; error: ApiError };
export type Paginated<T> = { items: T[]; total: number; page: number; pageSize: number };
/** Echo of the applied scope on list responses (API.md §1.4). */
export type ScopeInfo = {
  campusId: string | null;
  scope: Scope;
  city?: string;
  state?: string;
  center?: { lat: number; lng: number };
  radiusKm?: number;
  bbox?: [number, number, number, number];
};
export type ScopedPaginated<T> = Paginated<T> & { scope: ScopeInfo };

// ---------------------------------------------------------------- campus
export type Campus = {
  id: string;
  name: string;
  nameZh: string | null;
  shortName: string;
  slug: string;
  city: string;
  state: string;
  lat: number;
  lng: number;
  timezone: string;
  eduDomains: string[];
  hasShuttle: boolean;
  shuttleTrackerUrl?: string | null;
  metro?: string | null;
  defaultRadiusM: number;
  intlStudents?: number | null;
  sortOrder?: number;
  isActive?: boolean;
};
export type CampusLite = Pick<Campus, 'id' | 'shortName' | 'city' | 'state'>;
export type CampusStats = { activeListings: number; activeWanted: number; activeItems: number; openBuddy: number; shuttleRoutes: number };

// ---------------------------------------------------------------- users
export type UserPublic = {
  id: string;
  name: string;
  role: Role;
  trustLevel: number;
  campusId: string | null;
  campus?: CampusLite | null;
  avatarUrl: string | null;
  bio: string | null;
  program: string | null;
  gradYear: number | null;
  languages: string[];
  memberSince: string;
  badges: Badge[];
  isPro: boolean;
  /** 'online' | 'recently' | null — never the exact timestamp */
  lastSeenAt?: string | null;
  responseRate?: number | null;
  responseMedianMin?: number | null;
};
export type UserMe = UserPublic & {
  email: string;
  locale: Locale;
  phone: string | null;
  phoneVerifiedAt: string | null;
  emailVerifiedAt: string | null;
  eduEmail: string | null;
  idVerifiedAt: string | null;
  paymentVerifiedAt: string | null;
  wechatId: string | null;
  gender: Gender | null;
  verifiedOnlyMessaging: boolean;
  emailDigestOptIn: boolean;
  referralCode: string;
  walletBalanceCents: number;
  proUntil: string | null;
  listingQuota: number;
  unreadNotifications: number;
  unreadMessages: number;
  banned: boolean;
  bannedReason: string | null;
  campus: Campus | null;
  /** set by POST /api/auth/register when an edu code was auto-sent */
  eduCodeSent?: boolean;
};
export type UserStats = { activeListings: number; itemsSold: number; buddyHosted: number; memberSince: string };
export type TrustProfile = {
  eduVerified: boolean;
  idVerified: boolean;
  phoneVerified: boolean;
  paymentOnFile: boolean;
  verifiedAt: { edu: string | null; id: string | null; phone: string | null; payment: string | null };
};
export type UserProfile = UserPublic & { stats: UserStats; trustProfile: TrustProfile };

// ---------------------------------------------------------------- uploads / photos
export type Upload = {
  id: string;
  url: string;
  kind: 'image' | 'document';
  mime: string;
  width: number | null;
  height: number | null;
  sizeBytes: number;
  isPrivate: boolean;
};
export type Photo = { id: string; uploadId: string; url: string; sortOrder: number; caption: string | null };
export type Availability = { id: string; startDate: string; endDate: string; status: AvailabilityStatus; note: string | null };

// ---------------------------------------------------------------- listings
export type ListingCard = {
  id: string;
  title: string;
  priceCents: number;
  depositCents: number;
  bedrooms: number;
  bathrooms: number;
  propertyType: PropertyType;
  listingType: ListingType;
  furnished: Furnished;
  availableFrom: string;
  availableTo: string | null;
  city: string;
  state: string;
  neighborhood: string | null;
  lat: number;
  lng: number;
  coverUrl: string | null;
  photoCount: number;
  status: ListingStatus;
  campusId: string;
  campus: CampusLite;
  isVerifiedListing: boolean;
  nearShuttle: boolean;
  distanceToCampusM: number | null;
  commuteWalkMin: number | null;
  commuteShuttleMin: number | null;
  saveCount: number;
  viewCount: number;
  ownerTrustLevel: number;
  publishedAt: string | null;
  sponsored: boolean;
  boostTier?: BoostTier;
  saved?: boolean;
  distanceM?: number;
};
export type Commute = {
  walkMin: number;
  bikeMin: number;
  shuttleMin: number | null;
  nearestStop: { id: string; name: string; distanceM: number } | null;
};
export type Listing = ListingCard & {
  description: string;
  addressLine1: string | null;
  addressLine2: string | null;
  addressDisplay: string;
  zip: string | null;
  hideExactAddress: boolean;
  utilitiesIncluded: boolean;
  utilitiesNote: string | null;
  utilitiesEstCents: number | null;
  sqft: number | null;
  minTermMonths: number;
  flexibleDates: boolean;
  leaseType: LeaseType;
  roommatesCount: number;
  genderPref: GenderPref;
  petsAllowed: boolean;
  parking: Parking;
  smokingAllowed: boolean;
  amenities: string[];
  photos: Photo[];
  availability: Availability[];
  owner: UserPublic;
  commute: Commute | null;
  leadCount?: number;
  expiresAt: string | null;
  moderationStatus?: ModerationStatus;
  boostedUntil: string | null;
  activeBoost?: Boost;
  bundle?: { id: string; title: string; itemCount: number };
};
export type ListingPin = { id: string; lat: number; lng: number; priceCents: number; boostTier?: BoostTier; isVerifiedListing: boolean };

// ---------------------------------------------------------------- wanted
export type Area = {
  id: string;
  label: string;
  kind: AreaKind;
  lat?: number | null;
  lng?: number | null;
  radiusM?: number | null;
  city?: string | null;
  state?: string | null;
  campusId?: string | null;
};
export type WantedCard = {
  id: string;
  title: string;
  budgetMinCents: number;
  budgetMaxCents: number;
  moveInFrom: string;
  moveInTo: string;
  moveOutDate: string | null;
  groupSize: number;
  bedroomsMin: number;
  furnishedPref: 'any' | 'partial' | 'full';
  status: WantedStatus;
  scope: Scope;
  campusId: string;
  campus: CampusLite;
  areas: Area[];
  matchCount: number;
  createdAt: string;
  author: UserPublic;
};
export type Wanted = WantedCard & {
  description: string;
  flexibleDays: number;
  genderPref: GenderPref;
  hasPets: boolean;
  needsParking: boolean;
  propertyTypes: string[];
  mustHaves: string[];
  niceToHaves: string[];
  offerCount: number;
  viewCount: number;
  expiresAt: string | null;
  myOffer?: { matchId: string; conversationId: string | null };
};
export type Match = {
  id: string;
  wantedId: string;
  listingId: string;
  score: number;
  breakdown: Record<string, number>;
  status: MatchStatus;
  offeredByHost: boolean;
  conversationId: string | null;
  computedAt: string;
  listing?: ListingCard;
  wanted?: WantedCard;
};

// ---------------------------------------------------------------- chat
export type ContextCard = {
  type: ContextType;
  id: string;
  title: string;
  subtitle?: string;
  priceCents?: number;
  imageUrl?: string | null;
  link: string;
  status?: string;
};
export type ConversationMember = UserPublic & { role: MemberRole; lastReadAt: string | null };
export type Message = {
  id: string;
  conversationId: string;
  senderId: string | null;
  sender?: UserPublic;
  kind: MessageKind;
  body: string | null;
  image?: Upload;
  context?: ContextCard | Record<string, unknown>;
  clientId: string | null;
  replyToId: string | null;
  editedAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  readBy?: string[];
  deleted?: boolean;
};
export type Conversation = {
  id: string;
  kind: ConversationKind;
  title: string | null;
  campusId: string | null;
  context: ContextCard | null;
  members: ConversationMember[];
  lastMessage: Message | null;
  lastMessageAt: string | null;
  unreadCount: number;
  muted: boolean;
  archived: boolean;
  isLocked: boolean;
  scamBannerDismissed: boolean;
  createdAt: string;
  created?: boolean;
  typingUserIds?: string[];
};

// ---------------------------------------------------------------- notifications
export type Notification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  entityType: string | null;
  entityId: string | null;
  data: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
};

// ---------------------------------------------------------------- shuttle
export type ShuttleStop = {
  id: string;
  campusId: string;
  name: string;
  nameZh: string | null;
  code: string | null;
  lat: number;
  lng: number;
  address: string | null;
  routes?: Pick<ShuttleRoute, 'id' | 'name' | 'shortName' | 'color'>[];
  distanceM?: number;
  walkMin?: number;
};
export type ShuttleRoute = {
  id: string;
  campusId: string;
  name: string;
  shortName: string | null;
  color: string;
  description: string | null;
  polyline: [number, number][];
  serviceDays: string[];
  firstDeparture: string | null;
  lastDeparture: string | null;
  headwayMin: number | null;
  officialUrl: string | null;
  isApproximate: boolean;
  isActive: boolean;
  stops: (ShuttleStop & { sequence: number; minutesFromStart: number })[];
};
export type ShuttleAlert = {
  id: string;
  campusId: string;
  routeId: string | null;
  severity: AlertSeverity;
  title: string;
  titleZh: string | null;
  body: string | null;
  bodyZh: string | null;
  startsAt: string;
  endsAt: string | null;
  isActive: boolean;
};
export type ShuttleDeparture = { routeId: string; routeName: string; routeColor: string; time: string; inMinutes: number; tripIndex: number | null };
export type ServiceDayName = ServiceDay;

// ---------------------------------------------------------------- market
export type ItemCard = {
  id: string;
  title: string;
  category: MarketCategory;
  condition: ItemCondition;
  priceCents: number;
  isFree: boolean;
  obo: boolean;
  coverUrl: string | null;
  photoCount: number;
  status: ItemStatus;
  campusId: string;
  campus: CampusLite;
  pickupLabel: string | null;
  pickupLat: number | null;
  pickupLng: number | null;
  distanceToCampusM: number | null;
  city: string | null;
  state: string | null;
  wishlistCount: number;
  createdAt: string;
  seller: UserPublic;
  sponsored: boolean;
  boostTier?: BoostTier;
  wishlisted?: boolean;
  bundleId: string | null;
  distanceM?: number;
};
export type PriceSuggestion = { suggestedCents: number; lowCents: number; highCents: number; sampleSize: number; basis: 'campus' | 'nationwide' };
export type Bundle = {
  id: string;
  sellerId: string;
  campusId: string;
  listingId: string | null;
  title: string;
  description: string | null;
  discountPct: number;
  moveOutDate: string | null;
  status: BundleStatus;
  itemCount: number;
  items?: ItemCard[];
  listing?: ListingCard;
  seller?: UserPublic;
  totalCents: number;
  bundleCents: number;
};
export type Item = ItemCard & {
  description: string;
  originalPriceCents: number | null;
  brand: string | null;
  deliveryOption: DeliveryOption;
  photos: Photo[];
  viewCount: number;
  chatCount: number;
  soldAt: string | null;
  soldPriceCents: number | null;
  buyerId: string | null;
  expiresAt: string | null;
  bundle?: Bundle;
  suggestedPrice?: PriceSuggestion;
  similar?: ItemCard[];
};

// ---------------------------------------------------------------- buddy
export type BuddyCard = {
  id: string;
  type: BuddyType;
  title: string;
  startsAt: string | null;
  endsAt: string | null;
  isAllDay: boolean;
  locationName: string | null;
  lat: number | null;
  lng: number | null;
  destinationName: string | null;
  languages: string[];
  maxMembers: number;
  memberCount: number;
  verifiedOnly: boolean;
  minTrustLevel: number;
  requiresApproval: boolean;
  status: BuddyStatus;
  campusId: string;
  campus: CampusLite;
  costSplitCents: number | null;
  createdAt: string;
  author: UserPublic;
  sponsored: boolean;
  boostTier?: BoostTier;
  myMembership?: { status: BuddyMemberStatus; role: BuddyMemberRole } | null;
  distanceM?: number;
};
export type BuddyEvent = {
  id: string;
  postId: string;
  campusId: string;
  startsAt: string;
  endsAt: string | null;
  locationName: string | null;
  lat: number | null;
  lng: number | null;
  status: BuddyEventStatus;
  post?: BuddyCard;
};
export type Buddy = BuddyCard & {
  description: string;
  destLat: number | null;
  destLng: number | null;
  conversationId: string | null;
  members: (UserPublic & { status: BuddyMemberStatus; role: BuddyMemberRole; joinedAt: string; note?: string | null })[];
  events: BuddyEvent[];
  viewCount: number;
};

// ---------------------------------------------------------------- billing
export type Plan = {
  id: string;
  kind: PlanKind;
  key: string;
  name: string;
  nameZh: string | null;
  description: string | null;
  descriptionZh: string | null;
  entityType: BoostEntityType | null;
  tier: BoostTier | null;
  durationDays: number | null;
  interval: PlanInterval | null;
  priceCents: number;
  feeBps: number | null;
  feeMinCents: number | null;
  features: string[];
  isActive: boolean;
  sortOrder: number;
};
export type Payment = {
  id: string;
  orderId: string;
  provider: PaymentProvider;
  providerIntentId: string | null;
  clientSecret: string | null;
  status: PaymentStatus;
  amountCents: number;
  refundedCents: number;
  methodBrand: string | null;
  methodLast4: string | null;
  failureCode: string | null;
  failureMessage: string | null;
  succeededAt: string | null;
  createdAt: string;
};
export type Order = {
  id: string;
  kind: OrderKind;
  status: OrderStatus;
  planId: string | null;
  plan?: Plan;
  entityType: string | null;
  entityId: string | null;
  subtotalCents: number;
  discountCents: number;
  creditCents: number;
  feeCents: number;
  totalCents: number;
  promoCode?: string;
  payment?: Payment;
  metadata: Record<string, unknown>;
  paidAt: string | null;
  fulfilledAt: string | null;
  createdAt: string;
};
export type Boost = {
  id: string;
  entityType: BoostEntityType;
  entityId: string;
  tier: BoostTier;
  startsAt: string;
  endsAt: string;
  status: BoostStatus;
  impressions: number;
  clicks: number;
  plan?: Plan;
  entity?: ListingCard | ItemCard | BuddyCard;
};
export type PaymentMethod = { id: string; brand: string; last4: string; expMonth: number; expYear: number; isDefault: boolean };
export type Subscription = {
  id: string;
  planId: string;
  plan: Plan;
  status: SubscriptionStatus;
  currentPeriodStart: string;
  currentPeriodEnd: string;
  cancelAtPeriodEnd: boolean;
  cancelledAt: string | null;
  trialEndsAt: string | null;
  paymentMethod?: PaymentMethod;
};
export type EscrowEvent = { id: string; fromStatus: string | null; toStatus: string; actorId: string | null; note: string | null; createdAt: string };
export type Escrow = {
  id: string;
  listingId: string;
  listing?: ListingCard;
  conversationId: string | null;
  payer: UserPublic;
  payee: UserPublic;
  amountCents: number;
  feeBps: number;
  feeCents: number;
  feePayer: EscrowFeePayer;
  status: EscrowStatus;
  moveInDate: string | null;
  inspectionHours: number;
  inspectionDeadlineAt: string | null;
  fundedAt: string | null;
  releasedAt: string | null;
  refundedAt: string | null;
  disputedAt: string | null;
  disputeReason: string | null;
  resolution: EscrowResolution | null;
  resolvedAt: string | null;
  expiresAt: string | null;
  events: EscrowEvent[];
  actions: string[];
};
export type LedgerEntry = {
  id: string;
  deltaCents: number;
  balanceAfterCents: number;
  kind: LedgerKind;
  refType: string | null;
  refId: string | null;
  note: string | null;
  expiresAt: string | null;
  createdAt: string;
};
export type Partner = {
  id: string;
  slug: string;
  name: string;
  nameZh: string | null;
  category: PartnerCategory;
  tagline: string | null;
  taglineZh: string | null;
  description: string | null;
  descriptionZh: string | null;
  logoUrl: string | null;
  websiteUrl: string;
  promoText: string | null;
  promoTextZh: string | null;
  isSponsored: boolean;
  campusId: string | null;
  goUrl: string;
};
export type PromoCode = {
  id: string;
  code: string;
  kind: PromoKind;
  value: number;
  appliesTo: string[];
  campusId: string | null;
  maxRedemptions: number | null;
  redeemedCount: number;
  perUserLimit: number;
  minOrderCents: number;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  createdAt: string;
};
export type ClickPlacementName = ClickPlacement;

// ---------------------------------------------------------------- map
export type Poi = {
  id: string;
  campusId: string;
  name: string;
  nameZh: string | null;
  category: PoiCategory;
  lat: number;
  lng: number;
  address: string | null;
  url: string | null;
  icon: string | null;
  tags: string[];
};
export type GeocodeResult = {
  lat: number;
  lng: number;
  displayName: string;
  addressLine1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  precision: 'rooftop' | 'street' | 'city' | 'none';
  approx?: boolean;
  campusSuggestion?: { suggested: Campus | null; nearest: (Campus & { distanceM: number })[] };
};

// ---------------------------------------------------------------- moderation, misc
export type Report = {
  id: string;
  reporterId: string | null;
  reporter?: UserPublic;
  entityType: ReportEntityType;
  entityId: string;
  entity?: unknown;
  campusId: string | null;
  reason: ReportReason;
  details: string | null;
  status: ReportStatus;
  reviewerId: string | null;
  resolution: string | null;
  reviewedAt: string | null;
  createdAt: string;
};
export type Lead = {
  id: string;
  listingId: string;
  userId: string;
  user?: UserPublic;
  conversationId: string | null;
  source: LeadSource;
  status: LeadStatus;
  createdAt: string;
};
export type SavedSearch = {
  id: string;
  module: SavedSearchModule;
  campusId: string | null;
  scope: Scope;
  name: string | null;
  query: Record<string, unknown>;
  notify: boolean;
  lastRunAt: string | null;
  createdAt: string;
};
export type CampusRequest = {
  id: string;
  userId: string | null;
  schoolName: string;
  city: string | null;
  state: string | null;
  email: string | null;
  note: string | null;
  status: CampusRequestStatus;
  createdAt: string;
};
export type AnalyticsEvent = {
  id: string;
  userId: string | null;
  sessionId: string | null;
  campusId: string | null;
  type: string;
  entityType: string | null;
  entityId: string | null;
  props: Record<string, unknown>;
  path: string | null;
  createdAt: string;
};
export type AuditEntry = {
  id: string;
  actor: UserPublic | null;
  actorRole: string | null;
  action: string;
  entityType: string | null;
  entityId: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  createdAt: string;
};
export type FeatureFlag = {
  key: string;
  enabled: boolean;
  value: unknown;
  description: string | null;
  campusIds: string[];
  updatedBy: string | null;
  updatedAt: string;
};
export type VerificationRequest = {
  id: string;
  userId: string;
  campusId: string | null;
  type: VerificationType;
  frontUploadId: string | null;
  backUploadId: string | null;
  selfieUploadId: string | null;
  fullName: string | null;
  docNumberLast4: string | null;
  status: VerificationStatus;
  reviewerId: string | null;
  reason: string | null;
  submittedAt: string;
  reviewedAt: string | null;
};
export type Meta = {
  enums: Record<string, readonly string[]>;
  amenities: { key: string; icon: string }[];
  categories: { key: string; icon: string }[];
  buddyTypes: { key: string; icon: string }[];
  flags: Record<string, boolean | unknown>;
  limits: { uploadMaxBytes: number; pageSizeMax: number; listingQuotaFree: number };
  plans: Plan[];
  brand: { name: string; nameZh: string; nameDisplay: string; taglineZh: string; taglineEn: string };
  campusesCount: number;
  version: string;
};
export type SearchResult = {
  listings: ListingCard[];
  wanted: WantedCard[];
  items: ItemCard[];
  buddy: BuddyCard[];
  campuses: Campus[];
  users: UserPublic[];
  counts: Record<string, number>;
  scope: ScopeInfo;
};
export type SearchSuggestion = { type: string; id: string; label: string; sublabel: string | null; link: string };
