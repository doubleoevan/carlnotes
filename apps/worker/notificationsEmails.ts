// the sweep's notifications email: one email a day to each user that other people reacted to, commented on, or
// mentioned, with nothing sent on a quiet day
import { toSocialTargetPath } from "@carlnotes/contracts/seo"
import { REACTION_TYPE_LABELS } from "@carlnotes/contracts/social"
import { DAY_MS } from "@carlnotes/contracts/time"
import { db } from "@carlnotes/db"
import { isAllowed } from "@carlnotes/db/authorization"
import { isTopicFindingVisible } from "@carlnotes/db/findingPermissions"
import { runWithJobLease } from "@carlnotes/db/jobLease"
import { loadUserAccess, toUtcDay } from "@carlnotes/db/quotas"
import { notificationsEmailSends } from "@carlnotes/db/schema/notificationsEmailSends"
import { users } from "@carlnotes/db/schema/users"
import { isAfterSubscriberActivation, topicSubscriptionStartDate } from "@carlnotes/db/topicPermissions"
import { type EmailMessage, sendEmail } from "@carlnotes/emails/email"
import {
	type NotificationsEmailItem,
	type NotificationsEmailProps,
	renderNotificationsEmail,
	renderNotificationsEmailText,
	toNotificationsEmailSubject,
} from "@carlnotes/emails/notifications-email"
import { toUnsubscribeHeaders, toUnsubscribeUrl } from "@carlnotes/emails/unsubscribe"
import { appUrl } from "@carlnotes/server/appUrl"
import { reportError } from "@carlnotes/server/monitoring"
import { and, eq, max } from "drizzle-orm"
import { loadNotificationsEmailRows, type NotificationsEmailRow } from "./notificationsEmailRows"

// the job's name, so two sweeps never send the day's emails at once, and the UTC hour the day's emails go out after.
// users have no timezone, so one hour serves everyone
const NOTIFICATIONS_EMAILS_JOB = "notifications-emails"
const NOTIFICATIONS_EMAIL_UTC_HOUR = 15

// how far back one email reads at most, and how far a first email reads
const MAX_ACTIVITY_MS = 7 * DAY_MS
const FIRST_ACTIVITY_MS = DAY_MS

/**
 * Sends the day's notifications emails once the send hour has passed, under the job's lease. Returns how many were
 * sent, 0 before the hour, and null if another sweep holds the lease.
 */
export async function sendNotificationsEmails(now = new Date()): Promise<number | null> {
	if (now.getUTCHours() < NOTIFICATIONS_EMAIL_UTC_HOUR) {
		return 0
	}
	return runWithJobLease({ jobName: NOTIFICATIONS_EMAILS_JOB, runTask: () => sendDayNotificationsEmails(now) })
}

/**
 * Sends one notifications email to each user who has something to read since their last one and none sent today.
 * Returns how many were sent.
 */
export async function sendDayNotificationsEmails(now: Date): Promise<number> {
	// the users who may get an email today, whose activity alone is worth a read
	const sentDay = toUtcDay(now)
	const recipients = await loadRecipients(sentDay)
	if (recipients.length === 0) {
		return 0
	}

	// what happened to them inside the longest time one email covers
	const activityRows = await loadNotificationsEmailRows(
		new Date(now.getTime() - MAX_ACTIVITY_MS),
		recipients.map((recipient) => recipient.userId),
	)
	const activityRowsByRecipientId = Map.groupBy(activityRows, (activityRow) => activityRow.recipientUserId)

	// send each recipient their own items, one recipient at a time, so one failed send stops nothing else
	let sentCount = 0
	for (const recipient of recipients) {
		const activityStartAt = recipient.lastActivityEndAt ?? new Date(now.getTime() - FIRST_ACTIVITY_MS)
		const recipientActivityRows = (activityRowsByRecipientId.get(recipient.userId) ?? []).filter(
			(activityRow) => activityRow.createdAt > activityStartAt,
		)
		const isSent = await sendNotificationsEmail({
			recipient,
			activityRows: recipientActivityRows,
			sentDay,
			now,
		}).catch((error: unknown) => {
			reportError(error, "email", { emailKind: "notifications" })
			return false
		})
		sentCount += isSent ? 1 : 0
	}
	return sentCount
}

// a recipient: their address, and the end of the time their last notifications email covered, null before a first one
type Recipient = { userId: string; email: string; lastActivityEndAt: Date | null }

// the users who may get an email today: the switch is on and no email went out today
async function loadRecipients(sentDay: string): Promise<Recipient[]> {
	const recipientRows = await db
		.select({
			userId: users.id,
			email: users.email,
			lastActivityEndAt: max(notificationsEmailSends.activityEndAt),
			lastSentDay: max(notificationsEmailSends.sentDay),
		})
		.from(users)
		.leftJoin(notificationsEmailSends, eq(notificationsEmailSends.userId, users.id))
		.where(eq(users.isNotificationsEmailEnabled, true))
		.groupBy(users.id, users.email)
	return recipientRows.filter((recipientRow) => recipientRow.lastSentDay !== sentDay)
}

