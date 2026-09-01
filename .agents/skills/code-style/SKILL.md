---
name: code-style
description: >
  TypeScript and JavaScript readability rules. Use when writing,
  editing, reviewing, or refactoring ANY TypeScript, JavaScript, or JSX code:
  every new function, every fix, every generated file, even one-line changes.
  Covers mandatory comment groups, comment voice, top-down file order,
  file-count discipline, naming, import paths, early returns, object
  parameters, and type modeling. If code is being produced or changed, this
  skill applies.
---

# Code Style

This codebase is read by one human. Optimize every line for the reader.

Mechanical rules (curly braces, formatting, import order, complexity limits) live
in `biome.json` and CI, not here. This file holds only the judgment rules a
linter cannot check.

### 1. Comment every logical group — the prime rule

Every logical group of lines gets a comment on the line above it: a single line whenever possible.

- One comment per group. Prefer one line; when one line genuinely can't carry it, stack `//` lines instead of using `/* */` blocks. Never inline at the end of a line.
- No blank line between the comment and its group; one blank line before the next group starts.
- Write short plain sentences, lowercase, for a reader who did not write the code. Two short sentences separated by a period beat one clause-chained line.
- Never use a semicolon in a comment. Use a colon only right before a short list of literal values ("the source kind: rss, reddit, youtube").
- No dense parentheticals and no unexplained shorthand. Spell it out: "without time zone", never "(no tz)".
- Keep the why when it is not obvious from the code. Cut detail, not clarity — one line preferred, never more than two.
- A comment must be true. Verify it against the code it describes before writing it, and fix it when the code changes.
- Name what the group does, not how.
- A reader must be able to skim only the comments and understand the full flow of the file.
- Never record how the code got here. No "every caller", no "this used to", no note on what was tried or ruled out. A comment describes the code as it is now.
- JSX section comments use `{/* section name */}`.

Self-check before finishing any edit: scan the diff. Any group of two or more
statements without a comment above it fails this rule.

    // parse the request body
    const body: unknown = await request.json()
    const result = schema.safeParse(body)

    // reject invalid input
    if (!result.success) {
      return Response.json({ error: 'Invalid input' }, { status: 400 })
    }

    // write the record to the database
    const { error } = await database.from('table').insert(result.data)
    if (error) {
      return Response.json({ error: 'Database error' }, { status: 500 })
    }

    return Response.json({ success: true })

**Imperative voice.** A `//` comment names the action the group performs. Lead
with a bare verb: no `-s` ending, no `-ing` ending, no subject, no "this".

    // wrong — narrates the code instead of naming the action
    // parses the request body
    // parsing of the request body
    // this parses the request body

    // right
    // parse the request body

A group that declares instead of acting — a type, a schema field, a constant, a
config object — has no action to name. State the fact instead.

    // right — a constant declaration, so a plain statement
    // the source kinds carl can scan
    export const sourceKinds = ['web', 'rss', 'youtube'] as const

JSDoc runs the other way: third person, never imperative. See rule 11.

**Wording.** Two short sentences beat one clause-chained line.

    // wrong — clause-chained, the reader has to decode it
    // lifecycle status; running until it succeeds or fails, with the failure reason if it fails

    // right — two plain sentences
    // the scan status. running until it succeeds or fails, and error holds the failure reason

### 2. A comment earns its place

A comment says what the code is. Anything that argues for it, describes what it
is not, or narrates what happens elsewhere is cut. All three read as filler, and
all three drift as soon as the code around them moves.

**The trailing justification.** An action followed by "since" or "because" is a
fact plus an argument for the fact. Keep the fact.

    // wrong — the clause defends the line above it
    // reject deletes from anyone but the topic owner, since the team never owned the topic

    // right
    // reject deletes from anyone but the topic owner

**Defining by what it is not.** Say what the code does.

    // wrong
    // use the tooltip as the button's accessible name, since the icon has no text of its own

    // right
    // use the tooltip as the button's accessible name

**Downstream narrative.** A comment stops at the file it lives in. What some
other module does with the value belongs to that module, which is free to change
without anyone thinking to come back here.

    // wrong — an api file describing the ui
    // include role and plan in the session so the ui can render the admin link

    // right
    // include role and plan in the session

Keep a constraint the code cannot show: an external system's behavior, an
ordering the compiler will not enforce, an api that destroys its input. State it
as a plain sentence beside the action, never as a defense of it.

    // wrong — the constraint arrives as an argument
    // open LISTEN on the direct connection string, since neon's pooler endpoint
    // does not deliver notifications to a listener

    // right — the action, then the constraint that makes it the only option
    // open LISTEN on the direct connection string. neon's pooler drops
    // notifications to a listener

### 3. Top-down file order

