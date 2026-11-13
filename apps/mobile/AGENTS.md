# apps/mobile

`components/account/AiAgentAccountSection.tsx` renders the shared connected-app and API key controls.
`components/topic/TopicPersonalSourcesSection.tsx` renders saved items in Topic info and Artisanal Blend through `personalSourcesElements.tsx`. Edit Topic has no Personal sources setup section. `TopicPersonalSources.tsx` remains a standalone Nightshift preview.
Native adapters use Nightshift controls, selectable text, system confirmations, and `clipboard.ts`.
Conversation imports stay on the web; the matching position explains that limitation. Both phones read imported
entries through the same paged composition. The Personal sources stories use the browser's fixtures and name their references.

The Expo app: CarlNotes for iOS and Android from one codebase, on a development build, never Expo Go. It depends on the
universal packages alone — `@carlnotes/contracts`, `@carlnotes/client`, `@carlnotes/core`, `@carlnotes/nightshift` —
and the package boundary check fails anything else, a type-only import of `@carlnotes/api` included.

## Layout

- `app/` — the Expo Router routes. `_layout.tsx` configures the api client with the session cookie on every request,
  loads the fonts and the session behind the splash screen, stacks the TanStack Query providers and Sentry's wrap,
  mounts the Reusables `PortalHost` after the sheet provider so anchored controls appear above sheets, and guards the
  screens with `Stack.Protected`: a user sees `(tabs)/index.tsx`, the Home with its home topic and podcast cards and a user's topics,
  `(tabs)/topics.tsx`, the Topics directory, `(tabs)/search.tsx`, the retained site search, `(tabs)/settings.tsx`, a
  retained alias for Account, and `topics/[topicId].tsx`. Visitors may read Home, with the web hero, Search, public
  Topics, Podcast Episodes, Profiles, Teams, Plans, permitted Topic/Team notes, and `invite/[token].tsx`, the invitation
  screen, through the same platform routes, and the Dashboard screens, `profiles/[userId]/specials/topics.tsx`,
  `profiles/[userId]/specials/podcasts.tsx`, and `teams/[teamId]/specials.tsx`. `teams/specials.tsx` opens the user's
  first team's Team Dashboard in alphabetical order, or Teams for a user with no team. Account, with the three
  Dashboard rows, Activity, personal Teams, Settings, chat, and `teams/specials.tsx` require sign-in, and
  `+native-intent.ts` opens sign-in for a visitor's link to one of them, then the linked screen. Retired sessions cannot
  open public reading until their session is cleared. A visitor also sees `sign-in.tsx`, Google, GitHub, and Apple
  and the email form, and `sign-up.tsx`, the email form behind the app signup gate, with the web's prompt for the
  action that sent the visitor there. `storybook.tsx` is the component
  browser, which the layout shows only in a
  development build. A route's component is a screen (`HomeScreen`), the native word for what the web calls a page.
- `src/` — the app's own modules. `authClient.ts` configures the shared auth client at module load with the api base
  url and Better Auth's Expo plugin over `expo-secure-store`, and exports `mobileAuthClient`, the app's handle with
  `getCookie`, and `apiBaseUrl`. `apiRequestSettings.ts` is what the api client sends on every request and what a 401
  does. `appleSignIn.ts` is the native Sign in with Apple sheet. `appSignupGate.ts` attests the install through
  `@expo/app-integrity` and passes the gate, over `appSignupProofPlatform.ts`, which says which proof a build sends.
  `apiBaseUrl.ts` chooses the api url, and `typeRoleStyles.ts` maps the Nightshift type roles to native text styles.
  `activeIconProps.ts` is the class and fill of an active icon, the counterpart of the web's `ACTIVE_ICON_CLASS`.
  `clipboard.ts` copies text with accessible success feedback and shared failure handling for chat and Markdown.
  `theme.ts` restores and saves the appearance choice and keeps native controls and Uniwind on the same palette, and
  `useColorMode` reads the mode the app draws in.
  `themePreference.ts` names its three values: system, light, and dark. `sessionReturnPath.ts` keeps the screen a
  visitor left and `openSessionScreen` sends them to sign-in or sign-up with the web's prompt for the action,
  `nativeIntent.ts` decides what a link into the app opens: a web url maps through `platformPath.ts` the way the in-app
  links do, so a Topic's slug and a Podcast Episode's path reach their native routes, a listed path with no native route
  (`hasNativeRoute`) opens `app/open-web.tsx`, which shows the site's own url in the browser sheet and returns Home,
  and a visitor's link to an account screen opens sign-in. `appIconBadge.ts` keeps the app icon's
  badge at the account's update count. `appVersionLabel.ts` is the version line the Account screen ends with, drawn
  by `components/account/AppVersionLine.tsx`. `components/session/AppUpdateNotice.tsx` is the blocking notice an
  outdated build sees in place of every screen, on `core/stores/appUpdateStore.ts`, which `apiRequestSettings.ts`,
  `chatRoomEvents.ts`, and `authClient.ts` open on a 426. The Topic and Podcast Episode counts lines read their counts
  through `core/hooks/usePolledCounts.ts`, gated to the active route.
  The root loads regular and italic Karla faces at each supported weight so rich-text emphasis keeps the web's font.
  `hooks/useIsScreenActive.ts` shares route focus and app activity for chat and episode recording polls.
  `hooks/useFontScaledSize.ts` grows a size with the system text size, up to double, and
  `hooks/useIsReduceMotionEnabled.ts` follows the system's reduce motion setting. The `voice*.ts` modules and
  `spokenAnswerAudio.ts` are listed under Voice. The pure modules have `bun test` coverage beside them. No test renders
  a React Native component or imports a native module.
