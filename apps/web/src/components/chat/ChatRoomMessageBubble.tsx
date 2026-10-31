// one chat room message as the list renders it: the author line, the reply reference, the chat bubble with its shared
// files, and the footer

import { toChatRoomAttachmentUrl } from "@carlnotes/client/chatRoomClient"
import type { ChatRoomMessage } from "@carlnotes/contracts/chat"
import {
	type ChatRoomMessageBubbleProps,
	type ChatRoomMessageElements,
	ChatRoomMessageBubble as SharedChatRoomMessageBubble,
} from "@carlnotes/core/components/ChatRoomMessageBubble"
import { DELETE_CHAT_MESSAGE_COPY, HIDDEN_QUOTE_TEXT, REPORT_CHAT_MESSAGE_LABEL } from "@carlnotes/core/lib/chatCopy"
import { toChatRoomSpokenAnswerKey } from "@carlnotes/core/stores/spokenAnswerQueue"
import { cn } from "@carlnotes/nightshift/classNames"
import { FileText, Film, Flag, Image, Paperclip, Reply, Trash2, X } from "lucide-react"
import { memo, useState } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ConfirmDialog } from "@/components/common/ConfirmDialog"
import { LinkPreviewCard, LinkPreviewLoading } from "@/components/common/LinkPreviewCard"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { ChatAuthor } from "./ChatAuthor"
import { ChatMarkdown } from "./ChatMarkdown"
import { ChatVideo, CopyButton, toTimeAgoLabel } from "./ChatMessageParts"
import { SpokenAnswerButton } from "./SpokenAnswerButton"

// the icon per attachment kind, with the paperclip for a kind this build does not know
const ATTACHMENT_KIND_ICONS = {
	image: Image,
	pdf: FileText,
	document: FileText,
	text: Paperclip,
	video: Film,
	unknown: Paperclip,
} as const

/**
 * Adds browser media, downloads, and speech to the shared chat message.
 */
export const ChatRoomMessageBubble = memo(function ChatRoomMessageBubble(props: ChatRoomMessageBubbleProps) {
	return <SharedChatRoomMessageBubble {...props} elements={chatRoomMessageElements} />
})

// the browser room-message elements
const chatRoomMessageElements: ChatRoomMessageElements = {
	Author: ChatAuthor,
	Frame: ({ children, isOwn }) => (
		<div className={cn("group flex w-full flex-col", isOwn ? "items-end" : "items-start")}>{children}</div>
	),
	Quote: ({ message, onSelect }) => (
		<button
			type="button"
			onClick={() => onSelect(message.id)}
			className="text-muted-foreground bg-bubble/60 border-border mb-0.5 max-w-[92%] rounded-lg border-l-2 px-2.5 py-1 text-left text-xs @lg:max-w-[75%]"
		>
			{/* quoted author */}
			<span className="flex items-center gap-1">
				<Reply className="size-3" />
				{message.authorUsername}
			</span>
			{/* quoted message */}
			<span className="mt-0.5 line-clamp-3 block">{message.content}</span>
		</button>
	),
	HiddenQuote: () => (
		<div className="text-muted-foreground bg-bubble/60 border-border mb-0.5 max-w-[92%] rounded-lg border-l-2 px-2.5 py-1 text-xs italic @lg:max-w-[75%]">
			{HIDDEN_QUOTE_TEXT}
		</div>
	),
	Body: ({ content, isOwn, isModel }) => (
		<div
			className={cn(
				"max-w-[92%] rounded-2xl px-3.5 py-2 text-sm @lg:max-w-[75%]",
				isOwn ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-bubble text-foreground rounded-bl-sm",
			)}
		>
			{isModel ? <ChatMarkdown markdown={content} /> : <p className="whitespace-pre-wrap">{content}</p>}
		</div>
	),
	Previews: ({ previews, isLoading }) => (
		<>
			{/* loaded previews */}
			{previews.map((linkPreview) => (
				<LinkPreviewCard key={linkPreview.url} linkPreview={linkPreview} />
			))}
			{/* pending preview */}
			{isLoading && previews.length === 0 && <LinkPreviewLoading />}
		</>
	),
	Attachments: RoomAttachments,
	Footer: RoomFooter,
}

