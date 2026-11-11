import type { TopicResponse } from "@carlnotes/contracts/topics"
import { View } from "react-native"
import { NotesSection } from "@/components/note/NotesSection"
import { PodcastEpisodesCard } from "@/components/podcast/PodcastEpisodesCard"
import { CollapsibleSection } from "./CollapsibleSection"
import { RelatedTopicsSection } from "./RelatedTopicsSection"
import { TopicInfoContent } from "./TopicInfo"
import { TopicScanHistory } from "./TopicScanHistory"
import { TopicSettingsCard } from "./TopicSettingsCard"

// the topic, and where its notes section reports the count of its notes
type TopicPageCardsProps = { topic: TopicResponse; onNoteCountChange?: (noteCount: number | null) => void }

/**
 * Presents the web Topic page's cards in their phone-width order.
 */
export function TopicPageCards({ topic, onNoteCountChange }: TopicPageCardsProps) {
	return (
		<View className="mx-4">
			{/* the prompt and recap precede the read-only configuration */}
			<CollapsibleSection title="Topic roast" hasClosedDivider>
				<View className="rounded-lg border border-separator bg-card p-5 shadow-raised">
					<TopicInfoContent topic={topic} isCard />
				</View>
			</CollapsibleSection>
			<TopicSettingsCard topic={topic} />
			{/* the topic's films, history, and neighboring topics follow its configuration */}
			<PodcastEpisodesCard topic={topic} format="video" />
			<PodcastEpisodesCard topic={topic} />
			<TopicScanHistory topic={topic} />
			<NotesSection topic={topic} onNoteCountChange={onNoteCountChange} />
			<RelatedTopicsSection relatedTopics={topic.relatedTopics} />
		</View>
	)
}
