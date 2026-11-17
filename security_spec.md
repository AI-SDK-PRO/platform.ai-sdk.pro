# Firestore Security Specification (`ai-sdk.pro`)

## Phase 0: Data Invariants
1. **Default-Deny Catch-All**: Every path not explicitly matched is denied (`allow read, write: if false`).
2. **Strict Tenant & PII Isolation**: All documents live under `/users/{userId}/...` and require `isOwner(userId)` (`request.auth != null && request.auth.uid == userId && request.auth.token.email_verified == true`). No blanket `isSignedIn()` reads.
3. **Zero API Key / Secret Persistence**: No collection schema allows `apiKey`, `secret`, `token`, or arbitrary keys (`keys().hasOnly(...)` enforced on create, `affectedKeys().hasOnly(...)` enforced on update).
4. **Path ID & Size Hardening**: Single-document operations validate `isValidId()` (`^[a-zA-Z0-9_\-]+$`, max 128 chars) and bound all string fields with `.size()` limits matching `firebase-blueprint.json`.
5. **Immutable Ownership & Temporal Integrity**: `uid` / `ownerId` / `id` / `createdAt` cannot be modified after creation; `createdAt` and `updatedAt` must equal `request.time`.

## The "Dirty Dozen" Adversarial Payloads (Must All Return PERMISSION_DENIED)
1. **Unauthenticated read** on `/users/userA/private/account` (`request.auth == null`).
2. **Unverified email write** on `/users/userA/presets/p1` (`request.auth.token.email_verified == false`).
3. **Cross-tenant get/list** by `userB` on `/users/userA/presets/p1` (`auth.uid != userA`).
4. **Identity spoofing on create**: `userA` writing `ownerId: "userB"` or `uid: "userB"`.
5. **Shadow field injection ("Ghost Field")**: `userA` adding `apiKey: "sk-..."` or `isAdmin: true` to `PromptPreset` or `UserAccount`.
6. **ID poisoning**: Document ID longer than 128 chars or containing invalid characters (`../evil`).
7. **Oversized prompt payload ("Denial of Wallet")**: `PromptPreset.prompt` exceeding 2000 characters.
8. **Invalid enum poisoning**: `PromptPreset.providerPreference` set to `"arbitrary-provider"`.
9. **Client-forged timestamp on create**: `createdAt` set to a client-chosen `Timestamp` instead of `request.time`.
10. **Immutable field mutation on update**: Updating `ownerId`, `id`, or `createdAt` on an existing `PromptPreset`.
11. **Missing `updatedAt == request.time` on update** or updating disallowed keys.
12. **Reading or writing arbitrary root paths** such as `/admins/userA` or `/users/userA/public/profile`.
