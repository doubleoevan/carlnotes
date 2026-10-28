// compare the platform adapter with its shared web content in both Nightshift themes
import { NOTE_FORMATS_HTML, toTestNote } from "@carlnotes/contracts/noteTestFixtures"
import type { Meta, StoryObj } from "@storybook/react-native"
import { useState } from "react"
import { View } from "react-native"
import { Button } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { NoteViewer } from "./NoteViewer"
import { NOTE_STORY_THREAD } from "./noteStoryFixtures"

const meta: Meta<typeof NoteViewer> = {
	title: "Note/NoteViewer",
	component: NoteViewer,
	args: {
		note: toTestNote({ html: NOTE_FORMATS_HTML, canEdit: false }),
		noteCommentThread: NOTE_STORY_THREAD,
		isCommentsOpen: false,
	},
	render: (args) => <ViewerStory {...args} />,
	decorators: [
		(Story) => (
			<View style={{ height: 600 }}>
				<Story />
			</View>
		),
	],
	parameters: { webReference: "apps/web/src/components/note/NoteViewer.tsx", surface: "card" },
}
export default meta
type Story = StoryObj<typeof meta>
export const EveryFormat: Story = {}
export const LongNote: Story = { args: { note: toTestNote({ html: NOTE_FORMATS_HTML.repeat(10), canEdit: false }) } }
export const CommentsOpen: Story = { args: { isCommentsOpen: true } }

// keep the read-only thread reachable without adding editing controls
function ViewerStory(props: React.ComponentProps<typeof NoteViewer>) {
	const [isCommentsOpen, setIsCommentsOpen] = useState(props.isCommentsOpen)
	return (
		<>
			<Button
				accessibilityLabel="Show comments"
				variant="outline"
				size="sm"
				className="mb-3 self-end"
				onPress={() => setIsCommentsOpen(true)}
			>
				<Text>Comments</Text>
			</Button>
			<NoteViewer {...props} isCommentsOpen={isCommentsOpen} onCloseComments={() => setIsCommentsOpen(false)} />
		</>
	)
}
