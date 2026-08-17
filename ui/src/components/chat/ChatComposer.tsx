import { CHAT_QUESTION_CHARS, type ChatAttachment, type KeptChatAttachment } from "@shared/contracts"
import { ArrowUp, FileText, FileX2, Image, Minus, Paperclip, Square, X } from "lucide-react"
import { useEffect, useRef } from "react"
import { FileDropZone } from "@/components/common/FileDropZone"
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { FILE_PICKER_ACCEPT } from "@/lib/utils"

// how tall the question box may grow before it scrolls inside itself
const MAX_QUESTION_BOX_HEIGHT_PX = 120

/**
 * The chat composer: the question box, its attachment chips, and the send button that becomes a stop button while a reply streams.
 */
export function ChatComposer({
	question,
	attachments,
	keptAttachments,
	isStreaming,
	isSignupRequired,
	onChange,
	onAddFiles,
	onAddPastedText,
	onRemoveAttachment,
	onRemoveKeptAttachment,
	onSend,
	onStop,
}: {
	question: string
	attachments: ChatAttachment[]
	keptAttachments: KeptChatAttachment[]
	isStreaming: boolean
	isSignupRequired: boolean
	onChange: (value: string) => void
	onAddFiles: (files: File[]) => Promise<void>
	onAddPastedText: (text: string) => void
	onRemoveAttachment: (index: number) => void
	onRemoveKeptAttachment: (keptAttachmentId: string) => Promise<void>
	onSend: () => void
	onStop: () => void
}) {
	const questionBoxRef = useRef<HTMLTextAreaElement>(null)

	// focus the composer as soon as the panel opens, so the user can just start typing
	useEffect(() => {
		questionBoxRef.current?.focus()
	}, [])

	// grow the input box with the question and shrink it back when a send clears it
	useEffect(() => {
		const questionBox = questionBoxRef.current
		if (!questionBox) {
			return
		}
		// expand the question box to hold its content up to a maxiumum height before scrolling
		questionBox.style.height = "auto"
		if (question !== "") {
			questionBox.style.height = `${Math.min(questionBox.scrollHeight, MAX_QUESTION_BOX_HEIGHT_PX)}px`
		}
	}, [question])

	// Enter sends the question and Shift+Enter starts a new line
	function handleQuestionKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault()
			onSend()
		}
	}

	// pasted files become attachments, and a paste too long for the box folds into a text chip instead
	function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>): void {
		const files = Array.from(event.clipboardData.files)
		if (files.length > 0) {
			event.preventDefault()
			void onAddFiles(files)
			return
		}

		// a paste that would run past the question cap becomes a chip
		const text = event.clipboardData.getData("text")
		if (question.length + text.length > CHAT_QUESTION_CHARS) {
			event.preventDefault()
			onAddPastedText(text)
		}
	}

	return (
		<FileDropZone
			onDropFiles={(files) => {
				// a visitor's file drop routes to the signup
				if (isSignupRequired) {
					onSend()
					return
				}
				void onAddFiles(files)
			}}
		>
			<form
				className="border-t px-3 py-2.5"
				onSubmit={(event) => {
					event.preventDefault()
					onSend()
				}}
			>
				{/* attachments show as chips in the input, each is removable until the send */}
				{attachments.length > 0 && <AttachmentChips attachments={attachments} onRemove={onRemoveAttachment} />}
				<div className="flex items-end gap-2">
					{/* the add and remove attachment buttons sit next to each other */}
					<div className="flex shrink-0 items-center">
						{/* a visitor's attachment routes to the signup page */}
						<AttachButton isSignupRequired={isSignupRequired} onPick={onAddFiles} onSignup={onSend} />
						{/* the remove attachemnts button only shows if there are attachments kept */}
						{keptAttachments.length > 0 && (
							<KeptAttachmentsButton
								keptAttachments={keptAttachments}
								onRemoveKeptAttachment={onRemoveKeptAttachment}
							/>
						)}
					</div>
					{/* the input box is 16px to keep the panel on the screen */}
					<textarea
						ref={questionBoxRef}
						rows={1}
						value={question}
						maxLength={CHAT_QUESTION_CHARS}
						onChange={(event) => onChange(event.target.value)}
						onKeyDown={handleQuestionKeyDown}
						onPaste={handlePaste}
						placeholder="Hand-crafted notes are richer…"
						aria-label="Ask about this topic"
						className="placeholder:text-muted-foreground min-w-0 flex-1 resize-none bg-transparent py-2 text-base leading-relaxed outline-none sm:py-1 sm:text-sm"
					/>
					{/* an X button clears the input and hands focus back, only appearing when there is content */}
					{question !== "" && (
						<button
							type="button"
							aria-label="Clear draft"
							onClick={() => {
								onChange("")
								questionBoxRef.current?.focus()
							}}
							className="text-muted-foreground hover:text-foreground grid size-11 shrink-0 place-items-center rounded-full sm:size-8"
						>
							<X className="size-4" />
						</button>
					)}
					{/* the stop button ends a response stream. the arrow button sends the question or forwards a visitor to the signpu page */}
					{isStreaming ? (
						<button
							type="button"
							aria-label="Stop"
							onClick={onStop}
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
							className="bg-primary text-primary-foreground grid size-11 shrink-0 place-items-center rounded-full sm:size-8 disabled:opacity-40"
						>
							<ArrowUp className="size-4" />
						</button>
					)}
				</div>
			</form>
		</FileDropZone>
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
					<PopoverTrigger
						aria-label="Clear files or photos"
						className="text-muted-foreground hover:text-foreground grid size-11 shrink-0 place-items-center rounded-full sm:size-8"
					>
						<FileX2 className="size-4" />
					</PopoverTrigger>
				</TooltipTrigger>
				<TooltipContent>Clear files or photos</TooltipContent>
			</Tooltip>
			<PopoverContent align="start" className="w-64 p-2 text-sm">
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
							<TooltipContent>{`Delete ${keptAttachment.name}`}</TooltipContent>
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
	onPick,
	onSignup,
}: {
	isSignupRequired: boolean
	onPick: (files: File[]) => Promise<void>
	onSignup: () => void
}) {
	const inputRef = useRef<HTMLInputElement>(null)
	return (
		<>
			<input
				ref={inputRef}
				type="file"
				multiple
				accept={FILE_PICKER_ACCEPT}
				className="hidden"
				onChange={(event) => {
					void onPick(Array.from(event.target.files ?? []))
					event.target.value = ""
				}}
			/>
			<Tooltip>
				<TooltipTrigger asChild>
					<button
						type="button"
						aria-label={isSignupRequired ? "Sign up to add files" : "Add files or photos"}
						onClick={() => (isSignupRequired ? onSignup() : inputRef.current?.click())}
						className="text-muted-foreground hover:text-foreground grid size-11 shrink-0 place-items-center rounded-full sm:size-8"
					>
						<Paperclip className="size-4" />
					</button>
				</TooltipTrigger>
				<TooltipContent>{isSignupRequired ? "Sign up to add files" : "Add files or photos"}</TooltipContent>
			</Tooltip>
		</>
	)
}