The file reads like a newspaper: headline first, details after. The exported
or public function comes first; helpers follow below it in call order.

    // wrong — reader scrolls past plumbing to find the point of the file
    function normalizeTitle(raw: string) { ... }
    function scoreArticle(article: Article) { ... }
    export function rankArticles(articles: Article[]): Article[] { ... }

    // right — the point of the file first, helpers in the order they are called
    export function rankArticles(articles: Article[]): Article[] { ... }
    function normalizeTitle(raw: string) { ... }
    function scoreArticle(article: Article) { ... }

### 4. Fewest files possible

- A helper lives in its consumer's file until a **third** consumer appears. Extract on the third, not the second.
- No barrel files (`index.ts` re-exports). No one-function-per-file.
- Growing an existing file beats creating a new one.
- Creating a new file requires stating why in the change description, and new files only appear in an approved file tree.

### 5. Screen-sized functions

A function should fit on one screen, roughly 40 lines. When it grows past
that, comment groups become the section markers first; split into a helper
only when the groups stop fitting, and split **within the same file**.

### 6. Early returns, nesting limit of 2

Handle failure and edge cases first with guard clauses, then write the happy
path flat. More than two levels of nesting means restructure.

    // wrong — the happy path is buried three levels deep
    if (user) {
      if (user.isActive) {
        if (subscription) {
          return renderFeed(subscription)
        }
      }
    }

    // right — guards first, happy path flat
    if (!user) {
      return null
    }
    if (!user.isActive) {
      return null
    }
    if (!subscription) {
      return null
    }
    return renderFeed(subscription)

### 7. Named intermediates over clever chains

No chained pipeline past two steps, no nested ternaries, no dense
destructuring tricks. Each meaningful step gets a named variable, and the
names document the transformation. Boring over clever: clever is what someone
decodes at 3am.

    // wrong — one unreadable expression
    const top = articles.filter((a) => a.score > cutoff).sort((a, b) => b.score - a.score).slice(0, limit).map(toFeedItem)

    // right — each step named, the flow reads top to bottom
    // keep only articles above the relevance cutoff
    const relevantArticles = articles.filter((article) => article.score > cutoff)

    // rank best-first and limit to the feed size
    const rankedArticles = relevantArticles.sort((a, b) => b.score - a.score)
    const topArticles = rankedArticles.slice(0, limit)

    // shape the items for the feed
    const feedItems = topArticles.map(toFeedItem)

### 8. No abbreviations in variable names

Write the full word, always.

    // wrong
    const res = await fetch(...)
    const err = error

    // right
    const response = await fetch(...)
    const error = ...

Exceptions that are clearer than the spelled-out version: `url`, `id`, `api`,
`html`, `css`, `sdk`. Common substitutions: `btn` → `button`, `val` → `value`,
`cb` → `callback`, `tmp` → a descriptive name for what it actually holds.

### 9. Boolean prefix

Boolean variables and props are prefixed with `is`, `has`, `can`, `should`,
or `will`. Examples: `isActive`, `isLoading`, `hasError`, `canSubmit`,
`shouldRetry`, `willExpire`.

### 10. Meaningful variable names

Names describe what the value represents, not its position or freshness.
`existing`, `latest`, `current`, `result`, `data`, `value`, `item` are not
self-documenting.

    // wrong
    const existing = await db.findUser(id)
    const data = await response.json()

    // right
    const existingUser = await db.findUser(id)
    const reportPayload = await response.json()

### 11. JSDoc for exported functions

Double-star `/** */` block above every exported function. One line only.
Describe what it does, not how.

**Third person, not imperative** — the inverse of rule 1. A `//` comment names
an action the reader follows down the file; a JSDoc block describes a function
that already exists. The verb takes the `-s` and the line ends in a period.

    // wrong — imperative, reads like a step in a procedure
    /**
     * Score an article against the reader profile.
     */

    // wrong — no verb, so the reader learns nothing the name did not say
    /**
     * Article scoring.
     */

    // right
    /**
     * Scores an article against the reader profile.
     */
    export function scoreArticle(article: Article, profile: ReaderProfile): number { ... }

The two voices side by side:

| Comment | Voice | Example |
| --- | --- | --- |
| `//` | imperative, no period | `// parse the request body` |
| `/** */` | third person, period | `/** Parses the request body. */` |

### 12. Discriminated unions

When a type has a status or kind field and other fields that only apply to
certain variants, model each variant as its own union member. Never use
optional fields to paper over structural differences.

    // never — error is optional but only meaningful on failure
    interface FetchResult {
      status: 'success' | 'failed'
      articles?: Article[]
      error?: unknown
    }

    // always — each variant carries only what it owns
    type FetchResult =
      | { status: 'success'; articles: Article[] }
      | { status: 'failed'; error: unknown }

