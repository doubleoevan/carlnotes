## 1. Schema and migration

- [x] 1.1 Add `users.username` (text, case-insensitively unique), `users.username_changed` (boolean, default false), `users.avatar_source` (enum `generated`/`oauth`/`upload`, default `generated`), and `users.avatar_key` (text, nullable) to `db/schema.ts`
- [x] 1.2 Add `topics.subscriber_count` (integer, default zero) to `db/schema.ts`
- [x] 1.3 Generate the migration, enforcing username uniqueness case-insensitively through a unique index on `lower(username)` rather than in application code
- [x] 1.4 Backfill `subscriber_count` in the migration from existing subscriptions and audience memberships, excluding each Topic owner's own row
- [x] 1.5 Backfill a username for every existing user as SQL inside a migration, so the deploy's existing migration job runs it once per environment and no one-off script has to be kept or remembered
- [x] 1.6 Leave `users.image` untouched — it stays the private account-surface field
- [x] 1.7 Harden `users.username` and `users.username_normalized` to NOT NULL, by drawing the name inside the signup insert rather than in the `create.after` hook. Both columns are declared to Better Auth so it writes them, and a real signup was run end to end against the live constraint

## 2. Usernames

- [x] 2.1 Expand both word lists in `shared/usernameWords.ts`, keeping the coffee-and-reading vocabulary and profanity-filtering both, so the digit suffix becomes the exception rather than the rule
- [x] 2.2 Write the generator: `Adjective-Noun`, four digits appended only to break a collision
- [x] 2.3 Check a generated batch against taken usernames in one query and return the free candidates
- [x] 2.4 Add the reserved blocklist covering `admin`, `carl`, `carlnotes`, `support`, and `notesofcarl`
- [x] 2.5 Assign a username in the existing `databaseHooks.user.create` hook in `api/auth.ts`, beside the LiteLLM key provisioning, and carry username and avatar source on the session
- [x] 2.6 Generate the username at signup rather than asking for one, so signing up stays one step. It is changed afterwards from the account page
- [x] 2.7 Add the username claim endpoint, holding a typed name to the same uniqueness and blocklist rules as an assigned one, with no change limit
- [x] 2.9 Drop the change limit entirely rather than rate-limiting it. A profile is addressed by user id, so no link points at a name and changing one moves nothing: the blanket refusal, the `username_changed` flag, the `username_history` table, and the 30-day hold are all removed
- [x] 2.8 Test the generator, the blocklist, and case-insensitive collision

## 3. Avatars

- [x] 3.1 Write the initials avatar: the adjective and noun initials from the username in Architects Daughter on a circle, tinted `TINTS[hash(userId) % 6]` from `#8c5a2b`, `#a3542e`, `#7a4a52`, `#6b6440`, `#4f5f5a`, `#8a4f6d` with `#f6efe6` ink
- [x] 3.2 Take the letters from the username and never from a provider's display name, and never render one letter or a two-letter slice of one word
- [x] 3.3 Assign every user a username at signup and keep the column NOT NULL, substituting no letter from any other source
- [x] 3.4 Render the SVG inline in the DOM, so the letters keep the page webfont instead of silently falling back to a system cursive
- [x] 3.5 Serve stored avatars from `GET /api/avatars/:userId`, streaming an upload and redirecting to a provider photo, with 404 the signal to draw the initials
- [x] 3.6 Give the avatar the app's control styling — border, `shadow-lift`, and the standard focus-visible ring — since it links to a profile page, which also carries its edge in the dark theme where the tints separate by as little as 1.42:1 against a 3:1 need
- [x] 3.7 Keep the username visible beside every avatar that identifies another user, so no reader depends on hover
- [x] 3.8 Resolve upload → opted-in provider photo → initials, server-side on the avatar route, with 404 the fall-through an `<img>` cannot do on its own
- [x] 3.9 Request the provider photo only for a user who opted in, and keep `user.image` rendering in account pages only, never as the public avatar
- [x] 3.10 Offer the provider photo opt-in as a single unchecked checkbox on the account page, and make opting out return the user to the initials
- [x] 3.12 Test that the same user id always yields the same tint, that a username change moves the letters but not the tint, and that two users sharing initials draw their tints independently from their own ids
- [x] 3.13 Test that every tint sits at or below 0.15 relative luminance, so a tint added later cannot quietly drop the ink below AA

## 4. Follower counts

- [x] 4.1 Move `subscriber_count` in the same transaction as the subscribe and unsubscribe
- [x] 4.2 Move it for audience membership changes too, since those change who effectively follows without touching a subscription row
- [x] 4.3 Exclude the owner's own subscription everywhere the count is moved or computed
- [x] 4.4 Point the feed's popular ranking at the column and delete the subscriber-count subquery
- [x] 4.5 Test the count against both subscriber paths and the owner exclusion

