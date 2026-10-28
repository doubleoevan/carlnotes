import { toApiUrl } from "@carlnotes/client/apiClient"
import type { ChatLinkPreview, ChatMessageAttachment } from "@carlnotes/contracts/chat"
import { PODCAST_EPISODE_SPEAKER_NAMES } from "@carlnotes/contracts/podcastEpisodes"
import {
	type CopyMarkdownControlProps,
	CopyMarkdownButton as SharedCopyMarkdownButton,
} from "@carlnotes/core/components/CopyMarkdownButton"
import { isSafeHref } from "@carlnotes/core/lib/safeChatMarkdown"
import { cn } from "@carlnotes/nightshift/classNames"
import { Image } from "expo-image"
import { Check, Copy, Paperclip } from "lucide-react-native"
import type { ReactNode } from "react"
import { Pressable, View } from "react-native"
import { copyText } from "@/clipboard"
import { CoffeeMug } from "@/components/branding/CoffeeMug"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ThinkingLine } from "@/components/common/ThinkingLine"
import { YoutubePlayer } from "@/components/common/YoutubePlayer"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { ChatAuthor } from "./ChatAuthor"

/**
 * Shares the existing copy feedback state with the message's native clipboard control.
 */
export function CopyButton({ text }: { text: string }) {
	return <SharedCopyMarkdownButton markdown={text} copyToClipboard={copyText} Control={CopyControl} />
}
function CopyControl({ isCopied, onCopy }: CopyMarkdownControlProps) {
	return (
		<ChatMessageAction accessibilityLabel={isCopied ? "Copied" : "Copy message"} onPress={onCopy}>
			<Icon as={isCopied ? Check : Copy} className="size-3.5 text-muted-foreground" />
		</ChatMessageAction>
	)
}

/**
 * Draws compact web-style message actions with the native minimum touch target.
 */
export function ChatMessageAction({
	children,
	accessibilityLabel,
	onPress,
	className,
}: {
	children: ReactNode
	accessibilityLabel: string
	onPress: () => void
	className?: string
}) {
	return (
		<Pressable
			accessibilityRole="button"
			accessibilityLabel={accessibilityLabel}
			onPress={onPress}
			className={cn(
				"min-h-12 min-w-12 flex-row items-center justify-center gap-1 rounded-md active:bg-accent",
				className,
			)}
		>
			{children}
		</Pressable>
	)
}

/**
 * Shows stored chat attachment names as chips.
 */
export function ChatAttachmentChips({ attachments }: { attachments: ChatMessageAttachment[] }) {
	return (
		<View className="mt-1 flex-row flex-wrap gap-1">
			{attachments.map((attachment) => (
				<View key={attachment.id} className="flex-row items-center gap-1 rounded bg-muted px-2 py-1">
					<Icon as={Paperclip} className="size-3 text-muted-foreground" />
					<Text className="shrink text-xs text-muted-foreground">{attachment.name}</Text>
				</View>
			))}
		</View>
	)
}

/**
 * Shows the stored web preview metadata below its message.
 */
export function ChatLinkPreviews({ previews }: { previews: ChatLinkPreview[] }) {
	return (
		<View className="w-[92%] gap-2">
			{previews
				.filter((preview) => isSafeHref(preview.url))
				.map((preview) =>
					preview.youtubeVideoId ? (
						<View key={preview.url} className="mt-1 overflow-hidden rounded-lg border border-border">
							<YoutubePlayer
								youtubeVideoId={preview.youtubeVideoId}
								title={preview.title}
								thumbnailPath={preview.imagePath}
							/>
						</View>
					) : (
						<AnchorLink
							key={preview.url}
							href={preview.url}
							accessibilityLabel={preview.title ?? preview.url}
							className="mt-1 max-w-full overflow-hidden rounded-lg border border-border bg-card"
						>
							{preview.imagePath && (
								<Image
									source={{ uri: toApiUrl(preview.imagePath) }}
									style={{ width: "100%", height: 120 }}
									contentFit="cover"
								/>
							)}
							<View className="gap-1 p-2">
								<Text className="text-sm font-semibold text-link">{preview.title ?? preview.url}</Text>
								{preview.description && (
									<Text className="text-xs text-muted-foreground" numberOfLines={3}>
										{preview.description}
									</Text>
								)}
								<Text className="text-xs text-muted-foreground">{toPreviewHost(preview.url)}</Text>
							</View>
						</AnchorLink>
					),
				)}
		</View>
	)
}

// fall back to the supplied URL when its host cannot be read
function toPreviewHost(url: string): string {
	try {
		return new URL(url).hostname
	} catch {
		return url
	}
}

/**
 * Keeps Carl's author line visible while the first words are on their way.
 */
export function ModelThinkingBubble() {
	return (
		<ChatAuthor authorUserId={null} authorUsername={PODCAST_EPISODE_SPEAKER_NAMES.host}>
			<View className="max-w-[92%] flex-row items-center gap-2 rounded-2xl rounded-bl-sm bg-bubble px-3.5 py-2">
				<CoffeeMug size={16} className="text-muted-foreground" />
				<ThinkingLine />
			</View>
		</ChatAuthor>
	)
}
