import { cn } from "@carlnotes/nightshift/classNames"
import Markdown from "markdown-to-jsx"
import type * as React from "react"
import { TableCard } from "@/components/table/TableCard"
import { usePageTitle } from "@/hooks/usePageTitle"
import { PAGE_CLASS, TABLE_CLASS, TABLE_SCROLL_CLASS } from "@/lib/styleClasses"
import { LEGAL_MARKDOWN_OPTIONS } from "./legalMarkdownOptions"

// the providers table on the shared table card, scrolling instead of cramping on a narrow screen
function ScrollableTable({ children }: { children?: React.ReactNode }) {
	return (
		<TableCard className="mt-4">
			<div className={TABLE_SCROLL_CLASS}>
				<table className={cn(TABLE_CLASS, "min-w-[34rem] [&_tbody_tr:last-child_td]:border-b-0")}>{children}</table>
			</div>
		</TableCard>
	)
}

// map the privacy markdown to the shared legal-page typography, plus bold labels and the table
const PRIVACY_MARKDOWN_OPTIONS = {
	...LEGAL_MARKDOWN_OPTIONS,
	overrides: {
		...LEGAL_MARKDOWN_OPTIONS.overrides,
		strong: { props: { className: "font-semibold" } },
		table: { component: ScrollableTable },
		th: { props: { className: "border-separator border-b px-3 py-2 align-top font-semibold" } },
		td: { props: { className: "border-separator border-b px-3 py-2 align-top leading-relaxed" } },
	},
} as const

