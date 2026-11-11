// the Topic Post editor as its author opens a draft: short of the fewest words, ready to publish, and after a save
// that lost to a newer version
import { fetchTopicPost, saveTopicPost } from "@carlnotes/client/topicPostClient"
import { TOPIC_POST_READY_DRAFT_STORY, TOPIC_POST_SHORT_DRAFT_STORY } from "@carlnotes/core/lib/topicPostStories"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { expect, fn, mocked, userEvent, waitFor, within } from "storybook/test"
import { toOwnFrameDocs } from "../../../.storybook/parameters"
import { TopicPostEditor } from "./TopicPostEditor"

const meta = {
	title: "TopicPost/TopicPostEditor",
	component: TopicPostEditor,
	args: { topicPost: TOPIC_POST_SHORT_DRAFT_STORY, onPublished: fn(), onDone: fn() },
	argTypes: { topicPost: { control: false } },
	// a save the api keeps, and the post read back on a reload
	beforeEach: () => {
		mocked(saveTopicPost).mockResolvedValue({ status: "saved", version: 4 })
		mocked(fetchTopicPost).mockResolvedValue(TOPIC_POST_SHORT_DRAFT_STORY)
	},
	parameters: { layout: "padded", docs: toOwnFrameDocs(720) },
} satisfies Meta<typeof TopicPostEditor>

export default meta
type Story = StoryObj<typeof meta>

// a draft short of the fewest words counts against them, and its Publish button stays disabled
export const ShortDraft: Story = {
	play: async ({ canvas }) => {
		await expect(await canvas.findByText("120 of 300 words")).toBeVisible()
		await expect(canvas.getByRole("button", { name: "Publish" })).toBeDisabled()
	},
}

// a draft with a title and enough words shows its count alone and offers Publish
export const ReadyDraft: Story = {
	args: { topicPost: TOPIC_POST_READY_DRAFT_STORY },
	play: async ({ canvas }) => {
		await expect(await canvas.findByText("320 words")).toBeVisible()
		await expect(canvas.getByRole("button", { name: "Publish" })).toBeEnabled()
	},
}

// a save that lost to a newer version: a keystroke schedules a save, the api returns a conflict, and the notice
// keeps the words and offers a reload
export const Conflict: Story = {
	args: { topicPost: TOPIC_POST_READY_DRAFT_STORY },
	beforeEach: () => {
		mocked(saveTopicPost).mockResolvedValue({ status: "conflict", version: 5 })
	},
	play: async ({ canvasElement }) => {
		// type into the editor once it has mounted
		const editorElement = await waitFor(() => {
			const element = canvasElement.querySelector(".ProseMirror")
			expect(element).not.toBeNull()
			return element as HTMLElement
		})
		await userEvent.click(editorElement)
		await userEvent.keyboard(" and more")

		// the notice says where the newer version came from, and Publish waits for the reload
		const canvas = within(canvasElement)
		await waitFor(() => expect(canvas.getByRole("alert")).toHaveTextContent("another window"), { timeout: 4000 })
		await expect(canvas.getByRole("button", { name: "Publish" })).toBeDisabled()
	},
}
