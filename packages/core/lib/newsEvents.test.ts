// what a row of the news says, what its play button plays, and which row has the Video button
import { expect, test } from "bun:test"
import { type NewsEvent, toEmptyNewsText } from "@carlnotes/contracts/news"
import { toCommentFirstLine } from "@carlnotes/contracts/socialText"
import {
	toNewsEventDetailsTexts,
	toNewsEventPodcastEpisode,
	toNewsEventText,
	toNewsEventVideoButton,
} from "./newsEvents"
import { toNewsStoryPage } from "./newsStories"
import { PODCAST_STORY_EPISODE, PODCAST_STORY_FILM_EPISODE } from "./podcastEpisodeStories"

// the story's first rows, which hold one row of each kind
const STORY_ROWS = toNewsStoryPage(1).newsEvents

// the story's row of a kind
const toStoryRow = (kind: NewsEvent["kind"]): NewsEvent => {
	const storyRow = STORY_ROWS.find((newsEvent) => newsEvent.kind === kind)
	if (!storyRow) {
		throw new Error(`the story holds no ${kind} row`)
	}
	return storyRow
}

test("each kind of row reads as its own line", () => {
	expect(toNewsEventText(toStoryRow("podcastEpisode"), null)).toBe("Grinders, scales, and the pour")
	expect(toNewsEventText(toStoryRow("topicPost"), null)).toBe("Evan posted Why I weigh every shot")
	expect(toNewsEventText(toStoryRow("finding"), null)).toBe("Why pressure profiling changes espresso")
	expect(toNewsEventText(toStoryRow("comment"), null)).toStartWith("RoastFan: https://example.com/burrs says")
})

test("a Podcast Episode's line is its search result's, and every other row names its Topic", () => {
	const podcastEpisodeRow = toStoryRow("podcastEpisode")
	expect(toNewsEventDetailsTexts(podcastEpisodeRow, "2 hours ago")).toEqual(["Podcast", "2 hours ago", "14 listeners"])
	expect(toNewsEventDetailsTexts({ ...podcastEpisodeRow, listenerCount: 1 }, "just now")).toEqual([
		"Podcast",
		"just now",
		"1 listener",
	])
	expect(toNewsEventDetailsTexts(toStoryRow("finding"), "2 hours ago")).toEqual(["Home espresso", "2 hours ago"])
})

test("a Comment with no user is Carl's", () => {
	expect(toNewsEventText({ ...toStoryRow("comment"), actor: null, text: "Noted." }, null)).toBe("Carl: Noted.")
})

test("the reactions on the reader's own Comment read as theirs, and on another's by name", () => {
	const commentReactionsRow = toStoryRow("reaction")
	expect(toNewsEventText(commentReactionsRow, "user-evan")).toBe("12 reactions on your hot take")
	expect(toNewsEventText(commentReactionsRow, "user-roastfan")).toBe("12 reactions on Evan's hot take")
	expect(toNewsEventText({ ...commentReactionsRow, reactionCount: 1 }, null)).toBe("1 reaction on Evan's hot take")
})

test("one reaction names who reacted and what to", () => {
	const reactionRow = {
		...toStoryRow("reaction"),
		reactionCount: null,
		reactionType: "like" as const,
		actor: { userId: "user-roastfan", username: "RoastFan" },
	}
	expect(toNewsEventText(reactionRow, null)).toBe("RoastFan reacted to Home espresso")
	expect(toNewsEventText({ ...reactionRow, title: "Dialing in" }, null)).toBe("RoastFan reacted to Dialing in")
})

test("a Podcast Episode's row plays its own episode, and a Finding's row the episode that narrates it", () => {
	const podcastEpisodes = [PODCAST_STORY_EPISODE]
	expect(toNewsEventPodcastEpisode(toStoryRow("podcastEpisode"), podcastEpisodes)).toBe(PODCAST_STORY_EPISODE)
	expect(toNewsEventPodcastEpisode(toStoryRow("finding"), podcastEpisodes)).toBe(PODCAST_STORY_EPISODE)

	// a Finding no chapter narrates, and a row of any other kind, play nothing
	const unnarratedFindingRow = { ...toStoryRow("finding"), findingId: "finding-with-no-chapter" }
	expect(toNewsEventPodcastEpisode(unnarratedFindingRow, podcastEpisodes)).toBeNull()
	expect(toNewsEventPodcastEpisode(toStoryRow("comment"), podcastEpisodes)).toBeNull()
})

test("only a Podcast Episode's row with a film has the Video button, which reports where the news shows", () => {
	// the home's news shows the button as a pill and reports the home's news
	const podcastEpisodeRow = toStoryRow("podcastEpisode")
	const homeVideoButton = toNewsEventVideoButton({
		newsEvent: podcastEpisodeRow,
		podcastEpisode: PODCAST_STORY_FILM_EPISODE,
		place: "home",
	})
	expect(homeVideoButton).toEqual({
		podcastEpisode: PODCAST_STORY_FILM_EPISODE,
		label: "Video",
		surface: "home-news",
		size: "pill",
	})

	// a profile's news reports its own section
	const profileVideoButton = toNewsEventVideoButton({
		newsEvent: podcastEpisodeRow,
		podcastEpisode: PODCAST_STORY_FILM_EPISODE,
		place: "profile",
	})
	expect(profileVideoButton?.surface).toBe("profile-news")

	// a Podcast Episode with no film, a row with no Podcast Episode, and a Finding's row have none
	const filmOptions = { podcastEpisode: PODCAST_STORY_FILM_EPISODE, place: "home" as const }
	expect(toNewsEventVideoButton({ ...filmOptions, newsEvent: podcastEpisodeRow, podcastEpisode: null })).toBeNull()
	expect(toNewsEventVideoButton({ ...filmOptions, newsEvent: toStoryRow("finding") })).toBeNull()
	expect(
		toNewsEventVideoButton({ ...filmOptions, newsEvent: podcastEpisodeRow, podcastEpisode: PODCAST_STORY_EPISODE }),
	).toBeNull()
})

test("the news's words: an empty window and a Comment's first line", () => {
	expect(toEmptyNewsText("hour")).toBe("A quiet hour. Carl kept the kettle on.")
	expect(toCommentFirstLine("first line\nsecond line")).toBe("first line")
	expect(toCommentFirstLine("a".repeat(200))).toHaveLength(140)
})
