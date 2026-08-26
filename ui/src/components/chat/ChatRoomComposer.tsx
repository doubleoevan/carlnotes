import { ALL_USERNAME, CARL_USERNAME, isCarlMessage, toChatMentions } from "@shared/chatMentions"
import {
	CHAT_MAX_ATTACHMENTS,
	CHAT_ROOM_MESSAGE_MAX_CHARS,
	type ChatAttachment,
	type ChatRoomMessage,
} from "@shared/contracts"
import { ArrowUp, ChevronDown, Paperclip, Reply } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { ChatAttachmentChips } from "@/components/chat/ChatAttachmentChips"
import { toAttachment } from "@/components/chat/useTopicChat"
import { FileDropZone } from "@/components/common/FileDropZone"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { cn, FILE_PICKER_ACCEPT, isWideScreen } from "@/lib/utils"

// how tall the message box may grow before it scrolls inside itself, matching the private chat's composer
const MAX_MESSAGE_BOX_HEIGHT_PX = 120

// the active username mention token behind the caret: an @ at a word start and whatever prefix follows it
const ACTIVE_CHAT_MENTION_PATTERN = /(^|[^\w@.-])@([\w-]*)$/

/**
 * What the @ autocomplete suggests: Carl pinned first, then the room's members, narrowed by the
 * typed prefix. Nobody outside the chat members is ever suggested, so a departed chat member doesn't appear.
 */
export function toChatMentionSuggestions(mentionQuery: string, memberUsernames: string[]): string[] {
	return [CARL_USERNAME, ...memberUsernames.filter((username) => username.toLowerCase() !== CARL_USERNAME)].filter(
		(username) => username.toLowerCase().startsWith(mentionQuery.toLowerCase()),
	)
}

/**
 * The chat composer's shell with nothing live in it, for someone the room is closed to.
 * Nothing here responds to a click, and it is hidden from assistive tech.
 */
export function DisabledRoomComposer({ placeholder }: { placeholder?: string }) {
	return (
		<div aria-hidden="true" className="shrink-0 border-t px-3 py-2.5 opacity-60">
			<div className="bg-background rounded-2xl border px-3 py-2">
				<p className="text-muted-foreground py-1 text-base leading-relaxed sm:text-sm">
					{placeholder ?? toComposerPlaceholder(ALL_USERNAME)}
				</p>
				<div className="mt-1 flex items-center justify-between">
					<span className="text-muted-foreground grid size-11 place-items-center sm:size-8">
						<Paperclip className="size-4" />
					</span>
					<span className="bg-primary text-primary-foreground grid size-11 shrink-0 place-items-center rounded-full opacity-50 sm:size-8">
						<ArrowUp className="size-4" />
					</span>
				</div>
			</div>
		</div>
	)
}

/**
 * The chat room composer: the message box with the @ autocomplete and the reply selector.
 * The placeholder shows the reply target's mention.
 */
