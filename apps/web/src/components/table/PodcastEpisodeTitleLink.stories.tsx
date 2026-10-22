// a podcast episode's title in a table, linked to its page, with its play button and its details tooltip
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { LATEST_PODCAST_EPISODE_FIXTURE } from "../../../.storybook/fixtures/podcastEpisodes"
import { PodcastEpisodeTitleLink } from "./PodcastEpisodeTitleLink"

const meta = {
	title: "Table/PodcastEpisodeTitleLink",
	component: PodcastEpisodeTitleLink,
	args: { podcastEpisode: LATEST_PODCAST_EPISODE_FIXTURE },
	// the table card the podcast episodes table sits in
	parameters: { surface: "card" },
} satisfies Meta<typeof PodcastEpisodeTitleLink>

export default meta
type Story = StoryObj<typeof meta>

// a published podcast episode: the title links to its page beside the play button
export const Default: Story = {}

// a podcast episode without its own page, whose title shows as plain text
export const WithoutPage: Story = { args: { podcastEpisode: { ...LATEST_PODCAST_EPISODE_FIXTURE, pagePath: null } } }

// a long title in the podcast episodes table's title column, which wraps beside the play button
export const LongTitle: Story = {
	args: {
		podcastEpisode: {
			...LATEST_PODCAST_EPISODE_FIXTURE,
			title: "Agents that read the docs, write the tests, and still ask before they open a pull request",
		},
	},
	// the 223 pixels the column's 256 pixel cell leaves its content, inside the padding and the frozen column's rule
	decorators: [
		(Story) => (
			<div style={{ width: 223 }}>
				<Story />
			</div>
		),
	],
}

// the tooltip a hover on the play button opens, as the title does: the podcast's name, the number, and the description
export const TooltipOpen: Story = {
	play: async ({ canvas, userEvent }) => {
		await userEvent.hover(canvas.getByRole("button", { name: /^Play episode/ }))
	},
}
