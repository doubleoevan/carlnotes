// the chat bubble pattern: one chat turn's question and answer bubbles, and the composer box with its chips
import type { ChatAttachment } from "@carlnotes/contracts/payloads"
import { MINUTE_MS } from "@carlnotes/contracts/time"
import type { Meta, StoryObj } from "@storybook/tanstack-react"
import { ArrowUp, Paperclip, Square, X } from "lucide-react"
import { useRef, useState } from "react"
import { fn } from "storybook/test"
import { ChatAttachmentChips } from "@/components/chat/ChatAttachmentChips"
import { CHAT_QUESTION_PLACEHOLDER } from "@/components/chat/ChatComposer"
import { ChatTurnBlock } from "@/components/chat/ChatTurnBlock"
import { FileDropZone } from "@/components/common/FileDropZone"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import {
	COMPOSER_BAR_CLASS,
	COMPOSER_BOX_CLASS,
	COMPOSER_FRAME_CLASS,
	ICON_BUTTON_CLASS,
	SEND_BUTTON_CLASS,
} from "@/lib/styleClasses"
import { CHAT_FILE_PICKER_ACCEPT } from "@/lib/utils"
import { FIXTURE_DATE, STORY_PEOPLE } from "../../../.storybook/fixtures"

// the user who asks, and when the question was sent
const QUESTION_AUTHOR = STORY_PEOPLE[0]
const NOW = FIXTURE_DATE.getTime()
const QUESTION_AT = NOW - 6 * MINUTE_MS

// the attachments waiting on the next message: a document, a long paste, and a clip
const STORY_ATTACHMENTS: ChatAttachment[] = [
	{ kind: "pdf", name: "llm-tooling-benchmarks.pdf", keep: false, dataUrl: "data:application/pdf;base64," },
	{ kind: "text", name: "Pasted text", keep: false, text: "Latency in milliseconds by stack and model. ".repeat(80) },
	{ kind: "video", name: "retrieval-demo.mp4", keep: false, dataUrl: "data:video/mp4;base64," },
]

/**
 * Renders one chat turn and the composer under it, the way the private chat builds them.
 */
function ChatBubblePattern({
	question,
	answer,
	isThinking,
	draft,
	hasAttachments,
	onSendQuestion,
	onAddFiles,
	onRemoveAttachment,
}: {
	question: string
	// carl's reply, as Markdown
	answer: string
	// whether carl is still thinking, which shows the thinking bubble instead of the answer
	isThinking: boolean
	// the text already in the composer box
	draft: string
	hasAttachments: boolean
	onSendQuestion: (question: string) => void
	onAddFiles: (files: File[]) => void
	onRemoveAttachment: (index: number) => void
}) {
	return (
		<div className="@container flex flex-col">
			{/* the chat turn, waiting on carl's answer while carl is thinking */}
			<div style={{ padding: 12 }}>
				<ChatTurnBlock
					chatTurn={{
						question,
						answer: isThinking ? "" : answer,
						linkPreviews: [],
						answerLinkPreviews: [],
						speaker: "host",
						podcastEpisodeChapter: null,
						rejection: null,
						at: QUESTION_AT,
						spokenAnswerKey: "story-chat-turn",
						attachments: [],
					}}
					index={0}
					uncompactedChatTurnStart={0}
					isLast
					isStreaming={isThinking}
					now={NOW}
					author={{ userId: QUESTION_AUTHOR.userId, username: QUESTION_AUTHOR.username, avatarVersion: null }}
					voiceChatPage={null}
				/>
			</div>
			{/* a new key remounts the composer from the draft control */}
			<ComposerBox
				key={draft}
				draft={draft}
				isThinking={isThinking}
				attachments={hasAttachments ? STORY_ATTACHMENTS : []}
				onSendQuestion={onSendQuestion}
				onAddFiles={onAddFiles}
				onRemoveAttachment={onRemoveAttachment}
			/>
		</div>
	)
}

