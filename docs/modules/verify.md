# verify — 身份验证 + 信任 (module doc)

Owner: verify module agent. Scope: BRIEF §3 #4, API.md §6, DATA_MODEL §3.4 / §5 / §6.1, DESIGN §4.5 / §4.6 / §7.7 / §7.8.

## What was built

**Server** (`server/src/modules/verify/`)
- `routes.ts` — every endpoint of API.md §6 plus the payment-method, timeline and admin-stats endpoints listed below. Zod schemas live in `shared/src/schemas/verify.ts` (`verifySchemas`).
- `service.ts` — stable cross-module exports: `hasSupplyProof(userId)`, `latestRequest(userId, type?)`, `openRequest`, `approvedIdType`, `addPaymentMethod(userId, card)`, `removePaymentMethod`, `setDefaultPaymentMethod`, `listPaymentMethods`, `verificationStatus(user)`, `trustProfile(userId)`, `toRequestDto`.
- Edu flow is a thin alias of `lib/eduVerify.ts` (one code path, one owner of `email_codes`). Phone flow uses `lib/mailbox.ts` `sendSmsCode` / `verifySmsCode` (`phone_codes`). Trust is only changed through `lib/trust.ts` (`recomputeTrust`, `setTrustOverride`).
- Mock card gateway (test mode, never a charge): Luhn + expiry check, `4242 4242 4242 4242` succeeds, a number ending in `0002` → `402 PAYMENT_FAILED { failureCode: 'card_declined' }`, `0069` → `expired_card`. Only brand + last4 are stored (`payment_methods`, billing's `PaymentMethod` DTO). The first saved card sets `users.payment_verified_at`; removing the last one clears it; both recompute trust.
- Admin writes are audited (`verify.claim`, `verify.approve`, `verify.reject`, `user.trust_override` via `setTrustOverride`) and every document open streams through an admin-only endpoint that writes `verify.view_document` (deduped per admin / request / side for 10 min) — matches the admin-requirements rubric.
- Analytics (`lib/events`): `verify.submit` (canonical), `verify.cancel`, `verify.edu_request`, `verify.edu_confirm`, `verify.phone_request`, `verify.phone_confirm`, `verify.payment_add`, `verify.payment_fail`, `verify.payment_remove`, `verify.approve`, `verify.reject`, `verify.trust_override`.
- Notifications (`lib/notify`): `verify.approved`, `verify.rejected` (with the reason), `system` "fully verified" when a user reaches L3, `system` on an admin trust override.
- Duplicate-document warning: a request whose front upload `sha256` also exists under another owner is flagged `duplicateDocument: true` in the queue.

**Seed** (`server/src/db/seed/verify.ts`, version 1) — 40 verification requests across Northwestern (rich), UIUC, NYU, USC and UMich: 10 pending (3 of them past the 24 h SLA), 3 in review (claimed by the admin), 20 approved (aligned with the core seed's L2/L3 users, incl. landlord proofs), 6 rejected with bilingual reasons + rubric codes, 1 cancelled; alice has an older rejected attempt before her approval. Placeholder documents are abstract SVG "cards" watermarked `SAMPLE · 示例` (front / back / selfie variants, never real-looking) written to **`UPLOAD_PRIVATE_DIR/seed/verify/`** (`server/data/private-uploads/…`) and registered as private `uploads` rows (`purpose='verification'`, `is_private=1`) so they are only reachable through `/api/uploads/:id/file` and the audited admin endpoint. (The task suggested `server/uploads/private/seed/`, but everything under `server/uploads/` is served statically — a private document must not live there.) Also seeds: phone codes (one fresh dev code for 张浩然), one mock card for every L3 user that has none, approve/reject/claim/view audit entries, an admin trust-override entry, `verify.submit` events and the matching notifications. Idempotent: everything carries a `seed-verify-` id or path prefix and is wiped before re-insert.

**Web** (`web/src/features/verify/`, `web/src/i18n/verify.ts` — every string in zh-CN and en)
- `/verify` — `VerifyCenter.tsx`: level progress 0→3 with what each level unlocks, the ladder (edu → ID → phone → payment) where the first incomplete step opens by default (deep links `#id`, `?step=phone`), edu inline code flow (+ link to `/verify-email`), ID upload flow with type select, name / last-4, private `PhotoUploader`s (front required, back + selfie optional), photo tips and privacy note, pending / in-review / rejected (reason + 重新提交) / approved / withdrawn cards, phone SMS flow, mock card form with saved-method list (default / remove), status history timeline, right rail with the badge, unlock list and the 「仅接受已验证用户私信」 switch (`PATCH /api/users/me`). Loading skeleton, error state with retry, dev-code hints in `import.meta.env.DEV`.
- `/verify/trust/:userId` — standalone public trust profile page using `TrustProfileCard`.
- `/verify/admin` — `admin.tsx` (default export, also mounted by the admin shell at `/admin/verify`): SLA stat strip, tabs (待处理 / 已通过 / 已拒绝 / 全部), type / campus / search / sort filters, queue table (stacked cards on mobile) with SLA timer and overdue colouring, review modal with the audited document viewer (front / back / selfie tabs, zoom, open in new tab, PDF iframe), request facts, rubric, audit trail + the user's other requests, claim / approve (with internal note) / reject (rubric code pre-fills a bilingual reason the user sees) / manual trust override, prev / next, auto-advance after a decision. Keyboard: `J`/`K`/`↑`/`↓` move, `Enter`/`O` open, `/` focus search, `A` approve, `R` reject, `C` claim, `←`/`→` switch document, `N`/`P` next / previous, `Esc` close.
- Components other modules can import from `@/features/verify` (`index.ts`): `TrustStrip` (DESIGN §4.6 band for listing / item / buddy detail pages: `<TrustStrip user={listing.owner} role="host" onReport={…} />`, adds the warning line + `warning-soft` border for L0–1), `TrustProfileCard` (DESIGN §7.8 「信任档案」 section — `<TrustProfileCard userId={id} />` or `profile={data} compact` when the Profile page already renders the header), hooks `useVerifyStatus`, `useTrustProfile`, `verifyKeys`, helper `typeLabel`.
- `TrustBadge` usage (UI kit): `size="inline"` next to names (L0 renders nothing), `size="card"` on cards / the Trust Strip, `size="profile"` with label on profiles and in the center. Never purchasable; the Pro badge is a separate `Badge variant="pro"`.

## Endpoints (`/api/verify`)

| Method | Path | Auth | Notes |
|---|---|---|---|
| GET | `/status` | user | `{ trustLevel, steps: { edu, id (latest request), phone (masked), payment (methods[]) }, nextStep, badges, verifiedOnlyMessaging, openRequests }` |
| POST | `/edu/request` · `/edu/confirm` | user | aliases of the auth edu-code endpoints |
| GET | `/id` | user | my requests, newest first |
| POST | `/id` | trust ≥ 1 | `IdRequestInput`; uploads must be mine, `purpose='verification'`, unused; `409 CONFLICT { requestId, status }` when an open request of the type exists |
| DELETE | `/id/:id` | owner | pending → cancelled (`409 INVALID_STATE` otherwise) |
| POST | `/phone/request` | user | `{ phone: E.164 }` → `{ sent, expiresInSec: 300, devCode? }`; `409` when another verified account uses the number |
| POST | `/phone/confirm` | user | `{ code }` → `UserMe` |
| GET | `/payment-methods` | user | `PaymentMethod[]` |
| POST | `/payment-methods` | user | `PaymentMethodInput` → `{ method, methods, trustLevel }` (201); `402 PAYMENT_FAILED { failureCode }` |
| POST | `/payment-methods/:id/default` · DELETE `/payment-methods/:id` | user | |
| GET | `/audit` | user | my verification timeline (audit entries about me + my `verify.*` events), paginated |
| GET | `/profile/:userId` | public | `{ user (withStats), suspended, trust: { level, eduVerified, eduDomain, idVerified, idType, phoneVerified, paymentOnFile, memberSince, verifiedAt }, stats }` |
| GET | `/admin/stats` | admin | pending / inReview / overdue / approved24h / rejected24h / oldestPendingHours / medianDecisionHours7d / byType / byCampus |
| GET | `/admin/queue` | admin | `AdminQueueQuery` (status csv default `pending,in_review`, type csv, campusId, q, sort oldest/newest) → `Paginated<QueueItem>` (+ `user` with email, `front/back/selfie` uploads, `ageHours`, `overdue`, `duplicateDocument`, `internalNote`) |
| GET | `/admin/requests/:id` | admin | item + `history: AuditEntry[]` + `userRequests` |
| GET | `/admin/requests/:id/files/:side` | admin | streams front / back / selfie; audits `verify.view_document` |
| POST | `/admin/requests/:id/claim` · `/approve` · `/reject` | admin | §6.1 state machine; reject needs `reason` (3–500), optional `code` (rubric) and `note` |
| POST | `/admin/users/:userId/trust` | admin | `{ trustLevel 0..3, reason }` override via `setTrustOverride` |

## Seed accounts / data worth knowing

- `bob@u.northwestern.edu` (L1) — pending student ID submitted 31 h ago (overdue), an old unconsumed SMS code.
- `haoran.zhang@u.northwestern.edu` (L1) — pending passport + a fresh SMS dev code `731406` for `+13125550118` in `/dev/mailbox`.
- `minjae.park@…`, `daniel.kim@…`, `ava.nguyen@usc.edu` — in review (claimed by the admin).
- `zihao.guo@…` (blurry), `sophia.wang@…` (name mismatch), `grace.hu@…` (expired), `hana.sato@illinois.edu` (cropped), `omar.haddad@umich.edu` (wrong side) — rejected, resubmit available.
- `leo.ma@u.northwestern.edu` — withdrew a request; the center opens the empty upload form.
- `alice@u.northwestern.edu` (L2) — approved student ID after one rejected attempt; `yuting.chen@…`, `ruoxi.sun@…`, `nina.zhou@…`, `meilin.gao@illinois.edu`, `ziyang.pan@nyu.edu`, `hongyu.shi@usc.edu` (L3) — approved passport + mock card on file; `landlord@evanstonhomes.com` / `evanston.rentals@gmail.com` / `manhattan.lets@outlook.com` — approved landlord proofs (`hasSupplyProof` → true).
- `admin@example.edu` — reviewer on every decided row; appears in the audit trail.

## Verification

- `npm run typecheck`: shared ✓, server ✓ for `modules/verify/**` + `seed/verify.ts`, web ✓ for `features/verify/**` + `i18n/verify.ts` (the remaining errors at the time of writing are in other agents' in-progress modules: `buddy`, `chat`, `wanted`).
- `docs/modules/verify.spec.mjs` (server 4104 / web 5104, `DB_PATH=server/data/test-verify.db`): registers fresh users every run, exercises edu code → private upload → ID submit (UI) → SMS code → declined + accepted mock card → verified-only switch → admin modal on a seeded request (keyboard document switch) → approve → keyboard `J/K/Enter/R` reject with rubric → notification + L3 assertion → trust profile → fully verified center → English rejected state → dark mode. Passes with zero page errors.
- Screenshots in `docs/screenshots/verify/`: `verify-center-desktop`, `verify-center-mobile`, `verify-id-submitted`, `verify-phone-payment-done`, `admin-queue-desktop`, `admin-review-modal`, `admin-queue-mobile`, `trust-profile-desktop`, `verify-center-complete`, `verify-center-rejected-en`, `verify-center-dark`.

## Known gaps

- PDF uploads are accepted by the server (`application/pdf`, purpose verification) and rendered in the admin viewer, but the center's `PhotoUploader` only accepts JPG / PNG / WebP (the kit uploader is image-only).
- Document retention (review fix): `verify/jobs.ts` `purgeReviewedDocuments` (every 6 h) deletes the image files of requests decided more than 30 days ago (`verification_requests.files_purged_at`; the uploads row keeps only its sha256 for duplicate detection); account deletion purges immediately. Selfies need an explicit consent checkbox (`selfieConsent`, recorded in `internal_note`); no face template is ever derived. Admins can no longer stream verification uploads through the generic `/api/uploads/:id/file` — only the audited review endpoint. `landlord_proof` is presented as 「租约或产权证明 / Lease or ownership proof」 so sublet posters can upload a lease page (deep link `/verify?step=id&type=landlord_proof`); a separate `lease_proof` type still needs a table rebuild of the `type` CHECK.
- `lease_proof` verification type (billing's supply badge) does not exist in `schema.sql` (CHECK constraint); `hasSupplyProof` currently means an approved `landlord_proof`.
- Phone numbers are stored in E.164 without carrier validation; the "+1 default" normalisation is done in the web form.
- The trust-override endpoint returns the target's `UserMe` to the admin (API.md says "UserMe-ish"); it includes private fields by design for the admin view.

## Integration requests

1. **admin**: mount `features/verify/admin.tsx` (default export) at `/admin/verify` and show the 「验证队列 (n)」 nav count from `GET /api/verify/admin/stats` (`pending + inReview`); link overdue count (`overdue`) into the SLA strip.
2. **core Profile page** (`web/src/pages/Profile.tsx`): replace the inline verified-rows card with `<TrustProfileCard userId={u.id} compact />` from `@/features/verify` so the public trust profile has one implementation.
3. **listings / market / buddy detail pages**: use `<TrustStrip user={owner} role="host|seller|organizer" onReport={…} />` under the gallery (DESIGN §4.6).
4. **billing**: when a card is saved during checkout, call `addPaymentMethod(userId, card)` from `modules/verify/service.ts` (it writes `payment_methods`, sets `users.payment_verified_at`, recomputes trust) instead of inserting directly; `hasSupplyProof(userId)` is exported for the supply badge. If `lease_proof` is required as a distinct type, the architect needs to extend the `verification_requests.type` CHECK in `schema.sql` (SQLite cannot alter a CHECK in an additive migration) and `VerificationType` in `shared/src/enums.ts`.
5. **scaffold `lib/eduVerify.ts`**: `confirmEduCode` could emit `hooks.emit('user.trustChanged')` only through `recomputeTrust` (it already does) — no change needed; noting that `nextTrustStep` in `lib/auth.ts` keys on `users.payment_verified_at`, which verify now maintains (DATA_MODEL §1 lists billing as the writer of that column — please record verify as a co-writer).
6. **scaffold `/api/admin/audit`**: the spec reads `?action=verify.view_document`; the endpoint returned 404 (admin module stub) at the time of writing, so the assertion is skipped until it lands.
7. **scaffold `lib/uploads.ts`**: an `insertSeedUpload` variant for private files (`isPrivate`, base dir `uploadPrivateDir`) would remove the hand-rolled insert in `seed/verify.ts`.
