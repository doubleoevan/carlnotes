import type { ChatPage } from "@carlnotes/client/chatClient"
import { CHAT_QUESTION_CHARS } from "@carlnotes/contracts/chat"
import { CHAT_QUESTION_PLACEHOLDER, SUGGESTED_REPLY_COPY } from "@carlnotes/core/lib/chatCopy"
import { cn } from "@carlnotes/nightshift/classNames"
import { ArrowRightToLine, ArrowUp, Square, X } from "lucide-react"
import { useEffect, useRef } from "react"
import { FileDropZone } from "@/components/common/FileDropZone"
import { Button } from "@/components/primitives/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { COMPOSER_BAR_CLASS, COMPOSER_BOX_CLASS, COMPOSER_FRAME_CLASS, SEND_BUTTON_CLASS } from "@/lib/chatClasses"
import { ICON_BUTTON_CLASS } from "@/lib/styleClasses"
import { isSendKey, isTouchScreen, isWideScreen } from "@/lib/utils"
import { ChatAttachmentChips } from "./ChatAttachmentChips"
import { ChatAttachButton, KeptAttachmentsButton } from "./ChatComposerAttachments"
import { isMicShown, MicButton } from "./MicButton"
import { RecordingBar } from "./RecordingBar"
import { useComposerSuggestedReply } from "./useComposerSuggestedReply"
import type { TopicChat } from "./useTopicChat"
import { useVoiceRecording } from "./useVoiceRecording"

// how tall the question box may grow before it scrolls inside itself
const MAX_QUESTION_BOX_HEIGHT_PX = 120

/**
 * The chat composer: the question box, its attachment chips, and the send button that becomes a stop button while a reply streams.
 */
// what the private chat's question box shows while it is empty
export { CHAT_QUESTION_PLACEHOLDER } from "@carlnotes/core/lib/chatCopy"

