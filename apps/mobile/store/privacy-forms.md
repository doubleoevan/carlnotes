# Store privacy forms

The answers to Apple's App Privacy questions in App Store Connect and Google Play's Data safety form, in the order each
form asks them. Every answer comes from a row of `data-inventory.md`, which names the code behind it. Read the
inventory against the code again before filing, and settle the Privacy policy flags at the end first: a store form
that claims more or less than the published policy is a review rejection or a policy violation.

## Approximate location: declared

The phone reads no location. The api reads the place Cloudflare reports for a request's connection, and counts a view
or a play for that day, item, and place for the Specials charts. The count keeps the country, region, city, postal
code, metro code, and the city's coordinates, never the account, the IP address, or the device, and is deleted after
400 days.

Both stores count a place inferred from the IP address as approximate location, even when the server infers it and
keeps only aggregates, so both forms declare it:

- Apple: Coarse Location, not linked to the person, not used for tracking, purposes Analytics and App Functionality.
- Google: Approximate location, collected, not shared, not processed ephemerally because counts stay 400 days, optional
  because the app works without it, purposes Analytics and App functionality.

Declaring it costs nothing in review, and leaving it out would contradict the Privacy policy's Visitors by place
section, which discloses it.

## Apple App Privacy

Data collection: Yes, the app collects data.

Tracking: No for every type. The app has no advertising SDK, no data broker, and no cross-app identifier. The App
Tracking Transparency prompt is never shown.

| Apple data type | Linked to the person | Purposes | Inventory row |
| --- | --- | --- | --- |
| Contact Info: Name | Yes | App Functionality | Email address, name, avatar |
| Contact Info: Email Address | Yes | App Functionality | Email address, name, avatar |
| Location: Coarse Location | No | Analytics, App Functionality | Approximate place of a view or a play |
| User Content: Photos or Videos | Yes | App Functionality | Avatar photo, team avatar, chat attachments |
| User Content: Audio Data | Yes | App Functionality | Microphone recording of a spoken question |
| User Content: Other User Content | Yes | App Functionality | Topics and their attachments, chat messages, Tasting Notes, comments, hot takes, reports, chat attachment files |
| Identifiers: User ID | Yes | App Functionality, Analytics | Server usage events, keyed to the account id |
| Identifiers: Device ID | Yes | App Functionality | Expo push token, once the person allows notifications |
| Purchases: Purchase History | Yes | App Functionality | Store purchases |
| Usage Data: Product Interaction | Yes | Analytics | Server usage events, spoken question timings |
| Usage Data: Product Interaction | No | Analytics | Screen views and visit events in PostHog |
| Diagnostics: Crash Data | No | App Functionality | Crash and error reports |
| Diagnostics: Performance Data | No | App Functionality | Crash and error reports, traces sampled at 0.1 |
| Diagnostics: Other Diagnostic Data | No | Analytics | Platform, OS version, device model, app version, build number |

Product Interaction appears twice because Apple asks for each type once with both linkages: answer Yes to linked for
the server events and keep the purposes above.

Not collected: Health and Fitness, Financial Info, Precise Location, Sensitive Info, Contacts, Emails or Text Messages
outside the app's own chat, Gameplay Content, Browsing History, Search History (a search goes to the api and is not
stored or sent to analytics), Advertising Data, and Other Data.

Audio Data is declared although the api keeps no recording, because Google may log a recording for abuse monitoring for
up to 55 days, longer than the real-time servicing Apple exempts.

## Google Play Data safety

- Does your app collect or share any of the required user data types: Yes.
- Is all of the user data collected by your app encrypted in transit: Yes. Every request is TLS to the api, Sentry,
  PostHog, Expo, RevenueCat, Apple, or Google.
- Do you provide a way for users to request that their data is deleted: Yes. In the app: Account > Close your account
  > Close account. On the web: `https://carlnotes.com/account`. Without either, email support@carlnotes.com with the
  subject "Delete my CarlNotes account", answered within 30 days. The deletion url Play asks for is
  `https://carlnotes.com/privacy#delete-your-carlnotes-account`.

