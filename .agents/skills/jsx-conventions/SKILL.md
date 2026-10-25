---
name: jsx-conventions
description: >
  JSX and TSX conventions for React and React Native (Expo) code. Use when
  writing or editing ANY JSX or TSX: components, pages, screens, layouts,
  props, and markup, even one-line changes. Covers event handler naming, link
  handling, apostrophes and quotes, heading line breaks, and JSX section
  comments, with web and React Native versions where they differ.
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

**React Native (Expo).** The same single component, with native targets.

- Internal routes render `Link` from `expo-router`.
- External links open with `WebBrowser.openBrowserAsync` from `expo-web-browser`.
- Scheme links (`mailto:`, `tel:`, `sms:`) open with `Linking.openURL` from
  `expo-linking`.

### Apostrophes and quotes — never HTML entities

Never use HTML entities (`&apos;`, `&quot;`, `&amp;`) in JSX text content.
Wrap the string in a JS expression instead. This applies unchanged in React
Native: the JSX compiler decodes entities on every platform, inside `<Text>`
too.

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

**React Native (Expo).** There is no `<h1>` and no `block`. Nested `<Text>` stays
inline, so stack two sibling `<Text>` elements in a `<View>`, and mark the
heading for screen readers with `accessibilityRole="header"`.

    <View accessibilityRole="header">
      <Text style={styles.title}>{"Startup Intelligence,"}</Text>
      <Text style={[styles.title, styles.muted]}>{"before it's obvious."}</Text>
    </View>

### JSX section comments

Mark every logical section of markup with a `{/* section name */}` comment:
short, lowercase, on the line above the section it describes.