- `src/components/primitives/` — the app's implementation of each Nightshift component contract, at the path and file
  name of the web's implementation, added from React Native Reusables' Uniwind registry with its CLI and rebuilt on the
  contract. `button.tsx` and `badge.tsx` give the contract's box classes to the `Pressable` or `View` and its text
  classes to the label through `TextClassContext`, and add only the mobile classes: a pressed state for each Button
  variant in place of the web's hover, `flex-row` in place of `inline-flex`, the web's height as a minimum that grows
  with the label, a label that wraps beside an icon, and the border color the web's base layer gives. The Button
  draws each size at the web's height and reaches the 44-point touch target through a hit slop. `toButtonHeight`
  returns a size's height in points from `buttonHeightsRem`, and `toTouchTargetHitSlop` returns the hit slop that
  grows any drawn height to 44 points on iOS or 48 dp on Android, for the Button and for a control drawn to match it. Uniwind
  reads `active:` on a `Pressable` but no `group-active:`, so the Button tracks its own press for its label's pressed
  classes. The mobile Button requires an `accessibilityLabel`. `text.tsx` is the label inside them, in the Karla
  family, and `icon.tsx` a Lucide icon whose className sets its size and color. Every primitive has a story beside
  it, and each implementation's story has the web story's names, args, and controls. `components.json` points the
  Reusables CLI at this folder and its `cn` at `@carlnotes/nightshift/classNames`:
  `bunx @react-native-reusables/cli@0.7.1 add <name> --styling-library uniwind --cwd apps/mobile`, at the version that
  added the primitives here.
  `select.tsx` adapts the registry's `@rn-primitives/select` to Nightshift. Its popup anchors to the trigger, avoids
  screen edges, and closes on selection or outside press. `SelectItem` accepts custom content like web, so visibility
  choices keep their matching icons while the primitive owns selection and its checkmark. Rows uses this dropdown,
  never a choice sheet.
- `src/components/<area>/` — the app's own components, one PascalCase file per component, at the web's path and file
  name where the web has the same component. `branding/ShareMugsIcon.tsx` draws the two mugs of a comment that a Podcast
  Episode read. `branding/CoffeeMug.tsx` is the web's steaming mug, drawn from `@carlnotes/nightshift/coffeeMug` with
  the steam on React Native's `Animated` and its native driver. As on the web, the steam holds still below Nightshift's
  `md` breakpoint and under reduced motion, and rises on a wider screen. `common/` holds the components shared across
  areas: `cardElements.tsx` is `CARD_ELEMENTS`, the pressable card, topic image, text row, and heading the topic and
  podcast episode cards share, over core's `CardElements`, `ClassNameSvg.tsx` is an svg whose className sets the
  `currentColor` its paths draw in, and
  `ClassNameSafeAreaView.tsx` the safe area view whose className sets its style. Uniwind styles only the components it
  wraps, so a screen's safe area goes through it. `LoadFailedNotice.tsx` says a read failed, with its retry button, in
  place of a blank screen. `session/` holds what the sign-in, sign-up, and settings screens share: `SessionScreen.tsx`
  (the frame with the logo, the mug beside the name in the `logo` type role, in the web's session column, 24rem wide at
  most and centered both ways), `SessionTextInput.tsx` (the labeled field and the email and password fields over it),
  `SessionLink.tsx` (a session text link through `common/AnchorLink.tsx`, also used by the logo and the footer line that
  replaces the current form, with stories for both prompts, narrow wrapping, and the footer-free frame),
  `SessionErrorText.tsx`, and `OAuthProviderIcons.tsx` (the Google and Apple icons from
  `@carlnotes/nightshift/oauthProviderIcons`). Their buttons are the primitives' `Button`. A route imports `src/`
  through the `@/` alias, and so does a module whose relative import would climb two folders, as in `apps/web`.
- `global.css` — the stylesheet: tailwind, uniwind, and `@carlnotes/nightshift/uniwind.css`, the theme and the
  `shadow-raised` utility Nightshift writes, with the component contracts and `field.ts` read as Tailwind sources.
  It also scans `core/lib/spendMeter.ts` for the budget bar and legend colors returned by the shared model.
  Change a token in `packages/nightshift/`, never here.
- `metro.config.js` — Sentry's base config inside Storybook's `withStorybook`, inside `withUniwindConfig`, which must
  stay the outermost wrapper. Storybook is on outside production. In an export, a release build, or an update,
  `withStorybook` empties every Storybook module and every file under `.rnstorybook/`, and the CI export job fails if
  a bundle holds Storybook's `SET_CURRENT_STORY` or either platform's bundle is missing. `metro.config.js` also turns
  Storybook's telemetry off however Metro starts. Expo configures Metro for the monorepo and Bun's isolated install on
  its own, so add no watchFolders and no resolver aliases.
