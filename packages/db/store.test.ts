// store tests: the object content key, the keys among nullable rows, and deleteStoredObject, whose failed delete
// leaves the key pending with its failure and whose successful delete clears the key
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { restoreConnectionPool, stubConnectionPool } from "./connectionPoolStub"
import {
	deleteStoredObject,
	toResourceContentKey,
	toStoredObjectKeys,
	toTopicPodcastEpisodeVideoCaptionsKey,
	toTopicPodcastEpisodeVideoChapterImageKey,
	toTopicPodcastEpisodeVideoChaptersKey,
	toTopicPodcastEpisodeVideoImageKey,
	toTopicPodcastEpisodeVideoImagePartKey,
	toTopicPodcastEpisodeVideoKeys,
} from "./store"

// save the endpoint the environment had
const restoreEnvSettings = saveEnvSettings(["S3_ENDPOINT"])

// put the pool, the spies, and the endpoint back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
	restoreEnvSettings()
})

// the resource content key is stable and namespaced by resource id, mirroring the attachment key layout
test("resourceContentKey namespaces content under the resource id", () => {
	expect(toResourceContentKey("abc123")).toBe("resources/abc123/content.md")
	expect(toResourceContentKey("abc123")).toBe(toResourceContentKey("abc123"))
})

// a row still uploading has no key yet, and the keys that exist are returned in order
// a film's keys sit under its podcast episode, and the parts drawn from the image name the image's hash
test("the film keys sit under the podcast episode's video folder", () => {
	expect(toTopicPodcastEpisodeVideoChaptersKey("episode-1")).toBe("episodes/episode-1/video/chapters.mp4")
	expect(toTopicPodcastEpisodeVideoCaptionsKey("episode-1")).toBe("episodes/episode-1/video/captions.vtt")
	expect(
		toTopicPodcastEpisodeVideoImagePartKey({ podcastEpisodeId: "episode-1", part: "sign-off", imageHash: "abc" }),
	).toBe("episodes/episode-1/video/sign-off-abc.mp4")
})

// a film row's keys leave out the parts not yet uploaded
test("toTopicPodcastEpisodeVideoKeys drops the keys not yet uploaded", () => {
	const topicPodcastEpisodeVideoKeys = toTopicPodcastEpisodeVideoKeys({
		introKey: "intro",
		chaptersKey: "chapters",
		signOffKey: null,
		filmKey: null,
		captionsKey: "captions",
		podcastEpisodeId: "episode-1",
		imageHash: null,
		chapterCount: 0,
	})
	expect(topicPodcastEpisodeVideoKeys).toEqual(["intro", "chapters", "captions"])
})

// a film with its own image lists the image's key under the film's folder
test("toTopicPodcastEpisodeVideoKeys lists the film's own image", () => {
	const topicPodcastEpisodeVideoKeys = toTopicPodcastEpisodeVideoKeys({
		introKey: null,
		chaptersKey: null,
		signOffKey: null,
		filmKey: "film",
		captionsKey: null,
		podcastEpisodeId: "episode-1",
		imageHash: "abc",
		chapterCount: 0,
	})
	expect(topicPodcastEpisodeVideoKeys).toEqual(["film", "episodes/episode-1/video/image-abc.jpg"])
	expect(toTopicPodcastEpisodeVideoImageKey("episode-1", "abc")).toBe("episodes/episode-1/video/image-abc.jpg")
})

// a film lists an imagined image's key for each chapter of its podcast episode, and a podcast episode with no film
// row lists none
test("toTopicPodcastEpisodeVideoKeys lists each chapter's imagined image under the film's folder", () => {
	const filmRow = { introKey: null, chaptersKey: null, signOffKey: null, filmKey: null, captionsKey: null }
	const topicPodcastEpisodeVideoKeys = toTopicPodcastEpisodeVideoKeys({
		...filmRow,
		podcastEpisodeId: "episode-1",
		imageHash: null,
		chapterCount: 2,
	})
	expect(topicPodcastEpisodeVideoKeys).toEqual([
		"episodes/episode-1/video/chapter-0-image.jpg",
		"episodes/episode-1/video/chapter-1-image.jpg",
	])
	expect(toTopicPodcastEpisodeVideoChapterImageKey("episode-1", 1)).toBe("episodes/episode-1/video/chapter-1-image.jpg")

	// no film row, so no chapter image
	const filmlessKeys = toTopicPodcastEpisodeVideoKeys({
		...filmRow,
		podcastEpisodeId: null,
		imageHash: null,
		chapterCount: 2,
	})
	expect(filmlessKeys).toEqual([])
})

test("toStoredObjectKeys keeps the keys and drops the nulls", () => {
	expect(toStoredObjectKeys([{ objectKey: "a" }, { objectKey: null }, { objectKey: "b" }])).toEqual(["a", "b"])
})

// a failed delete is logged, and the key's pending row keeps the failure with its next try pushed back
test("a failed delete leaves the key pending with its failure", async () => {
	// an unconfigured bucket, so the delete fails before it reaches storage, and a pool that records the writes
	Bun.env.S3_ENDPOINT = ""
	const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
	const sentQueries = stubConnectionPool()

	// the delete reports its failure and writes it to the pending row, and clears nothing
	expect(await deleteStoredObject("topics/topic-1/attachments/attachment-1/notes.pdf")).toBe(false)
	expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
	expect(sentQueries).toHaveLength(1)
	expect(sentQueries[0]?.text).toStartWith('update "pending_object_deletions"')
	expect(sentQueries[0]?.text).toContain("least(power(2,")
	expect(sentQueries[0]?.values).toContain("topics/topic-1/attachments/attachment-1/notes.pdf")
})

// a successful delete, of a present object or of one already gone, clears the key's pending row
test("a successful delete clears the key", async () => {
	// a configured bucket whose every delete succeeds
	Bun.env.S3_ENDPOINT = "https://bucket.example"
	Bun.env.S3_REGION ??= "auto"
	Bun.env.S3_BUCKET ??= "test"
	Bun.env.S3_ACCESS_KEY_ID ??= "key"
	Bun.env.S3_SECRET_ACCESS_KEY ??= "secret"
	spyOn(Bun.S3Client.prototype, "delete").mockResolvedValue(undefined)

	// a pool that records the writes
	const sentQueries = stubConnectionPool()

	// the delete succeeds and deletes the pending row alone
	expect(await deleteStoredObject("avatars/user-1/3f2a.png")).toBe(true)
	expect(sentQueries).toHaveLength(1)
	expect(sentQueries[0]?.text).toStartWith('delete from "pending_object_deletions"')
	expect(sentQueries[0]?.values).toEqual(["avatars/user-1/3f2a.png"])
})
