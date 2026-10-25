## Why

The web's sign-in, sign-up, and invite pages draw a column 24rem wide at most, centered across the page and down it.
The mobile session screens draw their content at the top of the screen, and on an iPad the buttons stretch across all
834 points, so neither the phone nor the tablet matches the web. The cause is partly a dropped class: the screens wrap
their scroll in `react-native-safe-area-context`'s `SafeAreaView` with `className="flex-1"`, but Uniwind styles only the
components it wraps, so the safe area takes no height and nothing inside it can center.

## What Changes

- Draw the sign-in, sign-up, and settings screens in the web's session column: at most 24rem wide, centered across the
  screen, with the web's padding, and centered down the screen while the content is shorter than the screen.
- Add `ClassNameSafeAreaView`, the safe area view wrapped with Uniwind's `withUniwind`, so its className styles it, and
  use it on the session screens and the home screen. The home screen's `flex-1` takes effect too, so its scroll fills
  the screen and scrolls a list taller than the screen.

## Capabilities

### New Capabilities

### Modified Capabilities

- `mobile-sign-in`: the session screens draw their logo and forms in the web's centered session column.

## Impact

- **Code:** `apps/mobile/src/components/session/SessionScreen.tsx`, `apps/mobile/app/index.tsx`, and the new
  `apps/mobile/src/components/common/ClassNameSafeAreaView.tsx`.
- **Docs:** `apps/mobile/AGENTS.md`.
- **Behavior:** the session screens move to the middle of the screen in a narrower column on an iPad. Nothing changes
  on the web.
