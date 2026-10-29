# Dependency patches

`expo-audio@58.0.10.patch` adds single-player chapter targets to Expo audio 58.0.10. The app streams one continuous
file; a playlist would change tracks instead of seeking to the next or previous chapter in that file.

The patch adds `setChapterTargets` to the TypeScript interface, generated declaration, iOS module,
and Android module. It filters targets to finite, nonnegative positions and sorts them. iOS remote next/previous commands and
Android MediaSession next/previous commands seek to adjacent chapter starts, retain pause, and update the displayed
title. Crossing either boundary is a no-op. Replace/release clears targets so a later source cannot reuse old metadata.
Ordinary timed seek commands remain Expo's own implementation; the app requests 15 seconds back and 30 forward.

The root `patchedDependencies` entry makes Bun apply this patch during installation. Upgrading Expo audio requires
checking the upstream single-player command support, reapplying or retiring this patch, rebuilding the app, and testing
chapter boundaries, replacement, pause, metadata, and system controls. An OTA JavaScript update cannot install the patch.
No recording capability is added. App config enables playback background modes/service and disables microphone permissions.

For this change, the iOS simulator build compiles the Swift extension. Android device QA is deliberately excluded at
the user's request. A simulator cannot establish physical headset, Bluetooth, real phone-call interruption, or every
lock-screen command behavior; those require device checks before release.

The other versioned patches remain owned by their existing module guides: Markdown rendering, rich-text editing,
and the mobile chat SSE transport. This change does not alter them.
