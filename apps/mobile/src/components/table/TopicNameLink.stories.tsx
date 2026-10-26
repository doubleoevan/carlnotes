import type { Meta, StoryObj } from "@storybook/react-native"
import { STORY_PODCAST_EPISODE } from "@/components/topic/topicPageStories"
import { TopicNameLink } from "./TopicNameLink"

// a linked Topic keeps the play button beside its name
const meta = {
	title: "Table/TopicNameLink",
	component: TopicNameLink,
	parameters: { webReference: "apps/web/src/components/table/TopicNameLink.tsx" },
	args: { topic: { id: "coffee", name: "Coffee for two", latestPodcastEpisode: STORY_PODCAST_EPISODE } },
} satisfies Meta<typeof TopicNameLink>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const WithoutPodcast: Story = { args: { topic: { ...meta.args.topic, latestPodcastEpisode: null } } }
export const LongName: Story = {
	args: { topic: { ...meta.args.topic, name: "Coffee from around the world: growers, roasters, and brewing methods" } },
}
