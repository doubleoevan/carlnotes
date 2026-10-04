// page head tests: the heads of a topic page, a podcast episode page, a team page, an invite page, and a profile page
import { expect, test } from "bun:test"

// a show cover's url is signed with the app's auth secret
Bun.env.BETTER_AUTH_SECRET ??= "page-head-test-secret"

import {
	toInvitePageHead,
	toPodcastEpisodePageHead,
	toProfilePageHead,
	toTeamPageHead,
	toTopicPageHead,
} from "./pageHead"
import type { TopicPreview } from "./topicImage"

// a public topic's preview as toTopicPreview returns it
const TOPIC_PREVIEW: TopicPreview = {
	topicId: "t1",
	title: "Agents",
	visibility: "public",
	ownerUserId: "u1",
	ownerUsername: "carl",
	ownerAvatar: null,
	keptCount: 4,
	sourceCount: 2,
	description: "What agents are shipping this week.",
}

// a public topic's head includes its structured data. the document title names the site and the card does not
test("toTopicPageHead names the topic, its card, and its structured data", () => {
	const head = toTopicPageHead({
		topicPreview: TOPIC_PREVIEW,
		appUrl: "https://carlnotes.com",
		jsonLd: { "@type": "CreativeWork" },
	})

	// the page's titles, description, and urls
	expect(head.title).toBe("Agents — CarlNotes")
	expect(head.cardTitle).toBe("Agents")
	expect(head.description).toBe("What agents are shipping this week.")
	expect(head.canonicalUrl).toBe("https://carlnotes.com/topics/t1/agents")
	expect(head.imageUrl).toStartWith("https://carlnotes.com/api/topics/t1/preview.png?v=")

	// a public topic is indexed and names its feed and its structured data
	expect(head.isIndexed).toBe(true)
	expect(head.feedUrl).toBe("https://carlnotes.com/topics/t1/feed.xml")
	expect(head.jsonLd).toEqual({ "@type": "CreativeWork" })
})

// the platforms cache a card by its url, so a card that changes has to move to a new url
test("toTopicPageHead names a new card version once the topic is retitled, and the same one otherwise", () => {
	const toImageUrl = (topicPreview: TopicPreview): string =>
		toTopicPageHead({ topicPreview, appUrl: "https://carlnotes.com", jsonLd: null }).imageUrl
	expect(toImageUrl({ ...TOPIC_PREVIEW, title: "Agents at work" })).not.toBe(toImageUrl(TOPIC_PREVIEW))
	expect(toImageUrl({ ...TOPIC_PREVIEW })).toBe(toImageUrl(TOPIC_PREVIEW))
})

// a private topic's head keeps its card and has no structured data
test("toTopicPageHead gives a private topic its card and no structured data", () => {
	const head = toTopicPageHead({
		topicPreview: { ...TOPIC_PREVIEW, visibility: "private" },
		appUrl: "https://carlnotes.com",
		jsonLd: null,
	})
	expect(head.jsonLd).toBeNull()
	expect(head.cardTitle).toBe("Agents")

	// a private topic is never indexed, names no canonical url or feed, and still has its card url for a shared link
	expect(head.isIndexed).toBe(false)
	expect(head.canonicalUrl).toBeNull()
	expect(head.feedUrl).toBeNull()
	expect(head.cardUrl).toBe("https://carlnotes.com/topics/t1/agents")
})

// a team's head includes its own card, name, canonical url, and the counts its description reads
test("toTeamPageHead writes the team's card and counts", () => {
	const head = toTeamPageHead(
		{ teamId: "tm1", name: "Raccoon Crew", avatar: null, memberCount: 1, topicCount: 3 },
		"https://carlnotes.com",
	)

	// the card image, the canonical url, the description's counts, and the card title
	expect(head.imageUrl).toStartWith("https://carlnotes.com/api/teams/tm1/preview.png?v=")
	expect(head.canonicalUrl).toBe("https://carlnotes.com/teams/tm1")
	expect(head.description).toBe("Raccoon Crew on CarlNotes. 1 member, 3 public topics.")
	expect(head.cardTitle).toBe("Raccoon Crew — CarlNotes")
})

// an invitation names its action. a team is joined and a topic is followed
test("toInvitePageHead titles a team invitation 'Join' and a topic invitation 'Follow'", () => {
	const inviteUrls = { imageUrl: "https://carlnotes.com/card.png", inviteUrl: "https://carlnotes.com/invite/t0k3n" }
	const teamInviteHead = toInvitePageHead({ ...inviteUrls, name: "Raccoon Crew", kind: "team" })
	const topicInviteHead = toInvitePageHead({ ...inviteUrls, name: "Espresso Machines", kind: "topic" })

	// a team is joined, and a topic is followed, in the title and in the description alike
	expect(teamInviteHead.title).toBe("Join Raccoon Crew on CarlNotes")
	expect(teamInviteHead.description).toContain("You are invited to join Raccoon Crew.")
	expect(topicInviteHead.title).toBe("Follow Espresso Machines on CarlNotes")
	expect(topicInviteHead.description).toContain("You are invited to follow Espresso Machines.")

	// a token is a credential, so its page is never indexed and its card url is the invite url
	expect(topicInviteHead.isIndexed).toBe(false)
	expect(topicInviteHead.canonicalUrl).toBeNull()
	expect(topicInviteHead.cardUrl).toBe("https://carlnotes.com/invite/t0k3n")
})

