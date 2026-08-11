## Context

The app has owners but no public identity. `users` carries name, email, role, plan, and Better Auth's `image`; nothing on it is safe to show a stranger. Topics route at `/topics/:id` and are served by the SPA fallback in `api/index.ts`, which hands `index.html` to any unmatched GET. Subscriber counts are computed by subquery inside the feed assembly. Object storage reaches R2 through `worker/store.ts`, re-exported from the `worker` barrel that `api/index.ts` already imports. Email goes out through `worker/email.ts` over Resend.

Two constraints shape almost every decision below. First, a crawler does not run JavaScript, so anything a link preview needs must be in the HTML the server sends. Second, there is no free-text user content anywhere in the product — no bios, no comments, no topic descriptions written for an audience — which is what makes a one-control moderation surface defensible rather than negligent.

## Goals / Non-Goals

**Goals:**

- Every account has a public name and a public mark, with no action required from the user.
- A public Topic credits its owner, and that credit leads somewhere.
- A pasted link renders a card.
- Aggregate follower numbers, never a list of who follows what.

**Non-Goals:**

- Changing scanning, scoring, or Scan cost. Nothing here touches the pipeline.
- Following a *person*. Following stays per-Topic; the profile is a directory of an owner's Topics, not a subscribe target.
- A moderation queue, appeals, or takedown workflow. One flag control into the admin inbox.
- Bios, links, or any other free-text profile field. Their absence is what keeps the moderation surface honest.

## Decisions

**A username is assigned, not chosen, with choosing available.** Requiring a name at signup adds a step to a funnel that already carries Turnstile and OAuth. Generating a batch, checking it in one query, and offering the survivors means the common path is a click and the uncommon path is a text field. The digits exist only to break a collision, so a username reads as a name rather than a serial number.

This only holds at scale. Forty-four combinations is not a name space; it is a queue where the digits do all the work. The lists have to reach roughly forty each before launch, and that is a task in this change rather than a note for later, because shipping the seed lists would make every username look machine-issued and the fix afterwards would mean rewriting usernames people had already been given.

**The avatar is computed, never stored.** A generated mark needs no upload pipeline, no moderation, no CDN, no storage cost, and no default-avatar sadness for the account that never sets one. It is the only option that covers every account: Apple returns no photo, and email/password users have none.

**The mark is the username's initials, not a drawing.** An earlier draft generated a field notebook from the username's hash — cover color, elastic band, spine label, corner wear. Initials do the same job with none of the machinery: no SVG generator to write, test, and later redraw inside the OG card. The username is already `Adjective-Noun`, so its two initials fall out of it, and the display font makes them read as Carl's hand rather than as a system default.

**The tint is seeded from the user id, not from the username or the letters.** A wall of identically-colored circles told apart only by two small letters is not scannable at the size avatars are used, so the color has to vary. Seeding it from the letters would waste the palette, since every user sharing initials would share a color — and initials collide often here. Seeding it from the username looks right until someone changes their username and their color moves with it; the color is the half of the mark that carries recognition, so it is anchored to the one identifier that never changes.

**One palette across both themes.** The letters never needed theme adjustment, because the circle supplies its own background and the ink-to-tint contrast holds regardless of the page. Measured against the real tokens, the ink runs 4.76:1 to 6.28:1 — AA for normal text, not merely large.

The circle's edge is the part that does depend on the page, and in dark mode it fails: the tints separate from `--background: #4f3e2d` by 1.42:1 to 1.88:1 and from `--card: #382a1b` by 1.93:1 to 2.55:1, under the 3:1 a boundary needs, against 3.84:1 to 7.06:1 in light. Swapping tints per theme would trade a stable identity color away to solve a problem that lives at the edge.

