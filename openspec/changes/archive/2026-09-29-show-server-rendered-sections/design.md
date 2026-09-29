## Context

`HydrateSection` on the topic page and `Topic`, the topic card, both used `useIsVisible`: an element stays at `opacity-0` until an intersection observer sees it inside the viewport, then plays the `animate-hydrate` entrance. On the server no observer runs, so the server's HTML had every such element at `opacity-0`, except the topic page's top two sections, which already kept the animation class from the server's HTML. Google renders a page at a phone's size and does not scroll, so an element below the first screen never reached the observer's trigger line and stayed transparent. A local render at 412 by 732 reproduced it on production: the section with Carl's notes started at 737 px and stayed at opacity 0.

## Goals / Non-Goals

**Goals:**

- Nothing the server renders starts hidden, with or without scripts, and with or without a scroll.
- A page rendered in the browser keeps its scroll reveal.

**Non-Goals:**

- The accordion and the "more" toggles, whose content is already in the HTML.
- The header's and the scan quota's entrance animations, which play on load and complete.

## Decisions

**The server-rendered state is decided once, at the first render.** `useRevealClassName` reads `useIsHydrating`, which is true in the server's render and in the browser's render that hydrates it, and keeps that value in state. The server's HTML and the hydrating render then agree on the class, so hydration sees no mismatch, and a server-rendered element never switches to the scroll reveal later, which would hide it and fade it back in.

**A server-rendered element is shown, and only the topic page's top sections animate.** The top sections already played their animation from the server's HTML, and Google's screenshot shows them complete. Every other server-rendered section and card is shown with no animation class at all, so its visibility never depends on an animation finishing in a crawler's renderer. The fade had no visible effect there anyway, since those elements start below the first screen.

**Cloaking by user agent was rejected.** Serving crawlers different markup from visitors risks a penalty, and the visitor without scripts would still see nothing.

## Risks / Trade-offs

- [A visitor on a server-rendered page loses the fade as lower sections and cards scroll into view] → The content shows sooner, and the largest content paint no longer waits on a script and a scroll.