export function ChatRoomComposer({
	memberUsernames,
	replyTo,
	isAutoReply,
	replyMessages,
	onSelectReplyMessage,
	onSendMessage,
}: {
	// the current members the autocomplete suggests after Carl, never the current user or a departed member
	memberUsernames: string[]
	replyTo: ChatRoomMessage | null
	// whether the reply user was chosen automatically instead of by the user, which a typed mention may override
	isAutoReply: boolean
	// each other author's latest message, newest first, for the composer's suggestion list
	replyMessages: { username: string; message: ChatRoomMessage }[]
	onSelectReplyMessage: (message: ChatRoomMessage) => void
	onSendMessage: (content: string, replyToMessageId: number | null, attachments: ChatAttachment[]) => void
}) {
	const [message, setMessage] = useState("")
	// the attachment file waiting to send with the next message, removable until sent
	const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([])

	// selected and dropped files are read the same way, and the limit is what a message may carry at once
	const attachSelectedFiles = (selected: File[]): void => {
		for (const file of selected.slice(0, CHAT_MAX_ATTACHMENTS - pendingAttachments.length)) {
			void toAttachment(file)
				.then((converted) => converted && setPendingAttachments((waiting) => [...waiting, converted]))
				.catch((error) => console.error("attachment read failed", error))
		}
	}
	// the username mention prefix being typed, null while nothing matches
	const [mentionQuery, setMentionQuery] = useState<string | null>(null)
	const [highlightMentionIndex, setHighlightMentionIndex] = useState(0)
	const messageBoxRef = useRef<HTMLTextAreaElement>(null)

	// tapping Reply focus the input if the user selected a reply user on desktop
	// biome-ignore lint/correctness/useExhaustiveDependencies: the target changing is the trigger, not the flag
	useEffect(() => {
		if ((replyTo && !isAutoReply) || isWideScreen()) {
			messageBoxRef.current?.focus()
		}
	}, [replyTo])

	// grow the message box with the message and shrink it back when a send clears it
	useEffect(() => {
		const messageBox = messageBoxRef.current
		if (!messageBox) {
			return
		}
		// expand the box to hold its message up to a maximum height before scrolling
		messageBox.style.height = "auto"
		if (message !== "") {
			messageBox.style.height = `${Math.min(messageBox.scrollHeight, MAX_MESSAGE_BOX_HEIGHT_PX)}px`
		}
	}, [message])

	// carl is suggested first, then the chat members, narrowed by the typed prefix
	const usernameSuggestions = mentionQuery === null ? [] : toChatMentionSuggestions(mentionQuery, memberUsernames)

	// who the message is sent to, updated as the message is typed
	const chatMentions = toChatMentions(message, [CARL_USERNAME, ALL_USERNAME, ...memberUsernames])
	const mentionedUser = chatMentions[0] ?? null
	const hasMention = mentionedUser !== null && (replyTo === null || isAutoReply)
	const replyUser = hasMention
		? mentionedUser
		: replyTo
			? isCarlMessage(replyTo)
				? CARL_USERNAME
				: replyTo.authorUsername
			: ALL_USERNAME
	const replyUserLabel = toMentionLabel(replyUser)

	// selecting a user replies to their latest message.
	// selecting @all or a carl with no messages writes the mention instead
	const handleSelectReplyUser = (
		selectedUser: { username: string; message: ChatRoomMessage } | "all" | "carl",
	): void => {
		if (selectedUser === "all" || selectedUser === "carl") {
			setMessage(
				toChangedMentionMessage(message, selectedUser === "all" ? ALL_USERNAME : CARL_USERNAME, memberUsernames),
			)
			messageBoxRef.current?.focus()
			return
		}
		setMessage(toMessage(message, memberUsernames))
		onSelectReplyMessage(selectedUser.message)
		messageBoxRef.current?.focus()
	}

	// each keystroke re-reads the token behind the caret to suggest the users to mention
	function handleMessageChange(event: React.ChangeEvent<HTMLTextAreaElement>): void {
		setMessage(event.target.value)
		const selectedMentionQuery = event.target.value.slice(0, event.target.selectionStart ?? 0)
		const activeMentionQuery = selectedMentionQuery.match(ACTIVE_CHAT_MENTION_PATTERN)
		setMentionQuery(activeMentionQuery ? (activeMentionQuery[2] ?? "") : null)
		setHighlightMentionIndex(0)
	}

	// selecting a username replaces the typed prefix and puts the caret after it
	function selectMentionedUsername(username: string): void {
		const messageBox = messageBoxRef.current
		if (!messageBox) {
			return
		}

		// selecting a username replaces the typed prefix with the full one
		const caret = messageBox.selectionStart ?? message.length
		const messageStart = message.slice(0, caret).replace(ACTIVE_CHAT_MENTION_PATTERN, `$1@${username} `)
		setMessage(messageStart + message.slice(caret))
		setMentionQuery(null)
		messageBox.focus()
	}

	// post the trimmed message and reset the composer and the reply user
	function handleSendMessage(): void {
		const content = message.trim()
		if (content === "") {
			return
		}
		// a mention addresses itself, a previous reply target starts a message thread
		const isMessageThread = !hasMention && replyTo !== null
		const sentContent = hasMention || isMessageThread ? content : `@${ALL_USERNAME} ${content}`
		onSendMessage(sentContent, isMessageThread ? (replyTo?.id ?? null) : null, pendingAttachments)
		setPendingAttachments([])
		setMessage("")
		setMentionQuery(null)
	}

	// while the autocomplete is open, it owns the arrows, Enter, Tab, and Escape
	function handleAutocompleteKey(event: React.KeyboardEvent<HTMLTextAreaElement>): boolean {
		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault()
			const step = event.key === "ArrowDown" ? 1 : -1
			setHighlightMentionIndex((index) => (index + step + usernameSuggestions.length) % usernameSuggestions.length)
			return true
		}

		// enter and tab select the highlighted username
		if (event.key === "Enter" || event.key === "Tab") {
			event.preventDefault()
			const username = usernameSuggestions[highlightMentionIndex]
			if (username) {
				selectMentionedUsername(username)
			}
			return true
		}

		// escape closes the list without touching the message
		if (event.key === "Escape") {
			event.stopPropagation()
			setMentionQuery(null)
			return true
		}
		return false
	}

	// the autocomplete gets the key first while open. otherwise Enter sends and Shift+Enter starts a new line
	function handleMessageKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
		if (usernameSuggestions.length > 0 && handleAutocompleteKey(event)) {
			return
		}
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault()
			handleSendMessage()
		}
	}

	return (
		<form
			autoComplete="off"
			className="relative shrink-0 border-t px-3 py-2.5"
			onSubmit={(event) => {
				event.preventDefault()
				handleSendMessage()
			}}
		>
			{/* the username suggestions autocomplete floats above the input, carl pinned first then the chat members */}
			{usernameSuggestions.length > 0 && (
				<ul className="bg-popover absolute right-3 bottom-full left-3 z-10 mb-1 overflow-hidden rounded-md border shadow-md">
					{usernameSuggestions.map((username, index) => (
						<li key={username}>
							<button
								type="button"
								onMouseDown={(event) => {
									event.preventDefault()
									selectMentionedUsername(username)
								}}
								className={cn(
									"w-full px-3 py-1.5 text-left text-sm",
									index === highlightMentionIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
								)}
							>
								@{username}
							</button>
						</li>
					))}
				</ul>
			)}

			{/* the username reply dropdown names who the message answers */}
			{replyUserLabel && (
				<ReplyToDropdown
					currentReplyUser={replyUserLabel}
					replyMessages={replyMessages}
					onSelectReplyTo={handleSelectReplyUser}
				/>
			)}
			<ChatAttachmentChips
				attachments={pendingAttachments}
				onRemove={(index) => setPendingAttachments((waiting) => waiting.filter((_, at) => at !== index))}
			/>
			{/* the message field owns its own line, with the send below it, so a long line won't get squeezed */}
			<FileDropZone className="bg-background rounded-2xl border px-3 py-2" onDropFiles={attachSelectedFiles}>
				{/* the box is 16px on touch screens to keep the panel on the screen.
					autocomplete is off, so a phone offers no passwords, cards, or addresses on the message field */}
				<textarea
					ref={messageBoxRef}
					rows={1}
					value={message}
					maxLength={CHAT_ROOM_MESSAGE_MAX_CHARS}
					onChange={handleMessageChange}
					onKeyDown={handleMessageKeyDown}
					placeholder={toComposerPlaceholder(replyUser)}
					aria-label="Message the room"
					autoComplete="off"
					className="placeholder:text-muted-foreground w-full resize-none bg-transparent py-1 text-base leading-relaxed outline-none sm:text-sm"
				/>
				<div className="mt-1 flex items-center justify-between">
					{/* only one attachment file can be sent with the message */}
					<label
						aria-label="Attach a file"
						className="text-muted-foreground hover:text-foreground grid size-11 cursor-pointer place-items-center rounded-full sm:size-8"
					>
						<Paperclip className="size-4" />
						<input
							type="file"
							accept={FILE_PICKER_ACCEPT}
							className="sr-only"
							multiple
							onChange={(event) => {
								const selected = Array.from(event.target.files ?? [])
								event.target.value = ""
								attachSelectedFiles(selected)
							}}
						/>
					</label>
					<button
						type="submit"
						aria-label="Send"
						className="bg-primary text-primary-foreground grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-50 sm:size-8"
						disabled={message.trim() === ""}
					>
						<ArrowUp className="size-4" />
					</button>
				</div>
			</FileDropZone>
		</form>
	)
}

