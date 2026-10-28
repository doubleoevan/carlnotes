import { expect, test } from "bun:test"
import { shouldLoadYoutubePlayerUrl, YOUTUBE_PLAYER_BASE_URL } from "./youtubePlayer"

test("the player keeps its document and embedded playback inside the app", () => {
	for (const href of [
		YOUTUBE_PLAYER_BASE_URL,
		`${YOUTUBE_PLAYER_BASE_URL}?data=player-settings`,
		"about:blank",
		"https://www.youtube.com/embed/lbLwYWAfhFE?autoplay=1&playsinline=1",
		"https://www.youtube-nocookie.com/embed/lbLwYWAfhFE",
	]) {
		expect(shouldLoadYoutubePlayerUrl(href)).toBe(true)
	}
})

test("watch links, app intents, and lookalike hosts cannot replace inline playback", () => {
	for (const href of [
		"https://www.youtube.com/watch?v=lbLwYWAfhFE",
		"https://youtu.be/lbLwYWAfhFE",
		"vnd.youtube:lbLwYWAfhFE",
		"intent://www.youtube.com/watch?v=lbLwYWAfhFE#Intent;scheme=https;end",
		"https://www.youtube.com.example.com/embed/video",
		"https://www.youtube.com@other.example/embed/video",
		"https://lonelycpp.github.io/react-native-youtube-iframe/iframe.html/other",
		"http://www.youtube.com/embed/video",
		"javascript:alert(1)",
		"not a URL",
	]) {
		expect(shouldLoadYoutubePlayerUrl(href)).toBe(false)
	}
})
