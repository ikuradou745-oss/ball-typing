# Firestore Security Specification (Ball Typing)

## 1. Data Invariants
1. **No Google Account Login + Unforgeable Server Write Gate**: All mutations to `/surveys/{surveyId}`, `/surveyQuotas/{visitorId}`, `/admins/{visitorId}`, `/presence/{visitorId}`, and `/presenceGates/{visitorId}` require `serverAuth` verified by the backend server (never transmitted to browsers). Any direct browser DevTools write to Firestore fails with `PERMISSION_DENIED`.
2. **Admin-Only Real-Time Survey Reading**: Direct single-document `get` on `/surveys/{surveyId}` is disabled (`allow get: if false`). `allow list` on `/surveys/{surveyId}` enforces `resource.data.adminChannel == <secret>` so only clients that have passed the server-side admin code verification (`👑`) and received `adminChannel` can attach real-time `onSnapshot` listeners.
3. **Immutable Survey Records & Server Timestamps**: Survey `createdAt` must equal `request.time`. Updates and deletes on `/surveys/{surveyId}` are always denied (`false`).
4. **Atomic 3-Per-Day Rate Limit**: Every `create` on `/surveys/{surveyId}` must occur in the same atomic `writeBatch` as creating or updating `/surveyQuotas/{visitorId}` (`updatedAt == request.time`), where `year/month/day` match server JST (`request.time + duration.value(9, 'h')`), `count` increments by 1 on the same JST date (or resets to 1 on a new JST date), and `1 <= count <= 3`.
5. **Protected Presence & Midnight JST Reset**: `/presence/{visitorId}` may only be created or updated in an atomic `writeBatch` with `/presenceGates/{visitorId}` (carrying `serverAuth`). Client browsers can subscribe to `presenceScope == 'public_lobby'` in real time without ever receiving `serverAuth`, and cannot inject fake/test players or overwrite another visitor's status.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Direct Client Survey Create**: Browser DevTools runs `addDoc(collection(db, 'surveys'), ...)` without `serverAuth` -> `PERMISSION_DENIED`.
2. **Even Admin Forging Standalone Survey**: Admin with `adminChannel` tries `setDoc(doc(db, 'surveys', 's1'), ...)` without `serverAuth` on `surveyQuotas` -> `PERMISSION_DENIED`.
3. **Visitor ID Spoofing / Mismatch**: Batch updates `surveyQuotas/v1` while survey says `visitorId: "v2"` -> `PERMISSION_DENIED`.
4. **Standalone Survey Create (Quota Bypass)**: Creating `/surveys/s1` without atomically updating `/surveyQuotas/{visitorId}` -> `PERMISSION_DENIED`.
5. **Fourth Survey Submission on Same JST Day**: `surveyQuotas/{visitorId}` with `count: 4` on the same JST date -> `PERMISSION_DENIED`.
6. **Client Date Forgery on Quota**: Passing tomorrow's `day` (`year/month/day != jstTime()`) -> `PERMISSION_DENIED`.
7. **Client Timestamp Forgery**: Passing backdated/future `createdAt`, `updatedAt`, or `lastSeenAt` instead of `request.time` -> `PERMISSION_DENIED`.
8. **Shadow / Ghost Field Injection**: Injecting extra field `isAdmin: true` or `role: "superadmin"` -> `PERMISSION_DENIED`.
9. **Oversized Content DoS**: Submitting `content` > 300 chars or `authorName`/`username` > 20 chars -> `PERMISSION_DENIED`.
10. **Path Variable Poisoning**: Writing `/surveys/bad$id!!` or `/presence/bad$id!!` -> `PERMISSION_DENIED`.
11. **Non-Admin Survey Scraping or Direct Presence Gate Read**: Calling `getDocs(collection(db, 'surveys'))` without `adminChannel`, or reading `/presenceGates` -> `PERMISSION_DENIED`.
12. **Fake Presence Injection / Self-Admin Escalation**: Browser calls `setDoc(doc(db, 'presence', 'bot1'), ...)` or `setDoc(doc(db, 'admins', 'me'), ...)` -> `PERMISSION_DENIED`.
