// after a scheduled Scan succeeds, email its new Findings to the Topic's subscribers
import { and, eq } from "drizzle-orm"
import { db } from "../db"
import { audienceMembers, findings, resources, type scans, subscriptions, type topics, users } from "../db/schema"
import { renderTopicScanEmail, type TopicScanEmailFinding } from "../emails/topic-scan-email"
import { sendEmail } from "./email"
import { signUnsubscribeToken } from "./unsubscribe"

// a persisted Topic and Scan, and one recipient of the email: the subscriber's user id and address
type Topic = typeof topics.$inferSelect
type Scan = typeof scans.$inferSelect
type Recipient = { userId: string; email: string }

// email a scheduled Scan's new Findings to the Topic's matched subscribers. best-effort: anything missing sends nothing
export async function sendTopicScanEmail(topic: Topic, scan: Scan): Promise<void> {
	// only a "succeeded" Scan emails. a failed or still-running one has no settled Findings to send
	if (scan.status !== "succeeded") {
		return
	}

	// nothing new surfaced, so there is nothing to email
	const newFindings = await newFindingsForScan(scan)
	if (newFindings.length === 0) {
		return
	}

	// no matched subscriber, so there is no one to email
	const recipients = await loadTopicSubscribers(topic.id, topic.frequency)
	if (recipients.length === 0) {
		return
	}

	// the links back into the app, both undefined when no app base url is configured
	const appUrl = toAppUrl()
	const topicUrl = appUrl ? `${appUrl}/topics/${topic.id}` : undefined

	// send one email per recipient, each with its own signed unsubscribe link and one-click header
	const subject = `Notes on ${topic.name}: ${newFindings.length} finding${newFindings.length === 1 ? "" : "s"}`
	for (const recipient of recipients) {
		const unsubscribeUrl = await toUnsubscribeUrl(recipient.userId, topic.id)
		const content = await renderTopicScanEmail({
			topicName: topic.name,
			findingCount: newFindings.length,
			findings: newFindings,
			// the header, heading, and footer link back to the app and to this topic
			appUrl,
			topicUrl,
			unsubscribeUrl,
		})
		await sendEmail({ to: recipient.email, subject, content, headers: toUnsubscribeHeaders(unsubscribeUrl) })
	}
}

// the Findings a Scan first surfaced: those carrying its scan_id, joined to their Resource for the email fields.
// curation only scores Resources without a Finding yet, so a topic scan's Findings are exactly its new ones since the last succeeded Scan
export async function newFindingsForScan(scan: Scan): Promise<TopicScanEmailFinding[]> {
	// this topic scan's Findings joined to their Resource for the title, link, and relevance explanation for the email
	return db
		.select({ title: resources.title, url: resources.url, relevanceExplanation: findings.relevanceExplanation })
		.from(findings)
		.innerJoin(resources, eq(findings.resourceId, resources.id))
		.where(eq(findings.scanId, scan.id))
}

// the Topic's subscribers to email: users at the matching frequency, direct plus audience members, deduped by address
export async function loadTopicSubscribers(topicId: string, frequency: Topic["frequency"]): Promise<Recipient[]> {
	// direct user subscribers at the matching frequency
	const subscriberRows = await db
		.select({ userId: users.id, email: users.email })
		.from(subscriptions)
		.innerJoin(users, eq(subscriptions.subscriberUserId, users.id))
		.where(and(eq(subscriptions.topicId, topicId), eq(subscriptions.frequency, frequency)))

	// members of audiences subscribed at the matching frequency
	const audienceRows = await db
		.select({ userId: users.id, email: users.email })
		.from(subscriptions)
		.innerJoin(audienceMembers, eq(subscriptions.subscriberAudienceId, audienceMembers.audienceId))
		.innerJoin(users, eq(audienceMembers.userId, users.id))
		.where(and(eq(subscriptions.topicId, topicId), eq(subscriptions.frequency, frequency)))

	// collapse duplicates so a subscriber reached by both paths is emailed once
	const byEmail = new Map<string, Recipient>()
	for (const row of [...subscriberRows, ...audienceRows]) {
		byEmail.set(row.email, row)
	}
	return [...byEmail.values()]
}

// the app's base url without a trailing slash, or undefined if it isn't configured. every link in the email builds on it
function toAppUrl(): string | undefined {
	return Bun.env.BETTER_AUTH_URL?.replace(/\/$/, "")
}

// the recipient's signed one-click unsubscribe url, or undefined when the app base url isn't configured
async function toUnsubscribeUrl(userId: string, topicId: string): Promise<string | undefined> {
	// without an app base url, there is nowhere for the link to point
	const appUrl = toAppUrl()
	if (!appUrl) {
		return undefined
	}
	const unsubscribeToken = await signUnsubscribeToken({ userId, topicId })
	return `${appUrl}/api/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`
}

// the List-Unsubscribe headers that let inbox providers offer their own one-click unsubscribe link (RFC 8058)
function toUnsubscribeHeaders(unsubscribeUrl: string | undefined): Record<string, string> | undefined {
	// no url means no header
	if (!unsubscribeUrl) {
		return undefined
	}
	return { "List-Unsubscribe": `<${unsubscribeUrl}>`, "List-Unsubscribe-Post": "List-Unsubscribe=One-Click" }
}
