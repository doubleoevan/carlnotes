import type { ChatAttachment } from "@carlnotes/contracts/payloads"
import { toCharacterCountLabel } from "@carlnotes/core/lib/labels"
import { FileText, Film, X } from "lucide-react-native"
import { Image, Pressable, View } from "react-native"
import { toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"

/**
 * The attachments waiting on the next message, as removable chips. An image gets a thumbnail and everything else gets
 * a named chip.
 */
export function ChatAttachmentChips({
	attachments,
	onRemove,
}: {
	attachments: ChatAttachment[]
	onRemove: (index: number) => void
}) {
	if (attachments.length === 0) {
		return null
	}
	return (
		<View className="flex-row flex-wrap gap-1.5">
			{attachments.map((attachment, index) => (
				<View
					// biome-ignore lint/suspicious/noArrayIndexKey: two pastes share a name, and chips are stateless rows a shift repaints identically
					key={`${attachment.name}-${index}`}
					className="max-w-full flex-row items-center gap-1.5 rounded-lg border border-border bg-muted py-1 pl-1.5"
				>
					{/* the kind: a thumbnail for an image, an icon for the rest */}
					{attachment.kind === "image" ? (
						<Image
							source={{ uri: attachment.dataUrl }}
							accessibilityLabel={attachment.name}
							className="size-6 rounded"
							resizeMode="cover"
						/>
					) : (
						<Icon as={attachment.kind === "video" ? Film : FileText} className="size-3.5 text-muted-foreground" />
					)}
					{/* the name, and a pasted text's length */}
					<Text className="max-w-32 text-xs text-foreground" numberOfLines={1}>
						{attachment.name}
					</Text>
					{attachment.kind === "text" && (
						<Text className="text-xs text-muted-foreground">{toCharacterCountLabel(attachment.text)}</Text>
					)}
					{/* the remove control, sized to the touch target */}
					<Pressable
						accessibilityRole="button"
						accessibilityLabel={`Delete ${attachment.name}`}
						hitSlop={toTouchTargetHitSlop(28)}
						className="size-7 items-center justify-center"
						onPress={() => onRemove(index)}
					>
						<Icon as={X} className="size-3 text-muted-foreground" />
					</Pressable>
				</View>
			))}
		</View>
	)
}
