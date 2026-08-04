// after a scheduled Scan succeeds, email its new Findings to the Topic's subscribers. a manual Scan instead
// emails whoever started it, however it ended, since a manual scan runs for minutes
import { toScanFailureLabel } from "@shared/scanFailure"
import { and, desc, eq } from "drizzle-orm"
import { db } from "../db"
import { audienceMembers, findings, resources, type scans, subscriptions, type topics, users } from "../db/schema"
import { type ManualScanEmailProps, renderManualScanEmail, toManualScanSubject } from "../emails/manual-scan-email"
import { renderTopicScanEmail, type TopicScanEmailFinding } from "../emails/topic-scan-email"
import { sendEmail } from "./email"
import { signUnsubscribeToken } from "./unsubscribe"

// a persisted Topic and Scan, and one recipient of the email: the subscriber's user id and address
type Topic = typeof topics.$inferSelect
type Scan = typeof scans.$inferSelect
type Recipient = { userId: string; email: string }

// email a scheduled topic Scan's outcome to the Topic's email subscribers
export async function sendTopicScanEmail(topic: Topic, scan: Scan): Promise<void> {
	// only a "succeeded" Scan emails. a failed or still-running one has no settled outcome to send
	if (scan.status !== "succeeded") {
		return
	}

	// return if there is no one to email
	const recipients = await loadTopicEmailSubscribers(topic.id, topic.frequency)
	if (recipients.length === 0) {
		return
	}

	// the Scan's new Findings. an empty scan still sends the email with Carl's aside instead of a list
	const newFindings = await newFindingsForScan(scan)
	const allowedSummaryUrls = await topicFindingUrls(topic.id)

	// the links back into the app for the email, both undefined when no app base url is configured
	const appUrl = toAppUrl()
	const topicUrl = appUrl ? `${appUrl}/topics/${topic.id}` : undefined

	// send one email per recipient, each with its own signed unsubscribe link and one-click header
	const subject =
		newFindings.length === 0
			? `Notes on ${topic.name}: nothing new`
			: `Notes on ${topic.name}: ${newFindings.length} finding${newFindings.length === 1 ? "" : "s"}`
	for (const recipient of recipients) {
		const unsubscribeUrl = await toUnsubscribeUrl(recipient.userId, topic.id)
		const emailContent = await renderTopicScanEmail({
			topicName: topic.name,
			findingCount: newFindings.length,
			findings: newFindings,
			// the recap reads above the list. a scan that failed to summarize leaves it out instead of sending an empty block
			scanSummary: scan.scanSummary ?? undefined,
			allowedSummaryUrls,
			// the header, heading, and footer link back to the app and to this topic
			appUrl,
			topicUrl,
			unsubscribeUrl,
		})
		await sendEmail({
			to: recipient.email,
			subject,
			emailContent,
			emailKind: "topic-scan",
			headers: toUnsubscribeHeaders(unsubscribeUrl),
		})
	}
}

// email whoever started a manual Scan once it ends, whether it found something, found nothing, or failed.
// the recipient is the person who fired it, not the Topic's subscribers, since an admin may scan another user's Topic
export async function sendManualScanEmail(userId: string, topic: Topic, scan: Scan): Promise<void> {
	// a running Scan has no outcome to report yet, and a missing user has no address
	if (scan.status === "running") {
		return
	}
	const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId))
	if (!user) {
		return
	}

	// the links back into the app for the email, both undefined when no app base url is configured
	const appUrl = toAppUrl()
	const topicUrl = appUrl ? `${appUrl}/topics/${topic.id}` : undefined

	// a failed Scan reports why it stopped. a succeeded one reports its new Findings and Carl's recap of them
	const emailProps: ManualScanEmailProps =
		scan.status === "failed"
			? { status: "failed", topicName: topic.name, failureReason: toScanFailureLabel(scan.error), appUrl, topicUrl }
			: {
					status: "succeeded",
					topicName: topic.name,
					findings: await newFindingsForScan(scan),
					scanSummary: scan.scanSummary ?? undefined,
					allowedSummaryUrls: await topicFindingUrls(topic.id),
					appUrl,
					topicUrl,
				}

	// send one email, with the subject built from the same props the body renders from
	const emailContent = await renderManualScanEmail(emailProps)
	await sendEmail({
		to: user.email,
		subject: toManualScanSubject(emailProps),
		emailContent,
		emailKind: "manual-scan",
	})
}

// every url the Topic has a Finding for to use as the email's allowlist links.
// the recap is written before the max results trim runs, so it can cite a finding that gets cut afterward.
// only a url in the Topic's findings becomes a link. anything else the model wrote stays plain text
async function topicFindingUrls(topicId: string | null): Promise<string[]> {
	if (!topicId) {
		return []
	}

	// the Topic's Findings joined to their Resource for the urls the recap can link
	const findingRows = await db
		.select({ url: resources.url })
		.from(findings)
		.innerJoin(resources, eq(findings.resourceId, resources.id))
		.where(eq(findings.topicId, topicId))
	return findingRows.map((row) => row.url)
}

// the Findings this Scan surfaced, joined to their Resources for the email. review only scores Resources with no Finding yet, so these are exactly the new ones
async function newFindingsForScan(scan: Scan): Promise<TopicScanEmailFinding[]> {
	// this topic scan's Findings joined to their Resource for the title, link, and relevance explanation for the email.
	// ranked by relevance, the same ordering the as app's own default sort.
	return db
		.select({ title: resources.title, url: resources.url, relevanceExplanation: findings.relevanceExplanation })
		.from(findings)
		.innerJoin(resources, eq(findings.resourceId, resources.id))
		.where(eq(findings.scanId, scan.id))
		.orderBy(desc(findings.relevanceScore))
}

// the Topic's subscribers to email: users at the matching frequency, direct plus audience members, deduped by address
async function loadTopicEmailSubscribers(topicId: string, frequency: Topic["frequency"]): Promise<Recipient[]> {
	// only an active subscription with email on gets mail, unsubscribing deactivates the row instead of deleting it
	const canEmailSubscription = and(
		eq(subscriptions.topicId, topicId),
		eq(subscriptions.frequency, frequency),
		eq(subscriptions.isActive, true),
		eq(subscriptions.isEmailEnabled, true),
	)

	// direct user email subscribers
	const subscriberRows = await db
		.select({ userId: users.id, email: users.email })
		.from(subscriptions)
		.innerJoin(users, eq(subscriptions.subscriberUserId, users.id))
		.where(canEmailSubscription)

	// audience member email subscribers
	const audienceRows = await db
		.select({ userId: users.id, email: users.email })
		.from(subscriptions)
		.innerJoin(audienceMembers, eq(subscriptions.subscriberAudienceId, audienceMembers.audienceId))
		.innerJoin(users, eq(audienceMembers.userId, users.id))
		.where(canEmailSubscription)

	// collapse duplicate emails so a subscriber reached by both paths is emailed once
	const subscriberByEmail = new Map<string, Recipient>()
	for (const row of [...subscriberRows, ...audienceRows]) {
		subscriberByEmail.set(row.email, row)
	}
	return [...subscriberByEmail.values()]
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
