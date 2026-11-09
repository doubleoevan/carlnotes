// the topic card: a topic with an image, a team byline, a topic with no image, and the reaction count
import type { TopicCard as TopicCardFields } from "@carlnotes/contracts/home"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn } from "storybook/test"
import { TopicCard } from "./TopicCard"

// the podcast cover placeholder stands in for a topic's image, which the app serves from its public files
const SAMPLE_FILES = { url: "/podcast-cover-placeholder.jpg", url2x: "/podcast-cover-placeholder.jpg" }

// a public topic with an image, tags, and reactions
const TOPIC: TopicCardFields = {
	id: "topic-1",
	name: "Home espresso",
	path: "/topics/topic-1/home-espresso",
	image: { page: SAMPLE_FILES, list: SAMPLE_FILES, thumbnail: SAMPLE_FILES },
	tags: ["coffee", "gear"],
	owner: { userId: "user-1", username: "CoffeeReader", avatarSource: "generated", avatarVersion: null },
	teamLink: null,
	reactionCount: 12,
	latestPodcastEpisode: null,
}

const meta = {
	title: "Topic/TopicCard",
	component: TopicCard,
	args: { topic: TOPIC, onOpen: fn() },
	decorators: [(Story) => <div className="w-80">{Story()}</div>],
} satisfies Meta<typeof TopicCard>

export default meta
type Story = StoryObj<typeof meta>

// the card as the home page shows it, and a click on it reports the open
export const Default: Story = {
	play: async ({ canvas, args }) => {
		await canvas.getByRole("link", { name: "Open Home espresso" }).click()
		await expect(args.onOpen).toHaveBeenCalled()
	},
}

// a team topic names the team in its byline
export const Team: Story = {
	args: { topic: { ...TOPIC, teamLink: { teamId: "team-1", name: "Coffee's for Closers", avatarVersion: null } } },
}

// a topic whose image has not rendered yet shows the muted ground, and one with no tags or reactions keeps no last line
export const NoImage: Story = { args: { topic: { ...TOPIC, image: null, tags: [], reactionCount: 0 } } }