// one item as the email shows it: the Finding, the Podcast Episode, or the Topic it is on, by name and page
function toNotificationsEmailItem(activityRow: NotificationsEmailRow): NotificationsEmailItem {
	const { topic, findingId, findingTitle, podcastEpisode } = activityRow
	const { season, episodeNumber } = podcastEpisode ?? { season: null, episodeNumber: null }
	const targetPath = toSocialTargetPath(topic, { findingId, season, episodeNumber })
	return {
		kind: activityRow.kind,
		authorUsername: activityRow.authorUsername,
		reactionLabel: activityRow.reactionType ? REACTION_TYPE_LABELS[activityRow.reactionType] : null,
		targetLabel: findingTitle ?? podcastEpisode?.title ?? topic.name,
		targetUrl: `${appUrl()}${targetPath}`,
		text: activityRow.text,
	}
}

// whether a user may open what an activity row names: its Finding by the Finding's rule, or else its Topic, and its
// Podcast Episode if the publish time passes the user's subscription activation
async function canReadNotificationsEmailRow(
	userId: string,
	{ topic, findingId, podcastEpisode }: NotificationsEmailRow,
): Promise<boolean> {
	if (findingId) {
		return isTopicFindingVisible(userId, findingId)
	}
	// the Topic comes first, and the Podcast Episode on it has its own gate
	const isTopicReadable = await isAllowed(userId, "topic:view", topic)
	if (!isTopicReadable || !podcastEpisode) {
		return isTopicReadable
	}

	// an invite Topic's subscriber reads what published after their subscription activated
	const { isAdmin } = await loadUserAccess(userId)
	const subscriberActivatedAt = await topicSubscriptionStartDate(topic, userId, isAdmin)
	return isAfterSubscriberActivation(podcastEpisode.publishedAt, subscriberActivatedAt)
}

// the rows a user may still read: all of them on their own Topic, and elsewhere what they may open, read once per
// Finding, Podcast Episode, or Topic
async function toReadableActivityRows(
	userId: string,
	activityRows: NotificationsEmailRow[],
): Promise<NotificationsEmailRow[]> {
	const isReadableById = new Map<string, boolean>()
	const readableActivityRows: NotificationsEmailRow[] = []
	for (const activityRow of activityRows) {
		// the row's own Finding or Podcast Episode, or its Topic
		const readableId = activityRow.findingId ?? activityRow.podcastEpisode?.id ?? activityRow.topic.id
		const isReadable =
			activityRow.topic.ownerId === userId ||
			(isReadableById.get(readableId) ?? (await canReadNotificationsEmailRow(userId, activityRow)))
		isReadableById.set(readableId, isReadable)

		// keep it
		if (isReadable) {
			readableActivityRows.push(activityRow)
		}
	}
	return readableActivityRows
}

// what one send needs: the recipient, their activity, the UTC day the email counts for, and the time it covers up to
type SendNotificationsEmailOptions = {
	recipient: Recipient
	activityRows: NotificationsEmailRow[]
	sentDay: string
	now: Date
}

// send one recipient's email, or nothing on a quiet day. the day's row is written after the render and before the send,
// so a second sweep sends nothing, and a rejected send deletes the row for the next sweep. returns whether an email
// went out
async function sendNotificationsEmail({
	recipient,
	activityRows,
	sentDay,
	now,
}: SendNotificationsEmailOptions): Promise<boolean> {
	// a quiet day sends nothing
	const readableActivityRows = await toReadableActivityRows(recipient.userId, activityRows)
	if (readableActivityRows.length === 0) {
		return false
	}

	// the items newest first, with the link that turns the email off
	const unsubscribeUrl = await toUnsubscribeUrl(appUrl(), { userId: recipient.userId, emailKind: "notifications" })
	const notificationsEmailProps: NotificationsEmailProps = {
		items: readableActivityRows
			.sort((first, second) => second.createdAt.getTime() - first.createdAt.getTime())
			.map(toNotificationsEmailItem),
		appUrl: appUrl(),
		unsubscribeUrl,
	}
	const emailMessage: EmailMessage = {
		to: recipient.email,
		subject: toNotificationsEmailSubject(notificationsEmailProps),
		emailContent: await renderNotificationsEmail(notificationsEmailProps),
		plainTextContent: await renderNotificationsEmailText(notificationsEmailProps),
		emailKind: "notifications",
		headers: toUnsubscribeHeaders(unsubscribeUrl),
	}

	// take the day for this recipient, and skip if another sweep took it first
	const [sendRow] = await db
		.insert(notificationsEmailSends)
		.values({ userId: recipient.userId, sentDay, activityEndAt: now })
		.onConflictDoNothing()
		.returning({ userId: notificationsEmailSends.userId })
	if (!sendRow) {
		return false
	}

	// a rejected send gives the day back, so the next sweep sends the same items
	const isAccepted = await sendEmail(emailMessage)
	if (!isAccepted) {
		await db
			.delete(notificationsEmailSends)
			.where(and(eq(notificationsEmailSends.userId, recipient.userId), eq(notificationsEmailSends.sentDay, sentDay)))
	}
	return isAccepted
}
