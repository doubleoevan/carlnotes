// podcast episode route tests: an unchecked upload over a podcast episode's image or its film's poster shows on the
// podcast episode's page and in its own read to the editor who uploaded it, and to nobody else
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import type { PodcastEpisodePageResponse } from "@carlnotes/contracts/podcastEpisodePage"
import {
	FREE_USER_ACCESS_ROW,
	restoreConnectionPool,
	type SentQuery,
	stubConnectionPool,
} from "@carlnotes/db/connectionPoolStub"
import { toSignedInApp } from "../testSession"
import {
	PUBLISHED_PODCAST_EPISODE,
	UNCHECKED_PODCAST_EPISODE,
	UNCHECKED_PODCAST_EPISODE_IMAGE_ROW,
	UNCHECKED_TOPIC_PODCAST_EPISODE_VIDEO_IMAGE_ROW,
} from "../uncheckedImageOverlayTestFixtures"
import * as helpers from "./helpers"
import type { PodcastEpisodeRow, TopicRow } from "./podcastEpisodeRows"
import * as podcastEpisodeRows from "./podcastEpisodeRows"
import * as podcastEpisodeShapes from "./podcastEpisodeShapes"
import { podcastEpisodesRoute } from "./podcastEpisodes"

// put the pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// the published podcast episode's topic: owner-1's public topic on team-1, whose members are owner-1 and member-1
const TOPIC = { id: "topic-1", ownerId: "owner-1", teamId: "team-1", visibility: "public" } as TopicRow
const TEAM_MEMBER_ROWS = [
	["owner-1", "leader"],
	["member-1", "member"],
]

// stub the pool with every user as a free user, the topic's team, and member-1's two unchecked uploads under the
// podcast episode's id. return each query sent
function stubUncheckedPodcastEpisodeImages(): SentQuery[] {
	return stubConnectionPool(({ text, values }) => {
		// the unchecked images, which the read of the user who uploaded them finds
		if (text.includes('from "unchecked_images"')) {
			return values.includes("member-1")
				? [UNCHECKED_PODCAST_EPISODE_IMAGE_ROW, UNCHECKED_TOPIC_PODCAST_EPISODE_VIDEO_IMAGE_ROW]
				: []
		}

		// the owning team's members among the users the edit check names, and each user's access row
		if (text.startsWith('select "user_id", "role" from "team_members"')) {
			return TEAM_MEMBER_ROWS.filter(([userId]) => values.includes(userId))
		}
		return text.includes('from "users"') ? [FREE_USER_ACCESS_ROW] : []
	})
}

// the ids of the users whose reads looked for an unchecked image, in the order of the reads
function toUncheckedImageReadUserIds(sentQueries: SentQuery[]): unknown[] {
	const uncheckedImageReads = sentQueries.filter(({ text }) => text.includes('from "unchecked_images"'))
	return uncheckedImageReads.map(({ values }) => values[3])
}

// a request of the route as the given user, or as a visitor for null
function requestAs(userId: string | null, path: string): Promise<Response> {
	const app = userId ? toSignedInApp(podcastEpisodesRoute, userId) : podcastEpisodesRoute
	return Promise.resolve(app.request(path))
}

test("an unchecked podcast episode image and film poster show on the page to their uploader alone", async () => {
	// the page as each user reads it: the owner and the member may edit, and nobody else
	const sentQueries = stubUncheckedPodcastEpisodeImages()
	spyOn(helpers, "loadPodcastEpisodePage").mockImplementation(
		async (_podcastEpisodePageRef, userId) =>
			({
				podcastEpisode: PUBLISHED_PODCAST_EPISODE,
				canEditPodcastEpisode: userId === "owner-1" || userId === "member-1",
				podcastEpisodeImageOrigin: null,
				podcastEpisodeImagePrompt: null,
			}) as PodcastEpisodePageResponse,
	)
	const pagePath = "/topics/topic-1/episodes/2026/3"

	// the uploader reads both unchecked uploads with their flags, in a response that names no shared cache
	const uploaderResponse = await requestAs("member-1", pagePath)
	expect(uploaderResponse.status).toBe(200)
	expect(await uploaderResponse.json()).toMatchObject({
		podcastEpisode: UNCHECKED_PODCAST_EPISODE,
		isPodcastEpisodeImageUnchecked: true,
		podcastEpisodeImageOrigin: "uploaded",
		isTopicPodcastEpisodeVideoImageUnchecked: true,
		topicPodcastEpisodeVideoImageOrigin: "uploaded",
	})
	expect(uploaderResponse.headers.get("cdn-cache-control")).toBeNull()
	expect(uploaderResponse.headers.get("cache-tag")).toBeNull()

	// a second editor, a user who may not edit, and a visitor each read the published images with no flag
	for (const userId of ["owner-1", "stranger-1", null]) {
		const page = (await (await requestAs(userId, pagePath)).json()) as PodcastEpisodePageResponse
		expect(page.podcastEpisode).toEqual(PUBLISHED_PODCAST_EPISODE)
		expect(page.isPodcastEpisodeImageUnchecked).toBeUndefined()
		expect(page.isTopicPodcastEpisodeVideoImageUnchecked).toBeUndefined()
	}

	// each editor's page sent one read for both kinds, and nobody else's page sent any
	expect(toUncheckedImageReadUserIds(sentQueries)).toEqual(["member-1", "owner-1"])
})

test("a podcast episode's own read shows the unchecked uploads to their uploader alone", async () => {
	// the podcast episode, which every user here may listen to
	const sentQueries = stubUncheckedPodcastEpisodeImages()
	spyOn(podcastEpisodeRows, "loadAccessiblePodcastEpisode").mockResolvedValue({
		podcastEpisodeRow: { id: "episode-1" } as PodcastEpisodeRow,
		topic: TOPIC,
	})
	spyOn(podcastEpisodeShapes, "loadPodcastEpisode").mockResolvedValue(PUBLISHED_PODCAST_EPISODE)

	// the uploader reads both unchecked uploads, and a second editor, a reader, and a visitor read the published images
	expect(await (await requestAs("member-1", "/episodes/episode-1")).json()).toEqual(UNCHECKED_PODCAST_EPISODE)
	for (const userId of ["owner-1", "stranger-1", null]) {
		expect(await (await requestAs(userId, "/episodes/episode-1")).json()).toEqual(PUBLISHED_PODCAST_EPISODE)
	}

	// only the two editors' reads looked for an unchecked image
	expect(toUncheckedImageReadUserIds(sentQueries)).toEqual(["member-1", "owner-1"])
})
