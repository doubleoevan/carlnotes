// a podcast episode's play token: it names its caller for its own episode until it expires, and the audio route reads
// it in place of a session
import { afterEach, beforeEach, expect, mock, spyOn, test } from "bun:test"
import { PLAY_TOKEN_LIFETIME_MS, readPlayToken, toPlayToken } from "./playTokens"
import * as podcastEpisodeRows from "./podcastEpisodeRows"
import { podcastEpisodesRoute } from "./podcastEpisodes"

// the auth secret the tokens sign with
beforeEach(() => {
	Bun.env.BETTER_AUTH_SECRET = "test-secret"
})

// put the spies back after each test
afterEach(() => {
	mock.restore()
})

test("a token names its user for its own episode, and a visitor's names none", () => {
	const playToken = toPlayToken({ podcastEpisodeId: "episode-1", userId: "user-1" })
	expect(readPlayToken({ playToken, podcastEpisodeId: "episode-1" })).toEqual({ userId: "user-1" })
	const visitorPlayToken = toPlayToken({ podcastEpisodeId: "episode-1", userId: null })
	expect(readPlayToken({ playToken: visitorPlayToken, podcastEpisodeId: "episode-1" })).toEqual({ userId: null })
})

test("a token for another episode, an expired token, and a forged one name no caller", () => {
	// another episode's token
	const playToken = toPlayToken({ podcastEpisodeId: "episode-1", userId: "user-1" })
	expect(readPlayToken({ playToken, podcastEpisodeId: "episode-2" })).toBeNull()

	// the same token a day and a second later
	const afterExpiry = Date.now() + PLAY_TOKEN_LIFETIME_MS + 1000
	expect(readPlayToken({ playToken, podcastEpisodeId: "episode-1" }, afterExpiry)).toBeNull()

	// the token with another user written in
	const forgedPlayToken = playToken.replace(".user-1.", ".user-2.")
	expect(readPlayToken({ playToken: forgedPlayToken, podcastEpisodeId: "episode-1" })).toBeNull()
	expect(readPlayToken({ playToken: "not-a-token", podcastEpisodeId: "episode-1" })).toBeNull()
})

test("the audio route reads the episode as the token's user, and a bad token reads as missing", async () => {
	// no episode is found, so the route stops after the access read
	const loadAccessiblePodcastEpisodeSpy = spyOn(podcastEpisodeRows, "loadAccessiblePodcastEpisode").mockResolvedValue(
		null,
	)

	// a valid token reads the episode under its user's access
	const playToken = toPlayToken({ podcastEpisodeId: "episode-1", userId: "user-1" })
	await podcastEpisodesRoute.request(`/episodes/episode-1/audio.mp3?play=${encodeURIComponent(playToken)}`)
	expect(loadAccessiblePodcastEpisodeSpy).toHaveBeenCalledWith({ userId: "user-1", podcastEpisodeId: "episode-1" })

	// another episode's token responds 404 and reads nothing
	const otherEpisodeResponse = await podcastEpisodesRoute.request(
		`/episodes/episode-2/audio.mp3?play=${encodeURIComponent(playToken)}`,
	)
	expect(otherEpisodeResponse.status).toBe(404)
	expect(loadAccessiblePodcastEpisodeSpy).toHaveBeenCalledTimes(1)
})
