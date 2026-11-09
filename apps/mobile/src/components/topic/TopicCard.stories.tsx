// the mobile topic card, with the web stories' names. the ground shows in place of the image, since a story has no api
import type { TopicCard as TopicCardFields } from "@carlnotes/contracts/home"
import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { TopicCard } from "./TopicCard"

// a public topic with tags and reactions
const TOPIC: TopicCardFields = {
	id: "topic-1",
	name: "Home espresso",
	path: "/topics/topic-1/home-espresso",
	image: null,
	tags: ["coffee", "gear"],
	owner: { userId: "user-1", username: "CoffeeReader", avatarSource: "generated", avatarVersion: null },
	teamLink: null,
	reactionCount: 12,
	latestPodcastEpisode: null,
}

const meta = {
	title: "Topic/TopicCard",
	component: TopicCard,
	parameters: { webReference: "apps/web/src/components/topic/TopicCard.stories.tsx at 375px" },
	args: { topic: TOPIC },
	render: (args) => (
		<View className="w-80">
			<TopicCard {...args} />
		</View>
	),
} satisfies Meta<typeof TopicCard>

export default meta
type Story = StoryObj<typeof meta>

// the card as the Home tab shows it
export const Default: Story = {}

// a team topic names the team in its byline
export const Team: Story = {
	args: { topic: { ...TOPIC, teamLink: { teamId: "team-1", name: "Coffee's for Closers", avatarVersion: null } } },
}

// a topic with no tags or reactions keeps no last line
export const NoImage: Story = { args: { topic: { ...TOPIC, tags: [], reactionCount: 0 } } }
