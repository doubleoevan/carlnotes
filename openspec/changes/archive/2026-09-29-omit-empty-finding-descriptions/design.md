## Context

`toFindingListLd` in `api/seo.ts` builds the `hasPart` ItemList of a public topic page's `CreativeWork` JSON-LD from `scanFindings`, one `ListItem` per Finding with its position, name, url, and description. Review writes a relevance explanation only for a Finding whose cheap score earns the premium re-score, so a Finding kept below that score has an empty explanation, and its `ListItem` goes out with `"description": ""`.

## Goals / Non-Goals

**Goals:**

- A `ListItem` has a description only if its Finding has an explanation.

**Non-Goals:**

- Any change to what a user or a crawler sees on the page itself. The visible page stays identical for both, which keeps it clear of cloaking.
- Writing explanations for the Findings that lack one.

## Decisions

**The empty field is left out, not filled.** schema.org's `description` is optional on a `ListItem`, so an entry with its position, name, and url is complete without it. Filling it with the title or another stand-in text would repeat what the entry already says. Every Finding keeps its entry and its position, so the list still ranks the same Findings the page shows.
