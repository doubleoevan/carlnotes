import { CHAT_QUESTION_CHARS, type KeptChatAttachment } from "@shared/contracts"
import { ArrowUp, FileText, FileX2, Film, Image, Minus, Paperclip, Square, X } from "lucide-react"
import { useEffect, useRef } from "react"
import { ChatAttachmentChips } from "@/components/chat/ChatAttachmentChips"
import type { TopicChat } from "@/components/chat/useTopicChat"
import { FileDropZone } from "@/components/common/FileDropZone"
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { ICON_BUTTON_CLASS } from "@/lib/styleClasses"
import { CHAT_FILE_PICKER_ACCEPT, isWideScreen } from "@/lib/utils"

// how tall the question box may grow before it scrolls inside itself
const MAX_QUESTION_BOX_HEIGHT_PX = 120

/**
 * The chat composer: the question box, its attachment chips, and the send button that becomes a stop button while a reply streams.
 */
// what the private chat's question box says while it is empty
export const CHAT_QUESTION_PLACEHOLDER = "Hand-crafted notes are richer…"

export function ChatComposer({
	chat,
	onSendQuestion,
}: {
	// the conversation the composer writes into, which owns the draft, its attachments, and the stream
	chat: TopicChat
	// a visitor's send routes to the signup instead of the conversation
	onSendQuestion: () => void
}) {
	const { question, attachments, keptAttachments, isStreaming, isSignupRequired } = chat
	const questionBoxRef = useRef<HTMLTextAreaElement>(null)

	// a wide screen focuses the composer as soon as the panel opens, so the user can just start typing
	useEffect(() => {
		if (isWideScreen()) {
			questionBoxRef.current?.focus()
		}
	}, [])

	// grow the input box with the question and shrink it back when a send clears it
	useEffect(() => {
		const questionBox = questionBoxRef.current
		if (!questionBox) {
			return
		}
		// expand the question box to hold its content up to a maximum height before scrolling
		questionBox.style.height = "auto"
		if (question !== "") {
			questionBox.style.height = `${Math.min(questionBox.scrollHeight, MAX_QUESTION_BOX_HEIGHT_PX)}px`
		}
	}, [question])

	// Enter sends the question and Shift+Enter starts a new line
	function handleSendQuestion(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault()
			onSendQuestion()
		}
	}

	// pasted files become attachments, and a paste too long for the box becomes a text chip instead
	function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>): void {
		const files = Array.from(event.clipboardData.files)
		if (files.length > 0) {
			event.preventDefault()
			void chat.addFiles(files)
			return
		}

		// a paste that would run past the question limit becomes a chip
		const text = event.clipboardData.getData("text")
		if (question.length + text.length > CHAT_QUESTION_CHARS) {
			event.preventDefault()
			chat.addPastedText(text)
		}
	}

	return (
		<form
			autoComplete="off"
			className="shrink-0 border-t px-3 py-2.5"
			onSubmit={(event) => {
				event.preventDefault()
				onSendQuestion()
			}}
		>
			{/* attachments show as chips in the input, each is removable until the send */}
			{<ChatAttachmentChips attachments={attachments} onRemove={chat.removeAttachment} />}
			<FileDropZone
				className="bg-background rounded-2xl border px-3 py-2"
				onDropFiles={(files) => {
					// a visitor's file drop routes to the signup
					if (isSignupRequired) {
						onSendQuestion()
						return
					}
					void chat.addFiles(files)
				}}
			>
				{/* the input box is 16px to keep the panel on the screen. autocomplete is off,
						so a phone offers no passwords, cards, or addresses over a chat field */}
				<textarea
					ref={questionBoxRef}
					rows={1}
					value={question}
					maxLength={CHAT_QUESTION_CHARS}
					onChange={(event) => chat.setQuestion(event.target.value)}
					onKeyDown={handleSendQuestion}
					onPaste={handlePaste}
					placeholder={CHAT_QUESTION_PLACEHOLDER}
					aria-label="Ask about this topic"
					autoComplete="off"
					className="placeholder:text-muted-foreground w-full resize-none bg-transparent py-1 text-base leading-relaxed outline-none sm:text-sm"
				/>
				{/* the buttons sit under the question: attachments to the left, clear and send to the right */}
				<div className="mt-1 flex items-center gap-2">
					{/* the add and remove attachment buttons sit next to each other */}
					<div className="flex shrink-0 items-center">
						{/* a visitor's attachment routes to the signup page */}
						<AttachButton isSignupRequired={isSignupRequired} onSelect={chat.addFiles} onSignup={onSendQuestion} />
						{keptAttachments.length > 0 && (
							<KeptAttachmentsButton
								keptAttachments={keptAttachments}
								onRemoveKeptAttachment={chat.removeKeptAttachment}
							/>
						)}
					</div>
					{/* the clear and send buttons sit to the right of the attachment buttons. each one guards its
					    mousedown to keep the caret in the question box, so a phone's keyboard never closes under
					    the tap and moves the button out from under the finger before the click lands */}
					<div className="ml-auto flex items-center gap-2">
						{/* an X button clears the input and hands focus back, only appearing when there is content */}
						{question !== "" && (
							<button
								type="button"
								aria-label="Clear draft"
								onMouseDown={(event) => event.preventDefault()}
								onClick={() => {
									chat.setQuestion("")
									questionBoxRef.current?.focus()
								}}
								className={ICON_BUTTON_CLASS}
							>
								<X className="size-4" />
							</button>
						)}
						{/* the stop button ends a response stream. the arrow button sends the question or forwards a visitor to the signup page */}
						{isStreaming ? (
							<button
								type="button"
								aria-label="Stop"
								onMouseDown={(event) => event.preventDefault()}
								onClick={chat.stop}
								className="bg-primary text-primary-foreground grid size-11 shrink-0 place-items-center rounded-full sm:size-8"
							>
								<Square className="size-3 fill-current" />
							</button>
						) : isSignupRequired ? (
							<Tooltip>
								<TooltipTrigger asChild>
									<button
										type="submit"
										aria-label="Sign up to chit-chat"
										onMouseDown={(event) => event.preventDefault()}
										className="bg-primary text-primary-foreground grid size-11 shrink-0 place-items-center rounded-full sm:size-8"
									>
										<ArrowUp className="size-4" />
									</button>
								</TooltipTrigger>
								<TooltipContent>Sign up to chit-chat</TooltipContent>
							</Tooltip>
						) : (
							<button
								type="submit"
								aria-label="Send"
								disabled={question.trim() === ""}
								onMouseDown={(event) => event.preventDefault()}
								className="bg-primary text-primary-foreground grid size-11 shrink-0 place-items-center rounded-full sm:size-8 disabled:opacity-40"
							>
								<ArrowUp className="size-4" />
							</button>
						)}
					</div>
				</div>
			</FileDropZone>
		</form>
	)
}

