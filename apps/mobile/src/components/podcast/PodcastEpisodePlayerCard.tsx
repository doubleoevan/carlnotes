import type { PodcastEpisode, PodcastEpisodeChapter } from "@carlnotes/contracts/podcast"
import { AI_VOICES_NOTE, PODCAST_NAME } from "@carlnotes/contracts/podcastEpisodes"
import { toHostWithoutWww } from "@carlnotes/contracts/seo"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import type { TopicFeedHandlers } from "@carlnotes/core/hooks/useTopicFindingActions"
import { toClockLabel, toCountLabel, toPodcastEpisodeDayAndDurationLabels } from "@carlnotes/core/lib/labels"
import { SITE_URL } from "@carlnotes/core/lib/pageHead"
import { cn } from "@carlnotes/nightshift/classNames"
import { Rss } from "lucide-react-native"
import { type ComponentRef, useRef, useState } from "react"
import { Pressable, View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { WebFeatureButton } from "@/components/common/WebFeature"
import { toTouchTargetHitSlop } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { MoreButton } from "@/components/topic/MoreButton"
import { useFontScaledSize } from "@/hooks/useFontScaledSize"
import { useTopicResourceInfo } from "@/providers/TopicResourceInfoProvider"
import { toTypeRoleStyle } from "@/typeRoleStyles"
import { PodcastEpisodeChapterPill } from "./PodcastEpisodePill"

import { PodcastEpisodePlayButton } from "./PodcastEpisodePlayButton"
import { PodcastEpisodeTitle } from "./PodcastEpisodeRow"

/**
 * Shows the latest podcast and its first chapters with the existing web player as the playback destination.
 */
export function PodcastEpisodePlayerCard({
	topic,
	topicFeedHandlers,
}: {
	topic: TopicResponse
	topicFeedHandlers: TopicFeedHandlers
}) {
	// keep chapter browsing local to the card
	const [isExpanded, setIsExpanded] = useState(false)
	const episode = topic.latestPodcastEpisode
	if (!episode?.pagePath) {
		return null
	}
	// retain the published path while selecting the visible chapters
	const chapters = isExpanded ? episode.chapters : episode.chapters.slice(0, 3)
	const isUnplayed = episode.progressSeconds === 0 && !episode.isCompleted
	return (
		<CollapsibleSection
			title={PODCAST_NAME}
			titleAside={isUnplayed ? <Text className="text-sm font-bold text-link">new episode</Text> : undefined}
		>
			<View className="gap-4 rounded-lg border border-separator bg-card p-5 shadow-raised">
				{/* the episode's published identity and playback link */}
				<PodcastDetails episode={episode} />
				{/* the web player provides chapter playback until the native player is available */}
				<View>
					{chapters.map((chapter, i) => (
						<PodcastChapter
							key={chapter.position}
							chapter={chapter}
							podcastEpisode={episode}
							topic={topic}
							topicFeedHandlers={topicFeedHandlers}
							isLast={i === chapters.length - 1}
						/>
					))}
				</View>
				<WebFeatureButton
					title="Subscribe to podcast"
					description="Choose a podcast app or copy this podcast’s feed on carlnotes.com."
					path={episode.pagePath}
					icon={Rss}
					className="min-h-11 w-full"
				/>
			</View>
			{episode.chapters.length > 3 ? (
				<MoreButton
					isExpanded={isExpanded}
					moreCount={episode.chapters.length - 3}
					moreLabel={`+ ${toCountLabel(episode.chapters.length - 3, "chapter")}`}
					onToggle={() => setIsExpanded(!isExpanded)}
				/>
			) : null}
		</CollapsibleSection>
	)
}

// match the published player's title, season, and metadata hierarchy
function PodcastDetails({ episode }: { episode: PodcastEpisode }) {
	const labels = [
		...toPodcastEpisodeDayAndDurationLabels(episode),
		toCountLabel(episode.chapterCount, "chapter"),
		AI_VOICES_NOTE,
	]
	return (
		<View className="flex-row items-center gap-4">
			<PodcastEpisodePlayButton episode={episode} size="lg" />
			<View className="min-w-0 flex-1 gap-0.5">
				<Text
					style={{ ...toTypeRoleStyle("sectionHeading"), fontSize: 14, lineHeight: 20 }}
					className="text-muted-foreground"
				>
					Season {episode.season} · Episode {episode.episodeNumber}
				</Text>
				<PodcastEpisodeTitle episode={episode} isLarge />
				<Text className="text-xs text-muted-foreground">{labels.join(" · ")}</Text>
			</View>
		</View>
	)
}

// open the Finding from its source line and share the web's labeled chapter pill
function PodcastChapter({
	chapter,
	podcastEpisode,
	topic,
	topicFeedHandlers,
	isLast,
}: {
	chapter: PodcastEpisodeChapter
	podcastEpisode: PodcastEpisode
	topic: TopicResponse
	topicFeedHandlers: TopicFeedHandlers
	isLast: boolean
}) {
	// keep the Finding sheet outside the chapter row and return focus to its source line
	const info = useTopicResourceInfo()
	const rankWidth = useFontScaledSize(16)
	const triggerRef = useRef<ComponentRef<typeof View>>(null)
	const finding = topic.findings.find((finding) => finding.findingId === chapter.findingId)
	const sourceLabel = `${toHostWithoutWww(chapter.sourceUrl)} · ${toClockLabel(chapter.startSeconds)} to ${toClockLabel(chapter.endSeconds)}`
	const handleOpenFinding = (): void => {
		if (finding && info) {
			info.open({ resource: finding, topic, latestPodcastEpisode: podcastEpisode, topicFeedHandlers, triggerRef })
		}
	}
	return (
		<Pressable
			accessible={false}
			onPress={handleOpenFinding}
			className={cn(
				"min-h-14 flex-row items-center gap-3 py-3 active:bg-accent",
				!isLast && "border-b border-dashed border-separator-strong",
			)}
		>
			<Text
				style={{ ...toTypeRoleStyle("sectionHeading"), fontSize: 14, width: rankWidth }}
				className="text-muted-foreground"
			>
				{chapter.position + 1}
			</Text>
			<View className="min-w-0 flex-1">
				{/* the title opens the player, independently of the Finding sheet */}
				<AnchorLink
					href={`${SITE_URL}${podcastEpisode.pagePath}`}
					accessibilityLabel={`Open player for chapter ${chapter.position + 1}: ${chapter.title}`}
					accessibilityHint="Opens the player on carlnotes.com"
					onPress={(event) => event.stopPropagation()}
					hitSlop={toTouchTargetHitSlop(20)}
				>
					<Text numberOfLines={1} className="text-sm font-bold">
						{chapter.title}
					</Text>
				</AnchorLink>
				{/* source and times open details; the same chapter pill appears on its Finding */}
				<View className="flex-row items-center gap-1.5">
					{finding && info ? (
						<Pressable
							ref={triggerRef}
							className="min-w-0 shrink"
							accessibilityRole="button"
							accessibilityLabel={`Open finding for chapter ${chapter.position + 1}: ${chapter.title}`}
							onPress={(event) => {
								event.stopPropagation()
								handleOpenFinding()
							}}
							hitSlop={toTouchTargetHitSlop(20)}
						>
							<Text numberOfLines={1} className="text-xs text-muted-foreground">
								{sourceLabel}
							</Text>
						</Pressable>
					) : (
						<Text numberOfLines={1} className="min-w-0 shrink text-xs text-muted-foreground">
							{sourceLabel}
						</Text>
					)}
					<PodcastEpisodeChapterPill podcastEpisode={podcastEpisode} chapter={chapter} />
				</View>
			</View>
		</Pressable>
	)
}