### 13. Branded types

Use branded types for semantically distinct strings that TypeScript would
otherwise treat as interchangeable. Apply the brand at the validation
boundary (a Zod transform is the cleanest place) so it flows through
naturally.

    type UserId = string & { readonly _brand: 'UserId' }
    const userIdSchema = z.string().uuid().transform((value) => value as UserId)

Good candidates: entity IDs, validated emails, tokens. Poor candidates:
strings used immediately in one place and never mixed with other string
types.

### 14. Alias imports over deep relatives

Use the project's path alias (`@/` unless the project defines otherwise) for
any import that climbs two or more parent directories. Same-folder `./` and a
single `../` are fine. Never include `.ts`/`.tsx` extensions in import
specifiers.

    // wrong — the reader counts dots to locate the file
    import { cn } from "../../lib/utils.ts"

    // right — the alias reads as an absolute address
    import { cn } from "@/lib/utils"

### 15. Explicit return types

Every named function declares its return type. The annotation is the
contract: a body edit can't silently change what callers receive, and the
reader never has to infer. Inline callbacks (event handlers, `.map`
lambdas) may stay inferred.

Relaxed in `.tsx` and `.jsx` files: components leave the return inferred,
since an annotation only restates that the thing renders. Hooks and plain
helpers in those files still declare a return type, because their return
value is not visible from the signature.

    // wrong — the contract lives in the body
    export async function runScan(scan: Scan) { ... }

    // right — the contract lives in the signature
    export async function runScan(scan: Scan): Promise<ScanResult> { ... }

    // fine in a .tsx file — the component renders, nothing to restate
    export function FeedItem({ finding }: FeedItemProps) { ... }

    // still typed in a .tsx file — the hook returns a value the reader can't see
    function useTopicFeed(topicId: TopicId): TopicFeedState { ... }

### 16. Object parameters over long signatures

Three or more parameters take a single options object. A positional call site is
a row of unlabeled values the reader has to match against the signature, and
every added parameter is a chance to break argument order.

Two parameters also take an object when they share a type or when either one is
a boolean. `store(userId, topicId)` is two strings a caller can swap with nothing
to catch it, and a bare `true` at a call site says nothing about what it turns on.

- Name the type after the function with an `Options` suffix.
- Destructure in the signature so the body reads the same as before.
- Required fields first, optional fields last.

Leave one or two parameters of distinct types positional, and leave inline
callbacks alone.

    // wrong — the call site is six values in a fixed order
    async function storeTopicChatAttachment(
      userId: string,
      topicId: string,
      chatTurnId: string | null,
      attachment: ChatAttachment,
      isAttachmentKept: boolean,
      litellmApiKey?: string,
    ): Promise<boolean> { ... }

    await storeTopicChatAttachment(userId, topicId, null, attachment, true, litellmApiKey)

    // right — every value arrives labeled
    interface StoreTopicChatAttachmentOptions {
      userId: UserId
      topicId: TopicId
      chatTurnId: ChatTurnId | null
      attachment: ChatAttachment
      isAttachmentKept: boolean
      litellmApiKey?: string
    }

    // store one attachment, and summarize it only when it is kept
    async function storeTopicChatAttachment({
      userId,
      topicId,
      chatTurnId,
      attachment,
      isAttachmentKept,
      litellmApiKey,
    }: StoreTopicChatAttachmentOptions): Promise<boolean> { ... }

    await storeTopicChatAttachment({
      userId,
      topicId,
      chatTurnId: null,
      attachment,
      isAttachmentKept: true,
      litellmApiKey,
    })

### 17. Ordinary words, and words already here

Two checks before naming anything or writing any comment.

**Prefer a word the codebase already uses.** Before introducing a term, search
for the concept. A second name for an existing thing costs every future reader a
translation step and splits every search.

    // wrong — the column, the enum, and the UI label all say frequency
    export const dailyCadences = ["daily", "weekdays"] as const

    // right — the word already in the codebase
    export const dailyFrequencies = ["daily", "weekdays"] as const

- `cadence` → **frequency**
- `curate` → **review**, the stage's own name
- `prune` → **filter**
- `harvest` → **find**, or **return** for what a function hands back
- `seam` → **boundary**, or just name the thing

**Among equally accurate options, use the common word.** A rare word makes the
reader parse vocabulary instead of reading the sentence.

- `carries` / `carrying` → **includes**, when one thing holds another
- `rather than` → **instead of**, for a choice between two
- `rides with` / `travels with` → **goes with**
- `disown` → **deny**

Accuracy beats both rules. When the swap changes the meaning, rewrite instead of
substituting.

    // wrong — "includes" says the limits are contents, not an attribute
    // the yearly interval includes the higher limits

    // right
    // the yearly interval has the higher limits