// a profile's head includes its card, canonical url, and the counts its description reads
test("toProfilePageHead writes the profile's card and counts", () => {
	const head = toProfilePageHead(
		{ userId: "u1", username: "carl", avatar: null, publicTopicCount: 1, followerCount: 2 },
		"https://carlnotes.com",
	)

	// the card image, the canonical url, and the description's counts
	expect(head.imageUrl).toStartWith("https://carlnotes.com/api/profiles/u1/preview.png?v=")
	expect(head.canonicalUrl).toBe("https://carlnotes.com/profiles/u1")
	expect(head.description).toBe("carl on CarlNotes. 1 public topic, 2 followers.")
})

// a team or a profile with no public topic is not indexed
test("toTeamPageHead and toProfilePageHead leave a page with no public topic unindexed", () => {
	const teamHead = toTeamPageHead(
		{ teamId: "tm1", name: "Raccoon Crew", avatar: null, memberCount: 1, topicCount: 0 },
		"https://carlnotes.com",
	)
	const profileHead = toProfilePageHead(
		{ userId: "u1", username: "carl", avatar: null, publicTopicCount: 0, followerCount: 2 },
		"https://carlnotes.com",
	)

	// neither is indexed or names a canonical url
	expect(teamHead.isIndexed).toBe(false)
	expect(teamHead.canonicalUrl).toBeNull()
	expect(profileHead.isIndexed).toBe(false)
	expect(profileHead.canonicalUrl).toBeNull()

	// both keep their card for a shared link
	expect(teamHead.cardUrl).toBe("https://carlnotes.com/teams/tm1")
	expect(profileHead.cardUrl).toBe("https://carlnotes.com/profiles/u1")
})

// a public topic that is not yet shown is not indexed
test("toTopicPageHead leaves a public topic with too few findings unindexed", () => {
	const head = toTopicPageHead({
		topicPreview: { ...TOPIC_PREVIEW, keptCount: 2 },
		appUrl: "https://carlnotes.com",
		jsonLd: null,
	})

	// the page names no canonical url and keeps its feed and its card
	expect(head.isIndexed).toBe(false)
	expect(head.canonicalUrl).toBeNull()
	expect(head.feedUrl).toBe("https://carlnotes.com/topics/t1/feed.xml")
	expect(head.cardUrl).toBe("https://carlnotes.com/topics/t1/agents")
})

// a published podcast episode of the public topic, as the episode page's head reads it
const PODCAST_EPISODE_ROW = {
	id: "episode-1",
	topicId: "t1",
	scanId: "scan-1",
	status: "published" as const,
	title: "Agents ship, and the evals follow",
	description: "What shipped this week and why the evals matter.",
	season: 2026,
	episodeNumber: 14,
	audioKey: "episodes/episode-1/audio.mp3",
	audioByteSize: 3_520_000,
	durationSeconds: 1690,
	publishedAt: new Date("2026-10-01T09:00:00Z"),
}

// a podcast episode page's head names its own title and description, its card, its audio, and its structured data
test("toPodcastEpisodePageHead names the episode, its card, its audio, and valid PodcastEpisode data", () => {
	// the head of the podcast episode's page, and the page's url
	const head = toPodcastEpisodePageHead({
		topicPreview: TOPIC_PREVIEW,
		podcastEpisodeRow: PODCAST_EPISODE_ROW,
		appUrl: "https://carlnotes.com",
	})
	const podcastEpisodeUrl = "https://carlnotes.com/topics/t1/agents/episodes/2026/14"

	// the title, the description, and the canonical url of an indexed page
	expect(head.title).toBe("Agents ship, and the evals follow · Agents — CarlNotes")
	expect(head.description).toBe("What shipped this week and why the evals matter.")
	expect(head.canonicalUrl).toBe(podcastEpisodeUrl)
	expect(head.isIndexed).toBe(true)

	// the podcast episode's own card image, whose url changes with its title, then the audio and the topic's podcast feed
	const retitledHead = toPodcastEpisodePageHead({
		topicPreview: TOPIC_PREVIEW,
		podcastEpisodeRow: { ...PODCAST_EPISODE_ROW, title: "A new title" },
		appUrl: "https://carlnotes.com",
	})
	expect(head.imageUrl).toStartWith("https://carlnotes.com/api/episodes/episode-1/preview.png?v=")
	expect(retitledHead.imageUrl).not.toBe(head.imageUrl)
	expect(head.audioUrl).toBe("https://carlnotes.com/api/episodes/episode-1/audio.mp3")
	expect(head.podcastFeedUrl).toBe("https://carlnotes.com/topics/t1/podcast.xml")

	// the structured data survives a round trip through JSON and has what a PodcastEpisode requires
	const jsonLd = JSON.parse(JSON.stringify(head.jsonLd))
	expect(jsonLd).toMatchObject({
		"@type": "PodcastEpisode",
		name: "Agents ship, and the evals follow",
		url: podcastEpisodeUrl,
		datePublished: "2026-10-01T09:00:00.000Z",
		duration: "PT28M10S",
		episodeNumber: 14,
		partOfSeason: { "@type": "PodcastSeason", seasonNumber: 2026 },
		associatedMedia: { contentUrl: "https://carlnotes.com/api/episodes/episode-1/audio.mp3" },
		partOfSeries: { "@type": "PodcastSeries", webFeed: "https://carlnotes.com/topics/t1/podcast.xml" },
	})
})

// a public topic that is not shown yet keeps its podcast episode pages out of search, like its own page
test("toPodcastEpisodePageHead leaves an episode of a topic that is not yet shown unindexed", () => {
	const head = toPodcastEpisodePageHead({
		topicPreview: { ...TOPIC_PREVIEW, keptCount: 0 },
		podcastEpisodeRow: PODCAST_EPISODE_ROW,
		appUrl: "https://carlnotes.com",
	})
	expect(head.isIndexed).toBe(false)
	expect(head.canonicalUrl).toBeNull()
})
