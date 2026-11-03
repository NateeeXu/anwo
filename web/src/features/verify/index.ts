// Public surface of the "verify" module — other modules import only what is exported here.
//   TrustStrip        detail-page band under the gallery (DESIGN §4.6): <TrustStrip user={listing.owner} role="host" onReport={…} />
//   TrustProfileCard  public 「信任档案」 section (DESIGN §7.8): <TrustProfileCard userId={id} /> or <TrustProfileCard profile={data} compact />
//   useVerifyStatus   React Query hook for GET /api/verify/status (own trust ladder, next step, badges)
//   useTrustProfile   React Query hook for GET /api/verify/profile/:userId
export { default as routes } from './routes';
export { default as AdminPanel } from './admin';
export { TrustStrip, type TrustStripProps } from './TrustStrip';
export { TrustProfileCard, type TrustProfileCardProps } from './TrustProfileCard';
export { useVerifyStatus, useTrustProfile, verifyKeys, type VerifyStatus, type TrustProfile, type NextStep } from './api';
export { typeLabel } from './labels';
