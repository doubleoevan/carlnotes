// the unsubscribe link of the topic scan email and of the notifications email: the page it opens, the unsubscribe its
// button and a provider's one-click post, and the pages that confirm or reject it

import { toTopicPath } from "@carlnotes/contracts/seo"
import type { DeviceProperties } from "@carlnotes/contracts/userAgent"
import { db } from "@carlnotes/db"
import { subscriptions, topics } from "@carlnotes/db/schema/topics"
import { verifyUnsubscribeToken } from "@carlnotes/emails/unsubscribe"
import { emailColors } from "@carlnotes/nightshift/email"
import { trackEvent } from "@carlnotes/server/analytics"
import { and, eq } from "drizzle-orm"
import { API_PAGE_BASE_STYLE } from "./apiPageStyle"
import { deletePodcastFeedToken } from "./podcast/podcastFeedTokens"
import { updateTopicSubscriberCount } from "./topic/subscriberCounts"
import { saveNotificationsEmailSwitch } from "./users"

// what an unsubscribe link names: a topic's emails, or the notifications email
export type UnsubscribeEmails = { kind: "topic"; id: string; name: string } | { kind: "notifications" }

// the notifications email as an unsubscribe link names it
const NOTIFICATIONS_UNSUBSCRIBE_EMAILS: UnsubscribeEmails = { kind: "notifications" }

// what performed an unsubscribe: the page's button, or a mail provider's one-click post. the device properties go on
// the event
export type UnsubscribeOptions = { entryPoint: "page" | "one-click"; deviceProperties: DeviceProperties }

/**
 * Verifies the token and returns what it names without changing anything, or null if the token is bad.
 */
export async function readUnsubscribeEmails(unsubscribeToken: string | undefined): Promise<UnsubscribeEmails | null> {
	const unsubscribePayload = unsubscribeToken ? await verifyUnsubscribeToken(unsubscribeToken) : null
	if (!unsubscribePayload) {
		return null
	}

	// a topic by its name, or the notifications email
	return "topicId" in unsubscribePayload
		? loadUnsubscribeTopic(unsubscribePayload.topicId)
		: NOTIFICATIONS_UNSUBSCRIBE_EMAILS
}

/**
 * Verifies the token and stops what it names: it deactivates the recipient's direct subscription to a topic, or turns
 * their notifications email off. Returns what was stopped, or null if the token is bad.
 */
export async function unsubscribe(
	unsubscribeToken: string | undefined,
	{ entryPoint, deviceProperties }: UnsubscribeOptions,
): Promise<UnsubscribeEmails | null> {
	// a missing or forged token unsubscribes nothing
	const unsubscribePayload = unsubscribeToken ? await verifyUnsubscribeToken(unsubscribeToken) : null
	if (!unsubscribePayload) {
		return null
	}

	// the notifications email is one switch on the user, and their topic emails stay as they are
	if (!("topicId" in unsubscribePayload)) {
		await saveNotificationsEmailSwitch(unsubscribePayload.userId, false)
		trackEvent("email_unsubscribed", unsubscribePayload.userId, {
			entryPoint,
			emailKind: "notifications",
			...deviceProperties,
		})
		return NOTIFICATIONS_UNSUBSCRIBE_EMAILS
	}

	// deactivate the subscription and turn its emails off, keeping the row, then update the denormalized subscriber
	await db.transaction(async (transaction) => {
		await transaction
			.update(subscriptions)
			.set({ isActive: false, isEmailEnabled: false })
			.where(
				and(
					eq(subscriptions.topicId, unsubscribePayload.topicId),
					eq(subscriptions.subscriberUserId, unsubscribePayload.userId),
				),
			)
		await updateTopicSubscriberCount(unsubscribePayload.topicId, transaction)
	})

	// delete the recipient's podcast feed token for the topic
	await deletePodcastFeedToken({ topicId: unsubscribePayload.topicId, userId: unsubscribePayload.userId })

	// report the unsubscribe with what performed it and the request's device, with no plan
	trackEvent("email_unsubscribed", unsubscribePayload.userId, {
		entryPoint,
		topicId: unsubscribePayload.topicId,
		...deviceProperties,
	})
	return loadUnsubscribeTopic(unsubscribePayload.topicId)
}

// the topic's id and name for the pages, with a fallback name if the topic has since been deleted
async function loadUnsubscribeTopic(topicId: string): Promise<UnsubscribeEmails> {
	const [topic] = await db.select({ name: topics.name }).from(topics).where(eq(topics.id, topicId))
	return { kind: "topic", id: topicId, name: topic?.name ?? "that topic" }
}

