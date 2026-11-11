import { COMMENT_MENTION_STORIES } from "@carlnotes/core/lib/commentMentionStories"
import { setCommentMentions } from "@carlnotes/core/stores/commentMentionStore"
import type { Meta, StoryObj } from "@storybook/react-native"
import { View } from "react-native"
import { CommentMentionList } from "./CommentMentionList"

// the web list's rows at phone width: a full list with its Mark all seen, and the line an empty list shows
const meta: Meta<typeof CommentMentionList> = {
	title: "Social/CommentMentionList",
	component: CommentMentionList,
	args: { onChoose: () => {} },
	parameters: { webReference: "social-commentmentionlist--full" },
	decorators: [
		(Story, { parameters }) => {
			// the list reads the store, which each story fills
			setCommentMentions(parameters.isEmpty ? [] : COMMENT_MENTION_STORIES)
			return (
				<View className="rounded-lg border border-separator bg-card p-2">
					<Story />
				</View>
			)
		},
	],
}
export default meta
type Story = StoryObj<typeof meta>

// three mentions, newest first, each with its author, its first line, and its page
export const Full: Story = {}

// a user with no unseen mention reads one line
export const Empty: Story = { parameters: { isEmpty: true } }
