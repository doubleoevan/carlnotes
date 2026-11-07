# Development services

## Database

Generate a migration from the Drizzle schema, then apply it:

```bash
bun run db:generate   # write a migration from the packages/db/schema files (offline, no doppler)
bun run db:migrate    # apply pending migrations (packages/db/migrate.ts, the same one-shot script the deploy job runs)
bun run db:seed       # creates the dev demo user and a user per plan using a real signup, then loads idempotent stub data (rejects an attempt to run it outside of the dev config)
bun run litellm:restart # reload litellm-config.yaml. the file is bind-mounted, so a restart picks up an edit with no rebuild
```

`db:seed` signs up a real dev account (`DEV_USER_EMAIL` / `DEV_USER_PASSWORD` in `.env.example`) through Better Auth, so
log in with those credentials locally to see the seeded demo topics. It also signs up `free@carlnotes.dev`,
`plus@carlnotes.dev`, and `premium@carlnotes.dev`, none of them admins, on those plans with the same password, to check
each plan's limits and monthly budget cutoffs. Auth needs these Doppler variables locally:
`BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`,
`GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`, and `RESEND_API_KEY`/`RESEND_FROM_EMAIL` — see `.env.example` for what each
is for. Signup itself is open: no invite code, Google, GitHub, and Apple are one-click, and email/password sits behind a
"Continue with email" toggle.

## Sign in with Apple

Sign in with Apple is optional. Without `APPLE_CLIENT_ID`, `APPLE_TEAM_ID`, `APPLE_KEY_ID`, and `APPLE_PRIVATE_KEY`, the
api starts with Apple off. To turn it on:

1. Join the Apple Developer Program, and create the App ID `com.carlnotes.app` with Sign in with Apple enabled.
2. Create a Services ID per environment, and enable Sign in with Apple on it. Its domains are `carlnotes.com` for prd
   and `apple-dev.carlnotes.com` for dev, and its return URLs are `https://carlnotes.com/api/auth/callback/apple` and
   `https://apple-dev.carlnotes.com/api/auth/callback/apple`.
3. Create a key with Sign in with Apple, and download its `.p8` file once.
4. Set the Services ID, the team id, the key id, and the `.p8` file's text in Doppler dev and prd. The api signs the
   client secret from them at runtime. No secret is stored. Each one expires after 30 days, and the api signs a new one
   every week.
5. Register the Resend sending domain and the `RESEND_FROM_EMAIL` address under Sign in with Apple for Email
   Communication. Apple's private relay delivers mail to a Hide My Email address only from a registered sender.
6. For dev, install cloudflared (`brew install cloudflared`), then run `cloudflared tunnel login`,
   `cloudflared tunnel create carlnotes-dev`, and `cloudflared tunnel route dns carlnotes-dev apple-dev.carlnotes.com`
   once. Set `APPLE_DEV_REDIRECT_URL` in Doppler dev to the dev return URL above. Then run `bun run dev:tunnel` beside
   `bun run dev`, and sign in from `localhost:5173`. Apple returns to the tunnel, which forwards only that callback to the
   api on the Apple hostname, and the api sends the browser back to localhost.

## Email receiving

For development email receiving, run `cloudflared tunnel route dns carlnotes-dev resend-dev.carlnotes.com` once,
then start or restart `bun run dev:tunnel` beside the local API. Configure Resend's `email.received` webhook at
`https://resend-dev.carlnotes.com/api/webhooks/resend/inbound` and put its signing secret in
`RESEND_INBOUND_WEBHOOK_SECRET` in Doppler `carlnotes/dev`. Only that exact path on the Resend hostname reaches
`http://localhost:3000`; other paths return 404. The receiving domain's MX records remain separate from this webhook
hostname. `RESEND_API_KEY` must have Resend's **Full access** permission to retrieve received messages; a
**Sending access** key returns `401 restricted_api_key`. Restart the API and Temporal worker after changing the key.
Use the mailbox in `RESEND_FROM_EMAIL` for both topic scan email sending and Personal sources receiving. Configure
receiving on that mailbox’s domain before enabling email. The setup payload, Copy controls, and Carl’s Reply-To use that
same mailbox. Link-bearing replies are handled like forwards; linkless replies are ignored, excluding quoted history.
The API and worker validate it at startup; receiving, Copy controls, reply text, and Reply-To all use it. A separate
development domain needs only this setting and matching Resend/domain configuration. Follow [the Personal sources
rollout guide](personal-sources-rollout.md) for the controlled forwarding checks.

## Push notifications

Push notifications are optional. The worker sends them through Expo's push service with `EXPO_PUSH_ACCESS_TOKEN` from
Doppler, named apart from `EXPO_ACCESS_TOKEN`, which the EAS CLI reads as its login. Without the token, sends go out
unauthenticated, which the push service accepts until enhanced push security is turned on in the Expo dashboard. Set
the token in Doppler dev and prd first, then turn the setting on, or every send fails.

## Backfills

Backfills (owner-run) are one-time data migrations that pair with a schema change. Each is idempotent, so a second run
changes nothing. Each runs under `doppler` against the configured database:

```bash
doppler run -- bun scripts/backfill-resource-content.ts   # upload existing resources.content to object storage, set content_key/content_bytes
doppler run -- bun scripts/backfill-vectors.ts            # save every topic's and published podcast episode's vector
```

## Moderation and monitoring

Image moderation is optional. Set `OPENAI_API_KEY` to turn it on. Error monitoring and product analytics are optional
the same way. If `SENTRY_DSN` or `POSTHOG_API_KEY` is not set, that service is off, and the app behaves the same. A
visitor's search on the MCP server is optional too. `bun run carl-up` creates a budgeted `LITELLM_PUBLIC_KEY` for it.
Without one, the search returns a message that it needs an account, and every other tool still works.

## Speech and podcast recording

The podcast and talking to Carl need a `GEMINI_API_KEY` on the LiteLLM service and ffmpeg (`brew install ffmpeg`).
ffmpeg joins an episode's chapters, transcodes a spoken question, and encodes Carl's spoken answer to MP3. These
settings change the defaults:

- `PODCAST_SPEECH_MODEL` names the speech model (default `gemini-3.8-flash-tts`).
- `CHAT_TRANSCRIPTION_MODEL` names the transcription model (default `gemini-3.5-transcribe`). LiteLLM's Gemini
  pass-through calls it by Google's name, with no alias.
- `PODCAST_RECORDING_CONCURRENCY` sets how many recording activities one worker runs at once (default 16).
- `PODCAST_HOST_VOICE` and `PODCAST_COHOST_VOICE` name the two voices.

To run without the podcast, set `PODCAST_SPEECH_MODEL` empty. No episode is recorded and the topic page shows no player.
Voice needs both models, so an empty `CHAT_TRANSCRIPTION_MODEL` or an empty `PODCAST_SPEECH_MODEL` turns it off: the
chat shows no mic and no play button.

## Billing

Billing (Stripe) is optional locally. Subscriptions map to the free, plus, and premium plans, and a Stripe webhook
derives the active plan. It needs `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, the per-plan `STRIPE_PRICE_*` ids, and
a metered `STRIPE_PRICE_MANUAL_SCAN_OVERAGE` (see `.env.example`). Without them, checkout and the Customer Portal cannot
reach Stripe. A metered overage report logs its failure and lets the scan run, and the admin console shows no Stripe
net revenue. The gate, plans, and quotas all work without Stripe.