## 5. Profile page

- [x] 5.1 Add the `/profiles/:userId` route in `ui/src/App.tsx`, resolving to the profile page
- [x] 5.2 Add the profile read endpoint, public and session-free
- [x] 5.3 Render the header: avatar, username, join month, and the distinct-people follower count with the owner's own subscription excluded
- [x] 5.4 Render the Topic table: topic, created, updated, followers, and findings kept over findings reviewed
- [x] 5.5 Sum the columns in the footer, which is the number a reader adding the column themselves arrives at
- [x] 5.6 Render every follower count as its number, zero included
- [x] 5.7 List only public Topics, expose no follower identities anywhere, and add no table of Topics the user follows
- [x] 5.8 Test that one person following three of an owner's Topics counts once in the header and three in the footer

## 6. Bylines

- [x] 6.1 Carry the owner's username and avatar inputs in the feed payload, so Featured needs no request per Topic
- [x] 6.2 Show the owner's avatar and username under the topic page title, linking to their profile
- [x] 6.4 Add the `Carl's Barista` section as the first section of `TopicInfo`, above `Carl's Prompt`, holding the owner's avatar and username linked to their profile. One edit covers both roast surfaces, since the popover and the card render from that component
- [x] 6.3 Show the same byline in the signed-out homepage Featured section, smaller and secondary, so the Topic stays the hero

## 7. OG meta and card images

- [x] 7.1 Add `satori` and `@resvg/resvg-js`, and commit the font files Satori needs as buffers
- [x] 7.2 Intercept the public topic path in Hono ahead of the static handler, read `index.html`, and inject `og:title`, `og:description`, `og:image`, and `twitter:card`
- [x] 7.3 Serve the same HTML to every requester, sniffing no user agents
- [x] 7.4 Add the card image route: check R2 first, and on a miss render JSX to SVG with Satori and SVG to PNG at 1200×630 with resvg, write it, and stream it
- [x] 7.5 Compose the card from the wordmark, Topic title, owner byline, and Finding counts, redrawing the initials in the card's own layout rather than fetching it
- [x] 7.6 Key the R2 object on the topic id, a hash of title and counts, and a template version segment, with the reason for the version segment recorded where the key is built
- [x] 7.7 404 the card route for any Topic that is not public, checking before reading storage or rendering
- [x] 7.8 Confirm the injected shell still boots the client router and renders the topic page

## 8. Sharing and feeds

- [x] 8.1 Add the share control beside Follow on public Topics: a menu of share platforms, a copy-link row, and a copy-feed row, rather than a row of always-visible buttons
- [x] 8.2 Serve an RSS feed at a feed path beneath the existing `/topics/:id` path
- [x] 8.3 Refuse the feed for a Topic that is not public, without disclosing its title

## 9. Abuse gates

- [x] 9.1 Withhold a public Topic holding fewer than three Findings from everywhere a stranger finds one — Featured, Popular, the profile table, the preview, and the feed — rather than refusing the visibility itself, so a Topic can be public from creation and is simply shown nowhere until Carl has kept enough of it
- [x] 9.2 Rate-limit publishing per account
- [x] 9.3 Add the flag control on Topics and profiles, delivering over the existing Resend sender to the address `SUPPORT_EMAIL` names
- [x] 9.4 Offer the avatar opt-in as a single unchecked checkbox on the account page, and nowhere at signup or in the topic editor

## 10. Navigation

- [x] 10.1 Put the avatar at the far right of the desktop header as the dropdown trigger, containing the avatar-and-username row linking to the profile, then activity, account, admin for an admin, and sign out last
- [x] 10.2 Take activity, account, admin, and sign out out of the primary navigation, so no top-level sign-out control remains beside it
- [x] 10.3 Put the same items as one block at the bottom of the mobile drawer, below a divider and below the primary navigation, in the same order and ending in sign out

## 11. Deploy, domain model, and verification

- [x] 11.1 Add Username and Avatar rows to the `domain-model` skill's entity table
- [x] 11.2 Rewrite its "Follow (UI copy only, never schema)" line as the explicit one-way seam rule: follow in reader-facing copy, subscribe in every identifier
- [x] 11.3 Record in the `domain-model` skill that a username is display only and needs no route reservation, since a profile is addressed by user id
- [x] 11.4 Backfill production usernames through the migration job that already runs on every push, rather than as a separate step
- [x] 11.5 No separate recount is needed: migration 0035 fills `subscriber_count` for every existing Topic as it adds the column, by the same rule the app recounts with, so the deploy's migration job already leaves the counts correct
- [x] 11.6 `bash scripts/preflight.sh` is green
- [x] 11.7 Verify a pasted public Topic link renders a card, and that a private Topic's card route and feed both 404
