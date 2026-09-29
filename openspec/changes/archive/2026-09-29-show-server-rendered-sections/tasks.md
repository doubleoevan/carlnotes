## 1. The reveal

- [x] 1.1 Add `useRevealClassName` in `ui/src/hooks/`: a server-rendered element is shown, with the hydrate animation only if asked, and an element rendered in the browser stays hidden until it scrolls into view, decided once at the first render
- [x] 1.2 Use it in `HydrateSection` in `ui/src/pages/TopicPage.tsx`, animating only the top two sections on the server, and in `ui/src/components/topic/Topic.tsx`
- [x] 1.3 Test that a server-rendered element never has `opacity-0`, and that an animated one keeps `animate-hydrate`

## 2. Verification

- [x] 2.1 Render a topic page at 412 by 732 without scrolling, and with scripts off, and confirm every section is shown, against production, which kept the section with Carl's notes at opacity 0
- [x] 2.2 Run `bash scripts/preflight.sh`
