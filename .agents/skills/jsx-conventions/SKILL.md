---
name: jsx-conventions
description: >
  JSX and TSX conventions for React code. Use when writing or editing ANY JSX
  or TSX: components, pages, layouts, props, and markup, even one-line
  changes. Covers event handler naming, link handling, apostrophes and
  quotes, heading line breaks, JSX section comments, and the Nightshift
  component contracts each app implements.
---

# JSX Conventions

### Event handler naming

Local callback functions use the `handle` prefix. Props that receive a
callback use the `on` prefix. Never mix them.

    // local handler function — always handle prefix
    function handleJoinWaitlist() { ... }

    // prop that accepts a callback — always on prefix
    interface CardProps {
      onSelect: (id: string) => void
    }

    // never
    function onSubmit() { ... }
    interface CardProps { handleSelect: () => void }

### Links go through one component

Every project routes all links through a single link component (for example
`AnchorLink`). Never use a bare `<a>` or the framework's `Link` directly in
feature code.

- Internal routes render the framework's client-side navigation.
- External links render `target="_blank"` with `rel="noopener noreferrer"`.
- Scheme links (`mailto:`, `tel:`) render a plain `<a>` with no target or rel.

### Apostrophes and quotes — never HTML entities

Never use HTML entities (`&apos;`, `&quot;`, `&amp;`) in JSX text content.
Wrap the string in a JS expression instead.

    // preferred
    {"We're working on our first posts."}

    // never
    We&apos;re working on our first posts.

### Line breaks in headings

Break a headline across two lines with `block` on the span. Never use
`{" "}` (that's a space, not a line break).

    <h1>Startup Intelligence,
      <span className="block text-muted-foreground">before it's obvious.</span>
    </h1>

### JSX section comments

Mark every logical section of markup with a `{/* section name */}` comment:
short, lowercase, on the line above the section it describes.

### Shared components: one contract, an implementation per app

A component both apps draw, such as Button and Badge, has one contract in
`packages/nightshift/components/<name>.ts` and one implementation per app at the same
path and file name, `apps/web/src/components/primitives/<name>.tsx` and
`apps/mobile/src/components/primitives/<name>.tsx`.

- The contract owns what the implementations agree on: the variant and size names,
  the defaults, the shared props (`variant`, `size`, `disabled`, `asChild`),
  and the classes both platforms draw, as box classes for the container
  and text classes for the label. The mobile implementation passes the text classes
  to its label, since native text does not inherit its container's color.
- An implementation builds on the contract's box and text classes and adds only its platform's
  classes, in records keyed by the contract's names. The web adds hover,
  focus-visible, and the aria, svg, and `has-` selectors. Mobile adds
  pressed states, `flex-row`, and a hit slop that grows the web's height
  to the 44-point touch target.
- Event props stay with the implementation: `onClick` on the web, `onPress` on
  mobile. The mobile implementation requires an `accessibilityLabel`.
- A call site imports the implementation, never the contract. A story's controls
  read their options from the contract's names.
- Add or rename a variant in the contract, then both implementations and both
  stories. `tsc -b` fails until both implementations match, and the parity check in
  preflight names a missing implementation or story.

      // a web implementation's own classes, keyed by the contract's variants
      const WEB_BUTTON_VARIANT_CLASSES = {
        default: "hover:bg-primary/90",
        ...
      } satisfies Record<ButtonVariant, string>