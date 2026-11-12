// topic action menu tests: where Edit film sits among the topic page's options, and who sees it
import { expect, test } from "bun:test"
import { toPodcastEpisodeFixture } from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import { toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { toEditTopicPodcastEpisodeVideoOption, toTopicActionLayout, toTopicActionOptions } from "./TopicActions"

// a topic whose latest podcast episode has a ready film, or none, as its editor or as a follower reads it
function toTopic({ canEdit, hasFilm }: { canEdit: boolean; hasFilm: boolean }): TopicResponse {
	const video = { videoUrl: "/api/episodes/episode-1/video.mp4", captionsUrl: "/api/episodes/episode-1/captions.vtt" }
	const podcast = {
		topicPodcastEpisodeVideoSection: { podcastEpisode: toPodcastEpisodeFixture({ video }) },
	}
	return toTestTopicResponse({ canEdit, podcast: (hasFilm ? podcast : null) as TopicResponse["podcast"] })
}

// the labels of the options the topic page gives the actions menu, and the option Edit film selected
function toOptionLabels(topic: TopicResponse, onEditTopicPodcastEpisodeVideo = () => {}): string[] {
	const topicActionLayout = toTopicActionLayout({ topic, isSignedIn: true, isBookmarkedView: false, isJoinable: false })
	const noop = (): void => {}
	const topicActionOptions = toTopicActionOptions({
		topic,
		isAdminUser: false,
		topicActionLayout,
		onAddTopicToTeam: noop,
		onShareTopic: noop,
		onToggleFollowTopic: noop,
		onRankHomeTopic: noop,
		onRankProfileTopic: noop,
		onEditTopicPodcastEpisodeVideo,
		onEditTopic: noop,
		onDeleteTopic: noop,
	})
	topicActionOptions.find((topicActionOption) => topicActionOption.label === "Edit film")?.onSelect()
	return topicActionOptions.map((topicActionOption) => topicActionOption.label)
}

test("Edit film sits right after Share topic and right above Edit topic for a topic's editor", () => {
	let editCount = 0
	const optionLabels = toOptionLabels(toTopic({ canEdit: true, hasFilm: true }), () => {
		editCount += 1
	})
	const shareIndex = optionLabels.indexOf("Share topic")
	expect(optionLabels.slice(shareIndex, shareIndex + 3)).toEqual(["Share topic", "Edit film", "Edit topic"])
	expect(editCount).toBe(1)
})

test("a topic with no film, and a user who may not edit the topic, get no Edit film", () => {
	expect(toOptionLabels(toTopic({ canEdit: true, hasFilm: false }))).not.toContain("Edit film")
	expect(toOptionLabels(toTopic({ canEdit: false, hasFilm: true }))).not.toContain("Edit film")
})

test("the Edit film option has the clapperboard icon and the film's label on both pages", () => {
	const editTopicPodcastEpisodeVideoOption = toEditTopicPodcastEpisodeVideoOption(() => {})
	expect(editTopicPodcastEpisodeVideoOption.label).toBe("Edit film")
	expect(editTopicPodcastEpisodeVideoOption.Icon.displayName).toBe("Clapperboard")
})
