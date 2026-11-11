// the Topic Post Discussion routes: the audio, for whoever may open the post's topic, by a session or by an MCP
// view's play token, and an editor's regenerate with an optional note for the hosts

import {
	TOPIC_POST_DISCUSSION_HINT_MAX_CHARS,
	topicPostDiscussionRegeneratePayload,
} from "@carlnotes/contracts/topicPosts"
import { isUniqueViolation } from "@carlnotes/db"
import { loadDiscussionRegenerationQuota } from "@carlnotes/db/quotas"
import {
	type StartTopicPostDiscussionOptions,
	startTopicPostDiscussion,
} from "@carlnotes/pipeline/topicPosts/topicPostDiscussions"
import { trackEvent } from "@carlnotes/server/analytics"
import { zValidator } from "@hono/zod-validator"
import { Hono } from "hono"
import { isAllowed } from "../authorization"
import { type AppEnv, currentUser, toAnalyticsProperties } from "../currentUser"
import { toObjectionableCategory, toObjectionableContentResponse } from "../moderation"
import { readPlayToken } from "../podcast/playTokens"
import { toPodcastEpisodeAudioResponse } from "../podcast/podcastEpisodeFiles"
import { toolCallerRateLimiter } from "../rateLimit"
import { toTermsOutdatedResponse } from "../termsAcceptance"
import { loadTopicPostDiscussion, loadTopicPostDiscussionAudioRow } from "./topicPostDiscussions"
import { canReadTopicPost, loadTopicPostRow } from "./topicPosts"

// what a regenerate reads while the post has a recording under way
const ALREADY_RECORDING_TEXT = "Carl and Vienna are already recording this one."

// the Topic Post Discussion routes
export const topicPostDiscussionsRoute = new Hono<AppEnv>()
	// the newest published recording's audio, to whoever may open the post's topic. a HEAD returns its length. an MCP
	// view's audio element sends no session, so its play token names the caller instead, and a token that names none
	// reads as missing
	.on(["GET", "HEAD"], "/topic-posts/:id/discussion/audio.mp3", async (context) => {
		const topicPostId = context.req.param("id")
		const playToken = context.req.query("play")
		const playTokenCaller = playToken ? readPlayToken({ playToken, topicPostId }) : null
		if (playToken && !playTokenCaller) {
			return context.json({ error: "not found" }, 404)
		}

		// the listener is the token's caller, else the session's user, and a post the listener may not read has no audio
		const listenerUserId = playTokenCaller ? playTokenCaller.userId : currentUser(context)
		const topicPostRow = await loadTopicPostRow(topicPostId)
		if (!topicPostRow?.topicPost.publishedAt || !(await canReadTopicPost(listenerUserId, topicPostRow))) {
			return context.json({ error: "not found" }, 404)
		}

		// the newest recording that still has its audio
		const discussionAudioRow = await loadTopicPostDiscussionAudioRow(topicPostRow.topicPost.id)
		return toPodcastEpisodeAudioResponse(context, discussionAudioRow ?? { audioKey: null, audioByteSize: null })
	})
	// an editor's regenerate: a fresh recording billed to the editor, steered by an optional note, within the month's
	// limit. the recording before it plays until the new one is stored
	.post(
		"/topic-posts/:id/discussion/regenerate",
		toolCallerRateLimiter,
		zValidator("json", topicPostDiscussionRegeneratePayload),
		async (context) => {
			// whoever may publish on the post's topic
			const userId = currentUser(context)
			const topicPostRow = await loadTopicPostRow(context.req.param("id"))
			const canRegenerate =
				userId &&
				topicPostRow?.topicPost.publishedAt &&
				(await isAllowed(userId, "topicPost:publish", topicPostRow.topic))
			// anyone else reads the post's regenerate as missing
			if (!userId || !topicPostRow || !canRegenerate) {
				return context.json({ error: "not found" }, 404)
			}
			// a write waits on the current Terms
			const termsOutdatedResponse = toTermsOutdatedResponse(context)
			if (termsOutdatedResponse) {
				return termsOutdatedResponse
			}

			// one recording at a time, and regenerations left this month
			const { topicPost, topic } = topicPostRow
			const [discussion, discussionRegenerationQuota] = await Promise.all([
				loadTopicPostDiscussion(topicPost.id),
				loadDiscussionRegenerationQuota(userId),
			])
			if (discussion?.isRecording) {
				return context.json({ error: ALREADY_RECORDING_TEXT }, 409)
			}
			if (discussionRegenerationQuota.remaining <= 0) {
				return context.json({ error: "This month's regenerations are used." }, 429)
			}

			// the note passes the moderation before it reaches the writer
			const hint = context.req.valid("json").hint?.slice(0, TOPIC_POST_DISCUSSION_HINT_MAX_CHARS)
			const objectionableCategory = hint
				? await toObjectionableCategory({
						text: hint,
						textKind: "a note that steers a recorded conversation about a post",
						subjectKind: "topicPostDiscussionHint",
						subjectId: topicPost.id,
					})
				: null
			if (objectionableCategory) {
				return toObjectionableContentResponse(context, objectionableCategory)
			}

			// the recording row and its workflow. a post that another request started recording first starts nothing
			const discussionId = await startDiscussionRegeneration({ topicPostId: topicPost.id, userId, hint })
			if (!discussionId) {
				return context.json({ error: ALREADY_RECORDING_TEXT }, 409)
			}

			// the regenerate's event by its ids, with no note
			trackEvent("social_topic_post_discussion_regenerate", userId, {
				...toAnalyticsProperties(context),
				objectId: topicPost.id,
				topicId: topic.id,
				isOwner: topic.ownerId === userId,
			})
			return context.json({ discussionId }, 202)
		},
	)

// start a regenerate's recording and return its id, or null for a post that already has a recording under way
async function startDiscussionRegeneration(
	regeneration: Omit<StartTopicPostDiscussionOptions, "kind">,
): Promise<string | null> {
	try {
		return await startTopicPostDiscussion({ ...regeneration, kind: "regenerate" })
	} catch (error) {
		// a post takes one recording row at a time, and another request's regenerate holds it
		if (isUniqueViolation(error)) {
			return null
		}
		throw error
	}
}
