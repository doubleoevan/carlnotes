## Context

`SessionLayout` renders both the login and signup routes. It puts the Google and GitHub buttons at the top and folds the email form behind a **Continue with email** link, which is the right order in a real browser: one tap versus typing a password.

Inside an embedded webview it is the wrong order. Google answers an OAuth request from a webview with `403 disallowed_useragent`, so the first button on the screen leads to a Google error page. LinkedIn, Instagram, and Facebook all open links this way, which is exactly where a shared CarlNotes link is likely to be tapped.

`emailAndPassword` is already enabled in `api/auth.ts`, so the working path exists and is simply presented second.

## Goals / Non-Goals

**Goals:**

- A visitor from a social link meets a path that works, first.
- The reason is stated, so the screen does not read as broken.
- Android visitors get a way into Chrome; iOS visitors get told where to look.

**Non-Goals:**

- Making Google OAuth work inside a webview. It cannot be done from our side; the refusal is Google's policy.
- Hiding or disabling the provider buttons.
- Changing the auth configuration, the submit handlers, the Turnstile check, or anything server side.
- Detecting every in-app browser. The list covers the apps that actually send us traffic, and an unrecognized one simply gets today's behavior.

## Decisions

### Detection is a user-agent match, kept in one helper

A small helper in `ui/src/lib` answers two separate questions: whether this is an in-app browser, and which platform it is. They are separate because the escape hatch differs by platform, not by app — every Android webview takes the same `intent://` route and no iOS webview does.

`navigator.userAgent` is the only signal available. It is spoofable and incomplete, which is exactly why the detection only reorders and explains rather than removing anything.

*Alternative considered*: feature-detecting the webview (probing for `window.chrome`, checking `window.matchMedia("(display-mode: browser)")`). Rejected — those signals are noisier than the user-agent tokens the apps set deliberately, and a false positive there would be as wrong as a missed match.

### Reorder rather than hide

The in-app case renders the email form open and above the provider buttons. The buttons keep their handlers and their styling.

Hiding them would turn a detection miss into a lost sign-in, and would also remove GitHub, which is not subject to Google's refusal and often completes in the same webview. Demoting costs a visitor one glance; hiding costs them the account.

### The notice carries the platform difference, not the detection

One notice component renders in the in-app case, and its copy branches on platform: Android gets an `intent://` link, iOS gets a sentence naming the browser's own menu.

`intent://` needs the current url rewritten into an intent with a browser fallback, which is a string built at render time from `window.location`. On iOS the same slot holds no link at all — offering one that silently fails would be worse than the sentence.

### `SessionLayout` decides, both routes inherit

The ordering lives in the shared layout rather than in `LoginPage` and `SignupPage`. Both routes already hand the layout their own submit, wording, and cross-link; neither should have an opinion about browser detection, and putting it in one place is what keeps them identical.

Signup's Turnstile widget rides along in `extraFields` and is unaffected — the email path was always the one that needed it.

## Risks / Trade-offs

- **A missed in-app browser gets today's behavior** → They see the Google button first and may hit the 403. That is the current state for everyone, so a miss is no worse than not shipping; a match is strictly better.
- **A false positive demotes OAuth in a real browser** → The visitor sees email first and the buttons just below, still working. The cost is one extra glance, which is why the buttons are not hidden.
- **The `intent://` link depends on Chrome being installed** → The intent carries a browser fallback, and the email form is still on screen either way.
- **Turnstile inside a webview** → Signup's bot check now sits on the path we are steering people toward. It is the same widget the email path has always used, so this changes how many people meet it rather than whether it works.

## Open Questions

None.