export function ChatComposer({
	chat,
	onSendQuestion,
	placeholder = CHAT_QUESTION_PLACEHOLDER,
	page,
}: {
	// the conversation the composer writes into, which owns the draft, its attachments, and the stream
	chat: TopicChat
	// a visitor's send routes to the signup instead of the conversation
	onSendQuestion: () => void
	// what the empty question box shows without a suggestion. the private chat's line unless the conversation says
	// otherwise
	placeholder?: string
	// the private conversation's page, which suggested replies need. a composer without one shows none
	page?: ChatPage
}) {
	const { question, attachments, keptAttachments, isStreaming, isSignupRequired } = chat
	const questionBoxRef = useRef<HTMLTextAreaElement>(null)

	// the recording the mic starts, whose transcript sends as a spoken question
	const voiceRecording = useVoiceRecording({
		page: chat.voiceChatPage,
		onTranscript: (transcript, timings) =>
			void chat.send(transcript, { isSpoken: true, spokenQuestionTimings: timings }),
	})
	// the box is read-only and the send button off while the microphone is asked for or the transcript is on its
	// way, so a typed send never races the spoken one
	const isVoiceRecordingBusy = voiceRecording.state !== "idle"
	// the mic takes the send slot of an empty box while voice is on and nothing streams
	const isMicInSendSlot = isMicShown({
		voiceChatPage: chat.voiceChatPage,
		draft: question,
		attachmentCount: attachments.length,
		isBusy: isStreaming,
	})

	// the suggested reply the empty box shows, its announcement, and its accept. the voice composer and a recording show none
	const composerSuggestedReply = useComposerSuggestedReply({ chat, page, placeholder, voiceRecording, questionBoxRef })
	const { suggestedReply } = composerSuggestedReply

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

		// an accepted suggestion leaves the caret at its end
		composerSuggestedReply.moveCaretAfterAccept(questionBox)
	}, [question, composerSuggestedReply.moveCaretAfterAccept])

	// send the question, unless a spoken question is on its way. on a touch screen the box lets go of focus, so the
	// keyboard closes, and the reply shows
	function sendQuestion(): void {
		if (isVoiceRecordingBusy) {
			return
		}
		// a typed question ends listen mode
		voiceRecording.stopListening()
		onSendQuestion()
		if (isTouchScreen()) {
			questionBoxRef.current?.blur()
		}
	}

	// Enter sends the question and Shift+Enter starts a new line. Right Arrow alone in an empty box accepts its suggestion,
	// except during an input method composition
	function handleQuestionKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>): void {
		composerSuggestedReply.handleAcceptKey(event)
		if (isSendKey(event)) {
			event.preventDefault()
			sendQuestion()
		}
	}

	// pasted files become attachments, and a paste too long for the box becomes a text chip instead
	function handlePaste(event: React.ClipboardEvent<HTMLTextAreaElement>): void {
		const files = Array.from(event.clipboardData.files)
		if (files.length > 0) {
			event.preventDefault()
			void chat.addAttachmentFiles(files)
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
			className={COMPOSER_BAR_CLASS}
			onSubmit={(event) => {
				event.preventDefault()
				sendQuestion()
			}}
		>
			{/* attachments show as chips in the input, each is removable until the send */}
			{<ChatAttachmentChips attachments={attachments} onRemove={chat.removeAttachment} />}
			<FileDropZone
				className={COMPOSER_FRAME_CLASS}
				onDropFiles={(files) => {
					// a visitor's file drop routes to the signup
					if (isSignupRequired) {
						onSendQuestion()
						return
					}
					void chat.addAttachmentFiles(files)
				}}
			>
				{/* the recording bar replaces the box while a recording runs */}
				{voiceRecording.state === "recording" ? (
					<RecordingBar voiceRecording={voiceRecording} />
				) : (
					<>
						{/* the input box is 16px to keep the panel on the screen. autocomplete is off,
						so a phone offers no passwords, cards, or addresses over a chat field */}
						<div className="relative">
							<textarea
								ref={questionBoxRef}
								rows={1}
								value={question}
								readOnly={isVoiceRecordingBusy}
								maxLength={CHAT_QUESTION_CHARS}
								onChange={(event) => chat.setQuestion(event.target.value)}
								onKeyDown={handleQuestionKeyDown}
								onPaste={handlePaste}
								placeholder={composerSuggestedReply.placeholder}
								aria-placeholder={suggestedReply ?? undefined}
								aria-label="Ask Carl"
								autoComplete="off"
								className={COMPOSER_BOX_CLASS}
							/>
							{/* the suggestion over the empty box */}
							<SuggestedReplyLine suggestedReply={suggestedReply} />
						</div>
						{/* a new suggestion is read to a screen reader once, without interrupting it */}
						<span className="sr-only" aria-live="polite">
							{composerSuggestedReply.announcement}
						</span>
						{/* the buttons sit under the question: attachments to the left, clear and send to the right */}
						<div className="mt-1 flex items-center gap-2">
							{/* the add and remove attachment buttons sit next to each other */}
							<div className="flex shrink-0 items-center">
								{/* a visitor's attachment routes to the signup page */}
								<ChatAttachButton
									isSignupRequired={isSignupRequired}
									onSelect={chat.addAttachmentFiles}
									onSignup={onSendQuestion}
								/>
								{keptAttachments.length > 0 && (
									<KeptAttachmentsButton
										keptAttachments={keptAttachments}
										onRemoveKeptAttachment={chat.removeKeptAttachment}
									/>
								)}
							</div>
							{/* the clear and send buttons. each keeps focus in the message box.
						losing it closes a phone's keyboard, which moves the button before the click arrives */}
							<div className="ml-auto flex items-center gap-2">
								{/* the suggestion's accept button */}
								<SuggestedReplyAcceptButton
									suggestedReply={suggestedReply}
									onAccept={() => composerSuggestedReply.accept("button")}
								/>
								{/* an X button clears the input and returns focus, only appearing when there is content */}
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
								{/* the stop button ends a response stream. the mic starts a recording from an empty box. the arrow
							button sends the question or forwards a visitor to the signup page */}
								{isStreaming ? (
									<button
										type="button"
										aria-label="Stop"
										onMouseDown={(event) => event.preventDefault()}
										onClick={chat.stop}
										className={SEND_BUTTON_CLASS}
									>
										<Square className="size-3 fill-current" />
									</button>
								) : isMicInSendSlot ? (
									<MicButton voiceRecording={voiceRecording} isSignupRequired={isSignupRequired} />
								) : isSignupRequired ? (
									<Tooltip>
										<TooltipTrigger asChild>
											<button
												type="submit"
												aria-label="Sign up to chit-chat"
												onMouseDown={(event) => event.preventDefault()}
												className={SEND_BUTTON_CLASS}
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
										disabled={isVoiceRecordingBusy || (question.trim() === "" && chat.attachments.length === 0)}
										onMouseDown={(event) => event.preventDefault()}
										className={SEND_BUTTON_CLASS}
									>
										<ArrowUp className="size-4" />
									</button>
								)}
							</div>
						</div>
					</>
				)}
			</FileDropZone>
		</form>
	)
}

// the suggestion as the empty box's one-line placeholder, cut with an ellipsis, or nothing while none shows
function SuggestedReplyLine({ suggestedReply }: { suggestedReply: string | null }) {
	if (!suggestedReply) {
		return null
	}
	return (
		<span
			aria-hidden="true"
			className={cn(
				COMPOSER_BOX_CLASS,
				"text-muted-foreground pointer-events-none absolute inset-x-0 top-0 truncate motion-safe:animate-in motion-safe:fade-in",
			)}
		>
			{suggestedReply}
		</span>
	)
}

// the suggestion's accept button, or nothing while no suggestion shows. it keeps focus in the box and sends nothing
function SuggestedReplyAcceptButton({
	suggestedReply,
	onAccept,
}: {
	suggestedReply: string | null
	onAccept: () => void
}) {
	if (!suggestedReply) {
		return null
	}
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<Button
					type="button"
					variant="ghost"
					size="icon-sm"
					aria-label={SUGGESTED_REPLY_COPY.toAcceptLabel(suggestedReply)}
					onMouseDown={(event) => event.preventDefault()}
					onClick={onAccept}
					className="motion-safe:animate-in motion-safe:fade-in"
				>
					<ArrowRightToLine className="size-4" />
				</Button>
			</TooltipTrigger>
			<TooltipContent>{SUGGESTED_REPLY_COPY.acceptTooltip}</TooltipContent>
		</Tooltip>
	)
}
