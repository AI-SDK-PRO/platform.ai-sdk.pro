# Firebase authentication rollout — 2026-11-20

Scope: `/login`, `/signup`, and `/workspace/account` for the existing Firebase project. Keep the existing Neon `aisdk_pro` users/repositories and GitHub App permissions. Do not change production DNS, keys, or GitHub App configuration automatically.

## Verified from repository and live site

- Firebase project in `firebase-applet-config.json`: `gen-lang-client-0257543355`.
- Existing Firebase Google popup was blocked on the production `/login` page (`auth/popup-blocked`), email form was not rendered, and GitHub Login was absent.
- Existing `NEXT_PUBLIC_FIREBASE_EMAIL_AUTH_ENABLED` key is listed on Vercel, but its actual value and Firebase Console settings were not verified. The email form is now always visible; Firebase remains the source of truth for provider enablement.
- Firebase identity is mapped to the existing Neon `aisdk_pro.user.id` by `apps/web/lib/firebase-session.ts`. Same Firebase UID keeps the same platform user. No automatic merge by email.
- The GitHub OAuth connection under `/api/connections/github` is for repository access **only**. Firebase's GitHub provider is a **separate sign-in/linking flow**; both may use the same GitHub App when OAuth client/callback settings allow.

## Verify externally before production merge

1. In Firebase Authentication > Sign-in method, confirm **Google**, **GitHub**, and **Email/Password** are enabled for `gen-lang-client-0257543355`. Do not create another Firebase project.
2. In Firebase Authentication > Authorized domains confirm `platform.ai-sdk.pro` (plus other domains actually used) is present.
3. In Firebase GitHub provider confirm Client ID and Secret match the intended existing GitHub App's OAuth credentials. Never paste secrets into a PR, issue, chat, or client code.
4. GitHub App user authorization must allow the Firebase OAuth redirect `https://gen-lang-client-0257543355.firebaseapp.com/__/auth/handler`; the existing repository-link callback is `https://platform.ai-sdk.pro/api/auth/callback/github` if the current `BETTER_AUTH_URL` is `https://platform.ai-sdk.pro`. GitHub Apps support multiple callback URLs, so retain both when they are needed. Check the actual callback offered by Firebase rather than guessing from environment names.
5. Verify the Vercel production `NEON_DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and `GITHUB_CLIENT_ID/SECRET` values through the existing secured settings page without printing secrets. Do not substitute Google OAuth client credentials for GitHub credentials.
6. On the preview URL, test **Email signup -> verification email -> Email login -> same workspace**, **Google login**, **GitHub login**, then login as Google and link GitHub from `/workspace/account`. Sign out and sign in using the linked GitHub provider: Firebase UID and Neon user/own repositories must be unchanged.
7. Test inverse linking: Email account -> Google and GitHub. Test collision: a GitHub credential already linked to a different UID must fail; no silent data merge.
8. Verify `/api/platform/session` returns the same platform ID and securely renewed session, and that `/api/platform/connected-accounts` still reports **repository access**, not Firebase GitHub sign-in.
9. Check build and deployment readiness. Keep PR draft, no automatic production merge or deploy.

## Browser constraints

Provider Popup calls must be synchronous with a user gesture, after modules are loaded. Do **not** blindly switch to `signInWithRedirect` when `authDomain` is `*.firebaseapp.com` and the site is under `*.ai-sdk.pro`: browsers may block third-party storage required by redirect. Implement the Firebase-documented same-domain proxy/handler option before using redirect in production.

References:
- https://firebase.google.com/docs/auth/web/github-auth
- https://firebase.google.com/docs/auth/web/account-linking
- https://firebase.google.com/docs/auth/web/redirect-best-practices
- https://docs.github.com/en/apps/creating-github-apps/writing-code-for-a-github-app/building-a-login-with-github-button-with-a-github-app