// render attached media with downloads and deletion
function RoomAttachments({ chatMessage, topicId, teamId, canDelete, onAttachmentDelete }: ChatRoomMessageBubbleProps) {
	return (
		<>
			{chatMessage.attachments.map((attachment) => {
				// choose the attachment icon and media
				const KindIcon = ATTACHMENT_KIND_ICONS[attachment.kind]
				return (
					<div key={attachment.id} className="mt-1">
						{/* attached media */}
						{attachment.kind === "image" && <SharedImage attachment={attachment} topicId={topicId} teamId={teamId} />}
						{attachment.kind === "video" && (
							<ChatVideo src={toChatRoomAttachmentUrl(topicId, teamId, attachment.id)} name={attachment.name} />
						)}
						{/* download and delete controls */}
						<div className="text-muted-foreground flex items-center gap-1.5 text-xs">
							<KindIcon className="size-3" />
							<AnchorLink
								href={toChatRoomAttachmentUrl(topicId, teamId, attachment.id)}
								download={attachment.name}
								className="hover:text-foreground max-w-56 truncate underline-offset-2 hover:underline"
							>
								{attachment.name}
							</AnchorLink>
							{canDelete && (
								<Tooltip>
									<TooltipTrigger asChild>
										<button
											type="button"
											aria-label={`Delete ${attachment.name}`}
											onClick={() => onAttachmentDelete(attachment.id)}
											className="hover:text-foreground"
										>
											<X className="size-3" />
										</button>
									</TooltipTrigger>
									<TooltipContent>
										Delete <span className="font-semibold">{attachment.name}</span>
									</TooltipContent>
								</Tooltip>
							)}
						</div>
					</div>
				)
			})}
		</>
	)
}

// render message actions and its timestamp
function RoomFooter({
	chatMessage,
	isOwnChatMessage,
	isModel,
	voiceChatPage,
	canDelete,
	onDeleteChatMessage,
	onReply,
	onReport,
	now,
}: ChatRoomMessageBubbleProps & { isModel: boolean }) {
	const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
	return (
		<div
			className={cn(
				"text-muted-foreground mt-1 flex items-center gap-2 text-xs",
				isOwnChatMessage && "flex-row-reverse",
			)}
		>
			{/* the copy and play buttons sit tighter than the rest of the footer */}
			<div className={cn("flex items-center gap-0.5", isOwnChatMessage && "flex-row-reverse")}>
				<CopyButton text={chatMessage.content} isTooltipBelow={isOwnChatMessage} />
				{isModel && voiceChatPage && (
					<SpokenAnswerButton
						spokenAnswerKey={toChatRoomSpokenAnswerKey(chatMessage.id)}
						page={voiceChatPage}
						text={chatMessage.content}
					/>
				)}
			</div>
			{/* the author or a leader or an admin can remove the chat message, which takes its shared files with it */}
			{canDelete && (
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label="Delete message"
							onClick={() => setIsConfirmingDelete(true)}
							className="hover:text-foreground flex items-center"
						>
							<Trash2 className="size-3" />
						</button>
					</TooltipTrigger>
					<TooltipContent side={isOwnChatMessage ? "bottom" : "top"}>Delete message</TooltipContent>
				</Tooltip>
			)}
			<button
				type="button"
				onClick={() => onReply(chatMessage)}
				className="hover:text-foreground flex items-center gap-1"
			>
				<Reply className="size-3" />
				Reply
			</button>
			{/* the report action */}
			{onReport && !isOwnChatMessage && !isModel && chatMessage.authorUserId && (
				<Tooltip>
					<TooltipTrigger asChild>
						<button
							type="button"
							aria-label={REPORT_CHAT_MESSAGE_LABEL}
							onClick={() => onReport(chatMessage)}
							className="hover:text-foreground flex items-center"
						>
							<Flag className="size-3" />
						</button>
					</TooltipTrigger>
					<TooltipContent side="top">{REPORT_CHAT_MESSAGE_LABEL}</TooltipContent>
				</Tooltip>
			)}
			<span>{toTimeAgoLabel(new Date(chatMessage.createdAt).getTime(), now)}</span>
			{/* message deletion confirmation */}
			{canDelete && isConfirmingDelete && (
				<ConfirmDialog
					title={DELETE_CHAT_MESSAGE_COPY.title}
					confirmLabel={DELETE_CHAT_MESSAGE_COPY.confirm}
					cancelLabel={DELETE_CHAT_MESSAGE_COPY.cancel}
					onClose={() => setIsConfirmingDelete(false)}
					onConfirm={() => {
						// close confirmation before the existing server-accepted deletion flow
						setIsConfirmingDelete(false)
						onDeleteChatMessage(chatMessage.id)
					}}
				>
					{DELETE_CHAT_MESSAGE_COPY.description}
				</ConfirmDialog>
			)}
		</div>
	)
}

/**
 * A shared image, shown in place at a size that keeps the bubble readable. Clicking on it opens the full file.
 */
function SharedImage({
	attachment,
	topicId,
	teamId,
}: {
	attachment: ChatRoomMessage["attachments"][number]
	topicId: string | null
	teamId: string
}) {
	// the image opens full size in a new tab
	const imageUrl = toChatRoomAttachmentUrl(topicId, teamId, attachment.id)
	return (
		<AnchorLink href={imageUrl} isNewTab className="mb-1 block w-fit">
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
