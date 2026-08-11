## Why

Two accounts existed for one person. Signing up with a password using a Gmail address written without its dots created a second `users` row beside the Google account that already held the same mailbox. Gmail ignores dots and anything after a `+`, so one mailbox can be typed many ways, and Better Auth matches accounts by string equality on the stored address. Nothing in the app closed that gap.

Nothing could be closed, either. There was no way for a user to leave, and no way for an admin to remove an account. Every account created was permanent.

A third problem was found while reading the auth code: the breached-password check ran inside `password.hash`, which Better Auth also calls on its sign-in failure paths to spend the same time a real verify costs. A breached password offered against an account that does not exist answered differently than one offered against an account that does, which tells a stranger which addresses are registered.

## What Changes

- A user closes their own account from the bottom of the account page, and an admin closes any account from the console. Both confirm first.
- Closing cancels the Stripe subscription, deletes the owned Topics, the kept chat attachments, the uploaded avatar, and the LiteLLM key, then deletes the `users` row that cascades to everything else.
- Every email address is canonicalized before Better Auth looks a user up by it or stores it, on the password paths and on the OAuth providers alike, so every way of writing one mailbox reaches one account.
- The breached-password check moves off `password.hash` and onto the paths that actually set a password.
- A Topic's link-preview card draws the owner's published photo instead of only their username initials.

## Capabilities

### New Capabilities

- `account-closing`: closing an account, by its own user or by an admin, and what a close takes with it

### Modified Capabilities

- `user-auth`: one mailbox reaches one account regardless of how the address is written, and a breached password is rejected only where a password is being set
- `authorization`: a new `admin:deleteUser` capability, admin only
- `social-sharing`: the preview card draws the Topic owner's published avatar
- `admin-console`: the users table closes an account

## Impact

- `api/users.ts` (new): `deleteUser` and the two routes
- `api/auth.ts`: the single before hook that canonicalizes an address and refuses a breached password, plus `mapProfileToUser` on both providers
- `shared/emails.ts` (new): `toCanonicalEmail`
- `api/billing.ts`: `cancelUserSubscription`
- `api/authorization.ts`: the `admin:deleteUser` capability
- `api/chat/attachments.ts`: `deleteStoredChatAttachments`
- `api/share/preview.ts`, `api/share/previewImage.ts`: the owner avatar on the card, and the template version it forces
- `ui/src/pages/AdminPage.tsx`, `ui/src/components/account/AccountSettings.tsx`: the two confirm-first controls
- No schema migration. Every foreign key pointing at `users` already cascades.
