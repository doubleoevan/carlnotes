import { ALL_USERNAME, CARL_USERNAME, isModelChatMessage, toChatMentions } from "@shared/chatMentions"
import {
	CHAT_MAX_ATTACHMENTS,
	CHAT_ROOM_MESSAGE_MAX_CHARS,
	type ChatAttachment,
	type ChatRoomMessage,
	clipAttachmentText,
} from "@shared/contracts"
import { ArrowUp, ChevronDown, Paperclip, Reply } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { ChatAttachmentChips } from "@/components/chat/ChatAttachmentChips"
import { toAttachment } from "@/components/chat/useChatAttachments"
import type { ChatRoomReply } from "@/components/chat/useRoomReply"
import { FileDropZone } from "@/components/common/FileDropZone"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { MENU_OPTION_CLASS, MENU_OPTION_SELECTED_CLASS } from "@/lib/styleClasses"
import { CHAT_FILE_PICKER_ACCEPT, cn, isWideScreen } from "@/lib/utils"

// how tall the chat message box may grow before it scrolls inside itself, matching the private chat's composer
const MAX_MESSAGE_BOX_HEIGHT_PX = 120

// the active username chat mention token behind the caret: an @ at a word start and whatever prefix follows it
const ACTIVE_CHAT_MENTION_PATTERN = /(^|[^\w@.-])@([\w-]*)$/

/**
 * What the @ autocomplete username suggests: Carl pinned first, then the room's members, filtered by the typed-in prefix.
 */
export function toChatMentionSuggestions(mentionQuery: string, memberUsernames: string[]): string[] {
	return [CARL_USERNAME, ...memberUsernames.filter((username) => username.toLowerCase() !== CARL_USERNAME)].filter(
		(username) => username.toLowerCase().startsWith(mentionQuery.toLowerCase()),
	)
}

// what the autocomplete shows the composer: the open list and the handlers the chat message box wires in
type MentionAutocomplete = {
	usernameSuggestions: string[]
	highlightMentionIndex: number
	readMentionQuery: (chatMessageStart: string) => void
	selectMentionedUsername: (username: string) => void
	handleAutocompleteKey: (event: React.KeyboardEvent<HTMLTextAreaElement>) => boolean
	closeMentionList: () => void
}

// the @ autocomplete behind the chat message box: the typed prefix, the highlighted username, and the keys it owns
function useMentionAutocomplete(options: {
	memberUsernames: string[]
	chatMessage: string
	setChatMessage: (chatMessage: string) => void
	chatMessageBoxRef: React.RefObject<HTMLTextAreaElement | null>
}): MentionAutocomplete {
	const { memberUsernames, chatMessage, setChatMessage, chatMessageBoxRef } = options
	const [mentionQuery, setMentionQuery] = useState<string | null>(null)
	const [highlightMentionIndex, setHighlightMentionIndex] = useState(0)

	// carl is suggested first, then the chat members, narrowed by the typed prefix
	const usernameSuggestions = mentionQuery === null ? [] : toChatMentionSuggestions(mentionQuery, memberUsernames)

	// each keystroke re-reads the token behind the caret to suggest the users to mention
	const readMentionQuery = (chatMessageStart: string): void => {
		const activeMentionQuery = chatMessageStart.match(ACTIVE_CHAT_MENTION_PATTERN)
		setMentionQuery(activeMentionQuery ? (activeMentionQuery[2] ?? "") : null)
		setHighlightMentionIndex(0)
	}

	// selecting a username replaces the typed prefix and puts the caret after it
	const selectMentionedUsername = (username: string): void => {
		const chatMessageBox = chatMessageBoxRef.current
		if (!chatMessageBox) {
			return
		}

		// selecting a username replaces the typed prefix with the full one
		const caret = chatMessageBox.selectionStart ?? chatMessage.length
		const chatMessageStart = chatMessage.slice(0, caret).replace(ACTIVE_CHAT_MENTION_PATTERN, `$1@${username} `)
		setChatMessage(chatMessageStart + chatMessage.slice(caret))
		setMentionQuery(null)
		chatMessageBox.focus()
	}

	// while the autocomplete is open, it owns the arrows, Enter, Tab, and Escape
	const handleAutocompleteKey = (event: React.KeyboardEvent<HTMLTextAreaElement>): boolean => {
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

		// escape closes the list without touching the chat message
		if (event.key === "Escape") {
			event.stopPropagation()
			setMentionQuery(null)
			return true
		}
		return false
	}

	// the composer clears the list after a post, so a sent draft never leaves suggestions floating
	return {
		usernameSuggestions,
		highlightMentionIndex,
		readMentionQuery,
		selectMentionedUsername,
		handleAutocompleteKey,
		closeMentionList: () => setMentionQuery(null),
	}
}

