import type { Meta, StoryObj } from "@storybook/react-native"
import { NoteComments } from "./NoteComments"

// compare the native adapter with its shared web content in both Nightshift themes
import { NOTE_STORY_THREAD } from "./noteStoryFixtures"

const meta: Meta<typeof NoteComments> = {
	title: "Note/NoteComments",
	component: NoteComments,
	args: { ...NOTE_STORY_THREAD, canComment: true },
	parameters: { webReference: "apps/web/src/components/note/NoteComments.tsx", surface: "card" },
}
export default meta
type Story = StoryObj<typeof meta>
export const Thread: Story = {}
export const ReadOnly: Story = { args: { canComment: false } }
export const Loading: Story = { args: { comments: [], isLoading: true } }
export const Failed: Story = { args: { hasError: true } }
export const Empty: Story = { args: { comments: [] } }
export const FailedPost: Story = { args: { postNoteComment: async () => false } }
export const LongThread: Story = {
	args: {
		comments: Array.from({ length: 24 }, (_, index) => ({
			author: null,
			canDelete: false,
			createdAt: "2026-10-20T12:00:00Z",
			id: String(index),
			body: "Long comment. ".repeat(30),
		})),
	},
}
