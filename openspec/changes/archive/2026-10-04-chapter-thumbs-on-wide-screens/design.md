## Context

The chapter list shows thumbs on every row for a user who may rate. A row whose Finding is still in the Topic opens that
Finding's note, and the note has the same thumbs.

## Goals / Non-Goals

**Goals:**
- Give a chapter's title the row's width on a phone.

**Non-Goals:**
- No change to what a chapter's thumbs write, or to the thumbs on a wide screen.

## Decisions

- Hide every chapter's thumbs below `sm`, instead of keeping them on a chapter whose Finding was filtered out, so every
  row on a phone looks the same.

## Risks / Trade-offs

- A chapter whose Finding was filtered out has no thumbs on a phone. Its rating can still be given on a wide screen.
