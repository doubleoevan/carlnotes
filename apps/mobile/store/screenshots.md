# Store screenshots

The screens each store listing shows, in order, and the sizes each store takes. The app runs in portrait, and
`app.config.ts` sets `supportsTablet`, so Apple asks for iPad screenshots too. Check each size against the store's
upload page on the day: both stores change their required sizes with new devices.

## Where they come from

Take them from a release build, so no development menu or Storybook entry shows: a TestFlight build on an iPhone and an
iPad, and the Play internal track build on an Android phone. A simulator or emulator running the same release build
works too, at the exact device sizes below. Sign in as the review account, whose seeded topic, team, and podcast
episode fill every screen. Set the clock to 9:41 with full signal and battery: `xcrun simctl status_bar` on a
simulator, demo mode on Android. Take each screen in light mode, and add the dark set only if both read well.

## The screens

| # | Screen | What it shows | Caption |
| --- | --- | --- | --- |
| 1 | Home | The headline, Your topics, and the Brews News card | He already read it. All of it. |
| 2 | A topic page | Its findings, Carl's notes, and the scan recap | Carl keeps what matters, and says why. |
| 3 | The podcast episode player | Chapters, the transcript, and the full player | Carl and Vienna talk it through. |
| 4 | Coffee Break Cinema | A film playing a chapter, with the page Carl read on screen | Watch it in Coffee Break Cinema. |
| 5 | Coffee Talk | A question, Carl's reply, and an attached photo | Ask Carl anything about your topics. |
| 6 | A team room | Replies and a mention | Talk it over with your team. |
| 7 | A Tasting Note | A formatted note with a comment | Keep notes together. |
| 8 | Specials | A team's board of the day's numbers | See what your topics read today. |

The first three carry the listing on both stores, because the search results show only them. Captions are optional.
If the screenshots carry them, set them in Nightshift's display type on the page background, above the device frame.

## Sizes

### App Store

| Set | Size in pixels, portrait | Count | Required |
| --- | --- | --- | --- |
| iPhone 6.9" | 1320 × 2868, or 1290 × 2796 | 3 to 10 | Yes. Apple scales it for the smaller iPhones |
| iPad 13" | 2064 × 2752, or 2048 × 2732 | 3 to 10 | Yes, because the app supports iPad |

PNG or JPEG, no transparency. An app preview video is optional and is left out of 1.0.

### Google Play

| Asset | Size in pixels | Count | Required |
| --- | --- | --- | --- |
| Phone screenshots | 9:16, each side 1080 to 3840 | 2 to 8. Four or more at 1080 or wider for Play to feature the app | Yes |
| 7" tablet screenshots | 9:16, each side 320 to 3840 | Up to 8 | Only to be listed for tablets |
| 10" tablet screenshots | 9:16, each side 1080 to 7680 | Up to 8 | Only to be listed for tablets |
| Feature graphic | 1024 × 500 | 1 | Yes |
| App icon | 512 × 512, 32-bit PNG | 1 | Yes |

PNG or 24-bit JPEG, no transparency except the icon. The feature graphic shows Carl and the wordmark on the page
background, with nothing important near the edges, because Play crops it on some screens.

## Already on hand

`apps/docs/src/assets/screenshots/mobile-app-screens.png` and `mobile-push-badge-iphone.png` are docs images at docs
sizes, useful as a layout reference only.
