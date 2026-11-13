// the Topic Post route tests' fixtures: a draft and its published copy, the reads and writes a route stands in for, and
// a signed-in user's request and save
import { spyOn } from "bun:test"
import { toTopicPostBodyImagePath } from "@carlnotes/contracts/topicPostBodyImages"
import { ADMIN_USER_ACCESS_ROW, FREE_USER_ACCESS_ROW, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"
import * as socialLimits from "@carlnotes/db/socialLimits"
import * as temporalClient from "@carlnotes/pipeline/temporalClient"
import * as analytics from "@carlnotes/server/analytics"
import * as edgeCache from "../edgeCache"
import * as moderation from "../moderation"
import { toJsonRequest, toSignedInApp } from "../testSession"
import * as homeOrder from "../topic/homeOrder"
import type { TopicPostRow } from "./topicPosts"
import * as topicPosts from "./topicPosts"
import { topicPostsRoute } from "./topicPostsRoute"
import * as topicPostWrites from "./topicPostWrites"

// a body of a given count of words, as the editor saves it
export const toBodyHtml = (wordCount: number): string =>
	`<p>${Array.from({ length: wordCount }, () => "word").join(" ")}</p>`

// a draft by member-1 on owner-1's public Topic
export const DRAFT_ROW: TopicPostRow = {
	topicPost: {
		id: "post-1",
		topicId: "topic-1",
		authorUserId: "member-1",
		title: "Dialing in",
		// a body past the 300 words, at its third version
		html: toBodyHtml(320),
		wordCount: 320,
		version: 3,
		publishedAt: null,
		editedAt: null,
		summary: null,
		cost: "0",
		imageHash: null,
		imageOrigin: null,
		imagePrompt: null,
		imageUpdatedAt: null,
		homeOrder: null,
		profileOrder: null,
		viewerCount: 0,
		createdAt: new Date("2026-11-09T12:00:00Z"),
		updatedAt: new Date("2026-11-09T12:00:00Z"),
	},
	topic: {
		id: "topic-1",
		ownerId: "owner-1",
		visibility: "public",
		teamId: "team-1",
		name: "Home espresso",
		imageHash: null,
	},
	author: { userId: "member-1", username: "member-1", avatarSource: "generated", avatarKey: null },
}

// the same post published a given count of minutes ago
export const toPublishedRow = (minutesAgo: number): TopicPostRow => ({
	...DRAFT_ROW,
	topicPost: { ...DRAFT_ROW.topicPost, publishedAt: new Date(Date.now() - minutesAgo * 60_000) },
})

// stand in for the reads and writes around a route: the post's row, the team's memberships, each user's access row,
// the day's limit, the classification, and the events
export function stubTopicPostRoutes(topicPostRow: TopicPostRow | null): {
	saveSpy: ReturnType<typeof spyOn>
	publishSpy: ReturnType<typeof spyOn>
	deleteSpy: ReturnType<typeof spyOn>
	clearHomeSpy: ReturnType<typeof spyOn>
	purgeProfileSpy: ReturnType<typeof spyOn>
	trackEventSpy: ReturnType<typeof spyOn>
} {
	// member-1, member-2, and the owner are on the Topic's team, and admin-1 is an admin
	stubConnectionPool(({ text, values }) => {
		if (text.includes('from "team_members"')) {
			const ownerMembership = ["owner-1", "leader"]
			const memberId = values.find((value) => value === "member-1" || value === "member-2")
			return memberId ? [[memberId, "member"], ownerMembership] : [ownerMembership]
		}
		return values.includes("admin-1") ? [ADMIN_USER_ACCESS_ROW] : [FREE_USER_ACCESS_ROW]
	})

	// the post's read, its page, the day's limit, and a clean classification
	spyOn(topicPosts, "loadTopicPostRow").mockResolvedValue(topicPostRow)
	spyOn(topicPosts, "toTopicPostResponse").mockImplementation(
		async (_userId, readRow) => ({ id: readRow.topicPost.id }) as never,
	)
	spyOn(socialLimits, "countSocialWriteToday").mockResolvedValue(true)
	spyOn(moderation, "toObjectionableCategory").mockResolvedValue(null)

	// the workflows a publish and an edit start
	spyOn(temporalClient, "startTopicPostPublishWorkflow").mockResolvedValue()
	spyOn(temporalClient, "startTopicPostSummaryWorkflow").mockResolvedValue()
	return {
		saveSpy: spyOn(topicPostWrites, "saveTopicPost").mockResolvedValue({
			status: "saved",
			version: 4,
			droppedImageIds: [],
		}),
		publishSpy: spyOn(topicPostWrites, "publishTopicPost").mockResolvedValue(true),
		deleteSpy: spyOn(topicPostWrites, "deleteTopicPost").mockResolvedValue(),
		// the caches a published post's delete clears
		clearHomeSpy: spyOn(homeOrder, "clearHomeCaches").mockResolvedValue(),
		purgeProfileSpy: spyOn(edgeCache, "purgeProfileAtEdge").mockResolvedValue(undefined),
		trackEventSpy: spyOn(analytics, "trackEvent").mockImplementation(() => {}),
	}
}

// a request as one user
export const toUserApp = (userId: string): ReturnType<typeof toSignedInApp> => toSignedInApp(topicPostsRoute, userId)

// a save of a title and a body at a version
export const toSave = (wordCount: number, version = 3): RequestInit =>
	toJsonRequest({ title: "Dialing in", html: toBodyHtml(wordCount), version }, "PUT")

// a draft with a uuid, whose body shows the given images by their ids, as the sanitizer writes them
export function toImageDraftRow(topicPostId: string, imageIds: string[]): TopicPostRow {
	const imagesHtml = imageIds
		.map((imageId) => `<img src="${toTopicPostBodyImagePath({ topicPostId, imageId })}" width="4" height="3" />`)
		.join("")
	return { ...DRAFT_ROW, topicPost: { ...DRAFT_ROW.topicPost, id: topicPostId, html: `<p>one</p>${imagesHtml}` } }
}
