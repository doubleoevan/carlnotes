import { fetchPodcastEpisode } from "@carlnotes/client/podcastEpisodeClient"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { toTestTopicFeed } from "@carlnotes/contracts/topicFeedTestFixtures"
import { TopicPersonalSourcesSectionStory } from "@carlnotes/core/components/TopicPersonalSourcesSectionStory"
import { PODCAST_STORY_EPISODE, PODCAST_STORY_FILM_EPISODE } from "@carlnotes/core/lib/podcastEpisodeStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { mocked } from "storybook/test"
import { Button } from "@/components/primitives/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { POPOVER_PANEL_CLASS } from "@/lib/styleClasses"
import { PERSONAL_SOURCES_ELEMENTS } from "./personalSourcesElements"
import { TopicInfo } from "./TopicInfo"

// show the same Topic info content used by the Topic page
const meta = {
	title: "Topic/TopicInfo",
	component: TopicInfo,
	args: { topic: toTestTopicFeed({ visibility: "private", findings: [], scanSummary: null }) },
} satisfies Meta<typeof TopicInfo>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = { render: () => <InfoStory isClosed /> }

// render both flat item states inside the real platform popover
export const PersonalSourcesCollapsed: Story = { render: () => <InfoStory isClosed /> }
export const PersonalSourcesWithItems: Story = { render: () => <InfoStory /> }
export const PersonalSourcesExpanded: Story = { render: () => <InfoStory isExpanded /> }
export const PersonalSourcesEmpty: Story = { render: () => <InfoStory isEmpty /> }
export const Paginated: Story = { render: () => <InfoStory isPaged /> }

// the latest podcast episode with no film, which shows its row alone
export const WithPodcast: Story = {
	render: () => <InfoStory isClosed latestPodcastEpisode={PODCAST_STORY_EPISODE} />,
}

// the latest podcast episode with a ready film, which shows the film above its row. a press on the poster opens the
// Video dialog on the story's film, so the story never reaches the api
export const WithFilm: Story = {
	render: () => <InfoStory isClosed latestPodcastEpisode={PODCAST_STORY_FILM_EPISODE} />,
	beforeEach: () => {
		mocked(fetchPodcastEpisode).mockResolvedValue(PODCAST_STORY_FILM_EPISODE)
	},
}
function InfoStory({
	isExpanded = false,
	isEmpty = false,
	isClosed = false,
	isPaged = false,
	latestPodcastEpisode = null,
}: {
	isExpanded?: boolean
	isEmpty?: boolean
	isClosed?: boolean
	isPaged?: boolean
	latestPodcastEpisode?: PodcastEpisode | null
}) {
	// fictional owner data stays local to the story
	const topic = toTestTopicFeed({
		name: "LLM evals",
		prompt: "New methods for evaluating LLM agents, especially catching drift and regressions before users do.",
		visibility: "private",
		findings: [],
		scanSummary: null,
		latestPodcastEpisode,
	})
	const personalSources = (
		<TopicPersonalSourcesSectionStory
			className="border-t border-dashed border-separator-strong"
			elements={PERSONAL_SOURCES_ELEMENTS}
			isEntryExpanded={isExpanded}
			initialOpen={!isClosed}
			variant={isEmpty ? "empty" : isPaged ? "paged" : "ready"}
		/>
	)
	return (
		<Popover defaultOpen>
			<PopoverTrigger asChild>
				<Button>Topic details</Button>
			</PopoverTrigger>
			<PopoverContent className={POPOVER_PANEL_CLASS}>
				<TopicInfo topic={topic} personalSources={personalSources} />
			</PopoverContent>
		</Popover>
	)
}
