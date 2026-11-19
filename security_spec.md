# Firestore Security Specification (Ball Typing)

## 1. Data Invariants
1. **Identity & Verification**: Only authenticated, email-verified users (`request.auth != null && request.auth.token.email_verified == true`) can submit surveys or read their own quota document.
2. **Admin-Only Survey Visibility**: Only verified administrators (`isAdmin()`) may `get` or `list` documents in `/surveys/{surveyId}`. Non-admin users cannot read, list, update, or delete any survey.
3. **Immutable Survey Records & Server Timestamps**: Survey `createdAt` must equal `request.time`. Updates and deletes on `/surveys/{surveyId}` are denied to regular users.
4. **Atomic 3-Per-Day Rate Limit**: Every `create` on `/surveys/{surveyId}` must occur in the same atomic `writeBatch` as creating or updating `/surveyQuotas/{request.auth.uid}` (`updatedAt == request.time`), where `year/month/day` match server JST (`request.time + duration.value(9, 'h')`), `count` increments by 1 on the same JST date (or resets to 1 on a new JST date), and `1 <= count <= 3`.
5. **Strict Schema & Size Bounds**: Extra "ghost" keys, oversized strings (`authorName > 20` or `content > 300`), and malformed path IDs (`> 128` chars or non-`[a-zA-Z0-9_-]`) are always rejected.

## 2. The "Dirty Dozen" Adversarial Payloads
1. **Unauthenticated Survey Create**: `request.auth == null` creates `/surveys/s1` -> `PERMISSION_DENIED`.
2. **Unverified Email Survey Create**: `email_verified == false` creates `/surveys/s1` -> `PERMISSION_DENIED`.
3. **UID Spoofing**: Authenticated user A creates `/surveys/s1` with `uid: "user_B"` -> `PERMISSION_DENIED`.
4. **Standalone Survey Create (Quota Bypass)**: User creates `/surveys/s1` without atomically updating `/surveyQuotas/{uid}` -> `PERMISSION_DENIED`.
5. **4th Submission Same JST Day**: User with `surveyQuotas/{uid}.count == 3` for today tries to submit a 4th survey with `count: 4` or `count: 1` -> `PERMISSION_DENIED`.
6. **Client Date Forgery**: User submits `/surveyQuotas/{uid}` with tomorrow's `day` to bypass today's limit -> `PERMISSION_DENIED`.
7. **Client Timestamp Forgery**: User passes backdated/future `createdAt` or `updatedAt` instead of `serverTimestamp()` -> `PERMISSION_DENIED`.
8. **Shadow / Ghost Field Injection**: User injects `isAdmin: true` or `role: "admin"` into `/surveys/s1` or `/surveyQuotas/{uid}` -> `PERMISSION_DENIED`.
9. **Oversized Content DoS**: User submits `content` with 301+ characters or `authorName` with 21+ characters -> `PERMISSION_DENIED`.
10. **Path Variable Poisoning**: User writes `/surveys/bad$id!!` or 200-char ID -> `PERMISSION_DENIED`.
11. **Non-Admin Survey Scraping**: Regular authenticated user runs `getDocs(collection(db, 'surveys'))` or `getDoc(doc(db, 'surveys', 's1'))` -> `PERMISSION_DENIED`.
12. **Quota Deletion / Self-Admin Escalation**: Regular user deletes `/surveyQuotas/{uid}` or creates `/admins/{uid}` -> `PERMISSION_DENIED`.