- `.rnstorybook/` — Storybook for React Native: `main.ts` finds the stories under `src/components/`, with the
  on-device controls and actions and the backgrounds feature, and `preview.tsx` loads the stylesheet, switches the
  Uniwind theme with the light and dark toggle, puts a `surface: "card"` story on the card fill, and exports
  `toStoryTheme`, the theme the toggle picked. `seriesColorsDecorator.tsx` is the chart stories' decorator, which draws
  a story at the frame's full width with the series colors of the toggle's theme. `manager.tsx`
  brands the frame as the web's is: `NIGHTSHIFT_STORYBOOK_THEME` maps the web frame's Dark roast fields onto
  Storybook's native theme in both modes, and `NightshiftStorybookUI` draws Storybook's own `FullUI` with the app
  icon and the name in the logo type role as the brand. The brand is set after Storybook's deep merge of the theme, which
  overflows the stack on a React element. The frame's own text stays in the platform font, since the native theme
  has no font family.
  `storybook.requires.ts` is the stories index Storybook's Metro wrapper writes on each start, committed so `tsc -b`
  resolves the route. Never edit it. Leaving the route restores the app's saved appearance.
- `css-modules.d.ts` — the declaration of the `*.css` module the root layout and the component browser import for its
  side effect, which TypeScript 7 requires. Metro resolves the file and Uniwind reads it.
- `uniwind-types.d.ts` — generated by Uniwind from the theme, committed like the web app's route tree. Regenerate with
  the dev server, never edit it.
- `assets/` — the launcher icons, the light and dark splash wordmarks, and `carl-hero.png`, the web's hero image the
  visitor's Home draws. The splash uses Nightshift's coffee mug,
  Architects Daughter, and foreground and orange brand accent colors at 280 points wide. The mug is an unfilled outline.
  Changing it requires a native rebuild.
- `app.config.ts` — the identity, the scheme from `@carlnotes/contracts/mobileApp`, the EAS project link, Sign in
  with Apple, the App Attest production entitlement, the associated domain and the Android intent filters for the
  app link paths in `@carlnotes/contracts/appLinkPaths`, the encryption declaration (`ITSAppUsesNonExemptEncryption`
  false: TLS and the system keychain alone), and the Sentry, splash screen, Apple sign-in, secure store, and
  web browser plugins. `eas.json` — the build profiles, each pinned to Bun 1.4.4, the image's Bun, and an EAS
  environment, the remote app version source with the production build number incrementing on each build, and the
  production submit profile, whose Play key path the submit script fills for the length of a submit. EAS is Expo
  Application Services, the vendor's name for its cloud build and update services, so identifiers and files keep its
  word. A change that adds a native module, as the sign-in change did, needs a rebuilt development client.
- `store/` — the store release's own files: `listing.md`, the Apple and Google listing copy and the review notes
  template, `data-inventory.md`, what the app and each service collect for the privacy and data-safety forms, and
  `release-checklist.md`, the acceptance list a release passes, each item unverified until someone checks it.

## Commands

- `bun run dev:mobile` — the Expo dev server under Doppler's dev config, with the expo-mcp server on, from the repo
  root. In a development build connected to it, `carlnotes:///storybook` opens the component browser.
- `bun run mobile:build -- --profile development-simulator` — an EAS cloud build; profiles: development,
  development-simulator, preview, production.
- `bun run mobile:update` — an EAS Update on the fingerprint runtime policy.
- `bun run mobile:env:sync` — moves the mobile values from Doppler into the EAS environments. Never type a value into
  the EAS dashboard.
- `bun run mobile:submit -- --platform ios | android` — submits the latest production build, under Doppler prd, after
  the contract freeze check. `--dry-run` does everything but the submit.
- `bun run contract:freeze` — writes `contracts/<app-version>.json`. `-- --check` proves the file is fresh.
- `bun run reviewer:seed -- --environment prd` — creates or refreshes the store reviewer's account, under
  `doppler run --config prd`.
- CI exports both platforms' bundles (`expo export`) to prove Metro resolves the isolated install; preflight does not,
  because the bundle takes minutes.

For a local iPhone development build, use `bun run --cwd apps/mobile expo run:ios`. Keep simulator signing enabled;
SecureStore needs the app's application-identifier entitlement even on a simulator. `CODE_SIGNING_ALLOWED=NO` can
produce a launching app that cannot read or save its session. After a native rebuild, verify sign-in before treating
the build as a runtime pass. A bundle-only check uses `bun run --cwd apps/mobile export --platform ios`.

## The api in development

`apiBaseUrl.ts` points the client at port 3000 on the host the device reached the dev server on. It normalizes
`127.0.0.1` to `localhost`, matching the local OAuth callback's hostname so the browser sends the sign-in cookie on
return. An Android device or emulator in localhost mode needs `adb reverse tcp:3000 tcp:3000` for the API and
`adb reverse tcp:5173 tcp:5173` for the browser callback through the running web server. Reconnect these after a
device restart, alongside the Metro port. A phone using a LAN address also needs a reachable OAuth callback URL.
The authorization proxy rejects a browser that already holds a CarlNotes session. Sign out of CarlNotes in the
Android browser before starting native Google sign-in. The native session arrives asynchronously after the callback.

## Accessibility bar

Every mobile change holds to the bar the web's Storybook checks set:

- Every pressable control has an `accessibilityLabel` and an `accessibilityRole`. The primitives' `Button` gives the
  role, and a Button without the label fails to type-check.
