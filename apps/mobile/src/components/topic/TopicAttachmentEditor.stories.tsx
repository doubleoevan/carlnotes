import { toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import type { TopicDetails } from "@carlnotes/contracts/topics"
import { useTopicFields } from "@carlnotes/core/hooks/useTopicFields"
import type { Meta, StoryObj } from "@storybook/react-native"
import { useEffect } from "react"
import { TopicAttachmentEditor, type TopicAttachmentFile } from "./TopicAttachmentEditor"

// a read attachment with its context, one Carl failed to read, and the files a pick staged for the next save
const READ_ATTACHMENT: TopicDetails["attachments"][number] = {
	id: "storybook-research",
	filename: "Research.pdf",
	sourceUrl: null,
	status: "ready",
	context: "A survey of pour-over grind sizes, with brew times for each.",
	failureMessage: null,
}
const FAILED_ATTACHMENT: TopicDetails["attachments"][number] = {
	id: "storybook-scan",
	filename: "Scan.pdf",
	sourceUrl: null,
	status: "failed",
	context: null,
	failureMessage: "Carl couldn't read this PDF. Try a copy with selectable text.",
}
const PENDING_FILES: TopicAttachmentFile[] = [
	{ uri: "file:///storybook/photo.jpg", name: "photo.jpg", mimeType: "image/jpeg", byteSize: 412_000 },
	{ uri: "file:///storybook/notes.md", name: "notes.md", mimeType: "text/markdown", byteSize: 2_400 },
]

// the pending files a pick staged, and an attachment Carl could not read
const meta = {
	title: "Topic/TopicAttachmentEditor",
	component: TopicAttachmentEditorExample,
	parameters: { webReference: "apps/web/src/components/topic/TopicAttachmentEditor.tsx" },
	args: { attachments: [READ_ATTACHMENT], pendingFiles: PENDING_FILES },
} satisfies Meta<typeof TopicAttachmentEditorExample>
export default meta
type Story = StoryObj<typeof meta>
export const PendingFiles: Story = {}
export const FailedAttachment: Story = { args: { attachments: [READ_ATTACHMENT, FAILED_ATTACHMENT], pendingFiles: [] } }

// the editor over a saved topic's attachments, with the staged files set once
function TopicAttachmentEditorExample({
	attachments,
	pendingFiles,
}: {
	attachments: TopicDetails["attachments"]
	pendingFiles: TopicAttachmentFile[]
}) {
	const fields = useTopicFields<TopicAttachmentFile>(toTestTopicResponse({ attachments }))
	const { setPendingFiles } = fields
	useEffect(() => setPendingFiles(pendingFiles), [setPendingFiles, pendingFiles])
	return <TopicAttachmentEditor fields={fields} />
}
