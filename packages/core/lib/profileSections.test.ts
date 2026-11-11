// profile section tests: a rank dialog's pinned rows are the first cards, only a public topic's rows may be pinned,
// only the person's own action menu offers the pins, and the card sections end with one Topic Posts section
import { expect, test } from "bun:test"
import type {
	ProfilePodcastEpisodeCard,
	ProfileTopicCard,
	ProfileTopicPostCard,
} from "@carlnotes/contracts/profilePage"
import {
	PROFILE_SECTIONS,
	toProfilePodcastEpisodeRankItems,
	toProfileRankDialogItems,
	toProfileRankedNouns,
	toProfileTopicPostRankItems,
	toProfileTopicRankItems,
} from "./profileSections"
import {
	HOME_RANK_OPTION_LABELS,
	PROFILE_RANK_OPTION_LABELS,
	toHomeRankDialogLabels,
	toProfileRankDialogLabels,
} from "./rankDialog"

// a topic card with its name and whether its topic is public
function toProfileTopicCard(id: string, isPublic: boolean): ProfileTopicCard {
	return {
		id,
		name: `Topic ${id}`,
		path: `/topics/${id}`,
		image: null,
		tags: [],
		owner: null,
		teamLink: null,
		reactionCount: 0,
		latestPodcastEpisode: null,
		isPublic,
	}
}

test("the pinned topics are the first cards, and a private topic is no candidate", () => {
	const profileTopicRankItems = toProfileTopicRankItems({
		profileTopics: [toProfileTopicCard("a", true), toProfileTopicCard("b", true), toProfileTopicCard("c", false)],
		pinnedTopicCount: 1,
	})
	expect(profileTopicRankItems.pinnedItems).toEqual([{ id: "a", label: "Topic a" }])
	expect(profileTopicRankItems.candidateItems.map((candidateItem) => candidateItem.id)).toEqual(["a", "b"])
})

// a podcast episode card or a film card with its title and whether its topic is public. the tests read only the fields
// below
const toProfilePodcastEpisodeCard = (id: string, isTopicPublic: boolean): ProfilePodcastEpisodeCard =>
	({
		podcastEpisode: { id, title: `Episode ${id}` },
		topic: { id: `topic-${id}`, name: "Home espresso", path: "/topics/t", image: null },
		isTopicPublic,
	}) as ProfilePodcastEpisodeCard

// a profile with no card in any section
const EMPTY_PROFILE_CARDS = {
	profileTopics: [],
	pinnedTopicCount: 0,
	profileTopicPodcastEpisodeVideos: [],
	pinnedTopicPodcastEpisodeVideoCount: 0,
	profilePodcastEpisodes: [],
	pinnedPodcastEpisodeCount: 0,
	profileTopicPosts: [],
	pinnedTopicPostCount: 0,
}

test("a podcast episode is named by its title and its topic, and only a public topic's is a candidate", () => {
	const profilePodcastEpisodeRankItems = toProfilePodcastEpisodeRankItems({
		profilePodcastEpisodes: [toProfilePodcastEpisodeCard("1", true), toProfilePodcastEpisodeCard("2", false)],
		pinnedPodcastEpisodeCount: 0,
	})
	expect(profilePodcastEpisodeRankItems.pinnedItems).toEqual([])
	expect(profilePodcastEpisodeRankItems.candidateItems).toEqual([{ id: "1", label: "Episode 1 · Home espresso" }])
})

test("the films dialog holds twelve pins, the pinned films first, and only a public topic's film is a candidate", () => {
	// one pinned film, then a private topic's film and a public topic's
	const profileRankDialogItems = toProfileRankDialogItems("films", {
		...EMPTY_PROFILE_CARDS,
		profileTopicPodcastEpisodeVideos: [
			toProfilePodcastEpisodeCard("1", true),
			toProfilePodcastEpisodeCard("2", false),
			toProfilePodcastEpisodeCard("3", true),
		],
		pinnedTopicPodcastEpisodeVideoCount: 1,
	})
	expect(profileRankDialogItems.limit).toBe(12)
	expect(profileRankDialogItems.pinnedItems).toEqual([{ id: "1", label: "Episode 1 · Home espresso" }])
	expect(profileRankDialogItems.candidateItems.map((candidateItem) => candidateItem.id)).toEqual(["1", "3"])

	// the dialog's words say films
	expect(toProfileRankDialogLabels("films")).toMatchObject({
		title: "Featured films",
		emptyText: "No featured films yet.",
		addLabel: "Add a film",
	})
})

test("only the person's own action menu offers the pins, Featured films right before Featured podcasts", () => {
	const ownOptionLabels = toProfileRankedNouns(true).map((rankedNoun) => PROFILE_RANK_OPTION_LABELS[rankedNoun])
	expect(ownOptionLabels).toEqual(["Featured topics", "Featured films", "Featured podcasts", "Featured posts"])
	expect(toProfileRankedNouns(false)).toEqual([])
})

// a Topic Post card with its title and whether its topic is public. the tests read only the fields below
const toProfileTopicPostCard = (id: string, isTopicPublic: boolean): ProfileTopicPostCard =>
	({ id, title: `Post ${id}`, topicName: "Home espresso", isTopicPublic }) as ProfileTopicPostCard

test("the pinned Topic Posts are the first cards, and every post of a public topic is a candidate", () => {
	// the cards hold the pinned post, then every other post newest first
	const profileTopicPostRankItems = toProfileTopicPostRankItems({
		profileTopicPosts: [
			toProfileTopicPostCard("1", true),
			toProfileTopicPostCard("3", false),
			toProfileTopicPostCard("2", true),
		],
		pinnedTopicPostCount: 1,
	})
	expect(profileTopicPostRankItems.pinnedItems).toEqual([{ id: "1", label: "Post 1 · Home espresso" }])
	expect(profileTopicPostRankItems.candidateItems.map((candidateItem) => candidateItem.id)).toEqual(["1", "2"])
})

test("a profile's card sections end with the Topic Posts, with no second Topic Post section", () => {
	expect(Object.keys(PROFILE_SECTIONS)).toEqual([
		"profileTopics",
		"profileTopicPodcastEpisodeVideos",
		"profilePodcastEpisodes",
		"profileTopicPosts",
	])
	expect(PROFILE_SECTIONS.profileTopicPosts.title).toBe("Featured Posts")
})

test("the posts dialog has no limit and words itself for posts, on a profile and on the home", () => {
	const profileRankDialogItems = toProfileRankDialogItems("posts", EMPTY_PROFILE_CARDS)
	expect(profileRankDialogItems).toEqual({ pinnedItems: [], candidateItems: [] })

	// the profile's words and the home's
	expect(toProfileRankDialogLabels("posts")).toMatchObject({ title: "Featured posts", addLabel: "Add a post" })
	expect(toHomeRankDialogLabels("posts")).toMatchObject({ title: "Home posts", emptyText: "No home posts." })
	expect(HOME_RANK_OPTION_LABELS.posts).toBe("Home posts")
})