- Text scales with the system's text size on iOS and Android without clipping. Leave `allowFontScaling` on, and give
  a box around text a minimum height, never a fixed one, as the primitives' `Button` does. The logo and the oauth
  provider icons grow with the text up to double, the 200 percent the web is built for, so they still fit the screen
  at the largest sizes. The mug and the icons size through `useFontScaledSize`, and the name through
  `maxFontSizeMultiplier`.
- Touch targets are at least 44 points on iOS and 48 dp on Android. A control drawn smaller, to match the web, reaches the platform minimum through its hit slop,
  as the primitives' `Button` does.
- Colors come from Nightshift through Uniwind utilities (`bg-primary`, `text-muted-foreground`), whose contrast test
  already holds text to WCAG AA. No literal color values.
- Type goes through the roles in `src/typeRoleStyles.ts`, so a role reads the same on both platforms. A primitive's
  label takes its type from its contract's text classes instead, as the web's implementation does.

## Sign-in

The session is Better Auth's, kept by the Expo client in secure storage and sent as the `Cookie` header on every
request, the api client's through `apiRequestSettings.ts` and the auth client's own. Apple signs in through the native
sheet on iOS and the system browser on Android, Google and GitHub through the system browser on both, and email and
password natively. On iOS the Apple button is Apple's native button at the other sign-in buttons' height, never shorter, inside
a `Pressable` whose hit slop gives it the 44-point touch target, since the native view takes touches only inside its
own bounds. A browser sign-in returns on `carlnotes://`, which the api trusts. Email sign-up passes the app signup gate
in place of the web's Turnstile: a release build attests the install with App Attest or Play Integrity against a
one-time challenge, and a development build sends the development proof, which only the dev api accepts. A release
build that cannot attest is sent to the web's sign-up. A 401 from any request signs a revoked session out once, and the
guard shows the sign-in screen.

## Values

The app reads `EXPO_PUBLIC_SENTRY_DSN`, `EXPO_PUBLIC_POSTHOG_KEY`, and `EXPO_PUBLIC_PLAY_CLOUD_PROJECT_NUMBER`, the
Google Cloud project number Play Integrity is prepared with, inlined by Metro, and an EAS build reads
`SENTRY_AUTH_TOKEN` to upload source maps. All four live in Doppler (dev and prd) and reach EAS through
`mobile:env:sync`. A reporter without its key stays off, so a build without keys sends nothing, and an Android
release build without the project number cannot attest and sends sign-ups to the web.

## Feed reading

[Native reading and visual parity](reading-and-parity.md) maps Feed and Topic routes, saved reading data, and platform replacements to the web references.

## Native Tasting Notes and account features

[Native accounts and collaboration](account-and-collaboration.md) covers Tasting Notes, menu pages, forms, visitor access, live counts, push, store payments, and telemetry.

## Reactions and comment threads

`src/components/layout/SectionAnchor.tsx` is the screen's equivalent of a web anchor. Wrap a section in
`<SectionAnchor name="...">` and link with `?section=<name>`. `src/hooks/useSectionTargetScroll.ts` keeps a scroll
view at the view that fills `SectionTargetContext`'s ref, with no animation, until the user scrolls, and announces the
end of each scroll. `PageScreen`, the topic screen's scroll view in `topic/TopicPageContent.tsx`, and `Sheet` use it.
A screen with its own scroll view needs the hook and the context added first.

`src/components/social/` adapts core's `ReactionRow` and `CommentThread`. `socialElements.tsx` is the app's
`SocialElements` set: the six reaction icons from `lucide-react-native`, each drawn in `ReactionOption.tsx` at the web's
height with a hit slop to the touch target, the composer in a `Sheet` with `BottomSheetTextInput`, and a choice sheet
for a Podcast Episode's chapter. Its `COMMENT_ELEMENTS` and `SocialComposer` are the comment parts and the one composer
that `note/NoteComments.tsx` reuses, with a plain `TextInput` outside a sheet. Its comment row fills
`SectionTargetContext`'s ref for the Comment a link names with `?comment=<id>`, so its screen or sheet opens at it,
and a row with an unseen Comment Mention reports itself seen once half of it is inside the window, as it is laid out
and at the end of each scroll (`isHalfInWindow`, `subscribeScrollEnd`). `ReactionRow.tsx` and `CommentThread.tsx`
add sign-up that returns to the screen, the app's error display, the report sheet, and the thread's view event. The
flame and mugs of a comment shared with the podcast show their label as their accessibility label. `SocialSection.tsx`
holds the thread in the collapsible Hot takes card that `topic/TopicPageContent.tsx`,
`podcast/PodcastEpisodeScreen.tsx`, and the Finding's sheet in `topic/TopicResourceInfo.tsx` (its link preview in
`topic/FindingLinkPreview.tsx`) mount, each with the
reaction row in its header, and the sheet has the Finding's own flag.

## Chat and audio

[Native chat and audio](chat-and-audio.md) covers chat, Coffee Break playback, the mini player, and voice recording.

## Store release

The path from a commit to a store build, in order. Every secret stays in Doppler prd and is read by `doppler run`.

