// a finding's link preview in the Topic Finding sheet: the source's image or its YouTube player over the host, the
// title, and the description, all one link to the source
import { toApiUrl } from "@carlnotes/client/apiClient"
import type { ChatLinkPreview } from "@carlnotes/contracts/chat"
import { toHostWithoutWww } from "@carlnotes/contracts/seo"
import { toPlainText } from "@carlnotes/contracts/spokenText"
import { useFindingLinkPreview } from "@carlnotes/core/hooks/useFindingLinkPreview"
import { Image } from "expo-image"
import { useState } from "react"
import { Text, View } from "react-native"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { AnchorLink } from "@/components/common/AnchorLink"
import { YoutubePlayer } from "@/components/common/YoutubePlayer"
import { toTypeRoleStyle } from "@/typeRoleStyles"

// the finding whose preview loads, a supplied preview that keeps stories offline, and what opening the source reports
type FindingLinkPreviewProps = {
	findingId: string
	linkPreview?: ChatLinkPreview | null
	onOpen: () => void
}

/**
 * Renders the finding's link preview, read while the sheet is open unless the caller supplies one.
 */
export function FindingLinkPreview({ findingId, linkPreview: suppliedLinkPreview, onOpen }: FindingLinkPreviewProps) {
	const { linkPreview: fetchedLinkPreview, isLoading } = useFindingLinkPreview(
		findingId,
		suppliedLinkPreview === undefined,
	)
	const linkPreview = suppliedLinkPreview === undefined ? fetchedLinkPreview : suppliedLinkPreview
	if (isLoading) {
		return (
			<View className="mb-3">
				<CoffeeLoading isSmall className="py-1" />
			</View>
		)
	}
	if (!linkPreview) {
		return null
	}
	return (
		<FindingLinkPreviewCard key={linkPreview.imagePath ?? linkPreview.url} linkPreview={linkPreview} onOpen={onOpen} />
	)
}

// the preview card, which keeps its text if its image is missing or cannot load
function FindingLinkPreviewCard({ linkPreview, onOpen }: { linkPreview: ChatLinkPreview; onOpen: () => void }) {
	// keep loading visible until the image has appeared, a cached image included
	const [hasImageError, setHasImageError] = useState(false)
	const [isImageLoading, setIsImageLoading] = useState(Boolean(linkPreview.imagePath))
	if (linkPreview.youtubeVideoId) {
		return (
			<View className="mb-3 overflow-hidden rounded-xl border border-border bg-secondary">
				<YoutubePlayer
					key={linkPreview.youtubeVideoId}
					youtubeVideoId={linkPreview.youtubeVideoId}
					title={linkPreview.title}
					thumbnailPath={linkPreview.imagePath}
					onPlay={onOpen}
				/>
				<AnchorLink
					href={linkPreview.url}
					accessibilityLabel={`Open ${linkPreview.title || toHostWithoutWww(linkPreview.url)}`}
					onPress={onOpen}
				>
					<LinkPreviewText linkPreview={linkPreview} />
				</AnchorLink>
			</View>
		)
	}
	return (
		<AnchorLink
			href={linkPreview.url}
			accessibilityLabel={`Open ${linkPreview.title || toHostWithoutWww(linkPreview.url)}`}
			onPress={onOpen}
			className="mb-3 overflow-hidden rounded-xl border border-border bg-secondary active:opacity-75"
		>
			{linkPreview.imagePath && !hasImageError ? (
				<View>
					<Image
						source={{ uri: toApiUrl(linkPreview.imagePath) }}
						style={{ width: "100%", aspectRatio: 1.91 }}
						contentFit="cover"
						onDisplay={() => setIsImageLoading(false)}
						onError={() => setHasImageError(true)}
						accessible={false}
					/>
					{isImageLoading ? (
						<View className="absolute inset-0 items-center justify-center" pointerEvents="none">
							<CoffeeLoading isSmall className="py-1" />
						</View>
					) : null}
				</View>
			) : null}
			<LinkPreviewText linkPreview={linkPreview} />
		</AnchorLink>
	)
}

// the source's host, title, and description under the image or the video
function LinkPreviewText({ linkPreview }: { linkPreview: ChatLinkPreview }) {
	return (
		<View className="gap-1 p-3">
			<Text style={toTypeRoleStyle("caption")} className="text-muted-foreground">
				{toHostWithoutWww(linkPreview.url)}
			</Text>
			{linkPreview.title ? (
				<Text style={toTypeRoleStyle("label")} className="text-secondary-foreground">
					{toPlainText(linkPreview.title)}
				</Text>
			) : null}
			{linkPreview.description ? (
				<Text style={toTypeRoleStyle("caption")} className="text-muted-foreground">
					{toPlainText(linkPreview.description)}
				</Text>
			) : null}
		</View>
	)
}