// the username list showing above the chat message box, carl pinned first then the chat members
function MentionSuggestionList({ autocomplete }: { autocomplete: MentionAutocomplete }) {
	return (
		<ul className="bg-popover absolute right-3 bottom-full left-3 z-10 mb-1 overflow-hidden rounded-md border shadow-md">
			{autocomplete.usernameSuggestions.map((username, index) => (
				<li key={username}>
					<button
						type="button"
						onMouseDown={(event) => {
							event.preventDefault()
							autocomplete.selectMentionedUsername(username)
						}}
						className={cn(
							"w-full px-3 py-1.5 text-left text-sm",
							index === autocomplete.highlightMentionIndex ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
						)}
					>
						@{username}
					</button>
				</li>
			))}
		</ul>
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
 * The chat room composer: the chat message box with the @ autocomplete and the reply selector.
 * The placeholder shows the reply target's chat mention.
 */
export function ChatRoomComposer({
	memberUsernames,
	reply,
	onPostChatMessage,
}: {
	// the current members the autocomplete suggests after Carl, never the current user or a departed member
	memberUsernames: string[]
	// which chat message this composer answers
	reply: ChatRoomReply
	// returns false when the post failed, which keeps the draft in the composer
	onPostChatMessage: (
		content: string,
		replyToChatMessageId: number | null,
		attachments: ChatAttachment[],
	) => Promise<boolean>
}) {
	const { replyTo, isAutoReply, replyChatMessages } = reply
	const [chatMessage, setChatMessage] = useState("")
	// one post at a time, so Enter held through the round trip cannot send the draft twice.
	// the ref gates the next press right away, and the state drives the disabled control
	const isPostingMessageRef = useRef(false)
	const [isPostingMessage, setIsPostingMessage] = useState(false)
	// the attachment files waiting to send with the next chat message, removable until sent
	const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([])

	// selected and dropped files are read the same way. the limit is how many files one chat message may include
	const attachSelectedFiles = (selected: File[]): void => {
		// files past the limit are dropped with a toast, never silently
		const openSlots = CHAT_MAX_ATTACHMENTS - pendingAttachments.length
		if (selected.length > openSlots) {
			toast(`${CHAT_MAX_ATTACHMENTS} attachments max per message.`)
		}
		for (const file of selected.slice(0, openSlots)) {
			void toAttachment(file)
				.then((chatAttachment) => {
					// the limit reads the latest staged list, since reads that land together share one render
					if (chatAttachment) {
						setPendingAttachments((pendingChatAttachments) =>
							pendingChatAttachments.length < CHAT_MAX_ATTACHMENTS
								? [...pendingChatAttachments, chatAttachment]
								: pendingChatAttachments,
						)
					}
				})
				.catch((error) => console.error("attachment read failed", error))
		}
	}
	// pasted files become attachments. pasted text types as usual, unless it would run past the chat message limit
	function handlePasteFile(event: React.ClipboardEvent<HTMLTextAreaElement>): void {
		const files = Array.from(event.clipboardData.files)
		if (files.length > 0) {
			event.preventDefault()
			attachSelectedFiles(files)
			return
		}

		// a paste that would run past the chat message limit becomes a text chip instead of being clipped.
		// when every attachment slot is taken, the paste is rejected with the reason
		const pastedText = event.clipboardData.getData("text")
		if (chatMessage.length + pastedText.length > CHAT_ROOM_MESSAGE_MAX_CHARS) {
			event.preventDefault()
			if (pendingAttachments.length >= CHAT_MAX_ATTACHMENTS) {
				toast(`That paste is longer than a message holds, and ${CHAT_MAX_ATTACHMENTS} attachments are already staged.`)
				return
			}
			setPendingAttachments((waiting) => [
				...waiting,
				{ kind: "text", name: "Pasted text", text: clipAttachmentText(pastedText), keep: false },
			])
		}
	}

	// the @ autocomplete owns the typed prefix, the highlighted username, and the keys while its list is open
	const chatMessageBoxRef = useRef<HTMLTextAreaElement>(null)
	const autocomplete = useMentionAutocomplete({ memberUsernames, chatMessage, setChatMessage, chatMessageBoxRef })

	// focus the chat message box when a reply target is picked, and always on a wide-screen
	// biome-ignore lint/correctness/useExhaustiveDependencies: the target changing is the trigger, not the flag
	useEffect(() => {
		if ((replyTo && !isAutoReply) || isWideScreen()) {
			chatMessageBoxRef.current?.focus()
		}
	}, [replyTo])

	// grow the chat message box with the chat message and shrink it back when a send clears it
	useEffect(() => {
		const chatMessageBox = chatMessageBoxRef.current
		if (!chatMessageBox) {
			return
		}
		// expand the box to hold its chat message up to a maximum height before scrolling
		chatMessageBox.style.height = "auto"
		if (chatMessage !== "") {
			chatMessageBox.style.height = `${Math.min(chatMessageBox.scrollHeight, MAX_MESSAGE_BOX_HEIGHT_PX)}px`
		}
	}, [chatMessage])

	// who the chat message is sent to, updated as the chat message is typed
	const chatMentions = toChatMentions(chatMessage, [CARL_USERNAME, ALL_USERNAME, ...memberUsernames])
	const mentionedUser = chatMentions[0] ?? null
	const hasMention = mentionedUser !== null && (replyTo === null || isAutoReply)
	const replyUser = hasMention
		? mentionedUser
		: replyTo
			? isModelChatMessage(replyTo)
				? CARL_USERNAME
				: replyTo.authorUsername
			: ALL_USERNAME
	const replyUserLabel = toMentionLabel(replyUser)

	// selecting a user replies to their latest chat message.
	// selecting @all or a carl with no chat messages writes the chat mention instead
	const handleSelectReplyUser = (
		selectedUser: { username: string; chatMessage: ChatRoomMessage } | "all" | "carl",
	): void => {
		if (selectedUser === "all" || selectedUser === "carl") {
			setChatMessage(
				toChangedMentionChatMessage(
					chatMessage,
					selectedUser === "all" ? ALL_USERNAME : CARL_USERNAME,
					memberUsernames,
				),
			)
			chatMessageBoxRef.current?.focus()
			return
		}
		setChatMessage(toChatMessage(chatMessage, memberUsernames))
		reply.selectChatMessage(selectedUser.chatMessage)
		chatMessageBoxRef.current?.focus()
	}

	// each keystroke updates the draft and hands the caret's token to the autocomplete
	function handleMessageChange(event: React.ChangeEvent<HTMLTextAreaElement>): void {
		setChatMessage(event.target.value)
		autocomplete.readMentionQuery(event.target.value.slice(0, event.target.selectionStart ?? 0))
	}

	// post the trimmed chat message, resetting the composer only once the post is accepted
	async function handlePostChatMessage(): Promise<void> {
		const content = chatMessage.trim()
		if ((content === "" && pendingAttachments.length === 0) || isPostingMessageRef.current) {
			return
		}
		isPostingMessageRef.current = true
		// a chat mention addresses itself, a previous reply target starts a chat message thread
		const isChatMessageThread = !hasMention && replyTo !== null
		const sentContent = hasMention || isChatMessageThread ? content : `@${ALL_USERNAME} ${content}`

		// remember exactly what went out, so a success clears only that and never what was typed meanwhile
		const sentDraft = chatMessage
		const sentAttachments = pendingAttachments
		setIsPostingMessage(true)
		let isChatMessagePosted = false
		try {
			isChatMessagePosted = await onPostChatMessage(
				sentContent,
				isChatMessageThread ? (replyTo?.id ?? null) : null,
				sentAttachments,
			)
		} finally {
			// a post that threw reopens the composer too, so the draft is never locked in
			isPostingMessageRef.current = false
			setIsPostingMessage(false)
		}

		// a failed post keeps the draft so nothing typed is lost
		if (isChatMessagePosted) {
			setPendingAttachments((waiting) => waiting.filter((attachment) => !sentAttachments.includes(attachment)))
			setChatMessage((current) => (current === sentDraft ? "" : current))
			autocomplete.closeMentionList()
		}
	}

	// the autocomplete gets the key first while open. otherwise Enter sends and Shift+Enter starts a new line
	function handleMessageKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
		if (autocomplete.usernameSuggestions.length > 0 && autocomplete.handleAutocompleteKey(event)) {
			return
		}
		if (event.key === "Enter" && !event.shiftKey) {
			event.preventDefault()
			handlePostChatMessage()
		}
	}

	return (
		<form
			autoComplete="off"
			className="relative shrink-0 border-t px-3 py-2.5"
			onSubmit={(event) => {
				event.preventDefault()
				handlePostChatMessage()
			}}
		>
			{/* the username suggestions float above the input while a mention prefix is being typed */}
			{autocomplete.usernameSuggestions.length > 0 && <MentionSuggestionList autocomplete={autocomplete} />}

			{/* the username reply dropdown names who the chat message answers */}
			{replyUserLabel && (
				<ReplyToDropdown
					currentReplyUser={replyUserLabel}
					replyChatMessages={replyChatMessages}
					onSelectReplyTo={handleSelectReplyUser}
				/>
			)}
			<ChatAttachmentChips
				attachments={pendingAttachments}
				onRemove={(index) => setPendingAttachments((waiting) => waiting.filter((_, at) => at !== index))}
			/>
			{/* the chat message field owns its own line, with the send button below it */}
			<FileDropZone className="bg-background rounded-2xl border px-3 py-2" onDropFiles={attachSelectedFiles}>
				{/* the box is 16px on touch screens. smaller text makes a phone zoom on focus.
					autocomplete off keeps a phone's password, card, and address fill off the chat message field */}
				<textarea
					ref={chatMessageBoxRef}
					rows={1}
					value={chatMessage}
					maxLength={CHAT_ROOM_MESSAGE_MAX_CHARS}
					onChange={handleMessageChange}
					onKeyDown={handleMessageKeyDown}
					onPaste={handlePasteFile}
					placeholder={toComposerPlaceholder(replyUser)}
					aria-label="Message the room"
					autoComplete="off"
					className="placeholder:text-muted-foreground w-full resize-none bg-transparent py-1 text-base leading-relaxed outline-none sm:text-sm"
				/>
				<div className="mt-1 flex items-center justify-between">
					{/* the hidden file picker for attachments */}
					<label
						aria-label="Attach a file"
						className="text-muted-foreground hover:text-foreground grid size-11 cursor-pointer place-items-center rounded-full sm:size-8"
					>
						<Paperclip className="size-4" />
						<input
							type="file"
							accept={CHAT_FILE_PICKER_ACCEPT}
							className="sr-only"
							multiple
							onChange={(event) => {
								const selected = Array.from(event.target.files ?? [])
								event.target.value = ""
								attachSelectedFiles(selected)
							}}
						/>
					</label>
					{/* the mouse handler keeps the focus in the message box. losing it closes a phone's keyboard,
						which moves the button before the click lands */}
					<button
						type="submit"
						aria-label="Send"
						className="bg-primary text-primary-foreground grid size-11 shrink-0 place-items-center rounded-full disabled:opacity-50 sm:size-8"
						disabled={isPostingMessage || (chatMessage.trim() === "" && pendingAttachments.length === 0)}
						onMouseDown={(event) => event.preventDefault()}
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
	replyChatMessages,
	onSelectReplyTo,
}: {
	currentReplyUser: string
	replyChatMessages: { username: string; chatMessage: ChatRoomMessage }[]
	onSelectReplyTo: (selectedChatMessage: { username: string; chatMessage: ChatRoomMessage } | "all" | "carl") => void
}) {
	const [isOpen, setIsOpen] = useState(false)

	// selecting closes the menu and passes the chat message to the callback
	const handleSelectReplyTo = (
		selectedChatMessage: { username: string; chatMessage: ChatRoomMessage } | "all" | "carl",
	): void => {
		setIsOpen(false)
		onSelectReplyTo(selectedChatMessage)
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
			{/* the current reply target's row shows the selected tint */}
			<PopoverContent align="start" className="w-44" bodyClassName="p-1">
				{/* @all reaches the whole room and starts carl's turn beside it */}
				<button
					type="button"
					onClick={() => handleSelectReplyTo("all")}
					className={cn(MENU_OPTION_CLASS, currentReplyUser === "@all" && MENU_OPTION_SELECTED_CLASS)}
				>
					@all
				</button>
				{!replyChatMessages.some((chatMessage) => chatMessage.username === "Carl") && (
					<button
						type="button"
						onClick={() => handleSelectReplyTo("carl")}
						className={cn(MENU_OPTION_CLASS, currentReplyUser === "Carl" && MENU_OPTION_SELECTED_CLASS)}
					>
						Carl
					</button>
				)}
				{replyChatMessages.map((chatMessage) => (
					<button
						key={chatMessage.username}
						type="button"
						onClick={() => handleSelectReplyTo(chatMessage)}
						className={cn(MENU_OPTION_CLASS, currentReplyUser === chatMessage.username && MENU_OPTION_SELECTED_CLASS)}
					>
						{chatMessage.username}
					</button>
				))}
			</PopoverContent>
		</Popover>
	)
}

// the placeholder starts with the selected target's chat mention
function toComposerPlaceholder(replyUsername: string): string {
	return `@${replyUsername}, penny for your thoughts…`
}

// what the menu calls a chat mention: carl by name, @all as typed, anyone else by their username
function toMentionLabel(username: string): string {
	if (username === CARL_USERNAME) {
		return "Carl"
	}
	return username === ALL_USERNAME ? "@all" : username
}

// swap the current chat mention for the selected chat mention if there is one
export function toChangedMentionChatMessage(chatMessage: string, username: string, memberUsernames: string[]): string {
	return `@${username} ${toChatMessage(chatMessage, memberUsernames)}`
}

// the chat message without its leading chat mention
export function toChatMessage(chatMessage: string, memberUsernames: string[]): string {
	const currentMentions = chatMessage.match(/^@([\w-]+)\s*/)
	const chatUsernames = [
		CARL_USERNAME,
		ALL_USERNAME,
		...memberUsernames.map((memberUsername) => memberUsername.toLowerCase()),
	]
	if (currentMentions && chatUsernames.includes((currentMentions[1] ?? "").toLowerCase())) {
		return chatMessage.slice(currentMentions[0].length)
	}
	return chatMessage
}
