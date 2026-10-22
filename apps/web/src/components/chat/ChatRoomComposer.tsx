// the chat room composer: the chat message box with its attachments, the @ autocomplete, and the reply selector

import {
	CHAT_MAX_ATTACHMENTS,
	CHAT_ROOM_MESSAGE_MAX_CHARS,
	type ChatRoomMessage,
	clipAttachmentText,
} from "@carlnotes/contracts/chat"
import { ALL_USERNAME, CARL_USERNAME, isModelChatMessage, toChatMentions } from "@carlnotes/contracts/chatMentions"
import type { ChatAttachment, VoiceChatPage } from "@carlnotes/contracts/payloads"
import { ArrowUp, Paperclip } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { FileDropZone } from "@/components/common/FileDropZone"
import {
	COMPOSER_BAR_CLASS,
	COMPOSER_BOX_CLASS,
	COMPOSER_FRAME_CLASS,
	ICON_BUTTON_CLASS,
	SEND_BUTTON_CLASS,
} from "@/lib/styleClasses"
import { CHAT_FILE_PICKER_ACCEPT, cn, isSendKey, isTouchScreen, isWideScreen } from "@/lib/utils"
import { ChatAttachmentChips } from "./ChatAttachmentChips"
import { MentionSuggestionList, useMentionAutocomplete } from "./MentionSuggestionList"
import { isMicShown, MicButton } from "./MicButton"
import { RecordingBar } from "./RecordingBar"
import { ReplyToDropdown, toChangedMentionChatMessage, toChatMessage, toMentionLabel } from "./ReplyToDropdown"
import { toAttachment } from "./useChatAttachments"
import type { ChatRoomPost } from "./useChatRoom"
import type { ChatRoomReply } from "./useRoomReply"
import { useVoiceRecording } from "./useVoiceRecording"

// how tall the chat message box may grow before it scrolls inside itself, matching the private chat's composer
const MAX_MESSAGE_BOX_HEIGHT_PX = 120

/**
 * The chat composer's shell with nothing live in it, for someone the room is closed to.
 * Nothing here responds to a click, and it is hidden from assistive tech.
 */
