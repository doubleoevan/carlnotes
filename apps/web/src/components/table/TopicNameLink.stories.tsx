// a topic's name in a topic table: the link to the topic's page, the update count badge at the name's corner, and the
// play button of the topic's latest podcast episode
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { LLM_TOOLING_TOPIC_FIXTURE } from "../../../.storybook/fixtures"
import { LATEST_PODCAST_EPISODE_FIXTURE } from "../../../.storybook/fixtures/podcastEpisodes"
import { seedWaitingUpdates } from "../../../.storybook/fixtures/waitingUpdates"
import { toOwnFrameDocs } from "../../../.storybook/parameters"
import { StoryTable } from "../../../.storybook/tableDecorators"
import { TopicNameLink } from "./TopicNameLink"

// the topic every story links to, under a short name and a long one
const STORY_TOPIC_ID = LLM_TOOLING_TOPIC_FIXTURE.id
const SHORT_TOPIC_NAME = LLM_TOOLING_TOPIC_FIXTURE.name
const LONG_TOPIC_NAME = "Retrieval-augmented generation evaluation harnesses for multilingual customer support"

const meta = {
	title: "Table/TopicNameLink",
	component: TopicNameLink,
	args: { topic: { id: STORY_TOPIC_ID, name: SHORT_TOPIC_NAME, latestPodcastEpisode: null } },
	argTypes: {
		topic: { control: "object" },
	},
	decorators: [
		// the name sits in the first column of a topic table. the empty second cell keeps that column at its own width
		(Story) => (
			<StoryTable className="min-w-2xl">
				<tr className="border-b">
					<td className="py-2 pr-4">
						<Story />
					</td>
					<td className="py-2 pr-4" />
				</tr>
			</StoryTable>
		),
	],
} satisfies Meta<typeof TopicNameLink>

export default meta
type Story = StoryObj<typeof meta>

// the name alone, linking to the topic's page
export const Default: Story = {}

// the name with the play button of the topic's latest podcast episode beside it
export const WithPodcastEpisode: Story = {
	args: {
		topic: { id: STORY_TOPIC_ID, name: SHORT_TOPIC_NAME, latestPodcastEpisode: LATEST_PODCAST_EPISODE_FIXTURE },
	},
}

// the name with the update count badge for a waiting chat mention and an unread note change
export const WithUpdates: Story = {
	// every story shares the badge stores, so the docs page gives this story its own frame to keep its seed from the rest
	parameters: { docs: toOwnFrameDocs(103) },
	beforeEach: seedWaitingUpdates,
}

// a long name that wraps inside the column, with the badge on the name and the play button beside it
export const LongName: Story = {
	args: {
		topic: { id: STORY_TOPIC_ID, name: LONG_TOPIC_NAME, latestPodcastEpisode: LATEST_PODCAST_EPISODE_FIXTURE },
	},
	// every story shares the badge stores, so the docs page gives this story its own frame to keep its seed from the rest
	parameters: { docs: toOwnFrameDocs(223) },
	beforeEach: seedWaitingUpdates,
}