| Play data type | Collected | Shared | Ephemeral | Required | Purposes |
| --- | --- | --- | --- | --- | --- |
| Location: Approximate location | Yes | No | No | Optional | Analytics, App functionality |
| Personal info: Name | Yes | No | No | Optional | App functionality, Account management |
| Personal info: Email address | Yes | No | No | Required | App functionality, Account management |
| Personal info: User IDs | Yes | No | No | Required | App functionality, Analytics, Account management |
| Financial info: Purchase history | Yes | No | No | Optional | App functionality |
| Messages: Other in-app messages | Yes | No | No | Optional | App functionality |
| Photos and videos: Photos | Yes | No | No | Optional | App functionality |
| Audio: Voice or sound recordings | Yes | No | No | Optional | App functionality |
| Files and docs | Yes | No | No | Optional | App functionality |
| App activity: App interactions | Yes | Yes, PostHog | No | Required | Analytics |
| App activity: Other user-generated content | Yes | No | No | Optional | App functionality |
| App info and performance: Crash logs | Yes | Yes, Sentry | No | Required | App functionality |
| App info and performance: Diagnostics | Yes | Yes, Sentry | No | Required | App functionality, Analytics |
| Device or other IDs | Yes | No | No | Optional | App functionality |

Notes for the form's follow-up questions:

- Device or other IDs is the Expo push token, collected once the person allows notifications. Expo's push service,
  Apple Push Notification service, and Firebase Cloud Messaging deliver it as service providers, which Play does not
  count as sharing.
- A spoken question's recording goes to Google, a purchase to RevenueCat, and a file to Cloudflare R2, each as a
  service provider. The model providers read content to serve the person's own request, also as service providers.
- Audio is not ephemeral because Google may log a recording for abuse monitoring.
- Messages are the chat messages, team room messages, and mentions. Other user-generated content is topics, Tasting
  Notes, comments, hot takes, and reports.
- Fraud prevention, security, and compliance is a purpose of Device or other IDs only if Play counts the App Attest and
  Play Integrity evidence as collected. The api keeps only the result of that check, so the form leaves it out.
- Independent security review: No. Government app: No. No data is shared for advertising.

## Privacy policy flags

Each claim below is one the store forms make and `apps/web/src/pages/PrivacyPage.tsx` does not back, or one the policy
makes and the app does not do. Each needs a policy edit before the forms are filed, and the policy's last-updated date
moves with it.

1. **Chat content is not named.** The policy lists account data, topic configuration, hot takes, and payments, but no
   category for Coffee Talk messages, team room messages, Tasting Notes, comments, or chat attachments. Only the
   OpenAI row mentions an image shared to a team room. Both forms declare messages and other user content, so the
   policy needs a paragraph for them, with who reads them and how long they stay.
2. **The camera is not named.** The app asks for the camera to take a photo for a chat, a topic, or an avatar. The
   policy names neither the camera nor photos the person takes.
3. **Places keep more than the policy says.** Visitors by place names the country, region, city, and postal code. The
   daily counts also keep the metro code and the city's coordinates (`latitude`, `longitude` in
   `packages/db/schema/dailyCounts.ts`). Either name them in the policy or stop storing them.
4. **Mobile analytics claims too much.** The policy says mobile PostHog events can include SDK-generated identifiers
   and approximate location from the IP address, and that the SDK can store identifiers on the device. The app turns
   geoip off, deletes `$device_id` and `$device_name`, keeps memory-only persistence, and creates no person profile.
   The forms declare PostHog usage as not linked, so the policy should say the same. The PostHog row of the provider
   table repeats the claim.
5. **Sentry claims identifiers.** The policy says crash reports can include identifiers. `redactMobileEvent` drops the
   user and every identifier, and the forms declare crash data as not linked. Drop "identifiers" from the Technical
   data paragraph and the Sentry row, or keep it only for the web's reports if those include them.