**The edge comes from the control chrome, not from anything invented for avatars.** An avatar links to its owner's profile page, which makes it a control, and the app already dresses controls a particular way: every `buttonVariants` variant carries `shadow-raise`, the outline variant carries `border` with `dark:border-input`, and all of them share a focus-visible ring. Giving the avatar that same treatment supplies the dark-theme edge through the existing border token, gives it the same lift as every other tile, and makes it keyboard-reachable — which it needs anyway, being a link. A bespoke hairline ring would have solved one third of that and matched nothing.

**The palette is a range, enforced by a test.** "Do not add a tint without re-checking contrast" is a comment, and comments do not fail builds. Because a darker tint only gains contrast against light ink, the constraint collapses to a single ceiling: relative luminance at or below 0.15 keeps `#f6efe6` at 4.5:1 or better. The six tints span 0.096 to 0.143, with `#a3542e` closest to the line. A test on that ceiling means a future tint either sits in the range or turns the suite red.

**Avatar resolution runs server-side.** The avatar route resolves upload, then an opted-in provider photo, then nothing — and a 404 is what tells the client to draw the initials. Resolving in the client instead would mean every caller holding the source, the key, and the provider url, when a caller only ever has a user id.

**The shape rule is dropped.** An earlier draft made Carl a circle and users rounded squares so a person could never be read as the mascot at small sizes. Users are circles now. Half the original reason was the mascot licence, and initials reproduce nothing of the artwork, so that half dissolves. The other half — shape as the person-versus-mascot signal — is given up deliberately, in exchange for the shape readers already expect an avatar to be.

**The opt-in lives with the avatar controls, whatever the source.** Better Auth writes `user.image` at sign-in because that is what the provider returned, not because the user decided to publish their face, so it stays an account-surface field and never becomes the public avatar. The same reasoning governs the provider photo: publishing takes an unchecked box on the account page, beside the other avatar controls, so one screen holds every choice about how a user appears. Not signup, where the decision is authentication. Not the topic editor, where an unrelated question interrupts the task at hand.

**Follow in copy, subscribe in code — a one-way seam.** "Follow" is what readers understand and what every comparable product says. "Subscription" is the domain word and the table name, and `domain-model` already lists Follow as rejected for schema. Renaming the tables to match the copy would churn the Subscription/Billing Subscription distinction that the model works hard to keep apart. So the seam is one-way and stated: copy translates outward, identifiers never translate inward. `domain-model` gets it as an explicit rule rather than a parenthetical.

**Two follower numbers, never reconciled, because they answer different questions.** The header answers "how many people follow this owner" and must be distinct people — someone following three of an owner's Topics is one follower, not three. The table footer answers "what do these column figures add up to", and a reader who adds the column themselves must get the same number the footer shows, or the table looks broken.

These two numbers legitimately disagree. Rather than hide one or force them to match, each is labelled for what it counts and they sit in different places: people in the header, subscriptions in the footer. A footer labelled "followers" next to a header labelled "followers" showing a different number is the actual failure mode being avoided.

**Counts render as they are, zero included.** Suppressing a low count was considered and dropped: it hides a figure that is not sensitive, and it breaks the footer, since a column the reader can add up has to show the numbers it sums. If the Topic is public its owner published it, and the follower count is part of what they published.

**The subscriber count is denormalised because the profile is a table.** A count subquery per row is fine on a topic page and not fine on a profile listing twenty-five Topics. The column moves inside the same transaction as the subscribe and unsubscribe, so it cannot drift from the rows it summarises.

It must obey two rules that already exist in the model: the owner's own subscription never counts, and audience members inherit their audience's Subscription. Whichever of those paths is touched last has to leave the count agreeing with both, which is why the count's definition lives in the spec rather than only in the increment site. The migration backfills, or every Topic that already has subscribers reads zero.

**Meta tags are injected server-side; the image is generated at its own route.** The SPA cannot help here — by the time it boots, the crawler is gone. So a route ahead of the static handler reads `index.html` and injects the four tags. The same HTML goes to everyone, because serving crawlers something different from readers is cloaking, breaks the moment a shared link is opened by a person, and is a rule search engines enforce.

