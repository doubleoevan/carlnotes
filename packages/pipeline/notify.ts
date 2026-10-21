// email a finished Scan's outcome. a scheduled Scan emails the Topic's subscribers in batches, and any other Scan
// emails whoever ran it or created the Topic. each accepted send is recorded with its Scan, so a retry never repeats it

import { db } from "@carlnotes/db"
import { scans } from "@carlnotes/db/schema/scans"
import { subscriptions, topicEmailSends, topics } from "@carlnotes/db/schema/topics"
import { users } from "@carlnotes/db/schema/users"
import {
	type EmailKind,
	type EmailMessage,
	isSendableAddress,
	RESEND_BATCH_LIMIT,
	type ResendCallResult,
	reportDroppedAddresses,
	sendScanEmailCall,
} from "@carlnotes/emails/email"
import {
	renderManualScanEmail,
	renderManualScanEmailText,
	toManualScanSubject,
} from "@carlnotes/emails/manual-scan-email"
import { and, eq, inArray } from "drizzle-orm"
import {
	type EmailScan,
	type EmailTopic,
	type Recipient,
	toManualScanEmailProps,
	toTopicScanEmailProps,
	toTopicScanMessage,
} from "./scanEmailContent"

// Resend's result for a Scan's email, or skipped if no one was left to send it to
export type ScanEmailOutcome = ResendCallResult | { outcome: "skipped" }

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

/**
 * Returns the user ids that a Scan's digest sends to, in batches of up to a hundred, or none if the Scan sends no digest.
 * Subscribers that the Scan's email already reached and addresses Resend would reject are left out.
 */
export async function planScanDigest(scanId: string): Promise<string[][]> {
	// only a succeeded Scan of a Topic that still exists sends a digest
	const emailScanTopic = await loadEmailScanTopic(scanId)
	if (emailScanTopic?.scan.status !== "succeeded") {
		return []
	}

	// the Topic's current email subscribers, minus the ones that an earlier attempt already reached
	const unsentRecipients = await loadUnsentRecipients({ scanId, topicId: emailScanTopic.topic.id })

	// drop and report the addresses that Resend would reject. one of them fails a whole batch
	const sendableRecipients = unsentRecipients.filter((recipient) => isSendableAddress(recipient.email))
	if (sendableRecipients.length < unsentRecipients.length) {
		reportDroppedAddresses("topic-scan", unsentRecipients.length - sendableRecipients.length)
	}

	// batch the user ids within Resend's per-call limit, one batch for each call
	const recipientUserIdBatches: string[][] = []
	for (let start = 0; start < sendableRecipients.length; start += RESEND_BATCH_LIMIT) {
		const recipientBatch = sendableRecipients.slice(start, start + RESEND_BATCH_LIMIT)
		recipientUserIdBatches.push(recipientBatch.map((recipient) => recipient.userId))
	}
	return recipientUserIdBatches
}

// one digest batch to send, with its Scan and the user ids planned for it
export type SendScanDigestBatchOptions = { scanId: string; recipientUserIds: string[] }

/**
 * Sends one digest batch to the planned recipients who still get it, and records each accepted send with its Scan.
 */
export async function sendScanDigestBatch({
	scanId,
	recipientUserIds,
}: SendScanDigestBatchOptions): Promise<ScanEmailOutcome> {
	// a Topic deleted since the plan sends nothing
	const emailScanTopic = await loadEmailScanTopic(scanId)
	if (!emailScanTopic) {
		return { outcome: "skipped" }
	}

	// recheck the planned recipients now, leaving out anyone who unsubscribed, turned email off, or was already sent to
	const { scan, topic } = emailScanTopic
	const unsentRecipients = await loadUnsentRecipients({ scanId, topicId: topic.id, recipientUserIds })
	const sendableRecipients = unsentRecipients.filter((recipient) => isSendableAddress(recipient.email))
	if (sendableRecipients.length === 0) {
		return { outcome: "skipped" }
	}

	// render every recipient's email from the same Scan, then send them in one call
	const { subject, sharedProps } = await toTopicScanEmailProps(topic, scan)
	const messages = await Promise.all(
		sendableRecipients.map((recipient) => toTopicScanMessage(recipient, topic.id, subject, sharedProps)),
	)
	const scanEmailCallResult = await sendScanEmailCall({ scanId, messages })

	// record the accepted sends at once, so that a retry never sends this batch again
	if (scanEmailCallResult.outcome === "accepted") {
		await recordScanEmailSends({
			scanId,
			topicId: topic.id,
			emailKind: "topic-scan",
			recipientUserIds: sendableRecipients.map((recipient) => recipient.userId),
		})
	}
	return scanEmailCallResult
}

// one manual-scan report to send, with its Scan and whoever ran the Scan or created the Topic
export type SendScanReportOptions = { scanId: string; recipientUserId: string }

/**
 * Emails whoever ran a manual Scan, or created the Topic, once the Scan ends, whether it found something, found nothing,
 * or failed. Skips the send if the report already reached them.
 */
