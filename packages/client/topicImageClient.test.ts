// image upload client tests: each upload returns its image with whether it is shown to its uploader alone, and leaves
// the flag out for an upload that is published
import { afterEach, expect, test } from "bun:test"
import { toTopicImageUrls } from "@carlnotes/contracts/topicImages"
import { configureApiClient } from "./apiClient"
import { stubFetch } from "./fetchTestFixtures"
import { uploadPodcastEpisodeImageBody, uploadTopicPodcastEpisodeVideoImageBody } from "./podcastEpisodeClient"
import { uploadTopicImageBody } from "./topicImageClient"
import { uploadTopicPostImageBody } from "./topicPostClient"

// restore the client and the transport after each test
const realFetch = globalThis.fetch
afterEach(() => {
	globalThis.fetch = realFetch
	configureApiClient({ apiBaseUrl: "", showError: () => {} })
})

test("a topic's, a podcast episode's, and a Topic Post's upload each return whether it is unchecked", async () => {
	const image = toTopicImageUrls("topic-1", "upload-hash")
	for (const uploadImageBody of [uploadTopicImageBody, uploadPodcastEpisodeImageBody, uploadTopicPostImageBody]) {
		// an unchecked upload returns the flag, and a published one leaves the flag out
		stubFetch(Response.json({ image, isImageUnchecked: true }))
		expect(await uploadImageBody("subject-1", new FormData())).toEqual({ image, isImageUnchecked: true })
		stubFetch(Response.json({ image }))
		expect(await uploadImageBody("subject-1", new FormData())).toEqual({ image })
	}
})

test("a film's image upload returns its poster with whether the upload is unchecked", async () => {
	const posterUrl = "/api/topic-podcast-episode-video-images/episode-1/upload-hash/poster.jpg"
	stubFetch(Response.json({ posterUrl, isImageUnchecked: true }))
	expect(await uploadTopicPodcastEpisodeVideoImageBody("episode-1", new FormData())).toEqual({
		posterUrl,
		isImageUnchecked: true,
	})

	// a published upload leaves the flag out
	stubFetch(Response.json({ posterUrl }))
	expect(await uploadTopicPodcastEpisodeVideoImageBody("episode-1", new FormData())).toEqual({ posterUrl })
})
