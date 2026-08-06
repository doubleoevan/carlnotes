---
name: jsx-conventions
description: >
  JSX and TSX conventions for React code. Use when writing or editing ANY JSX
  or TSX: components, pages, layouts, props, and markup, even one-line
  changes. Covers event handler naming, link handling, apostrophes and
  quotes, heading line breaks, and JSX section comments.
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