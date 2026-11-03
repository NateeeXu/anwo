// React Query hooks + API calls for the billing module. Query keys are prefixed ['billing', …].
import { useMutation, useQuery } from '@tanstack/react-query';
import type { Boost, BuddyCard, Escrow, ItemCard, LedgerEntry, ListingCard, Order, Paginated, Partner, PaymentMethod, Plan, Subscription, UserPublic } from '@shared/types';
import type { CardInput, EscrowInput, EscrowRail, OrderInput, SubscribeInput } from '@shared/schemas/billing';
import { api } from '@/lib/api';
import { queryClient } from '@/lib/query';

export type PlanDto = Plan & { feeCapCents: number | null; minTrust: number; requiresBadge: string | null; addonFor: string | null; selfServe: boolean };
export type PricingData = {
  boosts: { entityType: 'listing' | 'market_item' | 'buddy_post'; tiers: { tier: 'basic' | 'plus' | 'max'; plans: PlanDto[] }[] }[];
  addons: PlanDto[];
  packs: PlanDto[];
  pro: PlanDto[];
  escrow: PlanDto | null;
  sponsor: PlanDto[];
  kit: { partnerCount: number };
  flags: { boosts: boolean; pro: boolean; escrow: boolean; affiliate: boolean };
  alwaysFree: string[];
  faq: string[];
  foundingUntil: string;
  trialDays: number;
};
export type OrderDto = Order & { userId: string; campusId: string | null; addons: PlanDto[]; plan?: PlanDto; payments?: Order['payment'][] };
export type OrderDetail = OrderDto & {
  entity: ListingCard | ItemCard | BuddyCard | null;
  escrow: EscrowDto | null;
  boosts: BoostDto[];
  paymentMethods: PaymentMethod[];
  walletBalanceCents: number;
};
export type BoostDto = Boost & { nationwide: boolean; pausedAt: string | null; campusId: string | null; orderId: string | null; createdAt: string; plan?: PlanDto };
export type BoostOptions = {
  entity: ListingCard | ItemCard | BuddyCard | null;
  entityTitle: string;
  plans: (PlanDto & { lock: string | null; estimatedReach: { dailyViews: number; multiplier: number } })[];
  currentBoost: BoostDto | null;
  estimatedReach: { dailyViews: number; multiplier: number };
  eligible: boolean;
  reason: string | null;
  nextStep: string | null;
  supplyProof: boolean;
  trustLevel: number;
  walletBalanceCents: number;
  bundle: { id: string; itemCount: number } | null;
};
export type BoostStats = { impressions: number; clicks: number; ctr: number; daily: { date: string; impressions: number; clicks: number }[]; upliftViews: number | null; boost: BoostDto };
export type WalletData = { balanceCents: number; expiringSoonCents: number; expiringAt: string | null; entries: Paginated<LedgerEntry>; payoutPendingCents: number };
export type ReferralData = { code: string; shareUrl: string; rewardCents: number; stats: { invited: number; qualified: number; rewarded: number; earnedCents: number }; referrals: { user: { name: string; avatarUrl: string | null; trustLevel: number }; status: string; createdAt: string; rewardedAt: string | null }[] };
export type SubscriptionDto = Subscription & { userId: string; lastOrderId: string | null; seats: number; plan: PlanDto };
export type SubscriptionData = { subscription: SubscriptionDto | null; isPro: boolean; proUntil: string | null; perks: string[]; gate: { trustOk: boolean; supplyProof: boolean; trialUsed: boolean; hasCard: boolean }; plans: PlanDto[]; invoices: OrderDto[]; listingQuota: number; activeListings: number };
export type ProAnalytics = { listings: { id: string; title: string; status: string; views: number; saves: number; leads: number; contactRate: number; boosted: boolean }[]; totals: { views: number; saves: number; leads: number; listings: number; active: number }; series: { date: string; views: number; leads: number }[]; topSources: { source: string; count: number }[]; boostUplift: number | null; days: number };
export type LeadDto = { id: string; listingId: string; userId: string; user: UserPublic | null; listing: ListingCard | null; conversationId: string | null; conversation: { id: string; lastMessage: string | null; lastMessageAt: string | null } | null; source: string; status: string; createdAt: string };
export type EscrowQuote = { amountCents: number; feeBps: number; feeCents: number; feeMinCents: number; feeCapCents: number; feePayer: 'payer' | 'payee' | 'split'; payerFeeCents: number; payeeFeeCents: number; payerTotalCents: number; payeeNetCents: number; rail: EscrowRail; railFeeCents: number; railAllowed: boolean };
export type EscrowDto = Escrow & { rail: EscrowRail; cardFeeCents: number; disputeReasonCode: string | null; createdBy: string | null; createdAt: string; quote: EscrowQuote; orderId: string | null; resolutionPayeeCents: number | null; resolutionPayerCents: number | null; campusId: string | null };
export type EscrowEligibility = { enabled: boolean; state: string | null; payeeEligible: boolean; payeeReason: string | null; viewerCanPropose: boolean; viewerCanFund: boolean; listingActive: boolean; suggestedAmountCents: number; existing: { id: string; status: string } | null; quote: EscrowQuote };
export type PartnerDto = Partner & { network: string | null; noSsnOk: boolean; stages: string[]; subcategory: string | null; feeFree: boolean; campusBranch: boolean; states: string[]; sortOrder: number; needs: string[] };
export type PartnersData = { categories: { key: string; partners: PartnerDto[] }[]; done: string[]; campusId: string | null; enabled: boolean };
export type PartnerDetail = PartnerDto & { related: PartnerDto[]; done: boolean; clickCount: number };
export type RevenuePoint = { date: string; revenueCents: number; boostCents: number; proCents: number; escrowFeeCents: number; affiliateCents: number; gmvCents: number; refundsCents: number; orders: number };
export type RevenueData = {
  totals: { revenueCents: number; byKind: Record<string, number>; gmvCents: number; affiliateEstCents: number; affiliateRecognizedCents: number; refundsCents: number; walletContraCents: number; orders: number; payingUsers: number };
  series: RevenuePoint[];
  topCampuses: { campusId: string; campus: { id: string; shortName: string; city: string; state: string } | null; revenueCents: number }[];
  byKind: { kind: string; revenueCents: number; orders: number }[];
  from: string; to: string; groupBy: string;
  funnel: { checkout: { starts: number; pays: number; successes: number; fails: number }; kit: { views: number; clicks: number; conversions: number } };
  subscriptions: { active: number; trialing: number; pastDue: number; mrrCents: number };
  boosts: { active: number; impressions30d: number; clicks30d: number };
  disputes: EscrowDto[];
  sponsorLeads: { id: string; businessName: string; contact: string; campusId: string | null; interest: string; status: string; createdAt: string }[];
};
export type AdminOrder = OrderDto & { user: UserPublic | null; email: string };
export type AdminPartner = PartnerDto & { isActive: boolean; clickCount: number; payoutModel: string; payoutCents: number; affiliateUrl: string; payoutNote: string | null; noSsnVerifiedAt: string | null; conversions: number };

