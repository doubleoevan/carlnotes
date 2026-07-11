---
name: code-style
description: >
  TypeScript and JavaScript readability rules. Use when writing,
  editing, reviewing, or refactoring ANY TypeScript, JavaScript, or JSX code:
  every new function, every fix, every generated file, even one-line changes.
  Covers mandatory comment groups, top-down file order, file-count discipline,
  naming, early returns, and type modeling. If code is being produced or
  changed, this skill applies.
---

# Code Style

This codebase is read by one human. Optimize every line for the reader.

Mechanical rules (curly braces, formatting, import order, complexity caps) live
in `biome.json` and CI, not here. This file holds only the judgment rules a
linter cannot check.

### 1. Comment every logical group — the prime rule

Every logical group of lines gets a comment on the line above it: a single line whenever possible.

- One comment per group. Prefer one line; when one line genuinely can't carry it, stack `//` lines rather than using `/* */` blocks. Never inline at the end of a line.
- No blank line between the comment and its group; one blank line before the next group starts.
- Short and lowercase. Describe what the group does, not how.
- A reader must be able to skim only the comments and understand the full flow of the file.
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

### 2. Top-down file order

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

### 3. Fewest files possible

- A helper lives in its consumer's file until a **third** consumer appears. Extract on the third, not the second.
- No barrel files (`index.ts` re-exports). No one-function-per-file.
- Growing an existing file beats creating a new one.
- Creating a new file requires stating why in the change description, and new files only appear in an approved file tree.

### 4. Screen-sized functions

A function should fit on one screen, roughly 40 lines. When it grows past
that, comment groups become the section markers first; split into a helper
only when the groups stop fitting, and split **within the same file**.

### 5. Early returns, nesting cap of 2

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

### 6. Named intermediates over clever chains

No chained pipeline past two steps, no nested ternaries, no dense
destructuring tricks. Each meaningful step gets a named variable, and the
names document the transformation. Boring over clever: clever is what someone
decodes at 3am.

    // wrong — one unreadable expression
    const top = articles.filter((a) => a.score > cutoff).sort((a, b) => b.score - a.score).slice(0, limit).map(toFeedItem)

    // right — each step named, the flow reads top to bottom
    // keep only articles above the relevance cutoff
    const relevantArticles = articles.filter((article) => article.score > cutoff)

    // rank best-first and cap to the feed size
    const rankedArticles = relevantArticles.sort((a, b) => b.score - a.score)
    const topArticles = rankedArticles.slice(0, limit)

    // shape for the feed
    const feedItems = topArticles.map(toFeedItem)

### 7. No abbreviations in variable names

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

### 8. Boolean prefix

Boolean variables and props are prefixed with `is`, `has`, `can`, `should`,
or `will`. Examples: `isActive`, `isLoading`, `hasError`, `canSubmit`,
`shouldRetry`, `willExpire`.

### 9. Meaningful variable names

Names describe what the value represents, not its position or freshness.
`existing`, `latest`, `current`, `result`, `data`, `value`, `item` are not
self-documenting.

    // wrong
    const existing = await db.findUser(id)
    const data = await response.json()

    // right
    const existingUser = await db.findUser(id)
    const reportPayload = await response.json()

### 10. JSDoc for exported functions

Double-star `/** */` block above every exported function. One line only.
Describe what it does, not how.

    /**
     * Scores an article against the reader profile.
     */
    export function scoreArticle(article: Article, profile: ReaderProfile): number { ... }

### 11. Discriminated unions

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

### 12. Branded types

Use branded types for semantically distinct strings that TypeScript would
otherwise treat as interchangeable. Apply the brand at the validation
boundary (a Zod transform is the cleanest place) so it flows through
naturally.

    type UserId = string & { readonly _brand: 'UserId' }
    const userIdSchema = z.string().uuid().transform((value) => value as UserId)

Good candidates: entity IDs, validated emails, tokens. Poor candidates:
strings used immediately in one place and never mixed with other string
types.