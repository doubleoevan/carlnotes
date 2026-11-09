// tests for the podcast episode edit route. an empty title and flagged words are rejected before any write, and a
// save writes the words and clears the caches that show them
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import {
	restoreConnectionPool,
	type SentQuery,
	stubConnectionPool,
	toSelectionRow,
} from "@carlnotes/db/connectionPoolStub"
// the modules the tests spy on, and the route
import * as podcastFeedCache from "@carlnotes/db/podcastFeedCache"
import * as authorization from "../authorization"
import * as currentUserModule from "../currentUser"
import * as moderation from "../moderation"
import * as feedCaches from "../topic/feedCaches"
import * as homeOrder from "../topic/homeOrder"
import { namedTopicColumns } from "../topic/permissions"
import { podcastEpisodesRoute } from "./podcastEpisodes"

// put the pool and every spy back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// an editor of the podcast episode's topic, and the queries the route sends
function stubEditor(): { sentQueries: SentQuery[] } {
	// every query the route sends, with the topic row for each select
	const sentQueries: SentQuery[] = []
	stubConnectionPool((sentQuery) => {
		sentQueries.push(sentQuery)
		const { text } = sentQuery
		return text.startsWith("select")
			? [toSelectionRow(namedTopicColumns, { id: "topic-1", ownerId: "owner-1", visibility: "public", teamId: null })]
			: []
	})

	// the topic's owner, whom the edit gate grants
	spyOn(currentUserModule, "currentUser").mockReturnValue("owner-1")
	spyOn(authorization, "isAllowed").mockResolvedValue(true)
	return { sentQueries }
}

// a save of the title and the description
function requestUpdate(payload: { title: string; description: string }): Promise<Response> {
	return Promise.resolve(
		podcastEpisodesRoute.request("/episodes/episode-1", {
			method: "PATCH",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(payload),
		}),
	)
}

test("an empty title is rejected, and words the moderation flags are rejected before any write", async () => {
	const { sentQueries } = stubEditor()
	expect((await requestUpdate({ title: "  ", description: "" })).status).toBe(400)

	// flagged words write nothing
	spyOn(moderation, "toObjectionableCategory").mockResolvedValue("harassment")
	expect((await requestUpdate({ title: "A flagged title", description: "" })).status).toBe(422)
	expect(sentQueries.some(({ text }) => text.startsWith("update"))).toBe(false)
})

test("a save writes the trimmed words and clears the feed, the topic's visitor page, and the home", async () => {
	const { sentQueries } = stubEditor()
	spyOn(moderation, "toObjectionableCategory").mockResolvedValue(null)
	const deleteFeedCacheSpy = spyOn(podcastFeedCache, "deletePodcastFeedCache").mockResolvedValue()
	const clearTopicPagesSpy = spyOn(feedCaches, "clearVisitorTopicPages").mockResolvedValue()
	const clearHomeSpy = spyOn(homeOrder, "clearHomeCaches").mockResolvedValue()
	const response = await requestUpdate({ title: " Fresher beans ", description: "" })
	expect(response.status).toBe(200)

	// the title saved trimmed, and an empty description saved as none
	const updateQuery = sentQueries.find(({ text }) => text.startsWith("update"))
	expect(updateQuery?.values.slice(0, 2)).toEqual(["Fresher beans", null])

	expect(deleteFeedCacheSpy).toHaveBeenCalledWith("topic-1")
	expect(clearTopicPagesSpy).toHaveBeenCalledWith("topic-1")
	expect(clearHomeSpy).toHaveBeenCalled()
})
