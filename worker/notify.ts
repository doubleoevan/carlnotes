// after a scheduled Scan succeeds, email its new Findings to the Topic's subscribers
import { toScanFailureLabel } from "@shared/scanFailure"
import { and, desc, eq, gte } from "drizzle-orm"
import { db } from "../db"
import { findings, resources, type scans, subscriptions, topicEmailSends, type topics, users } from "../db/schema"
import {
	type ManualScanEmailProps,
	renderManualScanEmail,
	renderManualScanEmailText,
	toManualScanSubject,
} from "../emails/manual-scan-email"
import {
	renderTopicScanEmail,
	renderTopicScanEmailText,
	type TopicScanEmailFinding,
	type TopicScanEmailProps,
} from "../emails/topic-scan-email"
import { type EmailKind, type EmailMessage, sendEmail, sendEmailBatches } from "./email"
import { signUnsubscribeToken } from "./unsubscribe"

// a persisted Topic and Scan, and one recipient of the email: the subscriber's user id and address
type Topic = typeof topics.$inferSelect
type Scan = typeof scans.$inferSelect
type Recipient = { userId: string; email: string }

/**
 * Persist an accepted sent email for the topic and who received it
 */
export async function createTopicEmailSend({
	topicId,
	emailKind,
	recipientUserId,
	isAccepted,
}: {
	topicId: string
	emailKind: EmailKind
	// null for an invitee the app has no account for
	recipientUserId: string | null
	isAccepted: boolean
}): Promise<void> {
	if (isAccepted) {
		await db.insert(topicEmailSends).values({ topicId, emailKind, recipientUserId })
	}
}

// email a scheduled topic Scan's outcome to the Topic's email subscribers
export async function sendTopicScanEmail(topic: Topic, scan: Scan): Promise<void> {
	// only a "succeeded" Scan emails. a failed or still-running one has no final outcome to send
	if (scan.status !== "succeeded") {
		return
	}

	// skip the subscribers an earlier attempt of this send already reached, so a retried activity never emails anyone twice
	const recipients = await loadTopicEmailSubscribers(topic.id, topic.frequency)
	const alreadySentUserIds = await loadTopicScanEmailRecipients(topic.id, scan)
	const unsentRecipients = recipients.filter((recipient) => !alreadySentUserIds.has(recipient.userId))
	if (unsentRecipients.length === 0) {
		return
	}

	// the Scan's new Findings. an empty scan still sends the email with Carl's aside instead of a list
	const newFindings = await newFindingsForScan(scan)
	const allowedSummaryUrls = await topicFindingUrls(topic.id)

	// the links back into the app for the email, both undefined when no app base url is configured
	const appUrl = toAppUrl()
	const topicUrl = appUrl ? `${appUrl}/topics/${topic.id}` : undefined

	// the props that every recipient's email renders from, minus the per-recipient unsubscribe link
	const subject =
		newFindings.length === 0
			? `Notes on ${topic.name}: nothing new`
			: `Notes on ${topic.name}: ${newFindings.length} finding${newFindings.length === 1 ? "" : "s"}`
	const sharedProps: TopicScanEmailProps = {
		topicName: topic.name,
		findingCount: newFindings.length,
		findings: newFindings,
		// the recap reads above the list. a scan that failed to summarize leaves it out instead of sending an empty block
		scanSummary: scan.scanSummary ?? undefined,
		allowedSummaryUrls,
		// the header, heading, and footer link back to the app and to this topic
		appUrl,
		topicUrl,
	}

	// render every recipient's email, then send them in one batch call instead of one POST per subscriber
	const messages = await Promise.all(
		unsentRecipients.map((recipient) => toTopicScanMessage(recipient, topic.id, subject, sharedProps)),
	)
	const accepted = await sendEmailBatches(messages)

	// record the accepted sends in one insert, which is what the retry check reads
	const acceptedRows = unsentRecipients
		.filter((_, index) => accepted[index])
		.map((recipient) => ({ topicId: topic.id, emailKind: "topic-scan" as const, recipientUserId: recipient.userId }))
	if (acceptedRows.length > 0) {
		await db.insert(topicEmailSends).values(acceptedRows)
	}
}

// render one subscriber's scan email, with their own signed unsubscribe link and one-click header
async function toTopicScanMessage(
	recipient: Recipient,
	topicId: string,
	subject: string,
	sharedProps: TopicScanEmailProps,
): Promise<EmailMessage> {
	// the HTML and its plain-text version, rendered from the same email props to be in sync
	const unsubscribeUrl = await toUnsubscribeUrl(recipient.userId, topicId)
	const emailProps = { ...sharedProps, unsubscribeUrl }
	return {
		to: recipient.email,
		subject,
		emailContent: await renderTopicScanEmail(emailProps),
		plainTextContent: await renderTopicScanEmailText(emailProps),
		emailKind: "topic-scan",
		headers: toUnsubscribeHeaders(unsubscribeUrl),
	}
}

// the user ids this topic-scan's email already reached
async function loadTopicScanEmailRecipients(topicId: string, scan: Scan): Promise<Set<string>> {
	// an invitee with no account or a closed account both leave the recipient null
	const sentRows = await db
		.select({ recipientUserId: topicEmailSends.recipientUserId })
		.from(topicEmailSends)
		.where(
			and(
				eq(topicEmailSends.topicId, topicId),
				eq(topicEmailSends.emailKind, "topic-scan"),
				gte(topicEmailSends.sentAt, scan.startedAt),
			),
		)
	return new Set(sentRows.flatMap((sentRow) => (sentRow.recipientUserId ? [sentRow.recipientUserId] : [])))
}

// email whoever started a manual Scan once it ends, whether it found something, found nothing, or failed
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
	const isAccepted = await sendEmail({
		to: user.email,
		subject: toManualScanSubject(emailProps),
		emailContent: await renderManualScanEmail(emailProps),
		plainTextContent: await renderManualScanEmailText(emailProps),
		emailKind: "manual-scan",
	})
	await createTopicEmailSend({ topicId: topic.id, emailKind: "manual-scan", recipientUserId: userId, isAccepted })
}

// every url the Topic has a Finding for to use as the email's allowlist links
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
	return findingRows.map((findingRow) => findingRow.url)
}

// the Findings this Scan surfaced, joined to their Resources for the email
async function newFindingsForScan(scan: Scan): Promise<TopicScanEmailFinding[]> {
	// this topic scan's Findings joined to their Resource for the title, link
	return db
		.select({ title: resources.title, url: resources.url, relevanceExplanation: findings.relevanceExplanation })
		.from(findings)
		.innerJoin(resources, eq(findings.resourceId, resources.id))
		.where(eq(findings.scanId, scan.id))
		.orderBy(desc(findings.relevanceScore))
}

// the Topic's subscribers to email: users at the matching frequency
async function loadTopicEmailSubscribers(topicId: string, frequency: Topic["frequency"]): Promise<Recipient[]> {
	// only an active subscription with email on gets mail, unsubscribing deactivates the row instead of deleting it
	const canEmailSubscription = and(
		eq(subscriptions.topicId, topicId),
		eq(subscriptions.frequency, frequency),
		eq(subscriptions.isActive, true),
		eq(subscriptions.isEmailEnabled, true),
	)

	// one subscription row per user per topic, so no address repeats
	return db
		.select({ userId: users.id, email: users.email })
		.from(subscriptions)
		.innerJoin(users, eq(subscriptions.subscriberUserId, users.id))
		.where(canEmailSubscription)
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
