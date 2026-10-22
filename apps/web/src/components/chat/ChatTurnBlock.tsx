// one chat turn as the private chat renders it: the question bubble, carl's answer bubble, and the compaction line

import { type ChatRejection, toChatAttachmentUrl } from "@carlnotes/client/chatClient"
import type { ChatMessageAttachment } from "@carlnotes/contracts/chat"
import { toPodcastEpisodeNoteParts } from "@carlnotes/contracts/chatQuestionNotes"
import type { VoiceChatPage } from "@carlnotes/contracts/payloads"
import { PODCAST_EPISODE_SPEAKER_NAMES } from "@carlnotes/contracts/podcastEpisodes"
import { RotateCcw } from "lucide-react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { hasPreviewableLink, LinkPreviewCard, LinkPreviewLoading } from "@/components/common/LinkPreviewCard"
import { ANSWER_BUBBLE_CLASS, QUESTION_BUBBLE_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import { ChatAuthor } from "./ChatAuthor"
import { ChatBudgetNotice } from "./ChatBudgetNotice"
import { ChatMarkdown } from "./ChatMarkdown"
import { ChatVideo, CopyButton, ModelThinkingBubble, toTimeAgoLabel } from "./ChatMessageParts"
import { CHAT_REJECTION_COPY } from "./chatRejectionCopy"
import type { ChatTurn } from "./chatTurns"
import { PodcastEpisodeChapterTag } from "./PodcastEpisodeChapterTag"
import { SpokenAnswerButton } from "./SpokenAnswerButton"

// who a chat message renders as: the account when one exists, and the recorded name either way
export type ChatMessageAuthor = { userId: string | null; username: string; avatarVersion: string | null }

/**
 * One chat turn as the chat message list renders it. The compaction line comes above the uncompacted chat turn if it
 * exists.
 */
export function ChatTurnBlock({
	chatTurn,
	index,
	uncompactedChatTurnStart,
	isLast,
	isStreaming,
	now,
	author,
	voiceChatPage,
	onRetry,
}: {
	chatTurn: ChatTurn
	index: number
	uncompactedChatTurnStart: number
	isLast: boolean
	isStreaming: boolean
	now: number
	author: ChatMessageAuthor
	// the page the answer's play button names, null while voice is off
	voiceChatPage: VoiceChatPage | null
	onRetry?: (question: string) => void
}) {
	return (
		<div className="space-y-3">
			{uncompactedChatTurnStart > 0 && index === uncompactedChatTurnStart && <CompactionNotice />}
			<QuestionBubble chatTurn={chatTurn} now={now} author={author} />
			<AnswerBubble
				chatTurn={chatTurn}
				isLast={isLast}
				isStreaming={isStreaming}
				now={now}
				voiceChatPage={voiceChatPage}
				onRetry={onRetry}
			/>
		</div>
	)
}

// the divider marking where the model's compaction ends
function CompactionNotice() {
	return (
		<div className="flex items-center gap-2 py-1">
			<div className="border-separator flex-1 border-t" />
			<p className="shimmer-text text-center text-xs">
				{"Carl has a lot on his mind. Everything above got summarized."}
			</p>
			<div className="border-separator flex-1 border-t" />
		</div>
	)
}

// the user's own question to the right, with their avatar and name like every chat message. a question asked from the
// podcast player shows its note as a tag under it instead of as text
function QuestionBubble({ chatTurn, now, author }: { chatTurn: ChatTurn; now: number; author: ChatMessageAuthor }) {
	const { question, podcastEpisodeNote } = toPodcastEpisodeNoteParts(chatTurn.question)
	return (
		<ChatAuthor
			authorUserId={author.userId}
			authorUsername={author.username}
			avatarVersion={author.avatarVersion}
			isOwnChatMessage
		>
			<div className="group flex w-full flex-col items-end">
				<p className={QUESTION_BUBBLE_CLASS}>{question}</p>
				{chatTurn.podcastEpisodeChapter && podcastEpisodeNote && (
					<PodcastEpisodeChapterTag
						podcastEpisodeChapter={chatTurn.podcastEpisodeChapter}
						podcastEpisodeNote={podcastEpisodeNote}
					/>
				)}
				{/* the images and clips sent with the question, each shown under it in place */}
				{chatTurn.attachments.map((attachment) => {
					if (attachment.kind === "image") {
						return <ChatImage key={attachment.id} attachment={attachment} />
					}
					if (attachment.kind === "video") {
						return (
							<ChatVideo
								key={attachment.id}
								src={attachment.dataUrl ?? toChatAttachmentUrl(attachment.id)}
								name={attachment.name}
							/>
						)
					}
					return null
				})}
				{/* the cards for the question's first links */}
				{chatTurn.linkPreviews.map((linkPreview) => (
					<LinkPreviewCard key={linkPreview.url} linkPreview={linkPreview} />
				))}
				{chatTurn.linkPreviewsPending &&
					chatTurn.linkPreviews.length === 0 &&
					hasPreviewableLink(chatTurn.question) && <LinkPreviewLoading />}
				{/* the footer mirrors carl's, reading in from the user's own edge: the copy button, then the time ago */}
				<div className="text-muted-foreground -mr-1 mt-1 flex flex-row-reverse items-center gap-2 text-xs">
					<CopyButton text={question} isTooltipBelow />
					{chatTurn.at !== undefined && <span>{toTimeAgoLabel(chatTurn.at, now)}</span>}
				</div>
			</div>
		</ChatAuthor>
	)
}

/**
 * A chat image sent with a question, shown at a size that keeps the bubble readable. Clicking it opens the full file.
 */
function ChatImage({ attachment }: { attachment: ChatMessageAttachment & { dataUrl?: string } }) {
	// the image opens full size in a new tab, from its data url until the upload has an id
	const imageUrl = attachment.dataUrl ?? toChatAttachmentUrl(attachment.id)
	return (
		<AnchorLink href={imageUrl} isNewTab className="mt-1 block w-fit">
			<img
				src={imageUrl}
				alt={attachment.name}
				loading="lazy"
				decoding="async"
				className="max-h-60 max-w-full rounded-lg object-contain"
			/>
		</AnchorLink>
	)
}

// the llm reply on the left, under the host who gave it. it shows the CoffeeMug and thinking chat message shimmer
// before the response starts streaming
function AnswerBubble({
	chatTurn,
	isLast,
	isStreaming,
	now,
	voiceChatPage,
	onRetry,
}: {
	chatTurn: ChatTurn
	isLast: boolean
	isStreaming: boolean
	now: number
	voiceChatPage: VoiceChatPage | null
	// re-asks a failed chat turn's question, offered on the failure notice
	onRetry?: (question: string) => void
}) {
	// the two live states, waiting while showing the thinking chat message and streaming the response
	const isWaitingForAnswer = isLast && isStreaming && chatTurn.answer === ""
	const isStreamingAnswer = isLast && isStreaming && chatTurn.answer !== ""
	if (isWaitingForAnswer && !chatTurn.rejection) {
		return <ModelThinkingBubble />
	}

	// a rejected chat turn shows the failure or a call to action instead of an empty bubble
	if (chatTurn.rejection) {
		return (
			<ChatRejectionNotice rejection={chatTurn.rejection} onRetry={onRetry && (() => onRetry(chatTurn.question))} />
		)
	}

	return (
		<ChatAuthor
			authorUserId={null}
			authorUsername={PODCAST_EPISODE_SPEAKER_NAMES[chatTurn.speaker]}
			speaker={chatTurn.speaker}
		>
			<div className="group flex w-full flex-col items-start">
				<div className={ANSWER_BUBBLE_CLASS}>
					<div className={cn(isStreamingAnswer && "shimmer-text")}>
						<ChatMarkdown markdown={chatTurn.answer} />
					</div>
				</div>
				{/* the cards for the answer's first links, shown once the reply has finished streaming */}
				{!isStreamingAnswer &&
					chatTurn.answerLinkPreviews.map((linkPreview) => (
						<LinkPreviewCard key={linkPreview.url} linkPreview={linkPreview} />
					))}
				{!isStreamingAnswer &&
					chatTurn.linkPreviewsPending &&
					chatTurn.answerLinkPreviews.length === 0 &&
					hasPreviewableLink(chatTurn.answer) && <LinkPreviewLoading />}
				{!isWaitingForAnswer && !isStreamingAnswer && chatTurn.answer !== "" && (
					<AnswerFooter chatTurn={chatTurn} now={now} voiceChatPage={voiceChatPage} />
				)}
			</div>
		</ChatAuthor>
	)
}

// the footer shows the copy button, the play button, and the time ago to the left
function AnswerFooter({
	chatTurn,
	now,
	voiceChatPage,
}: {
	chatTurn: ChatTurn
	now: number
	voiceChatPage: VoiceChatPage | null
}) {
	return (
		<div className="text-muted-foreground -ml-1 mt-1 flex items-center gap-2 text-xs">
			{/* the copy and play buttons sit tighter than the rest of the footer */}
			<div className="flex items-center gap-0.5">
				<CopyButton text={chatTurn.answer} />
				{voiceChatPage && (
					<SpokenAnswerButton
						spokenAnswerKey={chatTurn.spokenAnswerKey}
						page={voiceChatPage}
						text={chatTurn.answer}
						speaker={chatTurn.speaker}
					/>
				)}
			</div>
			{chatTurn.at !== undefined && <span>{toTimeAgoLabel(chatTurn.at, now)}</span>}
		</div>
	)
}

// what a rejected chat turn shows with a possible call to action
function ChatRejectionNotice({ rejection, onRetry }: { rejection: ChatRejection; onRetry?: () => void }) {
	// a stream that broke mid-reply invites another attempt, and the invitation re-asks the question
	if (rejection === "failed") {
		return (
			<p className="text-muted-foreground text-sm">
				{`${CHAT_REJECTION_COPY.failed} `}
				{onRetry ? (
					<button type="button" onClick={onRetry} className="sentence-link">
						Try again?
						<RotateCcw className="ml-1.5 inline size-3.5 align-middle" aria-hidden="true" />
					</button>
				) : (
					"Try again?"
				)}
			</p>
		)
	}

	// ask a user past the per-minute limit to wait
	if (rejection === "rateLimited") {
		return <p className="text-muted-foreground text-sm">{CHAT_REJECTION_COPY.rateLimited}</p>
	}

	// an exhausted budget shows a call-to-action to upgrade at the plans page. anything forbidden shows a rejection
	if (rejection === "budget") {
		return <ChatBudgetNotice />
	}
	return <p className="text-muted-foreground text-sm">{CHAT_REJECTION_COPY.forbidden}</p>
}
