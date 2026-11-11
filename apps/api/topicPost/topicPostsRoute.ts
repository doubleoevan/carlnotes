// the Topic Post routes: a Topic's posts, a draft's create and saves, the publish, the read of one, and the delete

import { NOTE_HTML_MAX_CHARS } from "@carlnotes/contracts/notes"
import { toHtmlText } from "@carlnotes/contracts/text"
import { isTopicPostComplete, topicPostSavePayload, toWordCount } from "@carlnotes/contracts/topicPosts"
import { db } from "@carlnotes/db"
import { topics } from "@carlnotes/db/schema/topics"
import { countSocialWriteToday } from "@carlnotes/db/socialLimits"
import { namedTopicColumns } from "@carlnotes/db/topicPermissions"
import { MODERATION_TEXT_MAX_CHARS } from "@carlnotes/models/moderation"
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
import { toObjectionableCategory, toObjectionableContentResponse } from "../moderation"
import { sanitizeNoteHtml } from "../noteHtml"
import { noteBodySaveRateLimiter, socialReadRateLimiter, toolCallerRateLimiter } from "../rateLimit"
import { loadTopicPostPreview, toCachedTopicPostPreviewPng, toPreviewPngResponse } from "../share/preview"
import { toTermsOutdatedResponse } from "../termsAcceptance"
import { clearVisitorTopicPages } from "../topic/feedCaches"
import { clearHomeCaches } from "../topic/homeOrder"
import {
	canReadTopicPost,
	createTopicPostDraft,
	deleteTopicPost,
	isTopicPostEditable,
	loadTopicPostCards,
	loadTopicPostRow,
	publishTopicPost,
	saveTopicPost,
	type TopicPostRow,
	toTopicPostResponse,
} from "./topicPosts"

// the path of a Topic Post's save, after the /api base, with a body limit of its own
export const TOPIC_POST_PATH = "/topic-posts/:id"

// the save's limit: any UTF-8 encoding of a body at the longest HTML, plus the JSON around it
const topicPostBodyLimit = toBodyLimit(NOTE_HTML_MAX_CHARS * 4 + 1024)

// a visitor's save responds like a missing Topic Post, before its body is read
const topicPostSignedOutRejection = toSignedOutRejection("not found", 404)

// load a Topic Post for a write by its author, who must still be one of its Topic's editors. null for anyone else
async function loadAuthoredTopicPost(userId: string | null, topicPostId: string): Promise<TopicPostRow | null> {
	const topicPostRow = await loadTopicPostRow(topicPostId)
	if (!userId || !topicPostRow || topicPostRow.topicPost.authorUserId !== userId) {
		return null
	}
	return (await isAllowed(userId, "topicPost:publish", topicPostRow.topic)) ? topicPostRow : null
}

// the category a Topic Post's title and text violate, or null. the whole text is classified, in pieces of the
// classification's limit, in order, up to the first violation
async function toObjectionableTopicPostCategory(
	text: string,
	topicPostId: string,
): ReturnType<typeof toObjectionableCategory> {
	for (let pieceStart = 0; pieceStart < text.length; pieceStart += MODERATION_TEXT_MAX_CHARS) {
		// classify one piece, and stop at a violation
		const objectionableCategory = await toObjectionableCategory({
			text: text.slice(pieceStart, pieceStart + MODERATION_TEXT_MAX_CHARS),
			textKind: "a public post about a topic",
			subjectKind: "topicPost",
			subjectId: topicPostId,
		})
		if (objectionableCategory) {
			return objectionableCategory
		}
	}
	return null
}

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
		return context.json(await toTopicPostResponse(userId, topicPostRow, { isCommentThreadIncluded: true }))
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

			// the body is cleaned on every save, and its words are counted over its text
			const { topicPost } = topicPostRow
			const { title, html, version } = context.req.valid("json")
			const sanitizedHtml = sanitizeNoteHtml(html)
			const bodyText = toHtmlText(sanitizedHtml)
			const wordCount = toWordCount(bodyText)

			// whether the save changes a published post's title or text. an edit of the formatting alone changes neither
			const isPublishedTextChanged =
				topicPost.publishedAt !== null && (title !== topicPost.title || bodyText !== toHtmlText(topicPost.html))

			// a published post is edited inside its edit time alone, keeps its title and its words, and a changed text is
			// classified again
			if (topicPost.publishedAt) {
				const publishedEditRejection = await toPublishedEditRejection(context, {
					topicPost,
					title,
					bodyText,
					wordCount,
					isTextChanged: isPublishedTextChanged,
				})
				if (publishedEditRejection) {
					return publishedEditRejection
				}
			}

			// write at the version the editor opened at. a newer version is a conflict
			const saveOutcome = await saveTopicPost({ topicPost, title, html: sanitizedHtml, wordCount, version })
			if (saveOutcome.status === "conflict") {
				return context.json({ error: "conflict", version: saveOutcome.version }, 409)
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
			`${topicPost.title}\n\n${toHtmlText(topicPost.html)}`,
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

			// a public topic's new post joins the home's cards and its author's profile page, and the topic's own page
			if (topicPostRow.topic.visibility === "public") {
				await clearHomeCaches()
				await purgeProfileAtEdge(userId)
			}
			await clearVisitorTopicPages(topicPost.topicId)
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

		// the delete takes the post's thread and discussions with it, and is reported by its ids
		await deleteTopicPost(topicPost.id)

		// a published post left the home's cards, its author's profile page, and the topic's own page
		if (topicPost.publishedAt) {
			await clearHomeCaches()
			await purgeProfileAtEdge(topicPost.authorUserId)
			await clearVisitorTopicPages(topicPost.topicId)
		}
		trackEvent("social_topic_post_delete", userId, toTopicPostEventProperties(context, userId, topicPostRow))
		return context.json({ ok: true as const })
	})

// what an edit of a published Topic Post is checked against: the post, the new title, text, and count, and whether
// the title or the text changed
type PublishedEditOptions = {
	topicPost: TopicPostRow["topicPost"]
	title: string
	bodyText: string
	wordCount: number
	isTextChanged: boolean
}

// the rejection of an edit of a published Topic Post, or null for an edit that may be written: past the edit time,
// short of its title or its words, or flagged. an edit counts toward no daily limit
async function toPublishedEditRejection(
	context: Context<AppEnv>,
	{ topicPost, title, bodyText, wordCount, isTextChanged }: PublishedEditOptions,
): Promise<Response | null> {
	if (!isTopicPostEditable(topicPost)) {
		return context.json({ error: "locked" }, 409)
	}
	if (!isTopicPostComplete(title, wordCount)) {
		return context.json({ error: "incomplete" }, 400)
	}

	// an edit that changed the formatting alone is not classified again
	if (!isTextChanged) {
		return null
	}

	// a changed text is public once it is saved, so it passes the moderation first
	const objectionableCategory = await toObjectionableTopicPostCategory(`${title}\n\n${bodyText}`, topicPost.id)
	return objectionableCategory ? toObjectionableContentResponse(context, objectionableCategory) : null
}
