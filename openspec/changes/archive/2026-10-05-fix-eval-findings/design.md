## Context

The expand-evals change ran every eval three times per case and read every failure. Most failures were the prompt or the
code, and a few were the eval's own rubric, which that change fixed. score-model is GLM 5.3 and cheap-model is MiniMax M3,
both on Fireworks through LiteLLM with structured output.

## Goals / Non-Goals

**Goals:**
- Fix what the evals found where it starts: a schema field, a resolution step, or a prompt rule.

**Non-Goals:**
- No change to the 120-second model timeout. A long segment call can outlive it, and the episode workflow's retries
  already cover that.
- No guessing a YouTube handle from a display name. A channel named that way may belong to someone else, so the prompt
  asks for the handle and an unresolved name is still dropped.

## Decisions

- **An integer field for a Finding's number.** A text field held prompt fragments like `": 3"` and `"{ELIDED}"`. Under
  structured output a number field can only hold a number. The draft types gain a `Draft` suffix, and the outline and
  segment types keep Finding ids, so nothing after the mapping changes.
- **Feed discovery at resolution.** An rss suggestion is fetched once, and an html page resolves to the first rss or atom
  feed its link tags advertise. A page that cannot be read is left as it was, for the readability check to drop. The
  model often knows a blog without knowing its feed's address, and the page names it.
- **Normalize in code, and ask in the prompt.** A prefix like `googleNews:` and a Google News url are cheap to fix in code
  and costly to leave. The prompt rules lower how often the model writes them.
- **A podcast must match its name.** Either the suggested name or the show's name holds the other, ignoring case and
  punctuation, so "Voxwomen" matches "Voxwomen Cycling Show" and a cycling name never matches a Star Trek show.
- **Five more suggestions than open slots.** Some fail the readability check, so asking for more fills more slots.

## Risks / Trade-offs

- [Feed discovery adds a fetch per rss suggestion] → It runs in parallel with the other resolutions under the same
  timeout as the readability check.
- [A short episode from thin Findings] → The spec already says a chapter is never planned past what its Finding can
  fill. The prompt now follows it.