// the privacy policy body, below the title
const PRIVACY_BODY = `## Who this covers

This policy covers the hosted CarlNotes service at **carlnotes.com** and the **CarlNotes iOS and Android apps** when they connect to that service ("we", "us").

CarlNotes is also open source under the AGPL-3.0 license. If you run your own copy, **this policy does not apply to you**. You operate that instance, you choose its providers, and you are responsible for the data on it. Self-hosted instances ship with zero telemetry: they send us nothing.

Contact: [support@carlnotes.com](mailto:support@carlnotes.com)

To close your account, see [Delete your CarlNotes account](/privacy#delete-your-carlnotes-account). You can request deletion without installing or opening the app.

## The short version

CarlNotes reads public web content on a schedule and scores it against context you supply. To do that we store your account, your topics, your context documents, and the findings we produce for you. We send your content to AI model providers so they can score and summarize. We do not sell your data, we do not serve ads, and we do not use your content to train our own models.

## What we collect

**Account data.** Email address, name if you provide one, and a hashed password if you use email and password. If you sign in with Apple, Google, or GitHub, we receive the provider account ID and the profile fields that provider makes available, such as your email address, verification status, name, and avatar URL. We process the sign-in credentials the provider issues and store tokens where needed to maintain or revoke the connection. We never receive your password for those providers. Apple may give us a private relay email address instead of your personal address, and may provide your name only when you first authorize CarlNotes. We also store your profile image URL, signup invite code, and session records so you stay logged in.

**Account linking.** When a verified email from Apple, Google, or GitHub matches the verified email on an existing CarlNotes account, we can link the sign-in to that account instead of creating a duplicate. An Apple private relay address may differ from the address you used with another provider, so those sign-ins may remain separate.

**Topic configuration.** Topic names, context documents, uploaded attachments, fetched URLs, source lists, tags, frequency settings, and privacy level.

**Scan data.** Discovered URLs, extracted page content, embeddings, relevance scores, generated summaries, scan reports, and cost records.

**Feedback and state.** Thumbs up and down, consumed state, bookmarks, and subscription preferences. This is what makes your feed improve.

**Connected accounts.** If you connect an external account such as Gmail or YouTube, we store the access grant and the scopes you approved. We never store your password for those services.

**Payment data.** On the web, Stripe handles your card. In the mobile app, Apple or Google handles your purchase, and RevenueCat, our subscription service, tells us which plan your store account holds. RevenueCat knows your account only by a random id we create for it, and closing your account deletes its record. We store only the subscription status, plan, billing provider, and billing identifiers, and our analytics record the store country of an in-app purchase. We never see or store full card numbers.

**Technical data.** IP address, browser and device type, timestamps, and error diagnostics. Used for security, abuse prevention, and debugging. When mobile error reporting is configured, the app sends crash and error reports to Sentry. Reports can include stack traces, app and device information, identifiers, and diagnostic or request context.

**Product analytics.** Server usage events are keyed to your account id, rather than your name or email, such as signup, a topic created, a scan completed, an episode played, or a team joined, with your plan and device type. Browser visit events include page views, plays, and the links and buttons you click to open a finding, sign up, share, or subscribe, naming a public topic at most. We also record what known crawlers, link previewers, podcast apps, and AI agents fetch, keyed to the bot's or app's name. Hosted only.

When mobile analytics is configured, the app sends PostHog screen names, app lifecycle events, and selected interactions such as playing a tutorial. Screen names can include a Topic identifier. These events can include app and device properties, SDK-generated identifiers, and approximate location inferred from your IP address. The mobile SDK can store identifiers and queue events on your device before sending them. Automatic touch capture is disabled. We do not intentionally include text you type or private Topic contents in product analytics events.

**App updates.** Mobile builds configured for Expo EAS Update contact Expo to check for and download app updates. Expo receives connection and update information, such as your IP address, app platform, and app/runtime version, to deliver a compatible update.

**Embedded videos.** When you choose to load a YouTube video in the mobile app, its player connects to YouTube. Google can receive your IP address, device information, and playback activity, and its player can use its own cookies or identifiers under the [Google Privacy Policy](https://policies.google.com/privacy).

**Viewer and listener counts.** To show how many people view a topic or listen to a podcast episode, we add your account id, or a one-way keyed hash of your IP address and browser if you are signed out, to an approximate counter. The counter keeps no record of who you are, cannot be turned back into your address, and sets nothing on your device.

## What we do not collect

We do not buy data about you from brokers. We do not track you across other websites. We do not run advertising or ad pixels. We do not attempt to access content behind a paywall unless you explicitly connect your own subscription credentials.

## How we use it

- Run scans and build your feed
- Score findings against your context and improve ranking from your feedback
- Send the scan emails and notifications you enable
- Enforce plan limits and scan budgets
- Detect abuse, spam, and automated signups
- Fix bugs and understand which features get used
- Meet legal obligations

We do not use your content to train our own models.

## Who we share it with

We use third-party providers to run the service. Each one receives only what its job requires.

| Provider | Purpose | What it sees |
| --- | --- | --- |
| Apple, Google, and GitHub | Sign-in | That you signed in to CarlNotes, plus the profile fields you approve sharing |
| Apple (App Attest) and Google (Play Integrity) | Installation checks for mobile email signup | App and device information used to issue integrity evidence; CarlNotes receives the evidence and verification results |
| Expo (EAS Update) | Mobile app updates | Connection and update information, including IP address, platform, and app/runtime version |
| YouTube (Google) | Videos you choose to load | IP address, device information, playback activity, and the player's cookies or identifiers |
| Neon | Application database | Account, topics, findings, feedback, encrypted Personal sources items and derived personal sources context |
| Northflank | Application hosting | Everything in transit through the app |
| Cloudflare | File storage and bot protection | Attachments, signup signals |
| Fireworks AI and other model providers | Scoring, summaries, embeddings, podcast scripts | Your context documents, fetched page content, and bounded personal sources text for summarization and private relevance scoring |
| Google Gemini | Podcast audio, spoken questions, and replies read aloud | The script of each podcast episode, which is written from a topic's findings. The recording of each spoken question, which Google transcribes with storage turned off and we never keep. The text of Carl's replies that are read aloud: replies to spoken questions, and any reply you tap play on. Google does not use any of this to train or improve its models. It may log it for a limited time, which its abuse monitoring policy sets at 55 days, only to detect abuse and make legally required disclosures |
| OpenAI | Moderation of images other people see | Each avatar you upload and each image you share to a team room. OpenAI does not train its models on data sent through its API |
| Exa, Firecrawl, and source APIs | Web search and page fetching | Search queries derived from ordinary Topic context, and public links selected for fetching. Private personal sources text is excluded from search queries |
| Resend | Email delivery and receiving | Email addresses and outbound email contents, plus messages delivered to the address Carl sends digests from |
| Expo, with Apple Push Notification service and Firebase Cloud Messaging | Mobile push notifications you turn on | Your device's push token, and each notification's title, text, and link. A notification names a topic or chat room, a finding's title, or who mentioned you, and never includes a chat message's text |
| Langfuse | Pipeline tracing | Ordinary pipeline prompt and response contents. Private personal sources model calls disable content tracing |
| Sentry | Error tracking | Error and crash diagnostics, app and device information, identifiers, and diagnostic or request context |
| PostHog | Product analytics | Server usage events keyed to your account, browser visit events, bot fetches, and mobile events with SDK identifiers, app and device properties, screen names, and approximate location inferred from IP |
| Stripe | Payments on the web | Billing details for a plan bought on the web |
| Apple (App Store) and Google (Google Play) | Subscriptions bought in the mobile app | Your purchase, its payment, and your store account's subscription status |
| RevenueCat | Subscription status for plans bought in the mobile app | A random id for your account, the store's purchase receipts and subscription events, your store country, and app and device information |

We select providers that do not train models on data submitted through their APIs. Their own terms govern their handling of that data.

We also share when the law requires it, to protect the service or its users from harm, or as part of a business transfer such as an acquisition. If ownership changes, we will tell you before your data moves.

**We do not sell your personal information and we do not share it for cross-context behavioral advertising.**

## Public and shared topics

Topics are private by default.

Publishing makes the Topic name, description, Topic context, fetched sources, and public findings visible to anyone. Review the Topic context and attachments before publishing. Personal sources stay private to each sender.

A source connected directly to an authenticated account can inform scoring and search on a private Topic. CarlNotes disables those connections before the Topic becomes invite-only or public. Personal sources are separate. A chat or email you explicitly send can help select findings on any Topic you can edit. Readers see the public explanation drawn from the linked page.

When you invite someone to a topic, they see only findings from scans that run after they accept the invitation, never the topic's earlier history.

A CarlNotes administrator can open ordinary topics, including private ones, along with their context documents, attachments, and findings for support and debugging. Personal sources items, their summaries, and private Finding annotations are visible only to the sender. Topic ownership and administrative access do not grant access to another sender's private layer. The shared Finding explanation uses linked-page evidence alone.

## AI processing

Your context documents and the content of pages we fetch are sent to AI model providers for scoring and summarization. This is the core function of the product and cannot be turned off while the service is running scans.

Scores and summaries are machine generated and can be wrong.

## Connections to AI apps (MCP)

You can connect Claude, ChatGPT, or another AI app to CarlNotes through the Model Context Protocol (MCP). The connected app sends tool arguments, such as a search query, a topic ID, or the changes you ask it to make. CarlNotes uses those arguments to carry out the request and returns public or account-authorized topics, findings, search results, and action outcomes, sometimes with interactive CarlNotes controls. Saved changes become part of the account or topic data described in this policy. The connected app receives those results and handles them under its own privacy policy.

**Assistant data.** CarlNotes never reads the assistant's chat history, memory, or uploaded files through this connection. MCP gives CarlNotes no access to them. The app can deliberately include text from your conversation or a file in a tool argument; CarlNotes receives that supplied text as part of the request.

**Sign-in and tokens.** Public reads can work without signing in. After you sign in to CarlNotes and approve an app's access, CarlNotes issues OAuth access and refresh tokens. The app uses these credentials to act with your account's existing permissions. We store the authorization records and hashed refresh tokens needed to maintain and revoke that access.

**Disconnecting and revoking access.** In Account, Connected AI apps lists live connections and disconnected Source history, grouped by validated registration domain. Disconnect revokes your grants for that app group. New personal sources sends stop immediately and those refresh grants cannot issue new access tokens. Other users' grants remain unchanged. An OAuth client can also revoke its refresh token at the discovered revocation endpoint. Removing a connection only inside the AI app may remove local credentials without server-side revocation. Already-issued read tokens can remain usable until expiry, including after sign-out. For help, contact [support@carlnotes.com](mailto:support@carlnotes.com). [Deleting your account](/privacy#delete-your-carlnotes-account) prevents subsequent MCP account access. Disconnecting does not delete accepted Personal sources items or information the AI app already received.

**Tool-call analytics.** PostHog records the connected app's name, tool name, caller kind (visitor or signed-in user), MCP entry point, timestamp, and outcome (successful, rejected, or failed). This event is keyed to the app name, with person-profile processing disabled. It contains no tool arguments, returned content, or token values. An account action can separately produce the account usage events described elsewhere in this policy. MCP tool-call analytics follow the same retention limit as other analytics: up to 12 months.

See [Add CarlNotes to your AI app](/docs/account/add-to-ai/) for connection instructions and the available tools.

## Personal sources data

**What you provide.** AI Agent Sources receive the title, summary, public links, and optional private conversation reference you explicitly send. Web imports preview supported ChatGPT or Claude exports locally and upload only selected conversations, or a transcript you confirm. Email Sources receive messages you send to the same address Carl sends digests from. Carl saves clear matches to Topics you can edit and replies with linked destinations. If clarification is needed, we retain only the provider/thread reference and encrypted Topic choices, not a copy of the email body. Same-thread replies can choose numbers or written editable Topic names. We retrieve the original from Resend after authenticating the sender and recheck Topic permissions before saving. Completed choice metadata is deleted, and account deletion removes outstanding choices. Ordinary acknowledgments are ignored and quoted email history is excluded. Accepted mail must come from an account email with provider-confirmed aligned DKIM and DMARC authentication. Each accepted email counts once across its matching Topics. Emailing Carl grants no mailbox access: CarlNotes does not request Gmail OAuth, browse mail history, or download attachments or raw messages. Resend separately receives the original message, including any attachments it contains.

**Storage and use.** Personal sources item titles, text, sender details, links, conversation references, private Finding annotations, and derived private context are encrypted in our database. We also store sender and Topic IDs, receipt and summarization times, retry fingerprints, delivery state, usage counts, and model cost records. We summarize bounded entry text through model providers and use derived context to score pages on the destination Topic. Carl processes each sender’s context separately. Each call selects evidence from the linked page for the public explanation and writes that sender’s private annotation. Podcasts, shared feeds, and public exports use only the public explanation. Private text is excluded from external search queries, shared Resource fields and vectors, and model content traces. Public links can be fetched through our normal page providers. Model providers still process the text sent to them; their processing and retention terms apply. Application trace suppression is not a promise of zero provider retention.

**Your controls.** Each sender alone can read their items, summary, and private annotations, including on shared Topics. Topic owners and administrators cannot read another sender's content. Changing Topic visibility or ownership does not expose it. You can delete individual items or your receiving Source and revoke app connections or API keys. Stop emailing Carl to stop new mail. App suggestions compare your own accepted sends with your Topic description locally; they do not read an assistant account or save a separate profile.

**Keys and retention.** Premium send-only API keys are displayed once; we store a digest, label, last four characters, and creation, use, and revocation times. They authorize only personal sources sends and stop working immediately on revocation or loss of entitlement. AI sends, emails, and imported conversations remain encrypted until you delete an item or Source, or the associated Topic or account is deleted. Deleted entries stop appearing in reads and invalidate derived context and private Finding annotations immediately; cleanup removes their stored content. Content-free email retry metadata can remain after deletion; other retry metadata can remain while the Topic exists to prevent a replay from restoring deleted text. Quota and billing records are retained separately from content. Deleting an entry does not refund usage or remove existing Findings, backups, or copies held by senders and providers. Resend retains received messages under its own terms independently of CarlNotes. The general deletion, backup, analytics, and billing periods below still apply.

See [Personal sources](/docs/topics/personal-sources/) for setup, limits, and deletion controls.

## Google user data

Our use of information received from Google APIs adheres to the Google API Services User Data Policy, including its Limited Use requirements. Data obtained from a connected Google account is used only to provide the features you enable, is not transferred to others except as necessary to provide those features, comply with the law, or as part of a business transfer, is not used for advertising, and is not read by humans except with your consent, to comply with the law, or for security and abuse prevention.

## Cookies and data on your device

On the website, we use a session cookie to keep you signed in and a security cookie for bot protection. Both are required for the service to work. Our website visit analytics set no cookie and store nothing on your device.

The mobile app stores sign-in credentials in the operating system's secure storage. If you allow notifications, it keeps your device's push token there too, and we store the token with your signed-in session until you sign out, the session ends, the app is uninstalled, or you close your account. It also saves your Feed and the most recently viewed Topic in ordinary app storage so you can read previously loaded content offline. This cache can include private Topic content. Your appearance preference is also saved on the device. Mobile analytics and error-reporting SDKs may keep their own identifiers, settings, and queued reports locally.

The app clears its saved reading cache when you successfully sign out or it detects that your session has ended. A device that is offline may retain previously downloaded content until it reconnects and detects the ended session. These local copies rely on your device's access controls and operating-system protections.

## Mobile installation checks

For email signup in supported mobile builds, CarlNotes uses Apple App Attest on iOS or Google Play Integrity on Android to check that the request comes from a genuine app installation. Apple or Google processes app and device information to issue integrity evidence. CarlNotes receives that evidence, a one-time challenge, and verification results to prevent automated signups. If a device cannot complete the check, signup can continue on the website using Cloudflare bot protection.

## Retention

- Account and topic data: kept while your account is active
- Findings and scan history: kept while the topic exists
- Personal sources sends, emails, and imported conversations: encrypted until deletion
- Deleted topics and accounts: purged within 30 days, backups within 90 days
- Error and analytics data: kept up to 12 months
- Billing records: kept as long as tax and accounting law requires

## Your choices

You can view and edit your topics at any time, export your data, delete individual topics, or [delete your CarlNotes account](/privacy#delete-your-carlnotes-account). If you signed in with Apple, Google, or GitHub, you can also revoke CarlNotes' access from that provider's own account settings. Revoking a provider connection does not by itself delete your CarlNotes account.

Depending on where you live, you may also have the right to access your data, correct it, delete it, port it, object to processing, or complain to a data protection authority. Email [support@carlnotes.com](mailto:support@carlnotes.com) and we will respond within 30 days. We will not treat you differently for exercising these rights.

If you are in the EEA or UK, our legal bases are: performance of a contract for running the service you signed up for, legitimate interests for security and product improvement, consent for marketing email and analytics where required, and legal obligation where applicable. Data is processed in the United States under standard contractual clauses where required.

## Delete your CarlNotes account

You can request deletion of your CarlNotes account and its associated data in any of these ways:

- **In the mobile app:** open **Settings**, find **Close your account**, choose **Close account**, and confirm.
- **On the website:** sign in, open [Account](/account), find **Close your account**, choose **Close account**, and confirm.
- **Without the app or a working sign-in:** email [support@carlnotes.com](mailto:support@carlnotes.com) with the subject **Delete my CarlNotes account**. Send the request from your account's registered email address if possible. If you cannot access that address, contact support so we can verify ownership before deleting the account. Do not send your password.

The same CarlNotes account is used across the website and mobile apps. Closing it revokes its sessions and removes its associated topics, context documents, attachments, findings, and feedback, subject to the retention periods above. Deleted account data is purged within 30 days and backups within 90 days. Error and analytics records may remain for up to 12 months, and billing records remain as long as tax and accounting law requires. We respond to email deletion requests within 30 days.

Uninstalling the app does not delete your CarlNotes account. Deleting the account on one device cannot immediately erase a reading cache on another device that is offline; reconnect that device so the app can detect the ended session.

## Security

Data sent to the hosted service is encrypted in transit, and hosted data is encrypted at rest. On mobile, sign-in credentials use operating-system secure storage; saved reading content and preferences use ordinary app storage, as described above. Secrets are managed through a dedicated secrets manager. Passwords are hashed. Access to production data is limited to what is needed to operate the service. No system is perfectly secure, and we cannot guarantee absolute security.

## Changes

We will post any change here and update the date above. If the change is material, we will email account holders before it takes effect.

## Contact

[support@carlnotes.com](mailto:support@carlnotes.com)`

/**
 * CarlNotes' privacy policy for the hosted service and mobile apps.
 */
export function PrivacyPage() {
	usePageTitle("Privacy")
	return (
		<main className={PAGE_CLASS}>
			{/* the title and the effective / last-updated dates */}
			<h1 className="font-display text-2xl">Privacy Policy</h1>
			<p className="text-muted-foreground mt-2 text-sm">
				Effective date: July 24, 2026 · Last updated: November 2, 2026
			</p>
			{/* the sections, rendered from the markdown body */}
			<Markdown options={PRIVACY_MARKDOWN_OPTIONS}>{PRIVACY_BODY}</Markdown>
		</main>
	)
}