export async function sendScanReport({ scanId, recipientUserId }: SendScanReportOptions): Promise<ScanEmailOutcome> {
	// a running Scan has no outcome to report yet, and a deleted Topic has nothing to report on
	const emailScanTopic = await loadEmailScanTopic(scanId)
	if (!emailScanTopic || emailScanTopic.scan.status === "running") {
		return { outcome: "skipped" }
	}

	// skip a recipient that the report already reached, and a user who no longer exists
	const [sentUserIds, [recipientUser]] = await Promise.all([
		loadScanEmailRecipientUserIds(scanId),
		db.select({ email: users.email }).from(users).where(eq(users.id, recipientUserId)),
	])
	if (sentUserIds.has(recipientUserId) || !recipientUser) {
		return { outcome: "skipped" }
	}

	// send one email, with the subject built from the same props that the body renders from
	const { scan, topic } = emailScanTopic
	const emailProps = await toManualScanEmailProps(topic, scan)
	const message: EmailMessage = {
		to: recipientUser.email,
		subject: toManualScanSubject(emailProps),
		emailContent: await renderManualScanEmail(emailProps),
		plainTextContent: await renderManualScanEmailText(emailProps),
		emailKind: "manual-scan",
	}
	const scanEmailCallResult = await sendScanEmailCall({ scanId, messages: [message] })

	// record the accepted send, so a retry never sends the report twice
	if (scanEmailCallResult.outcome === "accepted") {
		await recordScanEmailSends({
			scanId,
			topicId: topic.id,
			emailKind: "manual-scan",
			recipientUserIds: [recipientUserId],
		})
	}
	return scanEmailCallResult
}

// a Scan and its Topic as an email reads them, or null if the Scan is gone or its Topic was deleted
async function loadEmailScanTopic(scanId: string): Promise<{ scan: EmailScan; topic: EmailTopic } | null> {
	const [emailScanTopic] = await db
		.select({
			scan: { id: scans.id, status: scans.status, scanSummary: scans.scanSummary, error: scans.error },
			topic: { id: topics.id, name: topics.name },
		})
		.from(scans)
		.innerJoin(topics, eq(scans.topicId, topics.id))
		.where(eq(scans.id, scanId))
	return emailScanTopic ?? null
}

// the Scan and the Topic whose email subscribers to read, and for a batch, the user ids that were planned for it
type LoadUnsentRecipientsOptions = { scanId: string; topicId: string; recipientUserIds?: string[] }

// the Topic's current email subscribers that the Scan's email has not reached yet
async function loadUnsentRecipients({
	scanId,
	topicId,
	recipientUserIds,
}: LoadUnsentRecipientsOptions): Promise<Recipient[]> {
	// only an active subscription with email on gets mail. unsubscribing deactivates the row instead of deleting it
	const emailSubscriptionFilter = and(
		eq(subscriptions.topicId, topicId),
		eq(subscriptions.isActive, true),
		eq(subscriptions.isEmailEnabled, true),
		recipientUserIds ? inArray(subscriptions.subscriberUserId, recipientUserIds) : undefined,
	)

	// read the subscribers and the Scan's sent rows together. one subscription row per user and Topic means no address repeats
	const [subscriberRows, sentUserIds] = await Promise.all([
		db
			.select({ userId: users.id, email: users.email })
			.from(subscriptions)
			.innerJoin(users, eq(subscriptions.subscriberUserId, users.id))
			.where(emailSubscriptionFilter),
		loadScanEmailRecipientUserIds(scanId),
	])
	return subscriberRows.filter((subscriberRow) => !sentUserIds.has(subscriberRow.userId))
}

// the user ids that the Scan's email already reached
async function loadScanEmailRecipientUserIds(scanId: string): Promise<Set<string>> {
	// a closed account leaves its row's recipient null, and is no longer a recipient anyway
	const sentRows = await db
		.select({ recipientUserId: topicEmailSends.recipientUserId })
		.from(topicEmailSends)
		.where(eq(topicEmailSends.scanId, scanId))
	return new Set(sentRows.flatMap((sentRow) => (sentRow.recipientUserId ? [sentRow.recipientUserId] : [])))
}

// the accepted sends of a Scan's email to record
type RecordScanEmailSendsOptions = {
	scanId: string
	topicId: string
	emailKind: EmailKind
	recipientUserIds: string[]
}

// record the accepted sends of a Scan's email, once per recipient however many times the send is retried
async function recordScanEmailSends({
	scanId,
	topicId,
	emailKind,
	recipientUserIds,
}: RecordScanEmailSendsOptions): Promise<void> {
	await db
		.insert(topicEmailSends)
		.values(recipientUserIds.map((recipientUserId) => ({ topicId, emailKind, recipientUserId, scanId })))
		.onConflictDoNothing({ target: [topicEmailSends.scanId, topicEmailSends.recipientUserId] })
}
