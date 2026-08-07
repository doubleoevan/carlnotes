## Context

The modal already folds three lists into one payload array on save: `keptSources` (stored), `addedSources` (staged), and `promptSourceUrls` (urls written into Carl's Prompt). That single array is what `updateTopicPayload` validates, and both create and update go through it. So both halves of this change land on shapes that already exist.

Three things make the verification half cheap:

- **`fetchFeed` already parses rss and Atom** and is already used keylessly by the rss ingester, by reddit's fallback, and by youtube's fallback.
- **`toPlaylistIdAndAtomUrl` already turns a youtube channel or playlist config into its Atom url.** That is the keyless path the youtube ingester falls back to.
- **`toCanonicalUrl` already decides when two urls address the same page**, which is what "the Topic already has this" has to mean.

The one genuinely new part is the model call, and it copies the shape the search ingester runs: `cheapModel`, `Output.object`, a versioned markdown prompt through `fetchPromptTemplate`, with untrusted text fenced by `writePrompt`'s untrusted argument.

## Goals / Non-Goals

**Goals:**

- A reader who does not know what to add gets real, readable Sources from words they already wrote.
- Nothing the model invents ever reaches the modal.
- A Topic's Source list has a ceiling that the prompt cannot be used to escape.
- Clicking again gives something new.

**Non-Goals:**

- Ranking or explaining suggestions. They arrive as ordinary staged rows the reader keeps or drops. A reason string would be a second thing to read and a second thing for the model to invent.
- Persisting or learning from what a reader accepts. No feedback loop, no suggestion history.
- Per-plan caps. The ceiling bounds what one Scan fetches, which every plan pays for.
- Verifying that a Source is *good*, only that it is real and readable. Whether a feed is worth following is what the Scan's relevance gate already decides.
- Suggesting attachments, tags, or a frequency. This is the source editor's control.

## Decisions

### Verify with the ingesters' own readers

The alternative was a plain `HEAD` or `GET` on every candidate, which is simpler and wrong: a subreddit that does not exist returns a 200 HTML page, and an rss url that returns 200 may be a web page rather than a feed. Fetching it the way the ingester will is the only check that means anything, because it answers the question the reader actually cares about — will this produce anything on the next Scan?

That also costs nothing to build. Three of the four kinds route to `fetchFeed`, and the fourth is a fetch through `toFetchableUrl`, which already refuses a privately routable address.

Verification runs concurrently and a failure resolves to "dropped" rather than throwing, so one bad candidate cannot take the request down with it.

### The cap is one bound on the payload array

Because the modal already merges kept, added, and prompt-derived Sources into `payload.sources`, the whole cap is a `.max()` on that array in `updateTopicPayload`. No counting logic, no second code path for create versus update, and prompt urls are covered for free because they are already in the array by the time validation sees it.

The alternative — counting in `createTopic` and `updateTopic` separately — was rejected for being two places to keep in step for a rule that is one number.

### Web search counts toward the cap

The first draft of this had web search exempt. Exempting it means the ceiling is "10, plus one more that works differently", which is two rules where one will do, and it makes the modal's arithmetic conditional on which Source kinds are present. Counting it makes the rule sayable in a sentence, and it gives the reader a real trade: turn web search off and use the slot for a feed they trust more.

### The constant lives with the payload it bounds

`shared/contracts.ts` already holds shared limits (`CHAT_HISTORY_TURNS`, `CHAT_MEMORY_CHARS`) next to the schemas that use them. `shared/plans.ts` is the wrong home: everything there is a plan capability, and a flat constant filed among per-plan limits would read as one that someone forgot to tier.

### The route takes the Topic's text, not its id

An id would be simpler and would not work: the modal must suggest for a Topic that has never been saved, and even for a saved one the reader's unsaved edits are the words worth reading. So the request carries `name` and `prompt`, and the Topic never has to exist.

This means the route accepts arbitrary text from a signed-in caller and sends it to a model — the same exposure the chat route already has, and it is fenced the same way.

## Risks / Trade-offs

- **An unmetered model call behind a button anyone signed in can hold down.** → It is a cheap-tier call with a small bounded output, the button is disabled until there is text, and the caller must be signed in. But there is no quota, by decision, so a determined signed-in account can spend our money in a loop. The mitigation if it ever shows up is the one already built for scans: a per-user daily count. Not built now, and worth watching once the route is live.
- **Verification adds real latency.** Up to three feed fetches, each with its own timeout. → They run concurrently, so the request costs one round trip rather than three, and the moving line covers the wait. A slow candidate times out and drops rather than holding the reply.
- **A model that proposes nothing verifiable returns nothing.** A niche Topic may get zero suggestions twice in a row. → The modal says so plainly instead of leaving the reader wondering whether the click worked. It is an honest outcome: better than offering a feed that does not exist.
- **Suggestions arrive with no explanation.** A reader who does not recognize a subreddit has to judge it by its name. → They are ordinary staged rows, removable with one click, and nothing is persisted until Save. Adding a reason means adding a second model-written string to trust.
- **The cap is retroactive.** A Topic already over ten cannot be saved until Sources are removed, including one whose count is over only because of urls in its prompt. → Nothing is near ten today. Existing Topics keep scanning every Source they hold until someone edits them, so nothing breaks unattended.

## Open Questions

- Should a suggestion the reader removes be remembered, so the next click does not propose it again? Within one modal session it will be, since removed rows leave the staged list and no longer ride in `excludeSources` — meaning the same suggestion *can* come back. Fixing that means tracking rejections separately, which is a second list for a small annoyance.
- Should the cap be visible before it is hit — a "3 of 10" counter beside the Sources label, the way daily Brews reads in the frequency field? The cap only announces itself at the moment it refuses, which is the same complaint that produced the daily-topic counter.