export const billingKeys = {
  all: ['billing'] as const,
  pricing: () => ['billing', 'pricing'] as const,
  wallet: (page: number) => ['billing', 'wallet', page] as const,
  referrals: () => ['billing', 'referrals'] as const,
  order: (id: string) => ['billing', 'order', id] as const,
  orders: (p: Record<string, unknown>) => ['billing', 'orders', p] as const,
  boosts: (status: string, page: number) => ['billing', 'boosts', status, page] as const,
  boostOptions: (type: string, id: string) => ['billing', 'boost-options', type, id] as const,
  boostStats: (id: string) => ['billing', 'boost-stats', id] as const,
  subscription: () => ['billing', 'subscription'] as const,
  analytics: (days: number) => ['billing', 'analytics', days] as const,
  leads: (p: Record<string, unknown>) => ['billing', 'leads', p] as const,
  escrows: (p: Record<string, unknown>) => ['billing', 'escrows', p] as const,
  escrow: (id: string) => ['billing', 'escrow', id] as const,
  eligibility: (listingId: string) => ['billing', 'escrow-eligibility', listingId] as const,
  quote: (amount: number, feePayer: string, rail: string) => ['billing', 'escrow-quote', amount, feePayer, rail] as const,
  partners: (p: Record<string, unknown>) => ['billing', 'partners', p] as const,
  partner: (slug: string) => ['billing', 'partner', slug] as const,
  paymentMethods: () => ['billing', 'payment-methods'] as const,
  adminRevenue: (p: Record<string, unknown>) => ['billing', 'admin', 'revenue', p] as const,
  adminOrders: (p: Record<string, unknown>) => ['billing', 'admin', 'orders', p] as const,
  adminPartners: () => ['billing', 'admin', 'partners'] as const,
  adminEscrows: (status: string) => ['billing', 'admin', 'escrows', status] as const,
};
export function invalidateBilling() {
  void queryClient.invalidateQueries({ queryKey: billingKeys.all });
}

