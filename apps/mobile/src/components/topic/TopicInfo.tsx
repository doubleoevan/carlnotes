import { toAvatarImagePath } from "@carlnotes/contracts/avatars"
import { PODCAST_NAME } from "@carlnotes/contracts/podcastEpisodes"
import { SITE_URL } from "@carlnotes/contracts/site"
import type { TopicDetails, TopicResponse } from "@carlnotes/contracts/topics"
import { toCountLabel } from "@carlnotes/core/lib/labels"
import { toNotesMarkdown } from "@carlnotes/core/lib/topicScanRecap"
import { useRecyclingState } from "@shopify/flash-list"
import { Globe, Lock, Mail } from "lucide-react-native"
import { type ComponentRef, type ReactNode, useRef, useState } from "react"
import { type LayoutChangeEvent, Pressable, Text, View } from "react-native"
import { Avatar } from "@/components/branding/Avatar"
import { NoteIcon } from "@/components/branding/NoteIcon"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ScrollBox } from "@/components/common/ScrollBox"
import { Sheet, type SheetProps } from "@/components/common/Sheet"
import { PodcastEpisodeRow } from "@/components/podcast/PodcastEpisodeRow"
import { Button, toTouchTargetHitSlop } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { ShareTopic } from "@/components/share/ShareTopic"
import { toTypeRoleStyle } from "@/typeRoleStyles"
import { TopicAttachmentLink } from "./TopicAttachmentLink"
import { NumberedTopicFindingList, SafeNoteText, TopicScanFailure } from "./TopicScanRecap"
import { TopicSources } from "./TopicSources"

// a topic note follows the same fields as the web's home popover
type TopicInfoProps = { topic: TopicDetails } & Pick<SheetProps, "onClose" | "triggerRef">
const VISIBILITY_ICONS = { private: Lock, public: Globe, invite: Mail }

/**
 * Opens the Topic roast sheet from the web's note icon beside the title.
 */
export function TopicInfoButton({ topic, children }: { topic: TopicDetails; children?: ReactNode }) {
	// close a topic's note when its feed cell is recycled
	const [isOpen, setIsOpen] = useRecyclingState(false, [topic.id])
	const triggerRef = useRef<ComponentRef<typeof View>>(null)
	return (
		<>
			<Pressable
				ref={triggerRef}
				accessibilityRole="button"
				accessibilityLabel="Topic details"
				accessibilityHint={`A topic note from Carl about ${topic.name}`}
				accessibilityState={{ expanded: isOpen }}
				hitSlop={toTouchTargetHitSlop(28)}
				onPress={() => setIsOpen(true)}
				className={
					children
						? "min-h-11 min-w-0 shrink flex-row items-center gap-2 active:opacity-75"
						: "min-h-7 min-w-7 shrink-0 items-center justify-center active:opacity-75"
				}
			>
				{children}
				<NoteIcon />
			</Pressable>
			{isOpen ? (
				<TopicInfo key={topic.id} topic={topic} triggerRef={triggerRef} onClose={() => setIsOpen(false)} />
			) : null}
		</>
	)
}

/**
 * Presents the web's Topic roast content in a dismissible native sheet.
 */
export function TopicInfo({ topic, triggerRef, onClose }: TopicInfoProps) {
	return (
		<Sheet title="Topic roast" triggerRef={triggerRef} onClose={onClose}>
			<TopicInfoContent topic={topic} />
		</Sheet>
	)
}

/**
 * Shares the Topic roast's content between its sheet and page card.
 */
export function TopicInfoContent({ topic, isCard = false }: { topic: TopicDetails; isCard?: boolean }) {
	// include scan details when the topic response provides them
	const latestScan = isCard && "scans" in topic ? (topic as TopicResponse).scans[0] : null
	return (
		<>
			{/* preserve the web's section order and labels */}
			{latestScan?.status === "failed" ? (
				<InfoSection label="Last brew failed" isFirst>
					<TopicScanFailure error={latestScan.error} />
					<Text style={toTypeRoleStyle("caption")} className="text-muted-foreground">
						Carl will keep trying. Check this topic's sources if it keeps failing.
					</Text>
				</InfoSection>
			) : null}
			<TopicBarista topic={topic} />
			<TopicPrompt topic={topic} isCard={isCard} />
			<TopicNotes topic={topic} isCard={isCard} />
			{topic.attachments.length > 0 ? (
				<InfoSection label="Attachments">
					{topic.attachments.map((attachment) => (
						<TopicAttachmentLink key={attachment.id} attachment={attachment} isTopicOwner={topic.isTopicOwner} />
					))}
				</InfoSection>
			) : null}
			{!isCard ? (
				<InfoSection label="Sources">
					<TopicSources sources={topic.sources} />
				</InfoSection>
			) : null}
			<TopicInfoFooter topic={topic} isCard={isCard} />
		</>
	)
}

// state private and invite visibility above the closing counts
function TopicInfoFooter({ topic, isCard }: { topic: TopicDetails; isCard: boolean }) {
	return (
		<>
			{!isCard && topic.visibility !== "public" ? (
				<View className="border-t border-dashed border-separator-strong">
					<InfoSection label="Visibility">
						<TopicVisibility visibility={topic.visibility} />
					</InfoSection>
				</View>
			) : null}
			<View className="flex-row justify-between gap-3 border-t border-dashed border-separator-strong pt-3">
				<Text style={toTypeRoleStyle("body")} className="text-foreground">
					{toCountLabel(topic.teamCount, "team")}
				</Text>
				<Text style={toTypeRoleStyle("body")} className="text-foreground">
					{toCountLabel(topic.subscriberCount, "follower")}
				</Text>
			</View>
		</>
	)
}

