## Why

A public Topic today is credited to nobody. It has an owner id and no way for a reader to see whose work it is, no page collecting that person's Topics, and no card when the link is pasted into Slack. An owner has nothing to point at, and a reader has no way to follow one.

Everything needed to fix that is a rendering and identity problem, not a pipeline problem. Nothing here changes scanning, scoring, or what a Scan costs.

## What Changes

**Usernames.** Every account gets a username at signup, shaped `Adjective-Noun` with four digits appended only to break a collision. A batch of candidates is generated and checked against taken usernames in one query, and a free one is written inside the signup insert, so nobody is blocked on choosing a name. Stored case-insensitively unique, with a reserved blocklist covering `admin`, `carl`, `support`, and `notesofcarl`. A name is display only, since a profile is addressed by user id, so it can be changed as often as its owner likes from the account page.

**Avatars.** The public avatar is the username's two initials — the adjective's and the noun's — in Architects Daughter on a tinted circle, rendered inline as SVG. Never one letter, since a generated word list collides hard on first letters, and never a two-letter slice of one word, which reads as a syllable. Every account holds a username from signup on, so the initials always exist and no letter is ever invented from a name or email.

The tint is `TINTS[hash(userId) % 6]` from a fixed six-color palette, constrained to the luminance range that keeps the ink at AA — at or below 0.15 — and held there by a test rather than a comment. Hashing the **user id** rather than the letters or the username is what keeps a person's color theirs: shared initials still get different colors, and changing a username moves the letters without moving the color.

The same palette serves both themes, since an identity that changes color when the reader flips the theme is a weaker identity. Because an avatar links to its owner's profile page, it takes the app's control styling — border, lift shadow, focus-visible ring — which is also what carries its edge in the dark theme, where the tints separate from the page by as little as 1.42:1. Resolution order is upload, then an opted-in provider photo, then the initials.

**the provider photo is off until asked for.** Resolving one sends a hash of the user's email to a third party on behalf of whoever is viewing the page, so it takes a single unchecked checkbox on the account page, beside the other avatar controls — not at signup, where the decision in front of them is authentication, and not inside the topic editor, where it is friction in an unrelated task. Better Auth's `user.image` stays private and renders only in account pages. Resolution runs server-side, because the `?d=404` fall-through only works if something observes the 404, and a browser `<img>` cannot.

**Vocabulary.** Reader-facing copy says follow and follower everywhere. Code and schema keep subscribe, subscription, and subscriber. A one-way seam: the tables are not renamed and `follow` never reaches an identifier.

**Profile page.** Public, at a user-id route. The header carries the avatar, username, join month, and a **distinct-people** follower count — one person following three of an owner's Topics counts once, and the owner's own implicit subscription is excluded. Below it, a table of that user's public Topics: topic, created, updated, followers, and findings kept over findings reviewed. The footer sums the columns and is labelled in subscriptions, not people, because a column sum is arithmetic the reader can check and will not equal the header's distinct-people figure. Two different numbers, two different labels, two different places.

Counts render as they are, zero included: a public Topic's follower count is not sensitive, and a column the reader can add up themselves owes them its real figures. No list of who follows what, anywhere — aggregates only. No table of what the user follows; that leaks reading habits and repeats the activity page.

**Follower counts.** `topics.subscriber_count` becomes a denormalised integer, moved in the same transaction as the subscribe and unsubscribe. An owner with twenty-five Topics cannot afford a count query per row. Audience-inherited members count toward it alongside direct subscribers, and the owner's own row never does.

**Bylines.** The topic page shows the owner's avatar and username under the title, reading `Brewed by <username>` and linking to the profile. Every homepage Topic card carries the same byline, smaller and secondary — the Topic stays the hero, the owner is the credit line. The roast's `Carl's Barista` section drops the label, since its heading already names the relationship.

