## Context

`apps/web/src/lib/styleClasses.ts` defines `SESSION_PAGE_CLASS`, `mx-auto flex min-h-dvh max-w-sm flex-col
justify-center px-4 py-12`, the column the web's sign-in, sign-up, verify email, and invite pages share. The mobile
`SessionScreen.tsx` drew a `ScrollView` with `gap-4 p-6` inside a `SafeAreaView` from `react-native-safe-area-context`.
That `SafeAreaView` is not a React Native core component, so Uniwind ignored its `className="flex-1"`, and the
`ScrollView` took its content's height. The home screen has the same `SafeAreaView`.

## Goals / Non-Goals

**Goals:**

- The mobile session screens draw the web's column on a phone and on a tablet, centered both ways.
- A className on the safe area view takes effect everywhere the app uses one.

**Non-Goals:**

- The web keeps its classes. The mobile column keeps its own class string, since the two apps reach the same column
  through different layout properties: the web through `mx-auto` and `min-h-dvh`, native through `self-center` and
  `grow`.

## Decisions

### The scroll's content container is the column

`SessionScreen.tsx` gives the `ScrollView`'s content container `w-full max-w-sm grow justify-center gap-4 self-center
px-4 py-12`. `max-w-sm` is 24rem, 384 points, with the padding inside it, as on the web. `self-center` centers the
column across the screen. `grow` lets the content container fill the scroll's height, so `justify-center` centers a
short form down the screen, and a form taller than the screen still scrolls from its top. The alternative, a centered
`View` around the `ScrollView`, would center the scroll itself instead of its content and stop a tall form from
scrolling.

### The safe area view goes through withUniwind

`apps/mobile/src/components/common/ClassNameSafeAreaView.tsx` exports `withUniwind(SafeAreaView)`, beside
`ClassNameSvg.tsx`, which wraps the svg the same way. The session screen and the home screen use it, so their
`flex-1` takes effect. A `style={{ flex: 1 }}` in each screen would work too, but every other layout in the app is a
className.

## Risks / Trade-offs

- [The home screen's layout changes on a signed-in device] → its `flex-1` now fills the screen as the class always
  said, and its scroll reaches a list taller than the screen.
- [The logo has 2 points less width at the largest text size on a 402-point phone] → the column's 352 points of
  content against the old 354, checked on the simulator at the largest accessibility size.
