import { toApiUrl } from "@carlnotes/client/apiClient"
import { fetchTopicFindingLinkPreview } from "@carlnotes/client/topicFindingClient"
import type { ChatLinkPreview } from "@carlnotes/contracts/chat"
import { toHostWithoutWww } from "@carlnotes/contracts/seo"
import { toPlainText } from "@carlnotes/contracts/spokenText"
import { toOneLineText } from "@carlnotes/contracts/text"
import { toDateLabel } from "@carlnotes/core/lib/labels"
import { SITE_URL } from "@carlnotes/core/lib/pageHead"
import { toNotesMarkdown } from "@carlnotes/core/lib/topicScanRecap"
import { cn } from "@carlnotes/nightshift/classNames"
import { Image } from "expo-image"
import { Bookmark, Check, Circle, ExternalLink } from "lucide-react-native"
import { useEffect, useState } from "react"
import { Text, View } from "react-native"
import { CoffeeLoading } from "@/components/branding/CoffeeLoading"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ScrollBox } from "@/components/common/ScrollBox"
import { ShareMarkdownButton } from "@/components/common/ShareMarkdownButton"
import { Sheet, type SheetProps } from "@/components/common/Sheet"
import { YoutubePlayer } from "@/components/common/YoutubePlayer"
import { Button, toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text as ButtonText } from "@/components/primitives/text"
import { toTypeRoleStyle } from "@/typeRoleStyles"
import { captureVisitEvent, toPublicTopicProperties } from "@/visitAnalytics"
import { TopicFindingRating } from "./TopicFindingRating"
import { ResourceMetadata } from "./TopicFindingSummary"
import type { TopicResourceProps } from "./TopicResource"

// a sheet keeps the row's confirmed and pending state live
export type TopicResourceInfoProps = TopicResourceProps & Pick<SheetProps, "triggerRef" | "onClose">

/**
 * Presents the web's finding details and actions in a native sheet.
 */
export function TopicResourceInfo(props: TopicResourceInfoProps) {
	// record source openings and inline playback as views
	const { resource, topic, topicFindingRank, topicFeedHandlers, triggerRef, onClose } = props
	const title = toOneLineText(toPlainText(resource.title ?? "")) || resource.url
	const handleOpen = (): void => topicFeedHandlers.openTopicFinding(resource.findingId)
	const handleTitlePress = (): void => {
		// report the explicit source click using the same public-topic rule as web
		captureVisitEvent("visit_finding_clicked", {
			host: toHostWithoutWww(resource.url),
			...toPublicTopicProperties(topic),
		})
		handleOpen()
	}
	const markdown = toNotesMarkdown({
		topicId: topic.id,
		topicName: topic.name,
		prompt: topic.prompt,
		note: `[${resource.title ?? resource.url}](${resource.url})\n\n${resource.relevanceExplanation}`,
		origin: SITE_URL,
	})
	return (
		<Sheet title="Topic Finding" triggerRef={triggerRef} onClose={onClose}>
			{/* the source title and metadata */}
			<View className="mb-3 flex-row items-start gap-2.5">
				{topicFindingRank != null ? (
					<Text style={toTypeRoleStyle("sectionLabel")} className="pt-3 text-muted-foreground">
						{topicFindingRank}
					</Text>
				) : null}
				<View className="flex-1 gap-1">
					<AnchorLink
						href={resource.url}
						accessibilityLabel={`Open ${title}`}
						onPress={handleTitlePress}
						hitSlop={toTouchTargetHitSlop(44)}
						className="min-h-11 flex-row items-center gap-1 active:opacity-75"
					>
						<Text style={toTypeRoleStyle("label")} className="shrink text-link">
							{title}
						</Text>
						<Icon as={ExternalLink} className="size-3.5 text-link" />
					</AnchorLink>
					<ResourceMetadata resource={resource} latestPodcastEpisode={props.latestPodcastEpisode} />
				</View>
			</View>
			<FindingLinkPreview findingId={resource.findingId} linkPreview={props.linkPreview} onOpen={handleOpen} />
			{/* keep actions in reach below the same bounded notes as the web */}
			<Text style={toTypeRoleStyle("sectionLabel")} className="mb-1 text-muted-foreground">
				{"Carl's notes"}
			</Text>
			<ScrollBox
				scrollToTopOn={resource.findingId}
				copyMarkdown={markdown}
				actions={<ShareMarkdownButton markdown={markdown} />}
			>
				<Text selectable style={toTypeRoleStyle("body")} className="text-popover-foreground">
					{toPlainText(resource.relevanceExplanation) || "No notes yet."}
				</Text>
			</ScrollBox>
			<View className="my-3 flex-row justify-between gap-4">
				<View className="gap-1">
					<Text style={toTypeRoleStyle("sectionLabel")} className="text-muted-foreground">
						Fetched
					</Text>
					<Text style={toTypeRoleStyle("body")} className="text-popover-foreground">
						{toDateLabel(resource.fetchedAt)}
					</Text>
				</View>
				<View className="items-end gap-1">
					<Text style={toTypeRoleStyle("sectionLabel")} className="text-muted-foreground">
						Views
					</Text>
					<Text style={toTypeRoleStyle("body")} className="text-popover-foreground">
						{resource.viewCount.toLocaleString()}
					</Text>
				</View>
			</View>
			{/* permission-aware actions keep the same order and words as the web */}
			<View className="gap-3 border-t border-border pt-3" accessibilityState={{ busy: props.isPending }}>
				{topic.canRate ? <TopicFindingRating {...props} /> : null}
				<FindingActions {...props} />
			</View>
		</Sheet>
	)
}

