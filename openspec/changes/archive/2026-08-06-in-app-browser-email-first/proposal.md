## Why

Google refuses OAuth inside an embedded webview. A visitor who taps a CarlNotes link in LinkedIn, Instagram, or Facebook lands in that app's in-app browser, presses **Continue with Google**, and gets a `403 disallowed_useragent` page from Google rather than a consent screen. Nothing in our UI explains it, and the session form leads with the button that cannot work.

The session forms currently order the paths as OAuth first and email folded away behind a link, which is right in a real browser and exactly backwards in a webview. Every visitor arriving from a social link therefore meets a dead end on the one screen that decides whether they become a user.

## What Changes

- A user-agent helper under `ui/src/lib` names the in-app browsers we can detect and, separately, the platform, since the way out differs by platform rather than by app.
- `SessionLayout` leads with **Continue with email** when an in-app browser is detected: the email form is open on arrival rather than folded away behind a link.
- The OAuth buttons stay visible but demoted below the email path. They are not hidden and not disabled — GitHub still works in most webviews, the detection is a guess, and a visitor who knows better keeps the choice.
- A short notice in Carl's voice explains why the order changed, so the demotion reads as help rather than a broken page.
- On Android the notice offers an `intent://` link that reopens the current page in Chrome. iOS has no equivalent, so its copy names the browser menu instead.
- Ordering, wording, and the escape hatch are the whole change. The forms, their submit handlers, the Turnstile check on signup, and the OAuth handlers are untouched.

## Capabilities

### New Capabilities

None. This changes how an existing capability is presented, not what it can do.

### Modified Capabilities

- `user-auth`: the session forms order their sign-in paths by what can actually succeed in the current browser, leading with email inside an in-app browser and explaining why.

## Impact

- **UI**: a new user-agent helper in `ui/src/lib`, and `ui/src/components/session/SessionLayout.tsx` for the ordering, the notice, and the Android escape hatch. Both routes rendering it — `LoginPage` and `SignupPage` — inherit the behavior with no change of their own.
- **API**: none. `emailAndPassword` is already enabled in `api/auth.ts`, and no route or provider config changes.
- **DB**: none.
- **Dependencies**: none. Detection is a string match on `navigator.userAgent`.