export function DisabledRoomComposer({ placeholder }: { placeholder?: string }) {
	return (
		<div aria-hidden="true" className={cn(COMPOSER_BAR_CLASS, "opacity-60")}>
			<div className={COMPOSER_FRAME_CLASS}>
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
	voiceChatPage,
	onPostChatMessage,
	onBudgetRejected,
}: {
	// the current members the autocomplete suggests after Carl, never the current user or a departed member
	memberUsernames: string[]
	// which chat message this composer answers
	reply: ChatRoomReply
	// the page the mic names, null while voice is off and the mic never renders
	voiceChatPage: VoiceChatPage | null
	// returns false when the post failed, which keeps the draft in the composer
	onPostChatMessage: (chatRoomPost: ChatRoomPost) => Promise<boolean>
	// shows the spent budget's rejection if a recording's transcription is turned down for it
	onBudgetRejected?: () => void
}) {
	const { replyTo, isAutoReply, replyChatMessages } = reply
	const [chatMessage, setChatMessage] = useState("")
	// one post at a time, so Enter held through the round trip cannot send the draft twice.
	// the ref gates the next press right away, and the state drives the disabled control
	const isPostingMessageRef = useRef(false)
	const [isPostingMessage, setIsPostingMessage] = useState(false)
	// the attachment files waiting to send with the next chat message, removable until sent
	const [pendingAttachments, setPendingAttachments] = useState<ChatAttachment[]>([])

	// the recording the mic starts, whose transcript posts as a spoken message that addresses carl
	const voiceRecording = useVoiceRecording({
		page: voiceChatPage,
		onTranscript: (transcript, timings) =>
			void onPostChatMessage({
				content: transcript,
				replyToChatMessageId: null,
				attachments: [],
				isSpoken: true,
				spokenQuestionTimings: timings,
			}),
		onBudgetRejected,
	})
	// the mic takes the send slot of an empty box while voice is on and no post is on its way
	const isMicInSendSlot = isMicShown({
		voiceChatPage,
		draft: chatMessage,
		attachmentCount: pendingAttachments.length,
		isBusy: isPostingMessage,
	})

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
	const { hasMention, replyUser } = toReplyUser({ chatMessage, memberUsernames, replyTo, isAutoReply })
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

	// on a touch screen the box lets go of focus, so the keyboard closes, and the chat message shows
	function closeTouchKeyboard(): void {
		if (isTouchScreen()) {
			chatMessageBoxRef.current?.blur()
		}
	}

	// post the trimmed chat message, resetting the composer only once the post is accepted
	async function handlePostChatMessage(): Promise<void> {
		const content = chatMessage.trim()
		if ((content === "" && pendingAttachments.length === 0) || isPostingMessageRef.current) {
			return
		}
		isPostingMessageRef.current = true
		closeTouchKeyboard()

		// a typed message ends listen mode
		voiceRecording.stopListening()

		// a chat mention addresses itself, a previous reply target starts a chat message thread
		const isChatMessageThread = !hasMention && replyTo !== null
		const sentContent = hasMention || isChatMessageThread ? content : `@${ALL_USERNAME} ${content}`

		// remember exactly what went out, so a success clears only that and never what was typed meanwhile
		const sentDraft = chatMessage
		const sentAttachments = pendingAttachments
		setIsPostingMessage(true)
		let isChatMessagePosted = false
		try {
			isChatMessagePosted = await onPostChatMessage({
				content: sentContent,
				replyToChatMessageId: isChatMessageThread ? (replyTo?.id ?? null) : null,
				attachments: sentAttachments,
			})
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
		if (isSendKey(event)) {
			event.preventDefault()
			handlePostChatMessage()
		}
	}

	return (
		<form
			autoComplete="off"
			className={cn(COMPOSER_BAR_CLASS, "relative")}
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
			<FileDropZone className={COMPOSER_FRAME_CLASS} onDropFiles={attachSelectedFiles}>
				{/* the recording bar replaces the box while a recording runs */}
				{voiceRecording.state === "recording" ? (
					<RecordingBar voiceRecording={voiceRecording} />
				) : (
					<>
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
							className={COMPOSER_BOX_CLASS}
						/>
						<div className="mt-1 flex items-center justify-between">
							{/* the hidden file picker for attachments */}
							<label aria-label="Attach a file" className={cn(ICON_BUTTON_CLASS, "cursor-pointer")}>
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
							{/* the mic starts a recording from an empty box. the send button's mouse handler keeps the focus in
						the message box. losing it closes a phone's keyboard, which moves the button before the click arrives */}
							{isMicInSendSlot ? (
								<MicButton voiceRecording={voiceRecording} />
							) : (
								<button
									type="submit"
									aria-label="Send"
									className={SEND_BUTTON_CLASS}
									disabled={isPostingMessage || (chatMessage.trim() === "" && pendingAttachments.length === 0)}
									onMouseDown={(event) => event.preventDefault()}
								>
									<ArrowUp className="size-4" />
								</button>
							)}
						</div>
					</>
				)}
			</FileDropZone>
		</form>
	)
}

// the draft, the members it may mention, the reply chat message selected, and whether that reply was auto-selected
type ToReplyUserOptions = {
	chatMessage: string
	memberUsernames: string[]
	replyTo: ChatRoomMessage | null
	isAutoReply: boolean
}

// who the chat message is sent to: its first mention, else the reply chat message's author, else everyone. a
// mention outranks an auto-selected reply, and a tapped reply outranks a mention
function toReplyUser({ chatMessage, memberUsernames, replyTo, isAutoReply }: ToReplyUserOptions): {
	hasMention: boolean
	replyUser: string
} {
	const mentionedUser = toChatMentions(chatMessage, [CARL_USERNAME, ALL_USERNAME, ...memberUsernames])[0] ?? null
	const hasMention = mentionedUser !== null && (replyTo === null || isAutoReply)
	if (hasMention) {
		return { hasMention, replyUser: mentionedUser }
	}

	// the reply chat message's author, or everyone with no reply selected
	if (replyTo === null) {
		return { hasMention, replyUser: ALL_USERNAME }
	}
	return { hasMention, replyUser: isModelChatMessage(replyTo) ? CARL_USERNAME : replyTo.authorUsername }
}

// the placeholder starts with the selected target's chat mention
function toComposerPlaceholder(replyUsername: string): string {
	return `@${replyUsername}, penny for your thoughts…`
}