/**
 * Shares the web's visibility icon and label between Topic roast and Artisanal Blend.
 */
export function TopicVisibility({ visibility }: Pick<TopicDetails, "visibility">) {
	return (
		<View className="flex-row items-center gap-1.5">
			<Icon as={VISIBILITY_ICONS[visibility]} className="size-3.5 text-foreground" />
			<Text style={toTypeRoleStyle("body")} className="text-foreground">
				{visibility}
			</Text>
		</View>
	)
}

/**
 * Labels one section with the web's display type and spacing.
 */
export function InfoSection({
	label,
	children,
	isFirst = false,
}: {
	label: string
	children: ReactNode
	isFirst?: boolean
}) {
	return (
		<View className={isFirst ? "pb-3" : "py-3"}>
			<Text style={toTypeRoleStyle("sectionLabel")} className="text-muted-foreground">
				{label}
			</Text>
			<View className="mt-1">{children}</View>
		</View>
	)
}

// show the latest episode above the owner's complete prompt
function TopicPrompt({ topic, isCard }: { topic: TopicDetails; isCard: boolean }) {
	const allowedUrls = new Set(topic.findings.map((finding) => finding.url))
	return (
		<>
			{!isCard && topic.latestPodcastEpisode?.pagePath ? (
				<InfoSection label={PODCAST_NAME} isFirst={!topic.owner}>
					<PodcastEpisodeRow
						podcastEpisode={topic.latestPodcastEpisode}
						podcastEpisodePath={topic.latestPodcastEpisode.pagePath}
						isLatestPodcastEpisode
					/>
				</InfoSection>
			) : null}
			<InfoSection label="Carl's Prompt" isFirst={!topic.owner && !topic.latestPodcastEpisode?.pagePath}>
				{topic.prompt.length > 900 ? (
					<ScrollBox>
						<SafeNoteText note={topic.prompt} allowedUrls={allowedUrls} />
					</ScrollBox>
				) : (
					<SafeNoteText note={topic.prompt || "—"} allowedUrls={allowedUrls} />
				)}
			</InfoSection>
		</>
	)
}

// identify the owner even when the feed's byline names a team
function TopicBarista({ topic }: { topic: TopicDetails }) {
	const owner = topic.owner
	if (!owner) {
		return null
	}
	return (
		<InfoSection label="Carl's Barista" isFirst>
			<View className="flex-row items-center justify-between gap-3">
				<AnchorLink
					href={`${SITE_URL}/profiles/${owner.userId}`}
					accessibilityLabel={owner.username}
					className="min-h-11 shrink flex-row items-center gap-2 active:opacity-75"
				>
					<Avatar
						ownerId={owner.userId}
						name={owner.username}
						imageUrl={owner.avatarVersion ? toAvatarImagePath(owner.userId, owner.avatarVersion) : null}
					/>
					<Text style={toTypeRoleStyle("body")} className="shrink text-link">
						{owner.username}
					</Text>
				</AnchorLink>
				<ShareTopic topic={topic} isLabeled />
			</View>
		</InfoSection>
	)
}

// bound expanded notes and keep the page card's short preview above its toggle
function TopicNotes({ topic, isCard }: { topic: TopicDetails; isCard: boolean }) {
	// use one body for the short preview and the scrollbox
	const [isExpanded, setIsExpanded] = useState(false)
	const [isOverflowing, setIsOverflowing] = useState(false)
	const handleMeasure = (event: LayoutChangeEvent): void => setIsOverflowing(event.nativeEvent.layout.height > 136)
	const allowedUrls = new Set(topic.findings.map((finding) => finding.url))
	const copyMarkdown = toNotesMarkdown({
		topicId: topic.id,
		topicName: topic.name,
		prompt: topic.prompt,
		note: topic.scanSummary,
		findings: topic.findings,
		origin: SITE_URL,
	})
	if (!topic.scanSummary && topic.findings.length === 0) {
		return null
	}
	const notes = (
		<>
			{topic.scanSummary ? <SafeNoteText note={topic.scanSummary} allowedUrls={allowedUrls} /> : null}
			<NumberedTopicFindingList findings={topic.findings} />
		</>
	)
	return (
		<InfoSection label={topic.findings.length > 0 ? `Carl's Top ${topic.findings.length}` : "Carl's Notes"}>
			{/* the page preview expands into the same bounded note as the sheet */}
			{isCard && !isExpanded ? (
				<View className="overflow-hidden" style={{ maxHeight: 132 }}>
					<View onLayout={handleMeasure} style={{ flexShrink: 0 }}>
						{notes}
					</View>
				</View>
			) : (
				<ScrollBox copyMarkdown={copyMarkdown} scrollToTopOn={topic.id}>
					{notes}
				</ScrollBox>
			)}
			{isCard && isOverflowing ? (
				<Button
					variant="link"
					className="self-start px-0"
					accessibilityLabel={isExpanded ? "Read less" : "Read more"}
					onPress={() => setIsExpanded(!isExpanded)}
				>
					<Text style={toTypeRoleStyle("body")} className="text-link">
						{isExpanded ? "Read less" : "Read more"}
					</Text>
				</Button>
			) : null}
		</InfoSection>
	)
}
