// the table pattern: a data table in its card with sortable headers, and the list of dashed rows beside it
import { fetchTopicPage } from "@carlnotes/client/topicClient"
import { toTopicPath } from "@carlnotes/contracts/seo"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { mocked } from "storybook/test"
import { AnchorLink } from "@/components/common/AnchorLink"
import { PodcastEpisodeRow } from "@/components/podcast/PodcastEpisodeRow"
import { TopicsTable } from "@/components/table/TopicsTable"
import { RESOURCE_LIST_CARD_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import { LLM_TOOLING_TOPIC_FIXTURE } from "../../../.storybook/fixtures"
import { LATEST_PODCAST_EPISODE_FIXTURE, PODCAST_EPISODE_FIXTURES } from "../../../.storybook/fixtures/podcastEpisodes"
import { toStoryTopic } from "../../../.storybook/fixtures/topics"
import { PHONE_VIEWPORT_GLOBALS } from "../../../.storybook/viewports"

// the topics the table lists, each with its subscriber count and when it was last updated. LLM tooling has a podcast
// episode to play
const STORY_TOPICS = [
	toStoryTopic({
		...LLM_TOOLING_TOPIC_FIXTURE,
		latestPodcastEpisode: LATEST_PODCAST_EPISODE_FIXTURE,
		subscriberCount: 1284,
		updatedAt: "2026-09-28T12:00:00.000Z",
	}),
	toStoryTopic({
		id: "topic-rust",
		name: "Rust async runtimes",
		subscriberCount: 46,
		updatedAt: "2026-08-14T12:00:00.000Z",
	}),
	toStoryTopic({
		id: "topic-edge",
		name: "Edge databases and the replication strategies that keep them consistent",
		subscriberCount: 73,
		updatedAt: "2026-06-02T12:00:00.000Z",
	}),
	toStoryTopic({
		id: "topic-espresso",
		name: "Home espresso gear",
		subscriberCount: 9,
		updatedAt: "2025-12-19T12:00:00.000Z",
	}),
]

/**
 * Renders the app's topic table in its card, or the dashed rows of a list card.
 */
function TablePattern({ layout }: { layout: "table" | "dashedRows" }) {
	return layout === "table" ? (
		<TopicsTable topics={STORY_TOPICS} includesNonPublicTopics={false} />
	) : (
		<PodcastEpisodeRows />
	)
}

// a list card of podcast episode rows under its season tabs, each row drawing its dashed separator. the first row's
// podcast episode is the latest, and every other row's play button is muted
function PodcastEpisodeRows() {
	return (
		<div className={cn(RESOURCE_LIST_CARD_CLASS, "p-1")}>
			{/* one tab per season, the newest first and current. the latest season's link needs no season in its query */}
			<nav aria-label="Seasons" className="flex gap-1 px-2">
				{[2026, 2025].map((season, i) => (
					<AnchorLink
						key={season}
						href={
							i === 0
								? toTopicPath(LLM_TOOLING_TOPIC_FIXTURE)
								: `${toTopicPath(LLM_TOOLING_TOPIC_FIXTURE)}?season=${season}`
						}
						aria-current={i === 0 ? "page" : undefined}
						className={cn(
							"flex min-h-11 items-center border-b-[3px] px-3.5 text-sm sm:min-h-9",
							i === 0 ? "border-primary font-bold" : "text-muted-foreground border-transparent font-semibold",
						)}
					>
						{season}
					</AnchorLink>
				))}
			</nav>
			<ol aria-label="Season 2026 episodes">
				{PODCAST_EPISODE_FIXTURES.slice(0, 3).map((podcastEpisode, i) => (
					<PodcastEpisodeRow
						key={podcastEpisode.id}
						podcastEpisode={podcastEpisode}
						podcastEpisodePath={podcastEpisode.pagePath}
						isLatestPodcastEpisode={i === 0}
						isPlayButtonMuted={i > 0}
					/>
				))}
			</ol>
		</div>
	)
}

const meta = {
	title: "Patterns/Table",
	component: TablePattern,
	args: { layout: "table" },
	argTypes: { layout: { control: "inline-radio", options: ["table", "dashedRows"] } },
	// the kept cell's popover reads a topic with no page to show
	beforeEach: () => {
		mocked(fetchTopicPage).mockResolvedValue({ status: "missing" })
	},
} satisfies Meta<typeof TablePattern>

export default meta
type Story = StoryObj<typeof meta>

// TopicsTable: TableCard, the sideways scroll, the table and head classes, and sortable headers over four topics
export const Table: Story = {}

// the table on a 375-pixel-wide phone, where the columns scroll under the frozen first column
export const TablePhone: Story = {
	// the docs page is wider than a phone, so the story stays off it
	tags: ["!autodocs"],
	globals: PHONE_VIEWPORT_GLOBALS,
}

// DASHED_ROW_CLASS: the podcast episode card's rows under its season tabs, each with a dashed separator over it
export const DashedRows: Story = { args: { layout: "dashedRows" } }