// keep bookmarked and consumed state independent
function FindingActions({ resource, topic, topicFeedHandlers, isPending }: TopicResourceProps) {
	// allow removal after topic permissions change
	const hasBookmarkAccess = "canBookmark" in topic ? topic.canBookmark : topic.isTopicOwner || topic.isTeamMember
	const canBookmark = hasBookmarkAccess || resource.isBookmarked
	const bookmarkLabel = resource.isBookmarked ? "Remove bookmark" : "Bookmark"
	const readLabel = resource.isConsumed ? "Mark unread" : "Mark read"
	return (
		<View className="gap-2">
			<View className="flex-row flex-wrap items-center justify-between gap-2">
				{canBookmark ? (
					<Button
						variant="ghost"
						className="px-0"
						accessibilityLabel={bookmarkLabel}
						accessibilityState={{ selected: resource.isBookmarked }}
						disabled={isPending}
						onPress={() => topicFeedHandlers.bookmarkTopicFinding(resource.findingId, !resource.isBookmarked)}
					>
						<Icon
							as={Bookmark}
							className={cn("size-4", resource.isBookmarked && "text-primary")}
							fill={resource.isBookmarked ? "currentColor" : "none"}
						/>
						<ButtonText>{bookmarkLabel}</ButtonText>
					</Button>
				) : null}
				<Button
					variant="ghost"
					className="ml-auto px-0"
					accessibilityLabel={readLabel}
					accessibilityState={{ selected: resource.isConsumed }}
					disabled={isPending}
					onPress={() => topicFeedHandlers.consumeTopicFinding(resource.findingId, !resource.isConsumed)}
				>
					<Icon as={resource.isConsumed ? Circle : Check} />
					<ButtonText>{readLabel}</ButtonText>
				</Button>
			</View>
			{isPending ? (
				<Text accessibilityLiveRegion="polite" style={toTypeRoleStyle("caption")} className="text-muted-foreground">
					Saving…
				</Text>
			) : null}
		</View>
	)
}

// fetch previews only while details are mounted. supplied previews keep stories offline
function FindingLinkPreview({
	findingId,
	linkPreview: suppliedLinkPreview,
	onOpen,
}: {
	findingId: string
	linkPreview?: ChatLinkPreview | null
	onOpen: () => void
}) {
	// discard a late response after the sheet closes
	const [linkPreview, setLinkPreview] = useState(suppliedLinkPreview ?? null)
	const [isLoading, setIsLoading] = useState(suppliedLinkPreview === undefined)
	useEffect(() => {
		if (suppliedLinkPreview !== undefined) {
			return
		}
		let isFindingOpen = true
		fetchTopicFindingLinkPreview(findingId)
			.then((findingLinkPreview) => {
				if (isFindingOpen) {
					setLinkPreview(findingLinkPreview)
				}
			})
			.catch(() => {})
			.finally(() => {
				if (isFindingOpen) {
					setIsLoading(false)
				}
			})
		return () => {
			isFindingOpen = false
		}
	}, [findingId, suppliedLinkPreview])
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

// retain the preview text when its image is missing or cannot load
function FindingLinkPreviewCard({ linkPreview, onOpen }: { linkPreview: ChatLinkPreview; onOpen: () => void }) {
	// keep loading visible until the image has actually appeared, including a cached image
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
					onOpen={onOpen}
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

// share the source attribution between image and video previews
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