// the reply to user dropdown menu
function ReplyToDropdown({
	currentReplyUser,
	replyMessages,
	onSelectReplyTo,
}: {
	currentReplyUser: string
	replyMessages: { username: string; message: ChatRoomMessage }[]
	onSelectReplyTo: (selectedMessage: { username: string; message: ChatRoomMessage } | "all" | "carl") => void
}) {
	const [isOpen, setIsOpen] = useState(false)

	// selecting closes the menu and passes the message to the callback
	const handleSelectReplyTo = (
		selectedMessage: { username: string; message: ChatRoomMessage } | "all" | "carl",
	): void => {
		setIsOpen(false)
		onSelectReplyTo(selectedMessage)
	}

	return (
		<Popover open={isOpen} onOpenChange={setIsOpen}>
			<PopoverTrigger asChild>
				<button
					type="button"
					aria-label="Pick who to reply to"
					className="text-muted-foreground hover:text-foreground mb-1.5 flex items-center gap-1.5 text-xs"
				>
					<Reply className="size-3" />
					{`Replying to ${currentReplyUser}`}
					<ChevronDown className="size-3" />
				</button>
			</PopoverTrigger>
			<PopoverContent align="start" className="w-44 p-1">
				{/* @all reaches the whole room and starts carl's turn beside it */}
				<button type="button" onClick={() => handleSelectReplyTo("all")} className={REPLY_OPTION_CLASS}>
					@all
				</button>
				{!replyMessages.some((message) => message.username === "Carl") && (
					<button type="button" onClick={() => handleSelectReplyTo("carl")} className={REPLY_OPTION_CLASS}>
						Carl
					</button>
				)}
				{replyMessages.map((message) => (
					<button
						key={message.username}
						type="button"
						onClick={() => handleSelectReplyTo(message)}
						className={REPLY_OPTION_CLASS}
					>
						{message.username}
					</button>
				))}
			</PopoverContent>
		</Popover>
	)
}

