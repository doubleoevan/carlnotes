import { EMPTY_COMMENT_THREAD } from "@carlnotes/contracts/social"
import { toTestCommentThread, toTestEditorCommentThread } from "@carlnotes/contracts/socialTestFixtures"
import type { Meta, StoryObj } from "@storybook/react-native"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { View } from "react-native"
import { SocialSection } from "./SocialSection"

// the query cache a row's flag reads
const STORY_QUERY_CLIENT = new QueryClient()

// the same states as the web's section stories
const meta: Meta<typeof SocialSection> = {
	title: "Social/SocialSection",
	component: SocialSection,
	args: {
		target: { kind: "topic", id: "topic-1" },
		firstPage: toTestCommentThread(),
		isSignedIn: true,
		topicId: "topic-1",
		isTopicOwner: false,
	},
	parameters: { webReference: "apps/web/src/components/social/SocialSection.tsx at 375px" },
	decorators: [
		(Story) => (
			<QueryClientProvider client={STORY_QUERY_CLIENT}>
				<View style={{ width: "100%" }}>
					<Story />
				</View>
			</QueryClientProvider>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>
export const WithComments: Story = {}
export const Empty: Story = { args: { firstPage: EMPTY_COMMENT_THREAD } }
// a Topic's editor reads how many comments are shared with Carl at the card's top right, and presses each flame
export const TopicEditor: Story = {
	args: { isTopicOwner: true, firstPage: toTestEditorCommentThread({ usedCount: 1, slotCount: 3 }) },
}