// ---------------------------------------------------------------- queries
export const usePricing = () => useQuery({ queryKey: billingKeys.pricing(), queryFn: () => api<PricingData>('/api/billing/pricing'), staleTime: 5 * 60_000 });
export const useWallet = (page = 1, enabled = true) => useQuery({ queryKey: billingKeys.wallet(page), queryFn: () => api<WalletData>('/api/billing/wallet', { query: { page, pageSize: 20 } }), enabled, placeholderData: (p) => p });
export const useReferrals = (enabled = true) => useQuery({ queryKey: billingKeys.referrals(), queryFn: () => api<ReferralData>('/api/billing/referrals'), enabled });
export const useOrder = (id: string | undefined) => useQuery({ queryKey: billingKeys.order(id ?? ''), queryFn: () => api<OrderDetail>(`/api/billing/orders/${id}`), enabled: !!id });
export const useOrders = (p: { kind?: string; page?: number } = {}) => useQuery({ queryKey: billingKeys.orders(p), queryFn: () => api<Paginated<OrderDto>>('/api/billing/orders', { query: { ...p, pageSize: 20 } }) });
export const useMyBoosts = (status: string, page = 1) => useQuery({ queryKey: billingKeys.boosts(status, page), queryFn: () => api<Paginated<BoostDto> & { counts: { active: number; scheduled: number; ended: number } }>('/api/billing/boosts', { query: { status: status === 'all' ? undefined : status, page, pageSize: 20 } }), placeholderData: (p) => p });
export const useBoostOptions = (entityType: string | null, entityId: string | null, surface?: string) => useQuery({ queryKey: billingKeys.boostOptions(entityType ?? '', entityId ?? ''), queryFn: () => api<BoostOptions>('/api/billing/boosts/options', { query: { entityType, entityId, surface } }), enabled: !!entityType && !!entityId });
export const useBoostStats = (id: string | null) => useQuery({ queryKey: billingKeys.boostStats(id ?? ''), queryFn: () => api<BoostStats>(`/api/billing/boosts/${id}/stats`), enabled: !!id });
export const useSubscription = (enabled = true) => useQuery({ queryKey: billingKeys.subscription(), queryFn: () => api<SubscriptionData>('/api/billing/subscription'), enabled });
export const useProAnalytics = (days: number, enabled: boolean) => useQuery({ queryKey: billingKeys.analytics(days), queryFn: () => api<ProAnalytics>('/api/billing/pro/analytics', { query: { days } }), enabled });
export const useProLeads = (p: { status?: string; page?: number }, enabled: boolean) => useQuery({ queryKey: billingKeys.leads(p), queryFn: () => api<Paginated<LeadDto> & { counts: Record<string, number> }>('/api/billing/pro/leads', { query: { ...p, pageSize: 20 } }), enabled, placeholderData: (x) => x });
export const useEscrows = (p: { role?: string; status?: string; page?: number } = {}, enabled = true) => useQuery({ queryKey: billingKeys.escrows(p), queryFn: () => api<Paginated<EscrowDto>>('/api/billing/escrows', { query: { ...p, pageSize: 20 } }), enabled });
export const useEscrow = (id: string | undefined) => useQuery({ queryKey: billingKeys.escrow(id ?? ''), queryFn: () => api<EscrowDto>(`/api/billing/escrows/${id}`), enabled: !!id });
export const useEscrowEligibility = (listingId: string | null) => useQuery({ queryKey: billingKeys.eligibility(listingId ?? ''), queryFn: () => api<EscrowEligibility>('/api/billing/escrows/eligibility', { query: { listingId } }), enabled: !!listingId });
export const useEscrowQuote = (amountCents: number, feePayer: string, rail: string, enabled = true) => useQuery({ queryKey: billingKeys.quote(amountCents, feePayer, rail), queryFn: () => api<EscrowQuote & { enabled: boolean }>('/api/billing/escrows/quote', { query: { amountCents, feePayer, rail } }), enabled: enabled && amountCents >= 10000 && amountCents <= 1000000, placeholderData: (p) => p });
export const usePartners = (p: { campusId?: string | null; stage?: string | null }) => useQuery({ queryKey: billingKeys.partners(p), queryFn: () => api<PartnersData>('/api/billing/partners', { query: { campusId: p.campusId ?? undefined, stage: p.stage ?? undefined } }), placeholderData: (x) => x });
export const usePartner = (slug: string | undefined) => useQuery({ queryKey: billingKeys.partner(slug ?? ''), queryFn: () => api<PartnerDetail>(`/api/billing/partners/${slug}`), enabled: !!slug });
export const usePaymentMethods = (enabled = true) => useQuery({ queryKey: billingKeys.paymentMethods(), queryFn: () => api<PaymentMethod[]>('/api/billing/payment-methods'), enabled });
export const useAdminRevenue = (p: { from?: string; to?: string; campusId?: string; groupBy?: string }) => useQuery({ queryKey: billingKeys.adminRevenue(p), queryFn: () => api<RevenueData>('/api/billing/admin/revenue', { query: p }), placeholderData: (x) => x });
export const useAdminOrders = (p: { q?: string; kind?: string; status?: string; page?: number }) => useQuery({ queryKey: billingKeys.adminOrders(p), queryFn: () => api<Paginated<AdminOrder>>('/api/billing/admin/orders', { query: { ...p, pageSize: 15 } }), placeholderData: (x) => x });
export const useAdminPartners = () => useQuery({ queryKey: billingKeys.adminPartners(), queryFn: () => api<AdminPartner[]>('/api/billing/admin/partners') });
export const useAdminEscrows = (status: string) => useQuery({ queryKey: billingKeys.adminEscrows(status), queryFn: () => api<Paginated<EscrowDto>>('/api/billing/admin/escrows', { query: { status, pageSize: 20 } }) });