// the placeholder starts with the selected target's mention
function toComposerPlaceholder(replyUsername: string): string {
	return `@${replyUsername}, penny for your thoughts…`
}

// an option row inside the reply menu selector
const REPLY_OPTION_CLASS = "hover:bg-accent flex min-h-9 w-full items-center rounded-md px-2 text-sm"

// what the menu calls a mention: carl by name, @all as typed, anyone else by their username
function toMentionLabel(username: string): string {
	if (username === CARL_USERNAME) {
		return "Carl"
	}
	return username === ALL_USERNAME ? "@all" : username
}

// swap the current mention for the selected mention if there is one
export function toChangedMentionMessage(message: string, username: string, memberUsernames: string[]): string {
	return `@${username} ${toMessage(message, memberUsernames)}`
}

// the message without its current mention, so a new mention updates
export function toMessage(message: string, memberUsernames: string[]): string {
	const currentMentions = message.match(/^@([\w-]+)\s*/)
	const chatUsernames = [
		CARL_USERNAME,
		ALL_USERNAME,
		...memberUsernames.map((memberUsername) => memberUsername.toLowerCase()),
	]
	if (currentMentions && chatUsernames.includes((currentMentions[1] ?? "").toLowerCase())) {
		return message.slice(currentMentions[0].length)
	}
	return message
}
