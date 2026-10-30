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

**Payment data.** If paid plans are active, our payment processor handles your card. We store only the subscription status, plan, and billing identifiers. We never see or store full card numbers.

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
| Neon | Application database | Account, topics, findings, feedback |
| Northflank | Application hosting | Everything in transit through the app |
| Cloudflare | File storage and bot protection | Attachments, signup signals |
| Fireworks AI and other model providers | Scoring, summaries, embeddings, podcast scripts | Your context documents and fetched page content |
| Google Gemini | Podcast audio, spoken questions, and replies read aloud | The script of each podcast episode, which is written from a topic's findings. The recording of each spoken question, which Google transcribes with storage turned off and we never keep. The text of Carl's replies that are read aloud: replies to spoken questions, and any reply you tap play on. Google does not use any of this to train or improve its models. It may log it for a limited time, which its abuse monitoring policy sets at 55 days, only to detect abuse and make legally required disclosures |
| OpenAI | Moderation of images other people see | Each avatar you upload and each image you share to a team room. OpenAI does not train its models on data sent through its API |
| Exa, Firecrawl, and source APIs | Web search and page fetching | Search queries derived from your context |
| Resend | Email delivery | Email address and scan email contents |
| Langfuse | Pipeline tracing | Prompt and response contents |
| Sentry | Error tracking | Error and crash diagnostics, app and device information, identifiers, and diagnostic or request context |
| PostHog | Product analytics | Server usage events keyed to your account, browser visit events, bot fetches, and mobile events with SDK identifiers, app and device properties, screen names, and approximate location inferred from IP |
| Stripe | Payments | Billing details, when paid plans are live |

We select providers that do not train models on data submitted through their APIs. Their own terms govern their handling of that data.

We also share when the law requires it, to protect the service or its users from harm, or as part of a business transfer such as an acquisition. If ownership changes, we will tell you before your data moves.

**We do not sell your personal information and we do not share it for cross-context behavioral advertising.**

## Public and shared topics

Topics are private by default.

If you publish a topic, its name, description, context summary, sources, and findings become visible to anyone. Do not publish a topic whose context document contains anything you would not post publicly.

Content from a connected authenticated source such as a connected email account is never surfaced as a finding and never appears in any shared or public feed. It is used only to inform how findings are scored and searched on your own private topics. Because of this, a topic that uses a connected source can only be private: if you make such a topic invite-only or public, its connected sources are automatically disabled first, so private content can never influence a feed that anyone else can see.

When you invite someone to a topic, they see only findings from scans that run after they accept the invitation, never the topic's earlier history.

A CarlNotes administrator can open any topic, including a private one, along with its context document, attachments, and findings. This exists so we can answer a support question or debug a problem.

## AI processing

Your context documents and the content of pages we fetch are sent to AI model providers for scoring and summarization. This is the core function of the product and cannot be turned off while the service is running scans.

Scores and summaries are machine generated and can be wrong.

## Google user data

Our use of information received from Google APIs adheres to the Google API Services User Data Policy, including its Limited Use requirements. Data obtained from a connected Google account is used only to provide the features you enable, is not transferred to others except as necessary to provide those features, comply with the law, or as part of a business transfer, is not used for advertising, and is not read by humans except with your consent, to comply with the law, or for security and abuse prevention.

## Cookies and data on your device

On the website, we use a session cookie to keep you signed in and a security cookie for bot protection. Both are required for the service to work. Our website visit analytics set no cookie and store nothing on your device.

The mobile app stores sign-in credentials in the operating system's secure storage. It also saves your Feed and the most recently viewed Topic in ordinary app storage so you can read previously loaded content offline. This cache can include private Topic content. Your appearance preference is also saved on the device. Mobile analytics and error-reporting SDKs may keep their own identifiers, settings, and queued reports locally.

The app clears its saved reading cache when you successfully sign out or it detects that your session has ended. A device that is offline may retain previously downloaded content until it reconnects and detects the ended session. These local copies rely on your device's access controls and operating-system protections.

## Mobile installation checks

For email signup in supported mobile builds, CarlNotes uses Apple App Attest on iOS or Google Play Integrity on Android to check that the request comes from a genuine app installation. Apple or Google processes app and device information to issue integrity evidence. CarlNotes receives that evidence, a one-time challenge, and verification results to prevent automated signups. If a device cannot complete the check, signup can continue on the website using Cloudflare bot protection.

## Retention

- Account and topic data: kept while your account is active
- Findings and scan history: kept while the topic exists
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
				Effective date: July 24, 2026 · Last updated: October 29, 2026
			</p>
			{/* the sections, rendered from the markdown body */}
			<Markdown options={PRIVACY_MARKDOWN_OPTIONS}>{PRIVACY_BODY}</Markdown>
		</main>
	)
}