// what the pages say about a subject: the emails that stop, in html, where to go instead, and that link's two labels
function toUnsubscribeWords(
	subject: UnsubscribeEmails,
	appUrl: string | undefined,
): { stoppedHtml: string; backUrl: string | undefined; keepLabel: string; doneLabel: string } {
	const baseUrl = appUrl?.replace(/\/$/, "")
	if (subject.kind === "notifications") {
		return {
			stoppedHtml: "No more daily notifications emails. You can turn them back on from your account.",
			backUrl: baseUrl ? `${baseUrl}/account` : undefined,
			keepLabel: "Keep the emails and open your account instead",
			doneLabel: "Open your account",
		}
	}

	// a topic's emails, with the way back to the topic
	return {
		stoppedHtml: `No more emails about <strong>${Bun.escapeHTML(subject.name)}</strong>.`,
		backUrl: baseUrl ? `${baseUrl}${toTopicPath(subject)}` : undefined,
		keepLabel: "Keep the emails and open the topic instead",
		doneLabel: "Drop by on your own for the latest notes",
	}
}

/**
 * Returns the page the unsubscribe link opens: what stops and one button that posts the unsubscribe, so a fetch of the link
 * changes nothing.
 */
export function confirmUnsubscribePage(subject: UnsubscribeEmails, unsubscribeToken: string, appUrl?: string): string {
	// the button posts back to this url with the token, and the link below leaves without unsubscribing
	const { stoppedHtml, backUrl, keepLabel } = toUnsubscribeWords(subject, appUrl)
	const followAgainNote = subject.kind === "topic" ? " You can follow it again from the app." : ""
	const formAction = `/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`

	// the topic, the button, and the way out
	return renderPage(`
		<h1>Unsubscribe?</h1>
		<p>${stoppedHtml}${followAgainNote}</p>
		<form method="post" action="${Bun.escapeHTML(formAction)}"><input type="hidden" name="confirm" value="unsubscribe"><button type="submit">Unsubscribe</button></form>
		${backLink(backUrl, keepLabel)}
	`)
}

/**
 * The confirmation page shown after a successful unsubscribe, coffee-toned to match the email.
 */
export function unsubscribedPage(subject: UnsubscribeEmails, appUrl?: string): string {
	// link straight to the topic or the account
	const { stoppedHtml, backUrl, doneLabel } = toUnsubscribeWords(subject, appUrl)
	return renderPage(`
		<h1>You're unsubscribed</h1>
		<p>${stoppedHtml} Carl will read quietly.</p>
		${backLink(backUrl, doneLabel)}
	`)
}

/**
 * The page shown when the unsubscribe token is missing, forged, or expired.
 */
export function invalidUnsubscribePage(appUrl?: string): string {
	return renderPage(`
		<h1>This link didn't work</h1>
		<p>The unsubscribe link is invalid or has expired. You can manage your subscriptions in the app.</p>
		${backLink(appUrl, "Open CarlNotes")}
	`)
}

// a link to the url with the given label, rendered only when the url is known
function backLink(url: string | undefined, label: string): string {
	return url ? `<p class="back"><a href="${Bun.escapeHTML(url)}">${Bun.escapeHTML(label)}</a></p>` : ""
}

// TODO: redirect to a page in the app instead
// the base style, then the page's centered card, logo, and button
const PAGE_STYLE = `${API_PAGE_BASE_STYLE}
	body { min-height:100vh; display:flex; align-items:center; justify-content:center }

	.card { background:${emailColors.card}; border:1px solid ${emailColors.muted}; border-radius:14px;
	        max-width:440px; margin:24px; padding:32px 36px; text-align:center; box-shadow:0 1px 3px rgba(0,0,0,.06) }

	.mark { color:${emailColors.link}; font-size:15px; font-weight:700; margin-bottom:20px }
	h1    { font-size:22px; margin:0 0 10px }
	p     { color:${emailColors.secondaryForeground}; font-size:15px; line-height:1.55; margin:0 0 8px }
	.back { margin-top:20px }
	button { margin-top:16px; padding:10px 22px; border:0; border-radius:8px; background:${emailColors.link};
	         color:${emailColors.card}; font-size:15px; cursor:pointer }
`

// the api's own pages can use a style block, unlike an email. the card holds the CarlNotes mark and the page content
function renderPage(cardContent: string): string {
	return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>CarlNotes</title><style>${PAGE_STYLE}</style></head><body><div class="card"><div class="mark">☕ CarlNotes</div>${cardContent}</div></body></html>`
}