// the composer: the attachment chips over the question box, the paperclip at the left, and clear and send at the right.
// while carl is thinking, the reply is streaming, so the send slot shows stop
function ComposerBox({
	draft,
	isThinking,
	attachments,
	onSendQuestion,
	onAddFiles,
	onRemoveAttachment,
}: {
	draft: string
	isThinking: boolean
	attachments: ChatAttachment[]
	onSendQuestion: (question: string) => void
	onAddFiles: (files: File[]) => void
	onRemoveAttachment: (index: number) => void
}) {
	// the question being written. send waits for text or an attachment
	const [question, setQuestion] = useState(draft)
	const isSendDisabled = question.trim() === "" && attachments.length === 0
	return (
		<form
			autoComplete="off"
			className={COMPOSER_BAR_CLASS}
			onSubmit={(event) => {
				event.preventDefault()
				onSendQuestion(question)
			}}
		>
			<ChatAttachmentChips attachments={attachments} onRemove={onRemoveAttachment} />
			<FileDropZone className={COMPOSER_FRAME_CLASS} onDropFiles={onAddFiles}>
				<textarea
					rows={1}
					value={question}
					onChange={(event) => setQuestion(event.target.value)}
					placeholder={CHAT_QUESTION_PLACEHOLDER}
					aria-label="Ask Carl"
					autoComplete="off"
					className={COMPOSER_BOX_CLASS}
				/>
				{/* the buttons under the question */}
				<div className="mt-1 flex items-center gap-2">
					<div className="flex shrink-0 items-center">
						<AttachButton onAddFiles={onAddFiles} />
					</div>
					<div className="ml-auto flex items-center gap-2">
						{question !== "" && (
							<button
								type="button"
								aria-label="Clear draft"
								onClick={() => setQuestion("")}
								className={ICON_BUTTON_CLASS}
							>
								<X className="size-4" />
							</button>
						)}
						{isThinking ? (
							<button type="button" aria-label="Stop" className={SEND_BUTTON_CLASS}>
								<Square className="size-3 fill-current" />
							</button>
						) : (
							<button type="submit" aria-label="Send" disabled={isSendDisabled} className={SEND_BUTTON_CLASS}>
								<ArrowUp className="size-4" />
							</button>
						)}
					</div>
				</div>
			</FileDropZone>
		</form>
	)
}

// the paperclip with its tooltip, which opens the hidden file picker
function AttachButton({ onAddFiles }: { onAddFiles: (files: File[]) => void }) {
	const inputRef = useRef<HTMLInputElement>(null)
	return (
		<>
			<input
				ref={inputRef}
				type="file"
				multiple
				accept={CHAT_FILE_PICKER_ACCEPT}
				className="hidden"
				onChange={(event) => {
					onAddFiles(Array.from(event.target.files ?? []))
					event.target.value = ""
				}}
			/>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						aria-label="Add files or photos"
						onClick={() => inputRef.current?.click()}
						className={ICON_BUTTON_CLASS}
					>
						<Paperclip className="size-4" />
					</button>
				</TooltipTrigger>
				<TooltipContent>Add files or photos</TooltipContent>
			</Tooltip>
		</>
	)
}

const meta = {
	title: "Patterns/ChatBubble",
	component: ChatBubblePattern,
	args: {
		question: "Which of these LLM tooling stacks handles streaming best?",
		answer:
			"**Short version:** the second stack.\n\n- It streams tokens as they arrive.\n- The other two buffer each tool call first.",
		isThinking: false,
		draft: "",
		hasAttachments: false,
		onSendQuestion: fn(),
		onAddFiles: fn(),
		onRemoveAttachment: fn(),
	},
	argTypes: {
		question: { control: "text" },
		answer: { control: "text" },
		isThinking: { control: "boolean" },
		draft: { control: "text" },
		hasAttachments: { control: "boolean" },
		onSendQuestion: { control: false },
		onAddFiles: { control: false },
		onRemoveAttachment: { control: false },
	},
	// the docked chat panel's width on a wide screen, 30rem
	decorators: [
		(Story) => (
			<div className="bg-popover rounded-xl border" style={{ maxWidth: 480 }}>
				<Story />
			</div>
		),
	],
} satisfies Meta<typeof ChatBubblePattern>

export default meta
type Story = StoryObj<typeof meta>

// a question and carl's answer over an empty composer
export const Conversation: Story = {}

// carl's thinking bubble while the answer has not started, with stop in the send slot
export const Thinking: Story = { args: { isThinking: true } }

// a question long enough to wrap inside its bubble's width
export const LongQuestion: Story = {
	args: {
		question:
			"I read the benchmark post and the follow-up thread. Which of these LLM tooling stacks handles streaming best when every reply calls two tools and the chat is already a few hundred turns long?",
	},
}

// the composer with a draft and three attachment chips over it
export const ComposerWithAttachments: Story = {
	args: { draft: "Compare these to the benchmark post.", hasAttachments: true },
}