The card image is a separate route so the HTML stays cheap: the meta tag names a URL, and the image is rendered only when something actually fetches it. R2 first, then Satori for JSX-to-SVG and resvg for SVG-to-PNG at 1200×630, then write and stream.

**The image cache key carries a template version, because the platforms will not re-fetch.** Slack and X cache preview images hard and ignore cache headers. A URL keyed only on topic id would freeze the first card ever rendered, so the key covers the topic id plus a hash of the title, the owner username, and the counts, plus a version segment. The version segment is the part that gets forgotten: change the template, forget the bump, and every existing card keeps the old design forever with no error anywhere. It belongs in the key's construction with the reason attached.

**The image route checks visibility before it renders.** It takes no session — a crawler has none — which means it will answer anyone. If it renders for a private Topic it publishes that Topic's title to whoever guesses an id. It 404s for anything not public, and that check comes before the R2 read, not after.

**The publish gate ships with publishing, not after it.** A minimum of three Findings is what stops the pattern this change enables: empty Topics created purely to carry links. It sits on being shown rather than on the visibility flag, since a link farm needs to be seen, not to be flagged public. Three clears on one successful scan at the smallest max-results setting, so a real owner never waits. Adding this after the sharing surface exists means shipping the incentive before the brake.

**The preview card and the feed skip the minimum.** Both are reached only by following the Topic's own link, so the gate stops no farming there and costs the Topic its first impression instead. A platform caches whatever card it gets when a link is first pasted, and a reader app refused a feed never creates the subscription that would have retried later. Withholding either forfeits it rather than delaying it.

**The flag control is the whole moderation surface, and that is a statement about the product, not the roadmap.** There is no user-authored prose anywhere: no bios, no comments, no descriptions. What can be reported is a Topic name, a username, and a set of links to third-party content. A flag into the admin inbox over Resend is proportionate to that. It stops being proportionate the moment any free-text field ships, and that is the trigger for building more.

**Account items sit at the bottom of the mobile drawer.** Navigation is used every session and account items are used rarely, so the frequent thing takes the top of the drawer and the rare thing takes the bottom — which is also the easiest thumb reach, making the ordering a convenience rather than a demotion. On desktop the avatar is its own affordance at the far right, which is where every reader already looks for it.

## Risks / Trade-offs

**The seed lists make usernames look machine-issued** → Expanding both to roughly forty is a task in this change and a launch precondition. Shipping at forty-four combinations and fixing later means rewriting usernames people already have.

**A profile is addressed by user id, not username** → `/profiles/:userId` costs a less memorable link than `/:username` would give. It buys back the whole root namespace, so a new top-level route reserves nothing, and it makes a username display only: a rename moves no link, so there is no history to keep, no hold, and no change limit to enforce.

**Two new dependencies and committed font binaries** → Satori and resvg are the standard pairing for this and there is no lighter way to produce a PNG a crawler will accept. The fonts are committed because Satori has no system font access; that is a repo-size cost paid once.

**The denormalised count can drift** → It only cannot drift if every write path moves it transactionally, including audience membership changes, which are easy to miss because they change a count without touching a subscription row. The backfill is also a one-time correctness dependency: skip it and every existing Topic reads zero.

**A generated mark is a weaker identity signal than a photo** → Accepted. It is the only option that covers every account, and a seeded background color carries enough distinction to scan a list by.

**Initials collide often** → Forty adjectives and forty nouns produce far more usernames than initial pairs, so many users share letters. The seeded background color is what separates them, which is why it is not a single flat theme color.

**A person can now be read as the mascot at small sizes** → The consequence of dropping the shape rule. Carl and a user avatar are both circles; only the contents differ.

**An opt-out has to remove the object, not just stop rendering it** → A published photo left in storage stays reachable by anyone who kept the url. Switching source deletes the object the previous one left behind, so opting out actually withdraws the file.

## Open Questions
