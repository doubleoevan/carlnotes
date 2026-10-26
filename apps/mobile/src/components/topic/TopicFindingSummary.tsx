import { toApiUrl } from "@carlnotes/client/apiClient"
import type { TopicFinding } from "@carlnotes/contracts/findings"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import { toPlainText } from "@carlnotes/contracts/spokenText"
import { toOneLineText } from "@carlnotes/contracts/text"
import {
	type ResourceMetadataComponents,
	ResourceMetadata as SharedResourceMetadata,
} from "@carlnotes/core/components/ResourceMetadata"
import { cn } from "@carlnotes/nightshift/classNames"
import { fontFamilies } from "@carlnotes/nightshift/typography"
import { useRecyclingState } from "@shopify/flash-list"
import { Image } from "expo-image"
import { Bookmark, Globe } from "lucide-react-native"
import type { ComponentRef, ReactNode, RefObject } from "react"
import { Pressable, Text, View } from "react-native"
import { FindingChapterPill } from "@/components/podcast/PodcastEpisodePill"
import { toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { useFontScaledSize } from "@/hooks/useFontScaledSize"
import { toTypeRoleStyle } from "@/typeRoleStyles"
import { RESOURCE_KIND_ICON } from "./topicFeedIcons"

// the resource kind remains visible beside the title even when a favicon is available
type TopicFindingSummaryProps = {
	resource: TopicFinding
	topicFindingRank?: number | null
	latestPodcastEpisode?: PodcastEpisode | null
	isBookmarkOnLine?: boolean
	children?: ReactNode
	triggerRef: RefObject<ComponentRef<typeof View> | null>
	isInfoOpen: boolean
	onOpen: () => void
}

/**
 * Shows a finding's rank, kind, title, and source in the web's two-line layout.
 */
export function TopicFindingSummary({
	resource,
	topicFindingRank = 1,
	latestPodcastEpisode,
	isBookmarkOnLine,
	children,
	triggerRef,
	isInfoOpen,
	onOpen,
}: TopicFindingSummaryProps) {
	// format the title and keep two-digit ranks inside their existing column
	const title = toOneLineText(toPlainText(resource.title ?? "")) || resource.url
	const rankWidth = useFontScaledSize(16)
	return (
		<View className="flex-row items-start gap-2.5">
			{/* a saved finding takes the rank's place */}
			<View style={{ width: rankWidth }} className="items-center pt-0.5">
				{resource.isBookmarked && !isBookmarkOnLine ? (
					<Icon as={Bookmark} className="size-3.5 text-link" fill="currentColor" accessibilityLabel="Bookmarked" />
				) : (
					<Text
						style={{
							...toTypeRoleStyle("body"),
							fontFamily: fontFamilies.display.name,
							width: rankWidth * 2,
							textAlign: "center",
						}}
						numberOfLines={1}
						className="text-muted-foreground"
					>
						{topicFindingRank}
					</Text>
				)}
			</View>
			<Icon
				as={RESOURCE_KIND_ICON[resource.resourceKind]}
				className={cn("mt-0.5 size-4 text-muted-foreground", resource.isConsumed && "opacity-60")}
				accessibilityLabel={resource.resourceKind}
			/>
			<View className="flex-1 gap-0.5">
				{/* expose the details separately from the podcast and parent Topic links */}
				<Pressable
					ref={triggerRef}
					accessibilityRole="button"
					accessibilityLabel={`Details for ${title}`}
					accessibilityHint="Opens Carl's notes and finding actions"
					accessibilityState={{ expanded: isInfoOpen }}
					hitSlop={toTouchTargetHitSlop(20)}
					onPress={(event) => {
						event.stopPropagation()
						onOpen()
					}}
				>
					<Text
						style={toTypeRoleStyle(resource.isConsumed ? "body" : "label")}
						className={cn("text-card-foreground", resource.isConsumed && "text-muted-foreground")}
						numberOfLines={1}
					>
						{title}
					</Text>
				</Pressable>
				<ResourceMetadata
					resource={resource}
					latestPodcastEpisode={latestPodcastEpisode}
					isBookmarkOnLine={isBookmarkOnLine}
				/>
				{children}
			</View>
		</View>
	)
}

/**
 * Shows the source favicon, host, and publication age with a safe image fallback.
 */
export function ResourceMetadata({
	resource,
	latestPodcastEpisode,
	isBookmarkOnLine,
}: Pick<TopicFindingSummaryProps, "resource" | "latestPodcastEpisode" | "isBookmarkOnLine">) {
	return (
		<View className="gap-1">
			<View className="flex-row flex-wrap items-center gap-1.5">
				<SharedResourceMetadata resource={resource} components={RESOURCE_METADATA_COMPONENTS} />
				<FindingChapterPill podcastEpisode={latestPodcastEpisode} findingId={resource.findingId} />
				{isBookmarkOnLine && resource.isBookmarked ? (
					<Icon as={Bookmark} className="size-3.5 text-link" fill="currentColor" accessibilityLabel="Bookmarked" />
				) : null}
			</View>
			{resource.teamBookmarks.length > 0 ? (
				<Text style={toTypeRoleStyle("caption")} className="text-muted-foreground">
					{`Bookmarked by ${resource.teamBookmarks.map((profile) => profile.username).join(", ")}`}
				</Text>
			) : null}
		</View>
	)
}

// reset failed favicons when FlashList reuses a cell for another image
function HostFavicon({ faviconPath }: { faviconPath: string | null }) {
	const [hasImageError, setHasImageError] = useRecyclingState(false, [faviconPath])
	return faviconPath && !hasImageError ? (
		<Image
			source={{ uri: toApiUrl(faviconPath) }}
			recyclingKey={faviconPath}
			style={{ width: 16, height: 16 }}
			contentFit="contain"
			onError={() => setHasImageError(true)}
			accessible={false}
		/>
	) : (
		<Icon as={Globe} className="size-4 text-muted-foreground" />
	)
}

// use native text and image fallbacks around the shared source and publication metadata
const RESOURCE_METADATA_COMPONENTS: ResourceMetadataComponents = {
	Favicon: HostFavicon,
	Text: ({ children }) => (
		<Text style={toTypeRoleStyle("caption")} className="shrink text-muted-foreground" numberOfLines={1}>
			{children}
		</Text>
	),
}
