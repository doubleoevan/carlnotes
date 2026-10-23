// the site search's invented results: one row of every kind, and a page of them
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import type { SearchResultsPage, SearchRow } from "@carlnotes/contracts/search"
import { STORY_USER } from "../fixtures"
import { LATEST_PODCAST_EPISODE_FIXTURE } from "./podcastEpisodes"
import { STORY_TEAMS } from "./teams"
import { toStoryTopicFinding } from "./topicFeed"

// the home espresso topic's latest podcast episode, whose second chapter narrates the grinder burrs finding
const GRINDER_BURRS_PODCAST_EPISODE: PodcastEpisode = {
	...LATEST_PODCAST_EPISODE_FIXTURE,
	chapterCount: 2,
	topicId: "topic-home-espresso",
	topicVisibility: "public",
	status: "published",
	audioUrl: `/api/episodes/${LATEST_PODCAST_EPISODE_FIXTURE.id}/audio.mp3`,
	coverUrl: null,
	smallCoverUrl: null,
	chapters: [
		{
			position: 0,
			title: "Dialing in",
			findingId: null,
			sourceUrl: "https://example.com/dialing-in",
			rating: null,
			faviconPath: null,
			startSeconds: 0,
			endSeconds: 300,
		},
		{
			position: 1,
			title: "Burrs, measured",
			findingId: "finding-grinder-burrs",
			sourceUrl: "https://example.com/grinder-burrs",
			rating: null,
			faviconPath: null,
			startSeconds: 300,
			endSeconds: 600,
		},
	],
	progressSeconds: 0,
	isCompleted: false,
	isVoiceChatConfigured: true,
}

/** One search row of every kind, in the order the search ranks kinds. */
export const SEARCH_ROW_FIXTURES: SearchRow[] = [
	{
		kind: "topic",
		id: "topic-home-espresso",
		name: "Home espresso",
		path: "/topics/topic-home-espresso/home-espresso",
		date: "2026-05-18T12:00:00.000Z",
		count: 214,
		topic: { id: "topic-home-espresso", name: "Home espresso", latestPodcastEpisode: LATEST_PODCAST_EPISODE_FIXTURE },
		subscriberCount: 31,
		isSubscribed: false,
	},
	{
		kind: "podcastEpisode",
		id: LATEST_PODCAST_EPISODE_FIXTURE.id,
		name: LATEST_PODCAST_EPISODE_FIXTURE.title ?? "",
		path: LATEST_PODCAST_EPISODE_FIXTURE.pagePath ?? "",
		date: LATEST_PODCAST_EPISODE_FIXTURE.publishedAt,
		count: 38,
		podcastEpisode: LATEST_PODCAST_EPISODE_FIXTURE,
		topic: { id: "topic-home-espresso", name: "Home espresso" },
	},
	{
		kind: "finding",
		id: "finding-grinder-burrs",
		name: "Espresso grinder burrs, measured",
		path: "/topics/topic-home-espresso/home-espresso",
		date: "2026-09-28T12:00:00.000Z",
		count: 12,
		finding: toStoryTopicFinding({
			findingId: "finding-grinder-burrs",
			url: "https://example.com/grinder-burrs",
			title: "Espresso grinder burrs, measured",
			relevanceExplanation: "Measured burr alignment explains the uneven shots the topic keeps asking about.",
			viewCount: 12,
		}),
		topic: {
			id: "topic-home-espresso",
			name: "Home espresso",
			prompt: "Home espresso gear and technique",
			visibility: "public",
			canRate: false,
			canBookmark: false,
		},
	},
	{
		kind: "team",
		id: STORY_TEAMS.designGuild.teamId,
		name: STORY_TEAMS.designGuild.name,
		path: `/teams/${STORY_TEAMS.designGuild.teamId}`,
		date: null,
		count: null,
		team: STORY_TEAMS.designGuild,
		topicCount: 4,
		memberCount: 12,
	},
	{
		kind: "user",
		id: STORY_USER.userId,
		name: STORY_USER.username,
		path: `/profiles/${STORY_USER.userId}`,
		date: null,
		count: null,
		user: { userId: STORY_USER.userId, username: STORY_USER.username, avatarSource: null, avatarVersion: null },
	},
]

/** The first page of a search with twelve results, ten a page. */
export const SEARCH_PAGE_FIXTURE: SearchResultsPage = {
	rows: [...SEARCH_ROW_FIXTURES, ...SEARCH_ROW_FIXTURES].map((searchRow, i) => ({
		...searchRow,
		id: `${searchRow.id}-${i}`,
	})),
	rowCount: 12,
	page: 1,
	pageCount: 2,
	pageSize: 10,
	podcastEpisodes: [GRINDER_BURRS_PODCAST_EPISODE],
}
