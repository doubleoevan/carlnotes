## Context

The header renders the wordmark on every page and already holds the video dialog's opener. The hero's
`TopicTutorialVideoButton` is a watch link that opens the dialog on a primary click.

## Goals / Non-Goals

**Goals:**

- The hero's button beside the wordmark for a signed-in user, on every page.

**Non-Goals:**

- The button for a visitor beside the wordmark, since the hero shows them one on the homepage.

## Decisions

- **The button shows on `useIsSignedInBeforeSession()`.** It is the opposite of the hero's rule, so a signed-in page
  load shows it without waiting for the session request, and a visitor never sees two.
- **The wordmark and the button share a flex row.** The button stays outside the wordmark's link, which keeps its own
  home link and reheat.
