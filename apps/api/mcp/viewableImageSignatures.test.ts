// viewable image signature tests: a tool result signs the image paths of the non-public topics the caller may view,
// reached through a topic, a podcast episode, or a Topic Post, and leaves unsigned a public topic's path, a path of a
// topic the caller may not view even inside text someone wrote, and every path for a visitor
import { afterAll, afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import * as authorization from "@carlnotes/db/authorization"
import {
	restoreConnectionPool,
	type SentQuery,
	stubConnectionPool,
	toSelectionRow,
} from "@carlnotes/db/connectionPoolStub"
import { gatedTopicColumns } from "@carlnotes/db/topicPermissions"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { toResultWithViewableImagesSigned } from "./viewableImageSignatures"

// the signing secret before each test
const restoreEnvSettings = saveEnvSettings(["BETTER_AUTH_SECRET"])
beforeEach(() => {
	Bun.env.BETTER_AUTH_SECRET = "test-secret"
})

// the pool and every spy put back after each test, and the secret after the file
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})
afterAll(restoreEnvSettings)

// the caller's own private topic, a public topic, and a private topic the caller was removed from
const OWN_TOPIC_PATH = "/api/topic-images/own-topic/aaaa/list.webp"
const PUBLIC_TOPIC_PATH = "/api/topic-images/public-topic/bbbb/list.webp"
const REMOVED_TOPIC_PATH = "/api/topic-images/removed-topic/cccc/list.webp"
const OWN_FILM_PATH = "/api/topic-podcast-episode-video-images/own-episode/chapters/1/image.jpg"
const OWN_TOPIC_POST_PATH = "/api/topic-post-images/own-post/dddd/page.webp"

// the three topics' gate rows, the podcast episode's and the Topic Post's topic, and a view gate that grants the
// caller's own topic alone. every query sent is returned
function stubTopics(): SentQuery[] {
	spyOn(authorization, "isAllowed").mockImplementation(async (_userId, _capability, topic) => topic?.id === "own-topic")
	return stubConnectionPool(({ text }) => {
		// the podcast episode's and the Topic Post's topic
		if (text.includes('from "episodes"')) {
			return [toSelectionRow({ id: 1, topicId: 1 }, { id: "own-episode", topicId: "own-topic" })]
		}
		if (text.includes('from "topic_posts"')) {
			return [toSelectionRow({ id: 1, topicId: 1 }, { id: "own-post", topicId: "own-topic" })]
		}
		// the three topics' gate rows
		if (text.includes('from "topics"')) {
			return [
				toSelectionRow(gatedTopicColumns, { id: "own-topic", ownerId: "user-1", visibility: "private" }),
				toSelectionRow(gatedTopicColumns, { id: "public-topic", ownerId: "user-2", visibility: "public" }),
				toSelectionRow(gatedTopicColumns, { id: "removed-topic", ownerId: "user-2", visibility: "invite" }),
			]
		}
		return []
	})
}

test("the caller's viewable private images are signed through each subject, and no other path is", async () => {
	stubTopics()
	const toolResult = {
		structuredContent: {
			images: [OWN_TOPIC_PATH, PUBLIC_TOPIC_PATH, OWN_FILM_PATH, OWN_TOPIC_POST_PATH],
			// a note body a removed member wrote, naming the image path of a topic they may no longer view
			noteBody: `<p>${REMOVED_TOPIC_PATH}</p>`,
		},
	}
	const signedResult = await toResultWithViewableImagesSigned(toolResult, "user-1")

	// the own topic's image, its film's chapter image, and its Topic Post's image are signed
	const [ownTopicImage, publicTopicImage, ownFilmImage, ownTopicPostImage] = signedResult.structuredContent.images
	expect(ownTopicImage).toStartWith(`${OWN_TOPIC_PATH}?expires=`)
	expect(ownFilmImage).toStartWith(`${OWN_FILM_PATH}?expires=`)
	expect(ownTopicPostImage).toStartWith(`${OWN_TOPIC_POST_PATH}?expires=`)

	// a public topic's path needs no signature, and the removed topic's path in the note stays unsigned
	expect(publicTopicImage).toBe(PUBLIC_TOPIC_PATH)
	expect(signedResult.structuredContent.noteBody).toBe(`<p>${REMOVED_TOPIC_PATH}</p>`)
})

test("a visitor's result and a result with no gated image send no query and return as they are", async () => {
	// a visitor's result, then a signed-in caller's result with only an avatar
	const sentQueries = stubTopics()
	const visitorResult = { structuredContent: { image: OWN_TOPIC_PATH } }
	expect(await toResultWithViewableImagesSigned(visitorResult, null)).toBe(visitorResult)
	const imagelessResult = { structuredContent: { avatar: "/api/avatars/user-1/3" } }
	expect(await toResultWithViewableImagesSigned(imagelessResult, "user-1")).toBe(imagelessResult)
	expect(sentQueries).toEqual([])
})
