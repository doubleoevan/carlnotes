// what a Scan's email says: the props the digest and the report render from, with the new Findings, Carl's recap, the
// Podcast Episode, and the links back into the app, and one subscriber's rendered message

import { toScanFailureLabel } from "@carlnotes/contracts/scanFailure"
import { toTopicPath } from "@carlnotes/contracts/seo"
import { db, isFindingShown } from "@carlnotes/db"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { findings, resources, type scans } from "@carlnotes/db/schema/scans"
import type { topics } from "@carlnotes/db/schema/topics"
import type { EmailMessage } from "@carlnotes/emails/email"
import type { ManualScanEmailProps } from "@carlnotes/emails/manual-scan-email"
import {
	renderTopicScanEmail,
	renderTopicScanEmailText,
	type TopicScanEmailFinding,
	type TopicScanEmailPodcastEpisode,
	type TopicScanEmailProps,
} from "@carlnotes/emails/topic-scan-email"
import { signUnsubscribeToken } from "@carlnotes/emails/unsubscribe"
import { appBaseUrl } from "@carlnotes/server/appUrl"
import { toPodcastCoverPath } from "@carlnotes/server/podcastCoverPaths"
import { and, desc, eq } from "drizzle-orm"

// the Scan and Topic columns that an email reads, and one recipient's user id and address
export type EmailScan = Pick<typeof scans.$inferSelect, "id" | "status" | "scanSummary" | "error">
export type EmailTopic = Pick<typeof topics.$inferSelect, "id" | "name">
export type Recipient = { userId: string; email: string }

/**
 * Returns the digest's subject and the props every recipient renders from, minus their own unsubscribe link.
 */
export async function toTopicScanEmailProps(
	topic: EmailTopic,
	scan: EmailScan,
): Promise<{ subject: string; sharedProps: TopicScanEmailProps }> {
	// the Scan's new Findings. an empty scan still sends the email with Carl's aside instead of a list
	const newFindings = await newFindingsForScan(scan.id)
	const allowedSummaryUrls = await topicFindingUrls(topic.id)

	// the links back into the app for the email, both undefined if no app base url is configured
	const appUrl = appBaseUrl()
	const topicUrl = appUrl ? `${appUrl}${toTopicPath(topic)}` : undefined

	// the subject counts the new Findings, and says so if there are none
	const subject =
		newFindings.length === 0
			? `Notes on ${topic.name}: nothing new`
			: `Notes on ${topic.name}: ${newFindings.length} finding${newFindings.length === 1 ? "" : "s"}`
	return {
		subject,
		sharedProps: {
			topicName: topic.name,
			findingCount: newFindings.length,
			findings: newFindings,
			// the recap reads above the list. a scan that failed to summarize leaves it out instead of sending an empty block
			scanSummary: scan.scanSummary ?? undefined,
			allowedSummaryUrls,
			// the header, heading, and footer link back to the app and to this topic
			appUrl,
			topicUrl,
			// the Scan's Podcast Episode, if it has a title and is recording or published
			podcastEpisode: await toScanEmailPodcastEpisode({ scanId: scan.id, topicUrl }),
		},
	}
}

// the Scan whose Podcast Episode to read, and the Topic's url that the Podcast Episode's link builds on
type ToScanEmailPodcastEpisodeOptions = { scanId: string; topicUrl?: string }

// the Scan's Podcast Episode as the Scan's email shows the Podcast Episode,
// with its description and a link that opens the Podcast Episode by its id
async function toScanEmailPodcastEpisode({
	scanId,
	topicUrl,
}: ToScanEmailPodcastEpisodeOptions): Promise<TopicScanEmailPodcastEpisode | undefined> {
	// read the Scan's Podcast Episode, and show the Podcast Episode only if it has a title and is recording or published
	const [podcastEpisode] = await db
		.select({
			id: podcastEpisodes.id,
			title: podcastEpisodes.title,
			description: podcastEpisodes.description,
			status: podcastEpisodes.status,
		})
		.from(podcastEpisodes)
		.where(eq(podcastEpisodes.scanId, scanId))
	const isPodcastEpisodeShown = podcastEpisode?.status === "recording" || podcastEpisode?.status === "published"
	if (!podcastEpisode?.title || !isPodcastEpisodeShown) {
		return undefined
	}

	// build the Podcast Episode's link and its cover's url
	const appUrl = appBaseUrl()
	const coverPath = toPodcastCoverPath({ kind: "episode", id: podcastEpisode.id, title: podcastEpisode.title }, 600)
	return {
		title: podcastEpisode.title,
		description: podcastEpisode.description ?? undefined,
		url: topicUrl ? `${topicUrl}?episode=${podcastEpisode.id}` : undefined,
		coverUrl: appUrl ? `${appUrl}${coverPath}` : undefined,
	}
}

/**
 * Returns the props a manual-scan report renders from: why a failed Scan stopped, or a succeeded Scan's new Findings.
 */
export async function toManualScanEmailProps(topic: EmailTopic, scan: EmailScan): Promise<ManualScanEmailProps> {
	// the links back into the app for the email, both undefined if no app base url is configured
	const appUrl = appBaseUrl()
	const topicUrl = appUrl ? `${appUrl}${toTopicPath(topic)}` : undefined
	if (scan.status === "failed") {
		return { status: "failed", topicName: topic.name, failureReason: toScanFailureLabel(scan.error), appUrl, topicUrl }
	}

	// a succeeded Scan reports its new Findings and Carl's recap of them
	return {
		status: "succeeded",
		topicName: topic.name,
		findings: await newFindingsForScan(scan.id),
		scanSummary: scan.scanSummary ?? undefined,
		allowedSummaryUrls: await topicFindingUrls(topic.id),
		appUrl,
		topicUrl,
		podcastEpisode: await toScanEmailPodcastEpisode({ scanId: scan.id, topicUrl }),
	}
}

/**
 * Renders one subscriber's scan email, with their own signed unsubscribe link and one-click header.
 */
export async function toTopicScanMessage(
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

// every url the Topic has a Finding for to use as the email's allowlist links
async function topicFindingUrls(topicId: string): Promise<string[]> {
	// the Topic's Findings joined to their Resource for the urls the recap can link
	const findingRows = await db
		.select({ url: resources.url })
		.from(findings)
		.innerJoin(resources, eq(findings.resourceId, resources.id))
		.where(eq(findings.topicId, topicId))
	return findingRows.map((findingRow) => findingRow.url)
}

// the Findings this Scan surfaced, joined to their Resources for the email
async function newFindingsForScan(scanId: string): Promise<TopicScanEmailFinding[]> {
	// this topic scan's Findings joined to their Resource for the title, link
	return db
		.select({ title: resources.title, url: resources.url, relevanceExplanation: findings.relevanceExplanation })
		.from(findings)
		.innerJoin(resources, eq(findings.resourceId, resources.id))
		.where(and(eq(findings.scanId, scanId), isFindingShown))
		.orderBy(desc(findings.relevanceScore))
}

// the recipient's signed one-click unsubscribe url, or undefined if the app base url isn't configured
async function toUnsubscribeUrl(userId: string, topicId: string): Promise<string | undefined> {
	// without an app base url, there is nowhere for the link to point
	const appUrl = appBaseUrl()
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