**OG images.** Crawlers do not run JavaScript, so the meta tags must be in the served HTML before the SPA boots. A Hono route intercepts the public topic path ahead of the static handler, reads `index.html`, and injects `og:title`, `og:description`, `og:image`, and `twitter:card`. The same HTML goes to everyone; no user-agent sniffing. The image is generated on demand at its own route: R2 first, and on a miss render JSX to SVG with Satori and SVG to PNG at 1200×630 with resvg, write it, stream it. The R2 key covers the topic id, a hash of the title, the owner username, and the counts, and a template version segment — Slack and X cache aggressively and ignore cache headers, so a stable URL means a stale card forever, and a forgotten version bump freezes every existing card when the template changes. **The image route 404s for a non-public Topic**, or it leaks private titles through an endpoint with no session.

**Sharing.** A share control beside Follow on each public Topic opens a menu of the platforms a link is commonly shared to, plus rows that copy the Topic's link and its feed url. Not a row of always-visible per-platform buttons. Each public Topic also serves an RSS feed under its existing path.

**Abuse gates, in this change rather than after it.** A Topic needs at least three Findings before it is shown in Featured, Popular, or its owner's profile table, which stops empty Topics being farmed for links. Its own url, preview card, and feed stay open. A flag control on Topics and profiles routes to the admin inbox over Resend. That is the whole moderation surface, and it is enough only because there is no free-text user content yet.

**Navigation.** Signed in on desktop, the avatar sits at the far right of the header and opens a dropdown: the avatar-and-username row linking to the profile, then activity, account, the admin console for an admin, and sign out last. Those items leave the primary navigation — sign out in particular stops being a top-level control, since it is the rarest action in the header and the most costly to hit by accident. On mobile the same items form one block at the bottom of the existing drawer, below a divider and below the primary navigation — navigation is used every session, account items rarely, and the bottom of the drawer is the easiest thumb reach.

## Capabilities

### New Capabilities

- `usernames`: username generation, the reserved blocklist, case-insensitive uniqueness, and changing a name with no limit
- `user-avatars`: the username's initials on a tinted circle, the tint palette and its luminance ceiling, the resolution order, and the OAuth-photo opt-in
- `public-profiles`: the public profile page, its two distinct follower figures, and the owner byline on Topics
- `social-sharing`: injected OG meta on the public topic route, the generated card image and its cache key, the share control, and the per-Topic RSS feed
- `content-reporting`: the flag control on Topics and profiles, routed to the admin inbox

### Modified Capabilities

- `domain-schema`: `users.username`, `users.username_normalized`, `users.avatar_source`, `users.avatar_key`, and `topics.subscriber_count`, plus the migration
- `topic-publishing`: publishing a Topic gains a precondition — a minimum Finding count governing whether it is shown where a stranger browses
- `static-serving`: the public topic path is answered by a route that injects meta into the app shell, ahead of the static fallback that answers every other client route
- `feed-api`: the popular ranking reads the denormalised subscriber count instead of a subquery, and the feed payload carries the owner byline

## Impact

- **Two new dependencies**: `satori` and `@resvg/resvg-js`, plus committed font files — Satori cannot reach system fonts and needs the buffers.
- `db/schema.ts` and one migration for the four user columns and the topic count. `topics.subscriber_count` needs a backfill, or every existing public Topic reads zero.
- `api/` gains the profile read, the username endpoints, the OG meta route, the OG image route, the RSS route, and the report endpoint. R2 access follows the existing path — `api/index.ts` already imports storage helpers from the `worker` barrel.
- `api/auth.ts` gains username assignment in the existing `databaseHooks.user.create` hook, beside the LiteLLM key provisioning.
- `ui/` gains the profile page at `/profiles/:userId`, the header avatar dropdown, the drawer block, the byline, and the share control.
- `.agents/skills/domain-model/SKILL.md` gains Username and Avatar, and its "Follow (UI copy only, never schema)" line is rewritten as the explicit seam rule.
- Every subscribe and unsubscribe write becomes transactional with the count. Audience membership changes move it too.
- A profile is addressed by user id, so a username is display only: renaming moves no link, and no future top-level route needs a blocklist entry.

**The seed word lists are not shippable as given.** Eleven adjectives by four nouns is forty-four combinations. At that size the digits are load-bearing on nearly every username and near-duplicates are the norm, which is the opposite of a username that reads as a name. Expanding both lists to roughly forty — same coffee-and-reading vocabulary, both profanity-filtered — is a precondition of launch, not a follow-up, and is tracked as a task here.
