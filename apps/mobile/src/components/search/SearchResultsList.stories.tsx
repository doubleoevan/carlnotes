import type { SearchResultsPage } from "@carlnotes/contracts/search"
import { toTestTopicFinding } from "@carlnotes/contracts/topicFeedTestFixtures"
import type { Meta, StoryObj } from "@storybook/react-native"
import { ScrollView } from "react-native"
import { STORY_TOPIC_FEED_HANDLERS } from "@/components/topic/topicFeedStories"
import { STORY_PODCAST_EPISODE } from "@/components/topic/topicPageStories"
import { SearchResultsList } from "./SearchResultsList"

// the mixed result fixture shares real finding and podcast contracts
const topic = { id: "topic-1", name: "Coffee for two", latestPodcastEpisode: STORY_PODCAST_EPISODE }
const row = {
	id: "coffee-0",
	name: "Better beans, better mornings",
	path: "/topics/coffee",
	date: "2026-10-25T12:00:00Z",
	count: 3,
}
export const STORY_SEARCH_RESULTS_PAGE: SearchResultsPage = {
	page: 1,
	pageSize: 10,
	pageCount: 1,
	rowCount: 5,
	podcastEpisodes: [STORY_PODCAST_EPISODE],
	rows: [
		{
			...row,
			kind: "finding",
			finding: toTestTopicFinding({ findingId: row.id, title: row.name }),
			topic: { ...topic, prompt: "Find better coffee", visibility: "public", canRate: true, canBookmark: true },
		},
		{ ...row, id: topic.id, name: topic.name, kind: "topic", topic, subscriberCount: 12, isSubscribed: false },
		{ ...row, id: "episode-1", kind: "podcastEpisode", topic, podcastEpisode: STORY_PODCAST_EPISODE },
		{
			...row,
			id: "team-1",
			name: "Coffee readers",
			kind: "team",
			team: { teamId: "team-1", name: "Coffee readers", avatarVersion: null },
			topicCount: 4,
			memberCount: 8,
		},
		{
			...row,
			id: "reader-1",
			name: "CoffeeReader",
			kind: "user",
			user: { userId: "reader-1", username: "CoffeeReader", avatarVersion: null, avatarSource: null },
		},
	],
}

// the finding opens its sheet with inert handlers while every kind retains its web metadata
const meta: Meta<typeof SearchResultsList> = {
	title: "Search/SearchResultsList",
	component: SearchResultsList,
	parameters: { webReference: "apps/web/src/components/search/SearchResultsList.tsx" },
	args: { pages: [STORY_SEARCH_RESULTS_PAGE], state: { handlers: STORY_TOPIC_FEED_HANDLERS, pendingChanges: [] } },
	decorators: [
		(Story) => (
			<ScrollView className="w-full">
				<Story />
			</ScrollView>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>
export const Mixed: Story = {}
