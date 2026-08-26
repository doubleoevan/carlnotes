import Markdown from "markdown-to-jsx"
import type * as React from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { TableCard } from "@/components/table/TableCard"
import { usePageTitle } from "@/hooks/usePageTitle"
import { PAGE_CLASS, TABLE_CLASS, TABLE_SCROLL_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

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

// map the privacy markdown to the same legal-page typography as the terms page, plus bold labels and the table
const PRIVACY_MARKDOWN_OPTIONS = {
	disableAutoLink: true,
	overrides: {
		h2: { props: { className: "font-display mt-8 mb-1 text-lg" } },
		p: { props: { className: "mt-3 text-sm leading-relaxed" } },
		ul: { props: { className: "mt-3 list-disc space-y-1.5 pl-5 text-sm leading-relaxed" } },
		li: { props: { className: "leading-relaxed" } },
		strong: { props: { className: "font-semibold" } },
		table: { component: ScrollableTable },
		th: { props: { className: "border-separator border-b px-3 py-2 align-top font-semibold" } },
		td: { props: { className: "border-separator border-b px-3 py-2 align-top leading-relaxed" } },
		a: { component: AnchorLink, props: { className: "text-link hover:underline" } },
	},
} as const

// the privacy policy body, below the title
const PRIVACY_BODY = `## Who this covers

This policy covers **carlnotes.com**, the hosted version of CarlNotes ("we", "us").

CarlNotes is also open source under the AGPL-3.0 license. If you run your own copy, **this policy does not apply to you**. You operate that instance, you choose its providers, and you are responsible for the data on it. Self-hosted instances ship with zero telemetry: they send us nothing.

Contact: [support@carlnotes.com](mailto:support@carlnotes.com)

## The short version

CarlNotes reads public web content on a schedule and scores it against context you supply. To do that we store your account, your topics, your context documents, and the findings we produce for you. We send your content to AI model providers so they can score and summarize. We do not sell your data, we do not serve ads, and we do not use your content to train our own models.

## What we collect

**Account data.** Email address, name if you provide one, and a hashed password. If you sign in with Google or GitHub instead, we receive your email address, verified status, display name, and avatar URL from the provider, and we store the provider account ID and the OAuth tokens it issues. We also store your profile image URL and the signup invite code. Session records so you stay logged in.

**Account linking.** If the verified email from a Google or GitHub sign-in matches an existing CarlNotes account, we link the two instead of creating a duplicate account. Email address is the join key, and this relies on the provider verifying the address.

**Topic configuration.** Topic names, context documents, uploaded attachments, fetched URLs, source lists, tags, frequency settings, and privacy level.

**Scan data.** Discovered URLs, extracted page content, embeddings, relevance scores, generated summaries, scan reports, and cost records.

**Feedback and state.** Thumbs up and down, consumed state, bookmarks, and subscription preferences. This is what makes your feed improve.

**Connected accounts.** If you connect an external account such as Gmail or YouTube, we store the access grant and the scopes you approved. We never store your password for those services.

**Payment data.** If paid plans are active, our payment processor handles your card. We store only the subscription status, plan, and billing identifiers. We never see or store full card numbers.

**Technical data.** IP address, browser and device type, timestamps, and error diagnostics. Used for security, abuse prevention, and debugging.

**Product analytics.** Anonymous or pseudonymous usage events such as signup, first topic created, and first scan completed. Hosted only.

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
| Google and GitHub | Sign-in | That you signed in to CarlNotes, plus the profile fields you approve sharing |
| Neon | Application database | Account, topics, findings, feedback |
| Northflank | Application hosting | Everything in transit through the app |
| Cloudflare | File storage and bot protection | Attachments, signup signals |
| Fireworks AI and other model providers | Scoring, summaries, embeddings, audio | Your context documents and fetched page content |
| Exa, Firecrawl, and source APIs | Web search and page fetching | Search queries derived from your context |
| Resend | Email delivery | Email address and scan email contents |
| Langfuse | Pipeline tracing | Prompt and response contents |
| Sentry | Error tracking | Error diagnostics, may include request context |
| PostHog | Product analytics | Usage events, pseudonymous |
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

## Cookies

We use a session cookie to keep you signed in and a security cookie for bot protection. Both are required for the service to work. Analytics cookies are used on the hosted service only and can be declined where the law requires a choice.

## Retention

- Account and topic data: kept while your account is active
- Findings and scan history: kept while the topic exists
- Deleted topics and accounts: purged within 30 days, backups within 90 days
- Error and analytics data: kept up to 12 months
- Billing records: kept as long as tax and accounting law requires

## Your choices

You can view and edit your topics at any time, export your data, delete individual topics, or delete your account outright. Deleting your account removes your topics, context documents, attachments, findings, and feedback. If you signed in with Google or GitHub, you can also revoke CarlNotes' access from that provider's own account settings, independently of deleting your CarlNotes account.

Depending on where you live, you may also have the right to access your data, correct it, delete it, port it, object to processing, or complain to a data protection authority. Email [support@carlnotes.com](mailto:support@carlnotes.com) and we will respond within 30 days. We will not treat you differently for exercising these rights.

If you are in the EEA or UK, our legal bases are: performance of a contract for running the service you signed up for, legitimate interests for security and product improvement, consent for marketing email and analytics where required, and legal obligation where applicable. Data is processed in the United States under standard contractual clauses where required.

## Security

Data is encrypted in transit and at rest. Secrets are managed through a dedicated secrets manager. Passwords are hashed. Access to production data is limited to what is needed to operate the service. No system is perfectly secure, and we cannot guarantee absolute security.

## Changes

We will post any change here and update the date above. If the change is material, we will email account holders before it takes effect.

## Contact

[support@carlnotes.com](mailto:support@carlnotes.com)`

/**
 * CarlNotes' privacy policy for the hosted service.
 */
export function PrivacyPage() {
	usePageTitle("Privacy")
	return (
		<main className={PAGE_CLASS}>
			{/* the title and the effective / last-updated dates */}
			<h1 className="font-display text-2xl">Privacy Policy</h1>
			<p className="text-muted-foreground mt-2 text-sm">Effective date: July 24, 2026 · Last updated: July 24, 2026</p>
			{/* the sections, rendered from the markdown body */}
			<Markdown options={PRIVACY_MARKDOWN_OPTIONS}>{PRIVACY_BODY}</Markdown>
		</main>
	)
}