// a file-x opening the downloadable attachments for this topic chat. deleting an attachment frees a slot under the limit
function KeptAttachmentsButton({
	keptAttachments,
	onRemoveKeptAttachment,
}: {
	keptAttachments: KeptChatAttachment[]
	onRemoveKeptAttachment: (keptAttachmentId: string) => Promise<void>
}) {
	return (
		<Popover>
			<Tooltip>
				<TooltipTrigger asChild>
					<PopoverTrigger aria-label="Clear files or photos" className={ICON_BUTTON_CLASS}>
						<FileX2 className="size-4" />
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent>Clear files or photos</TooltipContent>
			</Tooltip>
			<PopoverContent align="start" className="w-64 text-sm" bodyClassName="p-2">
				{/* the minimize button in the corner of the panel closes the attachments menu */}
				<Tooltip>
					<TooltipTrigger asChild>
						<PopoverClose
							aria-label="Minimize"
							className="text-muted-foreground hover:text-foreground absolute top-1.5 right-1.5 grid size-9 place-items-center rounded-md sm:size-6"
						>
							<Minus className="size-4" />
						</PopoverClose>
					</TooltipTrigger>
					<TooltipContent>Minimize</TooltipContent>
				</Tooltip>
				{/* the centered label names the attachments menu */}
				<div className="text-muted-foreground font-display mb-1 text-center text-xs tracking-wide uppercase">
					Chat files
				</div>
				{keptAttachments.map((keptAttachment) => (
					<div key={keptAttachment.id} className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1">
						{keptAttachment.kind === "image" ? (
							<Image aria-hidden="true" className="text-muted-foreground size-3.5 shrink-0" />
						) : keptAttachment.kind === "video" ? (
							<Film aria-hidden="true" className="text-muted-foreground size-3.5 shrink-0" />
						) : (
							<FileText aria-hidden="true" className="text-muted-foreground size-3.5 shrink-0" />
						)}
						<Tooltip>
							<TooltipTrigger asChild>
								{/* a file download must be a full request, so it bypasses AnchorLink's client-side routing */}
								<a
									href={`/api/chat-attachments/${keptAttachment.id}/download`}
									download={keptAttachment.name}
									className="text-link min-w-0 flex-1 truncate hover:underline"
								>
									{keptAttachment.name}
								</a>
							</TooltipTrigger>
							<TooltipContent>Click to download</TooltipContent>
						</Tooltip>
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									aria-label={`Delete ${keptAttachment.name}`}
									onClick={() => void onRemoveKeptAttachment(keptAttachment.id)}
									className="text-muted-foreground hover:text-foreground grid size-9 shrink-0 place-items-center sm:size-5"
								>
									<X className="size-3.5" />
								</button>
							</TooltipTrigger>
							<TooltipContent>
								Delete <span className="font-semibold">{keptAttachment.name}</span>
							</TooltipContent>
						</Tooltip>
					</div>
				))}
			</PopoverContent>
		</Popover>
	)
}

// the paperclip and its hidden file picker. a visitor's click routes to signup page
function AttachButton({
	isSignupRequired,
	onSelect,
	onSignup,
}: {
	isSignupRequired: boolean
	onSelect: (files: File[]) => Promise<void>
	onSignup: () => void
}) {
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
					void onSelect(Array.from(event.target.files ?? []))
					event.target.value = ""
				}}
			/>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						aria-label={isSignupRequired ? "Sign up to add files" : "Add files or photos"}
						onClick={() => (isSignupRequired ? onSignup() : inputRef.current?.click())}
						className={ICON_BUTTON_CLASS}
					>
						<Paperclip className="size-4" />
					</button>
				</TooltipTrigger>
				<TooltipContent>{isSignupRequired ? "Sign up to add files" : "Add files or photos"}</TooltipContent>
			</Tooltip>
		</>
	)
}
