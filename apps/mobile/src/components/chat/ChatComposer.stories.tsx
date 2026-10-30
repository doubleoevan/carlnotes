import type { KeptChatAttachment } from "@carlnotes/contracts/chat"
import type { ChatAttachment } from "@carlnotes/contracts/payloads"
import { NEW_TOPIC_CHAT_COPY } from "@carlnotes/core/lib/chatCopy"
import type { Meta, StoryObj } from "@storybook/react-native"
import { useState } from "react"
import { View } from "react-native"
import { ChatComposer } from "./ChatComposer"
import { ChatAttachButton, KeptAttachmentList, KeptAttachmentsButton } from "./ChatComposerAttachments"

// the component fixture and preview layout
const meta: Meta<typeof ChatComposer> = {
	title: "Chat/ChatComposer",
	component: ChatComposer,
	args: { value: "", onChange: () => {}, onSend: () => {}, onStop: () => {} },
	parameters: { webReference: "apps/web/src/components/chat/ChatComposer.tsx" },
	decorators: [
		(Story) => (
			<View className="w-full">
				<Story />
			</View>
		),
	],
}
export default meta
type Story = StoryObj<typeof meta>
// rendered component states
export const Empty: Story = { render: () => <EditableComposer /> }
export const LongQuestion: Story = {
	args: {
		value:
			"What changed in the sources this week? Please compare their evidence, include the reasons for disagreement, and suggest one useful question to ask next. ".repeat(
				5,
			),
	},
}
export const Streaming: Story = { args: { isStreaming: true } }
export const NewTopicFirst: Story = { args: { placeholder: NEW_TOPIC_CHAT_COPY.firstTopicPlaceholder } }
export const NewTopicNext: Story = { args: { placeholder: NEW_TOPIC_CHAT_COPY.placeholder } }
export const Unavailable: Story = { args: { isDisabled: true } }
export const TwoAttachments: Story = { render: () => <AttachmentComposer attachments={TWO_ATTACHMENTS} /> }
export const FourLongNames: Story = { render: () => <AttachmentComposer attachments={LONG_NAME_ATTACHMENTS} /> }
export const RejectedPostKeepsDraft: Story = {
	render: () => (
		<AttachmentComposer attachments={TWO_ATTACHMENTS} question="Does the second chart agree with the PDF?" />
	),
}
export const AttachingFiles: Story = {
	render: () => <AttachmentComposer attachments={TWO_ATTACHMENTS} isAttaching />,
}
export const KeptFiles: Story = {
	render: () => (
		<View className="gap-3">
			<AttachmentComposer attachments={[]} keptAttachments={KEPT_ATTACHMENTS} />
			<KeptAttachmentList keptAttachments={KEPT_ATTACHMENTS} onRemoveKeptAttachment={async () => {}} />
		</View>
	),
}

// a 1-pixel png the image chip shows as its thumbnail
const PIXEL_DATA_URL =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="

// a photo and a pdf waiting on the send
const TWO_ATTACHMENTS: ChatAttachment[] = [
	{ kind: "image", name: "roast-curve.png", dataUrl: PIXEL_DATA_URL, keep: true },
	{ kind: "pdf", name: "harvest-report.pdf", dataUrl: "data:application/pdf;base64,JVBERi0=", keep: true },
]

// a full question of files whose names run past the chip width
const LONG_NAME_ATTACHMENTS: ChatAttachment[] = [
	{ kind: "image", name: "a-very-long-photo-name-from-the-camera-roll.jpg", dataUrl: PIXEL_DATA_URL, keep: true },
	{
		kind: "video",
		name: "pour-over-technique-side-angle-final-cut.mp4",
		dataUrl: "data:video/mp4;base64,AA==",
		keep: true,
	},
	{
		kind: "document",
		name: "quarterly-green-coffee-contracts-summary.docx",
		dataUrl: "data:application/vnd.openxmlformats-officedocument.wordprocessingml.document;base64,UEs=",
		keep: true,
	},
	{ kind: "text", name: "Pasted text", text: "Tasting notes. ".repeat(400), keep: false },
]

// the files the topic already keeps
const KEPT_ATTACHMENTS: KeptChatAttachment[] = [
	{ id: "kept-photo", kind: "image", name: "roast-curve.png", at: "2026-10-28T09:00:00.000Z" },
	{ id: "kept-report", kind: "pdf", name: "harvest-report-with-a-long-name-2026.pdf", at: "2026-10-20T09:00:00.000Z" },
]

// a composer holding files, with the attach control and, if the topic keeps files, the kept-files control
function AttachmentComposer({
	attachments: initialAttachments,
	keptAttachments = [],
	question: initialQuestion = "",
	isAttaching = false,
}: {
	attachments: ChatAttachment[]
	keptAttachments?: KeptChatAttachment[]
	question?: string
	isAttaching?: boolean
}) {
	const [question, setQuestion] = useState(initialQuestion)
	const [attachments, setAttachments] = useState(initialAttachments)
	return (
		<ChatComposer
			value={question}
			onChange={setQuestion}
			onSend={() => {}}
			attachments={attachments}
			onRemoveAttachment={(index) =>
				setAttachments((previousAttachments) => previousAttachments.filter((_, position) => position !== index))
			}
			attachmentActions={
				<>
					<ChatAttachButton isDisabled={isAttaching} onPicked={async () => {}} />
					{keptAttachments.length > 0 && (
						<KeptAttachmentsButton keptAttachments={keptAttachments} onRemoveKeptAttachment={async () => {}} />
					)}
				</>
			}
		/>
	)
}

// keep typing local to the story, including software and hardware keyboard checks
function EditableComposer() {
	const [question, setQuestion] = useState("")
	return <ChatComposer value={question} onChange={setQuestion} onSend={() => setQuestion("")} />
}
