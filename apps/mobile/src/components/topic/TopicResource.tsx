import type { sendFindingFeedback } from "@carlnotes/client/topicFindingClient"
import type { ChatLinkPreview } from "@carlnotes/contracts/chat"
import type { TopicFinding } from "@carlnotes/contracts/findings"
import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import type { FindingSearchTopic } from "@carlnotes/contracts/search"
import type { TopicDetails } from "@carlnotes/contracts/topics"
import type { TopicFeedHandlers } from "@carlnotes/core/hooks/useTopicFindingActions"
import { cn } from "@carlnotes/nightshift/classNames"
import { useRecyclingState } from "@shopify/flash-list"
import { type ComponentRef, type ReactNode, useRef } from "react"
import { Pressable, type View } from "react-native"
import { useTopicResourceInfo } from "@/providers/TopicResourceInfoProvider"
import { TopicFindingSummary } from "./TopicFindingSummary"
import { TopicResourceInfo } from "./TopicResourceInfo"

// the row receives presented data and keeps writes in the shared handlers
export type TopicResourceProps = {
	resource: TopicFinding
	topic:
		| Pick<TopicDetails, "id" | "name" | "prompt" | "isTopicOwner" | "isTeamMember" | "canRate">
		| Pick<FindingSearchTopic, "id" | "name" | "prompt" | "canRate" | "canBookmark">
	latestPodcastEpisode?: PodcastEpisode | null
	children?: ReactNode
	isBookmarkOnLine?: boolean
	topicFeedHandlers: TopicFeedHandlers
	linkPreview?: ChatLinkPreview | null
	onSendFeedback?: typeof sendFindingFeedback
	topicFindingRank?: number | null
	isLast?: boolean
	isPending?: boolean
}

/**
 * Opens a finding's details from the web's compact numbered row.
 */
export function TopicResource({ isLast = true, ...props }: TopicResourceProps) {
	// keep app sheets outside recycled rows and story sheets local
	const info = useTopicResourceInfo()
	const [isLocalInfoOpen, setIsLocalInfoOpen] = useRecyclingState(false, [props.resource.findingId])
	const triggerRef = useRef<ComponentRef<typeof View>>(null)
	const isInfoOpen = info ? info.findingId === props.resource.findingId : isLocalInfoOpen
	const handleOpen = (): void => {
		if (info) {
			info.open({ ...props, triggerRef })
			return
		}
		setIsLocalInfoOpen(true)
	}
	return (
		<>
			{/* rows share their parent's card and retain only the inset separator */}
			<Pressable
				accessible={false}
				onPress={handleOpen}
				className={cn("min-h-16 py-3 active:bg-accent", !isLast && "border-b border-dashed border-separator-strong")}
			>
				<TopicFindingSummary {...props} triggerRef={triggerRef} isInfoOpen={isInfoOpen} onOpen={handleOpen} />
			</Pressable>
			{/* inspecting a finding never records a source open */}
			{isLocalInfoOpen ? (
				<TopicResourceInfo
					key={props.resource.findingId}
					{...props}
					triggerRef={triggerRef}
					onClose={() => setIsLocalInfoOpen(false)}
				/>
			) : null}
		</>
	)
}
