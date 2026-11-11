// the mobile tag under a question asked from a Topic Post's screen, with the web stories' names
import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { TopicPostTag } from "./TopicPostTag"

// a post's page, as a stored chat turn names it
const TOPIC_POST_PATH = "/topics/topic-1/home-espresso/posts/post-1/dialing-in"

const meta: Meta<typeof TopicPostTag> = {
	title: "Chat/TopicPostTag",
	component: TopicPostTag,
	args: { topicPost: { title: "Dialing in", path: TOPIC_POST_PATH } },
	parameters: { webReference: "apps/web/src/components/chat/TopicPostTag.stories.tsx at 375px" },
	render: (args) => (
		<View className="w-80 items-end">
			<TopicPostTag {...args} />
		</View>
	),
}
export default meta
type Story = StoryObj<typeof meta>

// the tag names the post and opens its screen
export const Default: Story = {}

// a long title is cut inside the question's width
export const LongTitle: Story = {
	args: {
		topicPost: {
			title: "Light roasts, ranked by someone who was wrong about every single one of them for a year",
			path: TOPIC_POST_PATH,
		},
	},
}

// a post deleted since the question keeps the tag with no link
export const DeletedPost: Story = { args: { topicPost: { title: null, path: null } } }