- Build. Bump `version` in `app.config.ts` for a release that changes native code or that a store will review. Then
  run `bun run mobile:build -- --profile production --platform ios` and again with `android`. The build number comes
  from EAS (`appVersionSource: remote`, `autoIncrement` on production). `eas build:version:get` shows it, and the
  first production build initializes it. `eas build:version:set` starts it higher when a build number has to continue
  from an earlier store record. A preview build (`--profile preview`) installs beside the store app for the
  acceptance list.
- Test. `bun run check` is green, the stories for every new state exist, and `store/release-checklist.md` is worked
  through on the preview build, each result filled in with a date. An unverified item is named in the release record,
  never marked passed. TestFlight and the Play internal track take the production build before the public rollout.
- Freeze. At the submission version, `bun run contract:freeze` writes `contracts/<version>.json`, every api route the
  app reaches as JSON Schema from `@carlnotes/contracts/apiRouteContracts`. Commit it, and add the version to
  `contracts/releases.json` as `submitted`. From then on `scripts/check-contract-freeze.ts` fails preflight on an api
  change that a build of that version could not read or could not send. A read breaks on a dropped required field, a
  changed type, or an extended response enum. A send breaks on a new required request field, a narrowed type, or a
  removed enum value. A new optional field or a loosened request passes. The freeze fails on a capability the app
  reaches with no registry entry. A new client function gets its entry in the same change, or an `API_ROUTE_HELPERS`
  line if it calls no route.
- Submit. `bun run mobile:submit -- --platform ios`, then `android`. The script runs `contract:freeze -- --check`.
  It writes the App Store Connect key or the Play service account from Doppler (`ASC_APP_ID`, `APPLE_TEAM_ID`,
  `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_API_KEY_BASE64`, `PLAY_SERVICE_ACCOUNT_BASE64`) for the length of the submit.
  It then runs `eas submit --profile production --latest` and removes the key files. `--dry-run` proves the path
  without submitting.
- Rollout. iOS goes TestFlight, then review, then the store. Android goes the internal track, then production with a
  staged percentage in the Play Console. Once the App Store record exists, set `APP_STORE_ID` in
  `@carlnotes/contracts/mobileApp`: the web's smart banner and the 426's store url read it. Move the version to
  `released` in `contracts/releases.json`.
- Rollback. A store build is withdrawn in App Store Connect or halted in the Play Console. A JavaScript regression on
  a shipped build is undone with `eas update:republish` of the last good update on the channel. A minimum version
  raised too soon is cleared from the admin console's Mobile app card, which lifts the gate within a minute.
- Update or build. A change that touches native code, a config plugin, a native dependency, or a patch changes the
  runtime fingerprint and needs a store build: `bunx @expo/fingerprint apps/mobile` before and after the change shows
  it. A JavaScript-only change ships as `bun run mobile:update -- --channel preview --environment preview`, is checked
  on a preview build, then goes to the production channel. An update never reaches a build on another fingerprint.
- Minimum version. The admin console's Mobile app card holds the oldest build each platform's api still serves. A
  build below it gets a 426 on every api call and shows the update notice until it updates. Raise a minimum only above
  a version whose traffic has drained in PostHog (the `appVersion` property on every mobile event), and never within a
  day of a release. The gate fails open: no row, or a Redis or database failure, serves every build.
- Retire a snapshot. Once both minimums are above a version and its traffic has drained, mark it `retired` in
  `contracts/releases.json` and delete `contracts/<version>.json`. Preflight stops checking against it.
