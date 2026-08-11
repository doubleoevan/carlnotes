## 1. Closing an account

- [x] 1.1 Add `cancelUserSubscription` to `api/billing.ts`, cancelling outright and doing nothing for a free user
- [x] 1.2 Add `deleteStoredChatAttachments` to `api/chat/attachments.ts`, beside the other chat attachment deletes
- [x] 1.3 Add `api/users.ts` with `deleteUser`: retire the billing and the LiteLLM key first and let either abort the close, then delete owned Topics through `deleteTopic`, the stored chat attachments, and the avatar, then delete the row
- [x] 1.4 Record `account_deleted` with who closed it, since the row that would say so is gone
- [x] 1.5 Add the two routes, `DELETE /admin/users/:id` gated by `admin:deleteUser` and refusing the caller's own id, and `DELETE /users/me` needing only a session
- [x] 1.6 Mount `usersRoute` in `api/index.ts`
- [x] 1.7 Verify every foreign key pointing at `users` cascades in the live schema

## 2. Authorization

- [x] 2.1 Add `admin:deleteUser` to the `Capability` union and to the admin-only group in `api/authorization.ts`

## 3. The two controls

- [x] 3.1 Add `sendUserDelete` to `ui/src/lib/billingClient.ts` and `sendAccountDelete` to `ui/src/lib/profileClient.ts`, both throwing on a rejection
- [x] 3.2 Add the close column to the admin users table, hidden on the admin's own row, confirming first and reloading after
- [x] 3.3 Add the close section last on the account page, styled destructive, confirming first and leaving with a full navigation
- [x] 3.4 Add `account_deleted` to the analytics event union

## 4. One mailbox, one account

- [x] 4.1 Add `shared/emails.ts` with `toCanonicalEmail`, folding Gmail dots, `+tags`, and `googlemail.com`, and only lowercasing every other domain
- [x] 4.2 Cover it with unit tests for dots, `+tag`, both, the googlemail fold, case, a non-Gmail address, and idempotence
- [x] 4.3 Canonicalize the address on every Better Auth path that carries one, through the single before hook
- [x] 4.4 Canonicalize the OAuth providers' profiles with `mapProfileToUser`
- [x] 4.5 Check both live databases for an account stored non-canonically that a password sign-in would no longer find

## 5. The breached-password check

- [x] 5.1 Move the check off `password.hash` and onto the paths that set a password, leaving sign-in out
- [x] 5.2 Fold it into the same before hook, since Better Auth takes only one

## 6. The card's owner avatar

- [x] 6.1 Name the published avatar once as `PublishedAvatar` in `api/avatars.ts` and reuse it
- [x] 6.2 Carry the owner's published avatar on `TopicPreview` and include its identity in the card's storage key
- [x] 6.3 Read the image only when a card is actually being rendered, with a timeout on a provider photo and the initials as the fallback
- [x] 6.4 Draw the image in the byline, cropped to the circle the initials draw
- [x] 6.5 Bump the card's template version

## 7. Verification

- [x] 7.1 Render a real card for each avatar kind and look at it: upload, provider photo, initials, unreachable image
- [x] 7.2 Close a throwaway account end to end and confirm nothing of it survives
- [x] 7.3 Confirm a closed account's session cookie resolves to nobody at once, and its address can sign up again
- [x] 7.4 Sign up with one Gmail variant and confirm every other variant is rejected as already existing
- [x] 7.5 Confirm every variant still signs in to that same account
- [x] 7.6 Open and cancel both confirmation dialogs in the browser
- [x] 7.7 `bash scripts/preflight.sh` green
