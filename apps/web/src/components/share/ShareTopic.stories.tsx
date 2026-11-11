// the share dialog: a topic's own, the same dialog with a public topic's post shared in the topic's place, and an
// invite topic's post for the topic's owner, whose invite link names the post
import { sendCreateTopicInvite } from "@carlnotes/client/topicClient"
import { TOPIC_POST_DISCUSSION_STORY } from "@carlnotes/core/lib/topicPostStories"
import { toTopicPostShare } from "@carlnotes/core/lib/topicPosts"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, mocked, within } from "storybook/test"
import { ShareTopic } from "./ShareTopic"

// the story post's topic, as its owner shares it, and the post that is shared in its place
const { topic: STORY_TOPIC, topicPost: STORY_TOPIC_POST } = toTopicPostShare(TOPIC_POST_DISCUSSION_STORY)

const meta = {
	title: "Share/ShareTopic",
	component: ShareTopic,
	args: { topic: STORY_TOPIC, isDialog: true, onClose: fn() },
	// the invite option creates the story's link, so no story reaches the api
	beforeEach: () => {
		mocked(sendCreateTopicInvite).mockResolvedValue({
			id: "invite-1",
			email: null,
			token: "story-token",
			maxUses: 25,
			usedCount: 0,
			expiresAt: null,
		})
	},
} satisfies Meta<typeof ShareTopic>

export default meta
type Story = StoryObj<typeof meta>

// a public topic's own dialog posts the topic's page, and offers its rss feed
export const Topic: Story = {
	play: async ({ canvasElement }) => {
		const dialog = within(canvasElement.ownerDocument.body)
		await expect(await dialog.findByRole("heading", { name: "Share topic" })).toBeVisible()
		await expect(dialog.getByRole("button", { name: "Copy RSS" })).toBeVisible()
	},
}

// a public topic's post: the same options post the post's page under its title, with no rss feed and no report
export const TopicPost: Story = {
	args: { topicPost: STORY_TOPIC_POST },
	play: async ({ canvasElement }) => {
		const dialog = within(canvasElement.ownerDocument.body)
		await expect(await dialog.findByRole("heading", { name: "Share post" })).toBeVisible()

		// the platform link names the post's path and title, and the topic's own options are absent
		const blueskyLink = dialog.getByRole("link", { name: "Bluesky" })
		await expect(blueskyLink.getAttribute("href")).toContain(encodeURIComponent(STORY_TOPIC_POST.path))
		await expect(blueskyLink.getAttribute("href")).toContain(encodeURIComponent(STORY_TOPIC_POST.title))
		await expect(dialog.queryByRole("button", { name: "Copy RSS" })).toBeNull()
		await expect(dialog.queryByRole("button", { name: /Report/ })).toBeNull()
	},
}

// an invite topic's post, as the topic's owner: posting is disabled, and the invite link names the post
export const InviteTopicPost: Story = {
	args: { topic: { ...STORY_TOPIC, visibility: "invite", isTopicOwner: true }, topicPost: STORY_TOPIC_POST },
	play: async ({ canvasElement }) => {
		const dialog = within(canvasElement.ownerDocument.body)
		await expect(await dialog.findByRole("heading", { name: "Share post" })).toBeVisible()
		await expect(dialog.queryByRole("link", { name: "Bluesky" })).toBeNull()

		// the invite option creates the topic's link for this post
		await dialog.getByRole("button", { name: /invite link/ }).click()
		await expect(mocked(sendCreateTopicInvite)).toHaveBeenCalledWith(STORY_TOPIC.id, "share-sheet", STORY_TOPIC_POST.id)
	},
}
