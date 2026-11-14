// the Topic Post routes: a Topic's posts, a draft's create and saves, the publish, the read of one, and the delete

import { NOTE_HTML_MAX_CHARS } from "@carlnotes/contracts/notes"
import { toHtmlText } from "@carlnotes/contracts/text"
import { toTopicPostBodyImageIds } from "@carlnotes/contracts/topicPostBodyImages"
import { isTopicPostComplete, topicPostSavePayload, toWordCount } from "@carlnotes/contracts/topicPosts"
import { db } from "@carlnotes/db"
import { loadTopicPostBodyImageLimits } from "@carlnotes/db/quotas"
import { topics } from "@carlnotes/db/schema/topics"
import { countSocialWriteToday } from "@carlnotes/db/socialLimits"
import { namedTopicColumns } from "@carlnotes/db/topicPermissions"
import {
	rebuildTopicDashboardsAfterPublication,
	rebuildTopicDashboardsById,
} from "@carlnotes/pipeline/dashboardRebuild"
import { startTopicPostPublishWorkflow, startTopicPostSummaryWorkflow } from "@carlnotes/pipeline/temporalClient"
import { trackEvent } from "@carlnotes/server/analytics"
import { reportError } from "@carlnotes/server/monitoring"
import { zValidator } from "@hono/zod-validator"
import { eq } from "drizzle-orm"
import { type Context, Hono } from "hono"
import { isAllowed } from "../authorization"
import { toBodyLimit, toSignedOutRejection } from "../bodyLimit"
import { type AnalyticsProperties, type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { purgeProfileAtEdge } from "../edgeCache"
import { toObjectionableContentResponse } from "../moderation"
import { sanitizeTopicPostHtml } from "../noteHtml"
import { noteBodySaveRateLimiter, socialReadRateLimiter, toolCallerRateLimiter } from "../rateLimit"
import { loadTopicPostPreview, toCachedTopicPostPreviewPng, toPreviewPngResponse } from "../share/preview"
import { toTermsOutdatedResponse } from "../termsAcceptance"
import { clearVisitorTopicPages } from "../topic/feedCaches"
import { clearHomeCaches } from "../topic/homeOrder"
import { overlayUncheckedTopicPostImage } from "../uncheckedImageOverlays"
import { loadHtmlWithoutRemovedBodyImages, purgeTopicPostBodyImagesAtEdge } from "./topicPostBodyImages"
import { toObjectionableTopicPostCategory, toTopicPostModerationTexts } from "./topicPostModeration"
import {
	canReadTopicPost,
	loadAuthoredTopicPost,
	loadTopicPostCards,
	loadTopicPostRow,
	type TopicPostRow,
	toTopicPostResponse,
} from "./topicPosts"
import { createTopicPostDraft, deleteTopicPost, publishTopicPost, saveTopicPost } from "./topicPostWrites"

// the path of a Topic Post's save, after the /api base, with a body limit of its own
export const TOPIC_POST_PATH = "/topic-posts/:id"

// the save's limit: any UTF-8 encoding of a body at the longest HTML, plus the JSON around it
const topicPostBodyLimit = toBodyLimit(NOTE_HTML_MAX_CHARS * 4 + 1024)

// a visitor's save responds like a missing Topic Post, before its body is read
const topicPostSignedOutRejection = toSignedOutRejection("not found", 404)

// a Topic Post write's event properties: the post's id, its Topic's id, and whether the actor owns the Topic
function toTopicPostEventProperties(
	context: Context<AppEnv>,
	userId: string,
	{ topicPost, topic }: TopicPostRow,
): AnalyticsProperties & { objectId: string; topicId: string; isOwner: boolean } {
	return {
		...toAnalyticsProperties(context),
		objectId: topicPost.id,
		topicId: topic.id,
		isOwner: topic.ownerId === userId,
	}
}

// start a workflow after a write that already stands. a failed start is reported and blocks nothing
function startBestEffort(startWorkflow: () => Promise<void>, topicPostId: string): void {
	void startWorkflow().catch((error) =>
		reportError(error, "api-route", { topicPostId, step: "topic-post-workflow-start" }),
	)
}

// the response of a write past the day's limit
function toLimitReachedResponse(context: Context<AppEnv>): Response {
	return context.json({ error: "rate limited" }, 429)
}

/**
 * The Topic Post routes. Every access rejection is a 404, so a draft and a private Topic's post read as missing.
 */
export const topicPostsRoute = new Hono<AppEnv>()
	.get("/topics/:id/topic-posts", socialReadRateLimiter, async (context) => {
		// the Topic's posts for whoever may open the Topic, with the caller's own drafts first
		const userId = currentUser(context)
		const [topic] = await db
			.select(namedTopicColumns)
			.from(topics)
			.where(eq(topics.id, context.req.param("id")))
		if (!topic || !(await isAllowed(userId, "topic:view", topic))) {
			return context.json({ error: "not found" }, 404)
		}
		// the topic's cards for this reader, and whether they may publish
		const [topicPostCards, canPublish] = await Promise.all([
			loadTopicPostCards(userId, topic.id),
			isAllowed(userId, "topicPost:publish", topic),
		])
		return context.json({ topicPosts: topicPostCards, canPublish })
	})
	.post("/topics/:id/topic-posts", toolCallerRateLimiter, async (context) => {
		// only an editor of the Topic starts a draft on it
		const userId = currentUser(context)
		const [topic] = await db
			.select(namedTopicColumns)
			.from(topics)
			.where(eq(topics.id, context.req.param("id")))
		if (!userId || !topic || !(await isAllowed(userId, "topicPost:publish", topic))) {
			return context.json({ error: "not found" }, 404)
		}

		// a user who has not accepted the current Terms is asked to first, and the draft counts against the day
		const termsOutdatedResponse = toTermsOutdatedResponse(context)
		if (termsOutdatedResponse) {
			return termsOutdatedResponse
		}
		if (!(await countSocialWriteToday(userId, "topicPost"))) {
			return toLimitReachedResponse(context)
		}

		// the new draft as its author reads it
		const topicPostId = await createTopicPostDraft(topic.id, userId)
		const topicPostRow = await loadTopicPostRow(topicPostId)
		if (!topicPostRow) {
			return context.json({ error: "not found" }, 404)
		}
		return context.json(await toTopicPostResponse(userId, topicPostRow))
	})
	.get(TOPIC_POST_PATH, socialReadRateLimiter, async (context) => {
		// a draft for its author alone, and a published post for whoever may open its Topic
		const userId = currentUser(context)
		const topicPostRow = await loadTopicPostRow(context.req.param("id"))
		if (!topicPostRow || !(await canReadTopicPost(userId, topicPostRow))) {
			return context.json({ error: "not found" }, 404)
		}

		// the page, with the unchecked upload of whoever may change the image in the post's image's place
		const topicPostResponse = await toTopicPostResponse(userId, topicPostRow, { isCommentThreadIncluded: true })
		return context.json(await overlayUncheckedTopicPostImage(topicPostResponse, userId))
	})
	// the link-preview card that a social platform fetches for a published Topic Post of any topic
	.get(`${TOPIC_POST_PATH}/preview.png`, async (context) => {
		// respond 404 unless the Topic Post has published
		const loadedTopicPostPreview = await loadTopicPostPreview(context.req.param("id"))
		if (!loadedTopicPostPreview) {
			return context.json({ error: "not found" }, 404)
		}

		// draw the preview card on its first request, and read the card from storage after
		const topicPostPreviewPng = await toCachedTopicPostPreviewPng(loadedTopicPostPreview.topicPostPreview)
		return toPreviewPngResponse(context, topicPostPreviewPng)
	})
	.put(
		TOPIC_POST_PATH,
		noteBodySaveRateLimiter,
		topicPostSignedOutRejection,
		topicPostBodyLimit,
		zValidator("json", topicPostSavePayload),
		async (context) => {
			// a save is its author's, while the author may still edit the Topic
			const userId = currentUser(context)
			const topicPostRow = await loadAuthoredTopicPost(userId, context.req.param("id"))
			if (!userId || !topicPostRow) {
				return context.json({ error: "not found" }, 404)
			}
			// a write waits on the current Terms
			const termsOutdatedResponse = toTermsOutdatedResponse(context)
			if (termsOutdatedResponse) {
				return termsOutdatedResponse
			}

			// the body is cleaned on every save, keeps out the images an admin removed, and has its words counted over its
			// text
			const { topicPost } = topicPostRow
			const { title, html, version } = context.req.valid("json")
			const sanitizedHtml = await loadHtmlWithoutRemovedBodyImages(
				sanitizeTopicPostHtml(html, topicPost.id),
				topicPost.id,
			)
			const bodyText = toHtmlText(sanitizedHtml)

			// a body names no more images than the author's plan allows. the plan is read only for a body with an image
			const imageCount = toTopicPostBodyImageIds(sanitizedHtml, topicPost.id).length
			if (imageCount > 0 && imageCount > (await loadTopicPostBodyImageLimits(userId)).imageLimit) {
				return context.json({ error: "image-limit-reached" }, 422)
			}
			const wordCount = toWordCount(bodyText)

			// whether the save changes a published post's title or text. an edit of the formatting alone changes neither
			const isPublishedTextChanged =
				topicPost.publishedAt !== null && (title !== topicPost.title || bodyText !== toHtmlText(topicPost.html))

			// a save at an older version is a conflict before anything is classified
			if (version !== topicPost.version) {
				return context.json({ error: "conflict", version: topicPost.version }, 409)
			}

			// a published post keeps its title and its words, and a changed text is classified again
			if (topicPost.publishedAt) {
				const publishedEditRejection = await toPublishedEditRejection(context, {
					topicPost,
					title,
					html: sanitizedHtml,
					wordCount,
				})
				if (publishedEditRejection) {
					return publishedEditRejection
				}
			}

			// write at the version the editor opened at, settling the body's images. a newer version is a conflict
			const saveOutcome = await saveTopicPost({ topicPost, title, html: sanitizedHtml, wordCount, version })
			if (saveOutcome.status === "conflict") {
				return context.json({ error: "conflict", version: saveOutcome.version }, 409)
			}
			// a dropped image leaves the edge
			if (saveOutcome.droppedImageIds.length > 0) {
				await purgeTopicPostBodyImagesAtEdge(topicPostRow)
			}
			// an edit of a published post is reported by its ids
			if (topicPost.publishedAt) {
				trackEvent("social_topic_post_edit", userId, toTopicPostEventProperties(context, userId, topicPostRow))
			}

			// a changed text has its summary written again, once for the edits saved close together
			if (isPublishedTextChanged) {
				startBestEffort(() => startTopicPostSummaryWorkflow(topicPost.id), topicPost.id)
			}
			return context.json({ version: saveOutcome.version })
		},
	)
	.post(`${TOPIC_POST_PATH}/publish`, toolCallerRateLimiter, async (context) => {
		// publishing is the author's, on a draft alone
		const userId = currentUser(context)
		const topicPostRow = await loadAuthoredTopicPost(userId, context.req.param("id"))
		if (!userId || !topicPostRow) {
			return context.json({ error: "not found" }, 404)
		}
		// a post already published has nothing left to publish
		const { topicPost } = topicPostRow
		if (topicPost.publishedAt) {
			return context.json({ error: "conflict", version: topicPost.version }, 409)
		}
		// a write waits on the current Terms
		const termsOutdatedResponse = toTermsOutdatedResponse(context)
		if (termsOutdatedResponse) {
			return termsOutdatedResponse
		}

		// a draft short of a title or of its words stays a draft
		if (!isTopicPostComplete(topicPost.title, topicPost.wordCount)) {
			return context.json({ error: "incomplete" }, 400)
		}

		// the publish counts against the day before its text is classified, and a flagged text keeps the draft
		if (!(await countSocialWriteToday(userId, "topicPost"))) {
			return toLimitReachedResponse(context)
		}
		const objectionableCategory = await toObjectionableTopicPostCategory(
			[topicPost.title, ...toTopicPostModerationTexts(topicPost.html)],
			topicPost.id,
		)
		if (objectionableCategory) {
			return toObjectionableContentResponse(context, objectionableCategory)
		}

		// publish the version that was classified, at once, with no approval step, and report the publish by its ids
		const isPublished = await publishTopicPost(topicPost.id, topicPost.version)
		if (isPublished) {
			trackEvent("social_topic_post_publish", userId, toTopicPostEventProperties(context, userId, topicPostRow))
			startBestEffort(() => startTopicPostPublishWorkflow(topicPost.id), topicPost.id)

			// a public topic's new Topic Post joins the home's cards and its author's profile page
			if (topicPostRow.topic.visibility === "public") {
				await clearHomeCaches()
				await purgeProfileAtEdge(userId)
			}
			// clear the topic page's caches and rebuild the topic's Dashboards, whose snapshots stay until the rebuild writes
			await clearVisitorTopicPages(topicPost.topicId)
			await rebuildTopicDashboardsAfterPublication(topicPost.topicId)
		}
		// return the post as it now reads
		const publishedRow = await loadTopicPostRow(topicPost.id)
		if (!publishedRow) {
			return context.json({ error: "not found" }, 404)
		}

		// a draft saved again since the classification is a conflict
		if (!isPublished && !publishedRow.topicPost.publishedAt) {
			return context.json({ error: "conflict", version: publishedRow.topicPost.version }, 409)
		}
		return context.json(await toTopicPostResponse(userId, publishedRow))
	})
	.delete(TOPIC_POST_PATH, toolCallerRateLimiter, async (context) => {
		// deleting is the author's, the Topic's owner's, and an admin's. a draft is its author's alone
		const userId = currentUser(context)
		const topicPostRow = await loadTopicPostRow(context.req.param("id"))
		if (!userId || !topicPostRow || !(await canReadTopicPost(userId, topicPostRow))) {
			return context.json({ error: "not found" }, 404)
		}
		// its author, its topic's owner, and an admin may delete it
		const { topicPost, topic } = topicPostRow
		const isAuthorOrOwner = topicPost.authorUserId === userId || topic.ownerId === userId
		if (!isAuthorOrOwner && !(await isAllowed(userId, "admin:console"))) {
			return context.json({ error: "not found" }, 404)
		}

		// the delete takes the post's thread and discussions with it, and its body images leave the edge
		await deleteTopicPost(topicPost.id)
		if (toTopicPostBodyImageIds(topicPost.html, topicPost.id).length > 0) {
			await purgeTopicPostBodyImagesAtEdge(topicPostRow)
		}

		// a published Topic Post left the home's cards, its author's profile page, the topic's own page, and the topic's
		// Dashboards
		if (topicPost.publishedAt) {
			await clearHomeCaches()
			await purgeProfileAtEdge(topicPost.authorUserId)
			await clearVisitorTopicPages(topicPost.topicId)
			await rebuildTopicDashboardsById(topicPost.topicId)
		}

		// report the delete
		trackEvent("social_topic_post_delete", userId, toTopicPostEventProperties(context, userId, topicPostRow))
		return context.json({ ok: true as const })
	})

// what an edit of a published Topic Post is checked against: the post, and the new title, html, and count
type PublishedEditOptions = {
	topicPost: TopicPostRow["topicPost"]
	title: string
	html: string
	wordCount: number
}

// the rejection of an edit of a published Topic Post, or null for an edit that may be written: short of its title or
// its words, or flagged. an edit counts toward no daily limit
async function toPublishedEditRejection(
	context: Context<AppEnv>,
	{ topicPost, title, html, wordCount }: PublishedEditOptions,
): Promise<Response | null> {
	if (!isTopicPostComplete(title, wordCount)) {
		return context.json({ error: "incomplete" }, 400)
	}

	// readers see a changed text once it is saved, so a changed title and the new paragraphs and alt texts pass the
	// moderation first. an edit of the formatting alone changes none of them
	const previousTexts = new Set(toTopicPostModerationTexts(topicPost.html))
	const changedTexts = [
		...(title === topicPost.title ? [] : [title]),
		...toTopicPostModerationTexts(html).filter((text) => !previousTexts.has(text)),
	]
	const objectionableCategory = await toObjectionableTopicPostCategory(changedTexts, topicPost.id)
	return objectionableCategory ? toObjectionableContentResponse(context, objectionableCategory) : null
}