// ---------------------------------------------------------------- mutations
export const useCreateOrder = () => useMutation({ mutationFn: (body: OrderInput) => api<OrderDto>('/api/billing/orders', { body }), onSuccess: invalidateBilling });
export const usePayOrder = () => useMutation({ mutationFn: ({ id, body }: { id: string; body: { card: CardInput; useWallet?: boolean } | { paymentMethodId: string; useWallet?: boolean } }) => api<OrderDto>(`/api/billing/orders/${id}/pay`, { body }), onSuccess: invalidateBilling });
export const useCancelOrder = () => useMutation({ mutationFn: (id: string) => api<OrderDto>(`/api/billing/orders/${id}/cancel`, { method: 'POST' }), onSuccess: invalidateBilling });
export const useValidatePromo = () => useMutation({ mutationFn: (body: { code: string; orderKind?: string; planId?: string; subtotalCents?: number }) => api<{ valid: boolean; kind: string; value: number; discountCents: number; code: string; description: string }>('/api/billing/promo/validate', { body }) });
export const useRedeemPromo = () => useMutation({ mutationFn: (code: string) => api<{ creditedCents: number; balanceCents: number }>('/api/billing/promo/redeem', { body: { code } }), onSuccess: invalidateBilling });
export const useCancelBoost = () => useMutation({ mutationFn: (id: string) => api<BoostDto & { refundCents: number }>(`/api/billing/boosts/${id}/cancel`, { method: 'POST' }), onSuccess: invalidateBilling });
export const useSubscribe = () => useMutation({ mutationFn: (body: SubscribeInput) => api<{ subscription: SubscriptionDto | null; order: OrderDto }>('/api/billing/subscription', { body }), onSuccess: invalidateBilling });
export const useCancelSubscription = () => useMutation({ mutationFn: () => api<SubscriptionDto>('/api/billing/subscription/cancel', { body: {} }), onSuccess: invalidateBilling });
export const useResumeSubscription = () => useMutation({ mutationFn: () => api<SubscriptionDto>('/api/billing/subscription/resume', { method: 'POST' }), onSuccess: invalidateBilling });
export const useChangePlan = () => useMutation({ mutationFn: (planId: string) => api<SubscriptionDto>('/api/billing/subscription/change-plan', { body: { planId } }), onSuccess: invalidateBilling });
export const useLeadStatus = () => useMutation({ mutationFn: ({ id, status }: { id: string; status: string }) => api(`/api/billing/pro/leads/${id}`, { method: 'PATCH', body: { status } }), onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['billing', 'leads'] }) });
export const useCreateEscrow = () => useMutation({ mutationFn: (body: EscrowInput) => api<EscrowDto>('/api/billing/escrows', { body }), onSuccess: invalidateBilling });
export const useEscrowAction = () => useMutation({
  mutationFn: ({ id, action, body }: { id: string; action: 'accept' | 'release' | 'refund' | 'cancel' | 'dispute' | 'resolve'; body?: Record<string, unknown> }) => api<EscrowDto>(`/api/billing/escrows/${id}/${action}`, { method: 'POST', body: body ?? {} }),
  onSuccess: invalidateBilling,
});
export const useFundEscrow = () => useMutation({ mutationFn: ({ id, body }: { id: string; body: { card: CardInput; rail?: EscrowRail } | { paymentMethodId: string; rail?: EscrowRail } }) => api<{ escrow: EscrowDto; order: OrderDto }>(`/api/billing/escrows/${id}/fund`, { body }), onSuccess: invalidateBilling });
export const useKitDone = () => useMutation({ mutationFn: (body: { slug: string; done: boolean }) => api<{ done: string[] }>('/api/billing/kit/done', { body }), onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ['billing', 'partners'] }); void queryClient.invalidateQueries({ queryKey: ['billing', 'partner'] }); } });
export const useSponsorLead = () => useMutation({ mutationFn: (body: { businessName: string; contact: string; campusId?: string; interest: 'sponsor' | 'building'; note?: string }) => api<{ id: string }>('/api/billing/sponsor-leads', { body }) });
export const useReportPartner = () => useMutation({ mutationFn: ({ slug, reason, details }: { slug: string; reason: string; details?: string }) => api(`/api/billing/partners/${slug}/report`, { body: { reason, details } }) });
export const useAdminRefund = () => useMutation({ mutationFn: ({ id, amountCents, reason }: { id: string; amountCents?: number; reason: string }) => api<OrderDto>(`/api/billing/admin/orders/${id}/refund`, { body: { amountCents, reason } }), onSuccess: invalidateBilling });
export const useAddPaymentMethod = () => useMutation({ mutationFn: (body: CardInput & { setDefault?: boolean }) => api<PaymentMethod>('/api/billing/payment-methods', { body }), onSuccess: invalidateBilling });
