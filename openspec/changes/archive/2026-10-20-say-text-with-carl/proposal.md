## Why

The spoken questions cutoff tells a user that typing still works. "You can still text Carl" reads as texting him a
message from a phone. "You can still text with Carl" says the chat keeps working. The living spec also still names the
Activity page's followed topics accordion "Your topic subscriptions", which customer copy now calls "Topics you
follow", since copy says follow.

## What Changes

- The spoken questions cutoff's line and tooltip say "You can still text with Carl", on the account page's spend meter,
  the plans page's table, and the docs.
- The activity-page spec names the accordion "Topics you follow", as the page already does.

## Capabilities

### New Capabilities

### Modified Capabilities
- `activity-page`: the spoken questions cutoff's wording and the followed topics accordion's title.

## Impact

- `ui/src/components/account/monthlyBudgetCutoffCopy.ts` and its table test.
- `docs/src/content/docs/account/plans-and-limits.md`, `docs/src/content/docs/feed/chat.md`, and
  `docs/src/content/docs/feed/coffee-break.md`.
