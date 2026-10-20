## Why

A visitor who lands on a topic page from a shared link never sees the topic tutorial video. The video's button shows
beside the logo only for a signed-in user, and the hero's button shows only on the home page.

## What Changes

- The header shows the video's button beside the logo on every page that has no hero, for a visitor and a signed-in
  user alike.
- On the home page a visitor still sees the hero's button alone, so the page never shows two.
- The specs and comments say "logo" for the CarlNotes cup and name, where they said "wordmark".

## Capabilities

### New Capabilities

### Modified Capabilities

- `public-profiles`: the header's logo button shows to a visitor on every page without the hero.
- `social-sharing`: the topic and profile cards' requirements say "logo".

## Impact

- `ui/src/components/layout/Header.tsx`: the logo button's condition reads the hero instead of the session.
- Comments in `ui/src/components/session/SessionLayout.tsx`, `docs/src/routeData.ts`, and `api/content.ts` say "logo".
