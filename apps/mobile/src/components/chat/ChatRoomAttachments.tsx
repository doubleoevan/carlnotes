import { toChatRoomAttachmentUrl } from "@carlnotes/client/chatRoomClient"
import type { ChatRoomMessageBubbleProps } from "@carlnotes/core/components/ChatRoomMessageBubble"
import { FileText, Film, ImageIcon, type LucideIcon, Paperclip, X } from "lucide-react-native"
import { Pressable, View } from "react-native"
import { useDownloadedFilePreview } from "@/components/common/useDownloadedFilePreview"
import { Button, toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { usePageMutation } from "@/hooks/usePageMutation"

// the icon per attachment kind, with the paperclip for a kind this build does not know
const ATTACHMENT_KIND_ICONS: Record<
	ChatRoomMessageBubbleProps["chatMessage"]["attachments"][number]["kind"],
	LucideIcon
> = {
	image: ImageIcon,
	pdf: FileText,
	document: FileText,
	text: Paperclip,
	video: Film,
	unknown: Paperclip,
}

/**
 * A room message's files, each opening in the system preview, with a delete for the author and the room's leaders.
 */
export function ChatRoomAttachments({
	chatMessage,
	topicId,
	teamId,
	canDelete,
	onAttachmentDelete,
}: ChatRoomMessageBubbleProps) {
	// a download opens in the system preview, and its copy is deleted with the message
	const previewDownloadedFile = useDownloadedFilePreview()
	const mutation = usePageMutation()
	if (chatMessage.attachments.length === 0) {
		return null
	}
	return (
		<View className="mt-1 gap-0.5">
			{chatMessage.attachments.map((attachment) => (
				<View key={attachment.id} className="flex-row items-center gap-1.5">
					<Icon as={ATTACHMENT_KIND_ICONS[attachment.kind]} className="size-3 text-muted-foreground" />
					{/* the file download */}
					<Button
						variant="link"
						className="h-auto min-h-11 max-w-56 justify-start px-0"
						accessibilityLabel={`Download ${attachment.name}`}
						disabled={mutation.isPending}
						onPress={() =>
							void mutation.run(() =>
								previewDownloadedFile({
									path: toChatRoomAttachmentUrl(topicId, teamId, attachment.id),
									filename: attachment.name,
								}),
							)
						}
					>
						<Text className="text-xs text-muted-foreground underline" numberOfLines={1}>
							{attachment.name}
						</Text>
					</Button>
					{canDelete && (
						<Pressable
							accessibilityRole="button"
							accessibilityLabel={`Delete ${attachment.name}`}
							hitSlop={toTouchTargetHitSlop(28)}
							className="size-7 items-center justify-center"
							onPress={() => onAttachmentDelete(attachment.id)}
						>
							<Icon as={X} className="size-3 text-muted-foreground" />
						</Pressable>
					)}
				</View>
			))}
			{/* a download that failed */}
			{mutation.error && (
				<Text accessibilityRole="alert" className="text-xs text-destructive">
					{mutation.error}
				</Text>
			)}
		</View>
	)
}
