# Store steps that wait for the company

The steps to publish CarlNotes in both stores that need the company to exist first, in the order to do them. The
company forms on December 17, 2026. Nothing is submitted before then. Each step names what it unblocks, and the steps
under one heading can run side by side.

## 1. The company itself

1. Form the company and get its EIN. Everything below signs as the company.
2. Get the company's D-U-N-S number. Apple's organization enrollment requires it, and the lookup can take days, so ask
   the day the company forms.
3. Open the company's bank account. Both stores pay out to it, and both ask for it before a paid app or subscription
   goes live.

## 2. Apple

1. Convert the Apple Developer account from individual to organization with the D-U-N-S number, or enroll the company
   and transfer the app. The seller name on the App Store becomes the company's.
2. Sign the Paid Apps agreement in App Store Connect under Business, with the company's bank account and tax forms
   (W-9). Its status must read Active before a subscription can be sold or tested in review.
3. Create the subscription group "CarlNotes" with Premium ranked above Plus, and its four products: Plus and Premium,
   each monthly and yearly. Give each the display name and description in `listing/app-store.md`, the prices the web
   charges, and a review screenshot of Plans.
4. Fill App Privacy from `privacy-forms.md`, once its Privacy policy flags are settled.

## 3. Google Play

1. Convert the Play Console developer account to an organization account with the D-U-N-S number and the company's
   documents, and finish its identity verification. An organization account skips the personal account's 12-tester,
   14-day closed test before production.
2. Set up the payments profile under the company, with its bank account and tax details. A subscription cannot be
   created without it.
3. Create the subscriptions `carlnotes_plus` and `carlnotes_premium`, each with a monthly and a yearly base plan, at the
   web's prices, with the benefits in `listing/google-play.md`.
4. Finish the store setup: the privacy policy link, app access with the review account, ads (none), the content rating
   and target audience from `listing/review.md`, Data safety from `privacy-forms.md`, and the store listing from
   `listing/` with the assets in `screenshots.md`.
5. Turn on the Play Integrity API for the app in Google Cloud, so an email sign-up's install check passes.

## 4. RevenueCat

1. Connect the production App Store app (an App Store Connect API key and the in-app purchase key) and the production
   Play app (a service account with financial access) to the RevenueCat project.
2. Import the store products, and attach them to the `plus` and `premium` entitlements, which `apps/api/storeBilling.ts`
   reads by those ids. Put all four in the current offering.
3. Copy the production public SDK keys into Doppler as `EXPO_PUBLIC_REVENUECAT_APPLE_API_KEY` and
   `EXPO_PUBLIC_REVENUECAT_GOOGLE_API_KEY`, then run `bun run mobile:env:sync` so EAS builds read them. Keep
   `REVENUECAT_SECRET_API_KEY` and `REVENUECAT_WEBHOOK_AUTHORIZATION` in the prd config, and point the webhook at
   `https://carlnotes.com/api/webhooks/revenuecat`.
4. Add App Review's user id to `REVENUECAT_SANDBOX_USER_IDS` in prd once the review account signs in on a review build.

## 5. The release build

1. Bump `version` in `app.config.ts` to 1.0.0, freeze the contract with `bun run contract:freeze`, and add the release
   to `contracts/releases.json`.
2. Build with EAS for both stores and upload: TestFlight, then Play's internal track.
3. Work `release-checklist.md` on those builds, the store purchase rows first, because they need everything above.
4. Take the screenshots in `screenshots.md` from those builds.
5. Submit for review with the notes in `listing/review.md`, filling the review account's password from Doppler by hand.
