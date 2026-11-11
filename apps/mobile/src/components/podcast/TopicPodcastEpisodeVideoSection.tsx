import type { PodcastEpisode } from "@carlnotes/contracts/podcast"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import {
	TopicPodcastEpisodeVideoSection as SharedTopicPodcastEpisodeVideoSection,
	type TopicPodcastEpisodeVideoSectionElements,
} from "@carlnotes/core/components/TopicPodcastEpisodeVideoSection"
import { type ComponentProps, type ComponentRef, type RefObject, useEffect, useMemo, useRef } from "react"
import { type ScrollView, View } from "react-native"
import { CollapsibleSection } from "@/components/topic/CollapsibleSection"
import { captureFilmVisitEvent } from "@/visitAnalytics"
import { PodcastThemeSongNote } from "./PodcastThemeSongNote"
import { TopicPodcastEpisodeVideoPlayer } from "./TopicPodcastEpisodeVideoPlayer"
import { UnpublishedPodcastEpisodeCard } from "./UnpublishedPodcastEpisodeCard"

// the topic screen's scroll view, which a row's play scrolls to the section
type TopicScrollViewRef = RefObject<ComponentRef<typeof ScrollView> | null>

// the space left above the section once it scrolls into view
const SCROLL_TARGET_GAP = 12

// the topic, the read of its screen again while its film renders, and the topic's scroll view
type TopicPodcastEpisodeVideoSectionProps = {
	topic: TopicResponse
	onVideoRenderingPoll: () => void | Promise<void>
	scrollViewRef: TopicScrollViewRef
}

/**
 * Adapts Topic Cinema to the screen's collapsible section, which the topic's scroll view scrolls to each time a row
 * asks. A topic with no film, ready or rendering, shows nothing.
 */
export function TopicPodcastEpisodeVideoSection({
	topic,
	onVideoRenderingPoll,
	scrollViewRef,
}: TopicPodcastEpisodeVideoSectionProps) {
	// keep the section renderer stable while the film plays
	const elements = useMemo<TopicPodcastEpisodeVideoSectionElements>(
		() => ({
			// biome-ignore lint/correctness/noComponentHookFactories: memoized on the ref, so the player stays mounted
			Section: (sectionProps) => <TopicCinemaSection {...sectionProps} scrollViewRef={scrollViewRef} />,
			Player: TopicPodcastEpisodeVideoPlayer,
			RenderingCard: TopicPodcastEpisodeVideoRenderingCard,
		}),
		[scrollViewRef],
	)
	return (
		<SharedTopicPodcastEpisodeVideoSection
			topic={topic}
			onToggled={(isOpen) =>
				captureFilmVisitEvent("visit_episode_video_section_toggled", { topicId: topic.id, isOpen })
			}
			onVideoRenderingPoll={onVideoRenderingPoll}
			elements={elements}
		/>
	)
}

// the card that says the film is rendering, in the film player's place
function TopicPodcastEpisodeVideoRenderingCard({ podcastEpisode }: { podcastEpisode: PodcastEpisode }) {
	return <UnpublishedPodcastEpisodeCard podcastEpisode={podcastEpisode} isVideoRendering />
}

// the collapsible section, kept mounted while closed, with the theme song's credits right after its title and a
// divider under it while closed
function TopicCinemaSection({
	title,
	isOpen,
	onOpenChange,
	scrollRequestCount,
	scrollViewRef,
	children,
}: ComponentProps<TopicPodcastEpisodeVideoSectionElements["Section"]> & { scrollViewRef: TopicScrollViewRef }) {
	// scroll the section into view each time the count rises. Android removes a plain wrapper view from the native
	// tree, and a removed view cannot be measured
	const sectionRef = useRef<ComponentRef<typeof View>>(null)
	useEffect(() => {
		const contentView = scrollViewRef.current?.getInnerViewRef()
		if (scrollRequestCount === 0 || !sectionRef.current || !contentView) {
			return
		}
		sectionRef.current.measureLayout(contentView, (_x, y) => {
			scrollViewRef.current?.scrollTo({ y: y - SCROLL_TARGET_GAP, animated: true })
		})
	}, [scrollRequestCount, scrollViewRef])
	return (
		<View ref={sectionRef} collapsable={false}>
			<CollapsibleSection
				title={title}
				titleNote={<PodcastThemeSongNote />}
				isOpen={isOpen}
				onOpenChange={onOpenChange}
				isContentKept
				hasClosedDivider
			>
				{children}
			</CollapsibleSection>
		</View>
	)
}