- App links. The paths the app opens live in `@carlnotes/contracts/appLinkPaths`. The api serves the two association
  documents from `APPLE_TEAM_ID` and `ANDROID_SIGNING_FINGERPRINTS` (the Play App Signing key's SHA-256 and the upload
  key's, comma separated, from `eas credentials` and the Play Console). Apple's CDN check is
  `https://app-site-association.cdn-apple.com/a/v1/carlnotes.com`, and Android's is
  `adb shell pm verify-app-links --re-verify com.carlnotes.app` then `adb shell pm get-app-links com.carlnotes.app`.
- Reviewer. `bun run reviewer:seed -- --environment prd` under `doppler run --config prd` creates or refreshes the
  reviewer's account with its fixtures. The credentials come from `REVIEWER_EMAIL` and `REVIEWER_PASSWORD` in Doppler
  and go into the review notes by hand, from `store/listing.md`'s template.

## Topic images and the home

`components/layout/HomeHeadline.tsx` is the Home headline on both faces, the web's `HomeHeadline` at phone width.
`components/common/AccordionSection.tsx` is one section of a screen's list of sections, the web's `AccordionSection`.
It and `components/topic/CollapsibleSection.tsx` draw a section's title in the `sectionTitle` type role with its count
at the far right, and a caller leaves a count of zero out through `toSectionCountLabel`. An optional icon sits before
the title, as the account screen's Budget and Settings sections show.
`components/common/MeterRing.tsx` adapts core's `MeterRing` in two stacked svgs, the account budget cards' rings.
`components/common/CardsSection.tsx` adapts core's `CardsSection`, the home's, the profile's, and the team screen's
card sections, Featured Posts right below Featured Podcasts on the profile and the team screen and the profile's
Featured Films right above them, with this app's accordion section, card column, and page buttons. The Home writes its
sections in `HOME_SECTIONS`' order, as the web does, with New podcasts this week right below Featured podcasts and New
posts this week right below Featured posts, each absent with no card. The profile's Featured Posts lists every post
of its person and is its only Topic Post section. The team screen has the profile's four card sections, Featured
Films right before Featured Podcasts, and its Featured Posts lists every post of its topics.
`components/account/ProfileSections.tsx` and `components/team/TeamSections.tsx` adapt core's `ProfileSections` and
`TeamSections` over `components/common/pageSectionsElements.tsx`. The profile and team screens' card sections are
`AccordionSection`s and their table sections are `CollapsibleSection`s, as on the Activity, Teams, and topic screens
and in their loading states. `src/teamTopicRemoval.ts` removes a Topic from a team for the team screen and the add to
team sheet, and throws the line both show if the remove fails.
`components/team/TeamHeader.tsx` adapts core's `TeamHeader` with the leader's avatar picker, and
`components/activity/ActivitySections.tsx` adapts core's `ActivitySections` with the subscriptions and sent invites
tables, whose delete confirmations `components/table/TableConfirmAlert.tsx` opens as the system alert.
`components/common/ViewerCountLine.tsx` adapts core's
Visitors line at the end of the profile, team, and Topic Post screens, with the links to the person's Topic Dashboard
and Podcast Dashboard and the team's Team Dashboard. `components/dashboard/DashboardScreen.tsx` is a Dashboard screen
over core's `Dashboard`, with `dashboardElements.tsx` for its sections, cards, controls, and the sheet a tapped point
opens, and `components/common/avatarHeaderElements.tsx` for core's `AvatarHeader`, `AvatarHeaderSkeleton`, and
`DashboardSubjectHeader` under the screen's title, which the Teams, Activity, and Account screens share. `dashboardPageIcons.ts` holds each page's icon, which the screen's title, the loading state of
`teams/specials.tsx`, and the user menu share. `DashboardBarChart.tsx` draws the top ten as native rows,
`DashboardPieChart.tsx` the pie and `DashboardTrendChart.tsx` the trend with Victory Native on Skia,
`DashboardWordCloud.tsx` the word cloud with react-native-svg, and `PlaceMap.tsx` the map with react-native-maps, on
Google Maps on Android and on iOS if the build has `GOOGLE_MAPS_IOS_API_KEY`, else Apple Maps. Each has a story beside
it. `components/common/DetailsLine.tsx` adapts core's details
line, a wrapping row of small muted text: the counts under a topic's byline and reactions, a Topic Post's date,
reading time, and comment count under its byline's row, the profile's and the team screen's summary line, and the
Topic's viewers and followers in the Topic Post sheet. `components/common/DotSeparatedTexts.tsx` adapts core's row
details texts, which the news, search, and finding rows draw on their details lines. `components/common/RankDialog.tsx` adapts core's
`RankDialog` in a `Sheet`, where step buttons replace the web's drag, for the topics, films, podcast episodes, and
Topic Posts pinned on a person's own profile, opened from the profile and from the screen of one of their topics,
podcast episodes, or Topic Posts.
`components/topic/TopicByline.tsx` is a topic's byline, the team or the owner of the topic with its avatar, the web's
`TopicByline`. `components/topic/TopicCard.tsx` and `components/podcast/PodcastEpisodeCard.tsx` adapt the shared cards
over `components/common/cardElements.tsx`, the card box, topic image, and text row the two cards share, matching the
web's `cardElements`. `components/podcast/PodcastEpisodeVideoButton.tsx` adapts the shared button that opens a film,
with the Video sheet its press opens: a film card's round play button, `PodcastEpisodePlayButton` centered over the
card's image, and the Video pill beside the play pill on a `components/social/NewsList.tsx` row whose Podcast Episode
has a film. Its thumbnail size is the play button over the film's poster in `components/topic/TopicInfo.tsx`, whose
sheet shows the latest film's section, core's `TopicPodcastEpisodeVideoInfoSection`, right above the podcast's, and
whose Video sheet opens over the Topic roast sheet. `components/podcast/TopicPodcastEpisodeVideoPlayer.tsx` adapts
core's film player to an `expo-video` view with its captions track, fullscreen, and picture-in-picture, over
`src/topicPodcastEpisodeVideoAdapter.ts`, which adapts one Expo player to core's playback and keeps the authorized
film url in memory only. `components/podcast/TopicPodcastEpisodeVideoDialog.tsx` is the Video sheet, and
`components/podcast/TopicPodcastEpisodeVideoSection.tsx` the topic screen's collapsible film section, which the
screen scrolls to each time a row asks. While a film renders, that section on a topic with no ready film and the
podcast episode screen's film section show `components/podcast/UnpublishedPodcastEpisodeCard.tsx` with
`isVideoRendering` in the film player's place, the recording card's frame with the line "Carl and Vienna are
filming...", and core's `useTopicPodcastEpisodeVideoRenderingPoll` reads the screen again until the film is ready.
`components/topic/TopicNotePopover.tsx` adapts core's
`TopicNotePopover`, a Topic's note in a sheet under the note icon of a search row and a news row, and
`components/social/CommentMentionBadge.tsx` core's mention badge, a count whose press opens
`components/social/CommentMentionList.tsx` in a sheet, right after the title of the podcast episode screen and of the
Topic Post screen. `PageUpdateCountBadge` in `components/common/UpdateCountBadge.tsx` opens the same list on a press
while a Comment Mention waits and no chat mention does, as the web's does. `components/topic/TopicImageEditor.tsx` adapts the editor's
image block, with the device's photo picker for its file picker. `components/topic/TopicImageButton.tsx` is the image as
a button with a camera in its corner, and the screen header's image, which is that button for an editor.
`components/topic/TopicImageLink.tsx` adapts core's `TopicImageLink`, the image inside an `AnchorLink` to the screen of
what it shows, the web's `TopicImageLink`: a search row's, a news row's, and a Topics row's image, the Topic's image
in a Finding's and a Topic Post's sheet, each no accessibility element of its own beside the title that opens the
same screen, and the full-width image of the Topic roast and Topic Post sheets, each with its name, whose press also
closes the sheet. It compares the image's path, mapped through `toPlatformPath`, with the open route, and the open
screen's own image is a plain image.
`components/topic/EditImageDialog.tsx` is the Edit topic image and Edit podcast image sheet that the header image
opens, and the Edit film sheet that the Edit film option opens from the action menu of the podcast episode screen and
of the topic screen (`toEditTopicPodcastEpisodeVideoOption` in `components/search/pageActionOptions.ts`, which also
holds the Add topic to team and Share topic options and their labels, as both those screens' menus offer them), and
`components/podcast/EditPodcastEpisodeDialog.tsx` the Edit podcast sheet of the podcast episode screen's menu, the
web's dialogs of those names. `components/podcast/PodcastEpisodeHeader.tsx` holds that screen's header and
`components/podcast/PodcastEpisodeSkeleton.tsx` its loading state, the web's files of the same names, and `components/branding/NoteIconButton.tsx` the note tile as the button that opens a
Topic roast sheet or a Topic Post's info sheet.
`SearchRowTopicLink` in `components/search/SearchResultsList.tsx` opens a search row's or a news row's Topic without
opening the surrounding finding sheet, the web's `SearchRowTopicLink`. `src/topicImageClasses.ts` holds the classes of
a topic image in a header row, a Topics row, and the Topic roast sheet, matching the web's topic images at phone
width. `src/pageButtonClasses.ts` holds the
classes of a screen's top row of buttons, the counterpart of the web's page button classes. `PLAIN_PAGE_BUTTON_CLASS`
is the plain button at the row's left, the card's fill and border with a muted label and an icon that alone takes the
highlight color, and `HIGHLIGHTED_PAGE_BUTTON_CLASS` the one highlighted button at its right and the button of a titled
header row. Both go on the default `Button`, so the two draw at one size, 36 points tall with the hit slop to the touch
target. `PAGE_BUTTON_ROW_CLASS` is the row, and each screen adds the margins that keep 16 points above it, from the
search bar, and 16 points below it. `AVATAR_HEADER_BUTTON_ROW_CLASS` is that row with `PageScreen`'s margins, which
the screen and its loading state share. `src/components/common/PageHeaderRow.tsx` holds the avatar header's row and
`PageHeaderIdentity.tsx` the column beside the avatar that a profile, a team, and a Dashboard screen share, with the
title and the counts beside the avatar as the web's header draws them at phone width, and below it at a text size too
large for them to fit beside it. `src/sectionClasses.ts` holds the classes a section and its loading state share:
`SKELETON_SHAPE_CLASS`, a placeholder's fill, the collapsible section's box and title row, the news card's heading row,
and `COUNTS_LINE_CLASS`, the visitors and counts line that `ViewerCountLine` and `TopicCountsLine` share. A screen's
loading state is laid out in the loaded screen's own classes and components, so a section's
loading state is `AccordionSection` with `isLoading` or `components/topic/CollapsibleSectionSkeleton.tsx`, and the
news list's is its own loading rows. `components/topic/TopicSkeleton.tsx` is the topic screen's loading state, and
exports the film card's, the player card's, and the empty section card's loading states that the podcast episode
screen's loading state shares.

## Personal sources and search

`src/components/topic/TopicPersonalSourcesSection.tsx` adapts the same core section for Topic info and Artisanal Blend: flat full-item disclosures with a live item-count header, without a separate opener, popover, source grouping, or horizontal inset.

`src/components/primitives/expandable-row.tsx` implements the Nightshift contract and renders core's `ExpandableRow`
for item disclosures in both placements. `PersonalSourcesImportButton` and `PersonalSourcesImportDialog` render their same-name
core components; the native sheet explains the web import and returns focus to its opener. Native stories name their web references.

Personal sources stories cover the shared section in Topic info and Artisanal Blend: empty, with items, and item-expanded states, item loading/error/paging states, settings, linked Findings, and the contracted
expandable row. Loaded fixture states stay local to the stories; production reads retain the sender gate.


`PersonalSourceLink.tsx` shares authorized Finding resolution and local opening state through core. Web adapts it to the existing `TopicResourceInfo` popover; mobile uses its existing sheet. External sources retain the browser icon and only pending sources show Next brew. `core/lib/topicFindingCopy.ts` supplies the common tooltip and native accessibility hint.

`TopicInfoSection.tsx` shares labeled information-section composition through core, with thin same-name platform adapters and paired stories. Topic and Finding details reuse it without importing each other.

Edit Topic has no Personal sources setup section. Only empty Personal sources content renders the shared one-line mailbox hint and Copy. Forwarding instructions remain in docs.

Personal sources conversation links say “Open shared conversation in {platform}”, with the destination platform mark before the launch icon. Nightshift’s `Topic/TopicPersonalSourcesSection` includes `ConversationPlatforms` and individual platform examples. A missing conversation URL renders no link; an unrecognized destination uses the generic chat mark.

`components/search/SearchResultRow.tsx` and `TopicSearchResultDetails.tsx` adapt the same core row composition and count/podcast formatting used by web search and the MCP picker, retaining native navigation, font-scaled ranks, and separators. Both have on-device stories.


Entity icons use Lucide Coffee for Topics, Mic for Podcast Episodes, NotebookPen for Topic Posts, and Globe for Findings. The web search kind map, native search rows, Finding summaries, Podcast Episode pills, chapter tags, and podcast feed actions follow this convention. Media-type icons remain specific to files, video, or audio when describing a Source or attachment.

Expanded Personal sources entries reuse core date-only metadata and sender identity, with the same AI provider marks and mail icon as web. Deletion requires confirmation.

Personal sources items, private summaries, and annotations have no automatic expiry. Their content remains encrypted until explicit deletion. Released read contracts retain nullable expiry fields as null. Optional conversation URLs survive the MCP picker outside matching and open from the shared AI sender label; missing references remain plain labels.

Personal sources conversation metadata links the complete date, platform icon, and name when a real reference is supplied. Both apps consume the shared entry list and platform fixtures. A strict existing-chat Codex URI opens the system app; web references use the existing browser adapter. No entry retention sentence is shown.

Topic Posts: `src/components/topicPost/` holds the app's adapters of the shared `TopicPostCard`, `TopicPostInfo`
(a sheet in the popover's place, which reads its post by id once it opens, under the notebook-pen tile that
`src/components/social/NewsList.tsx` draws on a published Topic Post's row. The web splits that tile into its own
`TopicPostInfoButton`, which a sheet needs no second frame for. Its
Share and the screen's Share open `src/components/share/ShareTopic.tsx` with the post as its `topicPost`, which shares
the post in the topic's place, and whose invite link opens the post), `TopicPostsSection`, and
`TopicPostEditor`, whose `TopicPostBodyControls.tsx` adds the Image button from the photo library with each upload's
preview, and which returns to each save the code block languages and alt texts the native editor drops. The native
input and reader draw an image at its stored size, so the editor opens and the post's body shows once their width is
measured, with each image no wider than it, and a save keeps each image's stored size, and
`TopicPostScreen.tsx`, the screen at `app/topics/[topicId]/posts/[topicPostId].tsx`, with the post's body in
`TopicPostBody.tsx`. `ShareTopic.tsx`, `ShareTeam.tsx`,
and a Dashboard screen's
Share open the operating system's share sheet through `share/shareSheet.ts`, which shows an error if the sheet does
not open. `TopicPostScreen.tsx` renders the shared `TopicPostPage`: a
published post in `PageScreen` with its actions menu, whose Featured posts opens the author's `ProfileRankDialog` on
a published post of a public topic, image sheet, and comment thread, and a draft or an edit in
`note/NoteEditorScreen.tsx`, as a note's. `src/platformPath.ts` maps a post's web path to its route.
`src/components/account/ProfileHeader.tsx` adapts the shared profile header. `note/NoteDetails.tsx` and
`note/NotesList.tsx` adapt core's open note header and notes list, and `NoteScreen.tsx`'s open note renders the header
with `note/NoteNameInput.tsx` and `note/NoteFooter.tsx`, the save status, retry, report, and delete.
`note/NoteLayout.tsx` exports
`NoteBodyScroll` and `NoteKeyboardDoneButton`, which the note and the Topic Post editor both lay out with, and
`note/NoteEditorScreen.tsx` is the screen both are edited on: the header over the editor in the keyboard-safe space. A
disabled page action with a reason stays pressable and says its reason in a dialog.

Topic Post Discussions and the Topic Post chat: `src/components/topicPost/TopicPostDiscussionCard.tsx` adapts the
shared discussion card with the podcast play button and the session forms' text field. Its name is the button that
opens and closes the recording's transcript, behind the news card's caret, and the transcript's lines are the podcast
episode transcript's Text. A discussion plays through the
shared player and the app's audio adapter, which resolve its audio and its access through the podcast episode client by
the player's id. `TopicPostScreen` exports `TOPIC_POST_PAGE_ELEMENTS` for the page's stories and names the open post
to `topicPostChatStore`, again each time the screen takes focus. A chat screen asks about that post only if the
post's screen opened it (`toChatScreenTopicPost` in `src/components/chat/chatNavigation.ts`), so a Topic screen
opened above the post's keeps its own chat. On that screen `toChatHref` in `src/components/chat/chatNavigation.ts` sends the chat launcher
to `/topics/[topicId]/chat` with `privateChat=true`, so the chat screen opens on the topic's private chat, and a
visitor's press opens the sign-up sheet. `useChatPage` labels the private chat's choice with `toPrivateChatIdLabel`
on one line, and `PrivateChatPanel` reads its placeholder from `toPrivateChatPlaceholder`. Report image is the
screen's report in its actions sheet, beside a Report image N in post option for each body image a reader may report.
`src/components/chat/TopicPostTag.tsx` adapts the shared tag to a pressable
link.
