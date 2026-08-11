## Context

An account existed twice for one person. A Google account held `evan.tsao.author@gmail.com` and a later password signup created a second row for `evantsaoauthor@gmail.com`. Gmail treats those as one mailbox; Better Auth matches on string equality against the stored address, so the second signup found nothing and made a new account.

Nothing could be removed either. Neither a user nor an admin could close an account, so both the duplicate and every account after it were permanent.

Reading the auth code for the duplicate turned up a third problem. The breached-password check sat inside `password.hash`, which Better Auth also calls on three sign-in failure paths to spend the same time a real verify costs. A breached password offered against a non-existent account was rejected for a different reason than one offered against a real account, which answers a stranger's question about which addresses are registered.

## Goals / Non-Goals

**Goals:**

- A user can leave, and an admin can remove an account, with everything that account owns going with it.
- One mailbox reaches one account no matter how its address is written, on the password paths and the OAuth providers alike.
- The breached-password check runs only where a password is being set.
- The link-preview card draws the owner's real photo.

**Non-Goals:**

- Restoring a closed account. Closing is destructive by design and the confirmation says so.
- A grace period or soft delete. Nothing in the product needs one yet, and a soft delete would have to be honoured by every read path.
- Refunding or prorating a cancelled plan. Closing cancels outright.
- A separate canonical-address column. `users.email` is already unique, and storing the canonical form in it makes that constraint enforce the invariant for free.

## Decisions

**Retire what can spend money first, destroy second.** `deleteUser` cancels the Stripe subscription and retires the LiteLLM key before touching a row, and lets either throw. A throw aborts the close and leaves the account whole, which is recoverable: the row still names the key, so it can be retried. Doing it the other way round would delete someone who keeps being charged, or leave a funded key live with nothing left that names it. Everything after that point is best-effort, because a stored object left behind costs storage and nothing else.

**Let the database cascade, and handle only what it cannot reach.** Every foreign key pointing at `users` already cascades, verified against the live schema, so the close does not walk the tables. What a cascade cannot reach is what `deleteUser` does by hand: the Stripe subscription, the objects in storage behind Topics and kept chat attachments, the uploaded avatar, and the LiteLLM key. Owned Topics go through `deleteTopic` rather than being left to cascade, because their attachments and featured position are released there.

**Canonicalize both sides, in one hook.** Better Auth takes a single `hooks.before`, and a hook that returns `{ context: { body } }` has it merged back over the request. Rewriting the address there means the lookup and the insert both see the same form. Canonicalizing only the incoming address would be worse than doing nothing: a stored address written another way would stop matching.

Canonicalizing on the OAuth side uses `mapProfileToUser`, whose result the providers spread over the profile they read. An earlier attempt wrapped `getUserInfo` instead, which meant hand-building each provider only to borrow its own function. `mapProfileToUser` is the same seam with none of that.

**Store the canonical form in `users.email` rather than beside it.** A second column would need a unique index and a backfill of its own. The address column is already unique, so writing the canonical form into it makes the database refuse a duplicate mailbox without anything new. The cost is that the address as typed is not kept, which does not matter: every variant delivers to the same inbox.

**Key the preview card on the avatar's identity, never its bytes.** The card's storage key names the uploaded avatar's key or the provider photo's url. Both change when the image does, so a new image lands on a new url, and a cache hit never pays to fetch an image just to decide it already has the card.

## Risks / Trade-offs

**An account stored under a non-canonical address stops matching.** Canonicalizing the lookup means a row written before this change can no longer be found by the address it holds. Checked against both live databases: dev has no drift across 57 accounts, and prd has exactly one, which signs in with Google and therefore matches on the provider account id without the address being consulted. Nobody is locked out. That one row should still be canonicalized, or its owner's own mailbox stays able to make a second account through a password signup.

**Closing cancels a paid plan outright rather than at the period end.** Someone who closes mid-period forfeits the rest of it. The account is going away, so there is nothing left to keep access to, and the confirmation says the plan is cancelled.

**A close is several external calls, not a transaction.** Storage, Stripe, and LiteLLM cannot join the database transaction. The order puts the two that must not half-succeed first and lets them abort, and the rest are best-effort: a failed object delete leaves an unused file rather than a broken account.

**The canonicalized path list is a list.** A future Better Auth path carrying an address would not be canonicalized until it is added to `EMAIL_BODY_PATHS`, and nothing fails loudly if it is missed.
