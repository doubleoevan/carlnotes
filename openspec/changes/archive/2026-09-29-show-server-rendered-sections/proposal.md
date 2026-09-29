## Why

A public topic page renders on the server, but every section below the top two arrived with `opacity-0` and only appeared once scripts ran and the section scrolled into view. The section with Carl's recap and his notes on each finding is one of them. Google's URL Inspection renders a phone-sized page without scrolling, and its screenshot of a live topic page showed that section blank, so the page's most important content reads as invisible text to a crawler, and stays invisible for any visitor whose scripts fail to load. Topic cards on the homepage and the topics page used the same reveal.

## What Changes

- A section or a topic card the server rendered is shown before any script runs. The top two sections of a topic page keep their entrance animation, which plays from the server's HTML, and every other section and card is simply shown.
- A section or a card rendered in the browser, as on a signed-in user's pages, keeps the reveal: hidden until it scrolls into view, then the animation.
- One hook, `useRevealClassName`, decides the class for both.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `ui-routing`: a public page's content is shown before any script runs, not only included in the HTML.

## Impact

- `ui/src/hooks/useRevealClassName.ts` (new), `ui/src/pages/TopicPage.tsx` (`HydrateSection`), and `ui/src/components/topic/Topic.tsx`.
- A visitor on a server-rendered page sees the lower sections and the cards at once, without the fade as they scroll, and the page's largest content paints sooner.
- No api or spec change outside `ui-routing`.
