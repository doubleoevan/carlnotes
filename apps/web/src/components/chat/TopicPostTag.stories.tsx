// the tag under a question asked from a Topic Post's page: the post's title as a link, a long title cut, and a post
// deleted since
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect } from "storybook/test"
import { TopicPostTag } from "./TopicPostTag"

// a post's page, as a stored chat turn names it
const TOPIC_POST_PATH = "/topics/topic-1/home-espresso/posts/post-1/dialing-in"

const meta: Meta<typeof TopicPostTag> = {
	title: "Chat/TopicPostTag",
	component: TopicPostTag,
	args: { topicPost: { title: "Dialing in", path: TOPIC_POST_PATH } },
	decorators: [(Story) => <div className="flex w-80 flex-col items-end">{Story()}</div>],
}
export default meta
type Story = StoryObj<typeof meta>

// the tag names the post and links to its page
export const Default: Story = {
	play: async ({ canvas }) => {
		const link = canvas.getByRole("link", { name: "Dialing in, open this post" })
		await expect(link).toHaveAttribute("href", TOPIC_POST_PATH)
	},
}

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
export const DeletedPost: Story = {
	args: { topicPost: { title: null, path: null } },
	play: async ({ canvas }) => {
		await expect(canvas.getByText("A deleted post")).toBeVisible()
		await expect(canvas.queryByRole("link")).toBeNull()
	},
}
