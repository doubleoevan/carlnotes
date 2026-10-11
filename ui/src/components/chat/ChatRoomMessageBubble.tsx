// one chat room message as the list renders it: the author line, the reply reference, the chat bubble with its shared
// files, and the footer
import { isModelChatMessage } from "@shared/chatMentions"
import type { ChatRoomMessage } from "@shared/contracts"
import { FileText, Film, Image, Paperclip, Reply, Trash2, X } from "lucide-react"
import { memo } from "react"
import { toChatRoomAttachmentUrl } from "@/clients/chatRoomClient"
import { ChatAuthor } from "@/components/chat/ChatAuthor"
import { ChatMarkdown } from "@/components/chat/ChatMarkdown"
import { ChatVideo, CopyButton, toTimeAgoLabel } from "@/components/chat/ChatMessageParts"
import { AnchorLink } from "@/components/common/AnchorLink"
import { LinkPreviewCard, LinkPreviewLoading } from "@/components/common/LinkPreviewCard"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { cn } from "@/lib/utils"

// the icon each shared file kind shows beside its name
const ATTACHMENT_KIND_ICONS = { image: Image, pdf: FileText, document: FileText, text: Paperclip, video: Film } as const

// one chat message: the author line, the reply reference when there is one, the chat bubble, and the footer
export const ChatRoomMessageBubble = memo(function ChatRoomMessageBubble({
	chatMessage,
	topicId,
	teamId,
	repliedChatMessage,
	isOwnChatMessage,
	now,
	canDelete,
	isLinkPreviewLoading,
	onReply,
	onQuoteClick,
	onAttachmentDelete,
	onDeleteChatMessage,
}: {
	chatMessage: ChatRoomMessage
	// null is the team's own chat room, whose files download from the team routes
	topicId: string | null
	teamId: string
	repliedChatMessage: ChatRoomMessage | undefined
	isOwnChatMessage: boolean
	now: number
	// the chat message's author and a team leader may remove it and its shared files
	canDelete: boolean
	// true while this fresh chat message's link preview cards are still loading
	isLinkPreviewLoading: boolean
	onReply: (chatMessage: ChatRoomMessage) => void
	// scrolls the chat messages back to the quoted chat message
	onQuoteClick: (chatMessageId: number) => void
	onAttachmentDelete: (attachmentId: string) => void
	onDeleteChatMessage: (chatMessageId: number) => void
}) {
	// carl's answers are Markdown from the model. everyone else's words render as written
	const isModel = isModelChatMessage(chatMessage)
	return (
		<ChatAuthor
			authorUserId={chatMessage.authorUserId}
			authorUsername={chatMessage.authorUsername}
			avatarVersion={chatMessage.authorAvatarVersion}
			isOwnChatMessage={isOwnChatMessage}
		>
			<div className={cn("group flex w-full flex-col", isOwnChatMessage ? "items-end" : "items-start")}>
				{/* the reference quotes what this chat message answers, and clicking it scrolls back up to it */}
				{repliedChatMessage && (
					<button
						type="button"
						onClick={() => onQuoteClick(repliedChatMessage.id)}
						className="text-muted-foreground bg-bubble/60 border-border mb-0.5 max-w-[92%] rounded-lg border-l-2 px-2.5 py-1 text-left text-xs @lg:max-w-[75%]"
					>
						<span className="flex items-center gap-1">
							<Reply className="size-3" />
							{repliedChatMessage.authorUsername}
						</span>
						<span className="mt-0.5 line-clamp-3 block">{repliedChatMessage.content}</span>
					</button>
				)}
				<div
					className={cn(
						"max-w-[92%] rounded-2xl px-3.5 py-2 text-sm @lg:max-w-[75%]",
						isOwnChatMessage
							? "bg-primary text-primary-foreground rounded-br-sm"
							: "bg-bubble text-foreground rounded-bl-sm",
					)}
				>
					{isModel ? (
						<ChatMarkdown markdown={chatMessage.content} />
					) : (
						<p className="whitespace-pre-wrap">{chatMessage.content}</p>
					)}
				</div>

				{/* the cards for the chat message's first links */}
				{chatMessage.linkPreviews.map((linkPreview) => (
					<LinkPreviewCard key={linkPreview.url} linkPreview={linkPreview} />
				))}
				{isLinkPreviewLoading && chatMessage.linkPreviews.length === 0 && <LinkPreviewLoading />}

				{/* the shared attachment files. an image or a clip shows itself above its row, every kind keeps the row */}
				{chatMessage.attachments.map((attachment) => {
					const KindIcon = ATTACHMENT_KIND_ICONS[attachment.kind]
					return (
						<div key={attachment.id} className="mt-1">
							{attachment.kind === "image" && <SharedImage attachment={attachment} topicId={topicId} teamId={teamId} />}
							{attachment.kind === "video" && (
								<ChatVideo src={toChatRoomAttachmentUrl(topicId, teamId, attachment.id)} name={attachment.name} />
							)}
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
				{/* the footer shows the time ago, the reply button, and the copy button */}
				<div className="text-muted-foreground mt-1 flex items-center gap-2 text-xs">
					<span>{toTimeAgoLabel(new Date(chatMessage.createdAt).getTime(), now)}</span>
					<button
						type="button"
						onClick={() => onReply(chatMessage)}
						className="hover:text-foreground flex items-center gap-1"
					>
						<Reply className="size-3" />
						Reply
					</button>
					<CopyButton text={chatMessage.content} />
					{/* the author or a leader or an admin can remove the chat message, which takes its shared files with it */}
					{canDelete && (
						<Tooltip>
							<TooltipTrigger asChild>
								<button
									type="button"
									aria-label="Delete message"
									onClick={() => onDeleteChatMessage(chatMessage.id)}
									className="hover:text-foreground flex items-center"
								>
									<Trash2 className="size-3" />
								</button>
							</TooltipTrigger>
							<TooltipContent>Delete message</TooltipContent>
						</Tooltip>
					)}
				</div>
			</div>
		</ChatAuthor>
	)
})

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
		<AnchorLink href={imageUrl} target="_blank" rel="noopener noreferrer" className="mb-1 block w-fit">
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
