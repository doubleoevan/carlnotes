// topic action menu tests: the order of the topic page's editing options, who sees each, and their icons
import { expect, test } from "bun:test"
import { toPodcastEpisodeFixture } from "@carlnotes/contracts/podcastEpisodeTestFixtures"
import { toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { toEditOptions, toTopicActionLayout, toTopicActionOptions } from "./TopicActions"

// whether the user may edit the topic, whether its latest podcast episode has a ready film, and whether it has one
type ToTopicOptions = { canEdit: boolean; hasFilm: boolean; hasPodcastEpisode: boolean }

// a topic as its editor or a follower reads it, with its latest podcast episode and that podcast episode's film
function toTopic({ canEdit, hasFilm, hasPodcastEpisode }: ToTopicOptions): TopicResponse {
	const video = { videoUrl: "/api/episodes/episode-1/video.mp4", captionsUrl: "/api/episodes/episode-1/captions.vtt" }
	const podcastEpisode = toPodcastEpisodeFixture({ video: hasFilm ? video : null })
	const podcast = { topicPodcastEpisodeVideoSection: { podcastEpisode } }
	return toTestTopicResponse({
		canEdit,
		podcast: (hasFilm ? podcast : null) as TopicResponse["podcast"],
		latestPodcastEpisode: hasPodcastEpisode ? podcastEpisode : null,
	})
}

// the labels of the options the topic page gives the actions menu, and the dialogs its editing options open
function toTopicOptions(topic: TopicResponse): { optionLabels: string[]; openedDialogs: string[] } {
	const topicActionLayout = toTopicActionLayout({ topic, isSignedIn: true, isBookmarkedView: false, isJoinable: false })
	const noop = (): void => {}
	const openedDialogs: string[] = []
	const topicActionOptions = toTopicActionOptions({
		topic,
		isAdminUser: false,
		topicActionLayout,
		onAddTopicToTeam: noop,
		onShareTopic: noop,
		onToggleFollowTopic: noop,
		onRankHomeTopic: noop,
		onRankProfileTopic: noop,
		onEditTopic: () => openedDialogs.push("topic"),
		onEditTopicVideo: () => openedDialogs.push("film"),
		onEditPodcastEpisode: () => openedDialogs.push("podcast"),
		onDeleteTopic: noop,
	})

	// select each editing option, then read the labels
	for (const topicActionOption of topicActionOptions) {
		if (topicActionOption.label.startsWith("Edit")) {
			topicActionOption.onSelect()
		}
	}
	return { optionLabels: topicActionOptions.map((topicActionOption) => topicActionOption.label), openedDialogs }
}

test("a topic's editor gets Edit topic, Edit film, then Edit podcast between Share topic and Delete topic", () => {
	const { optionLabels, openedDialogs } = toTopicOptions(
		toTopic({ canEdit: true, hasFilm: true, hasPodcastEpisode: true }),
	)
	const shareIndex = optionLabels.indexOf("Share topic")
	expect(optionLabels.slice(shareIndex)).toEqual([
		"Share topic",
		"Edit topic",
		"Edit film",
		"Edit podcast",
		"Delete topic",
	])
	expect(openedDialogs).toEqual(["topic", "film", "podcast"])
})

test("Edit film needs a ready film, Edit podcast needs a podcast episode, and a follower gets neither", () => {
	const audioOnlyLabels = toTopicOptions(
		toTopic({ canEdit: true, hasFilm: false, hasPodcastEpisode: true }),
	).optionLabels
	expect(audioOnlyLabels).toContain("Edit podcast")
	expect(audioOnlyLabels).not.toContain("Edit film")
	const noPodcastLabels = toTopicOptions(
		toTopic({ canEdit: true, hasFilm: false, hasPodcastEpisode: false }),
	).optionLabels
	expect(noPodcastLabels).not.toContain("Edit podcast")
	const followerLabels = toTopicOptions(
		toTopic({ canEdit: false, hasFilm: true, hasPodcastEpisode: true }),
	).optionLabels
	expect(followerLabels.filter((optionLabel) => optionLabel.startsWith("Edit"))).toEqual([])
})

test("the editing options have the pencil, the clapperboard, and the mic on both pages", () => {
	const noop = (): void => {}
	const editOptions = toEditOptions({ onEditTopic: noop, onEditTopicVideo: noop, onEditPodcastEpisode: noop })
	expect(editOptions.map((editOption) => [editOption.label, editOption.Icon.displayName])).toEqual([
		["Edit topic", "Pencil"],
		["Edit film", "Clapperboard"],
		["Edit podcast", "Mic"],
	])
})