// this question's attachments as removable chips. an image gets a thumbnail and everything else gets a named chip
function AttachmentChips({
	attachments,
	onRemove,
}: {
	attachments: ChatAttachment[]
	onRemove: (index: number) => void
}) {
	return (
		<div className="mb-2 flex flex-wrap gap-1.5">
			{attachments.map((attachment, index) => (
				<div
					// biome-ignore lint/suspicious/noArrayIndexKey: two pastes share a name, and chips are stateless rows a shift repaints identically
					key={`${attachment.name}-${index}`}
					className="bg-muted flex items-center gap-1.5 rounded-lg border px-1.5 py-1 text-xs"
				>
					{attachment.kind === "image" ? (
						<img src={attachment.dataUrl} alt={attachment.name} className="size-6 rounded object-cover" />
					) : (
						<FileText className="text-muted-foreground size-3.5 shrink-0" />
					)}
					<span className="max-w-32 truncate">{attachment.name}</span>
					{attachment.kind === "text" && (
						<span className="text-muted-foreground shrink-0">{toCharacterCountLabel(attachment.text)}</span>
					)}
					<Tooltip>
						<TooltipTrigger asChild>
							<button
								type="button"
								aria-label={`Delete ${attachment.name}`}
								onClick={() => onRemove(index)}
								className="text-muted-foreground hover:text-foreground grid size-7 shrink-0 place-items-center sm:size-4"
							>
								<X className="size-3" />
							</button>
						</TooltipTrigger>
						<TooltipContent>{`Delete ${attachment.name}`}</TooltipContent>
					</Tooltip>
				</div>
			))}
		</div>
	)
}

// the number of characters in a large copy-paste text block that is turned into an attachment
function toCharacterCountLabel(text: string): string {
	return text.length < 1000 ? `${text.length} chars` : `${Math.round(text.length / 1000)}k chars`
}
