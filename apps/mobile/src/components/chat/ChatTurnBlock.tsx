import { toPodcastEpisodeNoteParts } from "@carlnotes/contracts/chatQuestionNotes"
import { PODCAST_EPISODE_SPEAKER_NAMES } from "@carlnotes/contracts/podcastEpisodes"
import {
	type ChatTurnBlockProps,
	type ChatTurnElements,
	ChatTurnBlock as SharedChatTurnBlock,
} from "@carlnotes/core/components/ChatTurnBlock"
import { toTimeAgoLabel } from "@carlnotes/core/lib/chatMessages"
import { View } from "react-native"
import { Text } from "@/components/primitives/text"
import { ChatAuthor } from "./ChatAuthor"
import { ChatMarkdown } from "./ChatMarkdown"
import { ChatLinkPreviews, ChatMessageAttachmentChips, CopyButton, ModelThinkingBubble } from "./ChatMessageParts"
import { ChatRejectionNotice } from "./ChatRejectionNotice"
import { PodcastEpisodeChapterTag } from "./PodcastEpisodeChapterTag"
import { SpokenAnswerButton } from "./SpokenAnswerButton"

/**
 * Adapts the shared private turn, preserving web authors, bubbles and action order.
 */
export function ChatTurnBlock(props: ChatTurnBlockProps) {
	return <SharedChatTurnBlock {...props} elements={CHAT_TURN_ELEMENTS} />
}

// native elements for the shared chat turn
const CHAT_TURN_ELEMENTS: ChatTurnElements = {
	Frame: ({ children }) => <View className="gap-3">{children}</View>,
	Compaction: () => (
		<Text className="py-1 text-center text-xs text-muted-foreground">
			Carl has a lot on his mind. Everything above got summarized.
		</Text>
	),
	Thinking: ModelThinkingBubble,
	Rejection: ChatRejectionNotice,
	Question: ({ chatTurn, now, author }) => {
		// separate the question from its podcast context
		const { question, podcastEpisodeNote } = toPodcastEpisodeNoteParts(chatTurn.question)
		return (
			<ChatAuthor
				authorUserId={author.userId}
				authorUsername={author.username}
				avatarVersion={author.avatarVersion}
				isOwnChatMessage
			>
				<View className="w-full items-end">
					{/* question */}
					<Text className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-sm text-primary-foreground">
						{question}
					</Text>
					{chatTurn.podcastEpisodeChapter && podcastEpisodeNote && (
						<PodcastEpisodeChapterTag
							podcastEpisodeChapter={chatTurn.podcastEpisodeChapter}
							podcastEpisodeNote={podcastEpisodeNote}
						/>
					)}
					{/* attachments and previews */}
					<ChatMessageAttachmentChips attachments={chatTurn.attachments} />
					<ChatLinkPreviews previews={chatTurn.linkPreviews} />
					{/* question actions */}
					<View className="-mr-1 mt-1 flex-row-reverse items-center gap-2">
						<CopyButton text={question} />
						{chatTurn.at !== undefined && (
							<Text className="text-xs text-muted-foreground">{toTimeAgoLabel(chatTurn.at, now)}</Text>
						)}
					</View>
				</View>
			</ChatAuthor>
		)
	},
	Answer: ({ chatTurn, now, voiceChatPage, isStreamingAnswer }) => (
		<ChatAuthor
			authorUserId={null}
			authorUsername={PODCAST_EPISODE_SPEAKER_NAMES[chatTurn.speaker]}
			speaker={chatTurn.speaker}
		>
			<View className="w-full items-start">
				{/* answer */}
				<View className="max-w-[92%] rounded-2xl rounded-bl-sm bg-bubble px-3.5 py-2">
					<ChatMarkdown markdown={chatTurn.answer} isStreaming={isStreamingAnswer} />
				</View>
				{/* answer previews */}
				{!isStreamingAnswer && <ChatLinkPreviews previews={chatTurn.answerLinkPreviews} />}
				{/* answer actions */}
				{!isStreamingAnswer && chatTurn.answer !== "" && (
					<View className="-ml-1 mt-1 flex-row items-center gap-2">
						{/* the copy and play buttons sit tighter than the rest of the footer */}
						<View className="flex-row items-center gap-0.5">
							<CopyButton text={chatTurn.answer} />
							{voiceChatPage && (
								<SpokenAnswerButton
									spokenAnswerKey={chatTurn.spokenAnswerKey}
									page={voiceChatPage}
									text={chatTurn.answer}
									speaker={chatTurn.speaker}
								/>
							)}
						</View>
						{chatTurn.at !== undefined && (
							<Text className="text-xs text-muted-foreground">{toTimeAgoLabel(chatTurn.at, now)}</Text>
						)}
					</View>
				)}
			</View>
		</ChatAuthor>
	),
}
