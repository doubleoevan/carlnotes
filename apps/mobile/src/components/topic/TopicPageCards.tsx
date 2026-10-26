import type { TopicResponse } from "@carlnotes/contracts/topics"
import { View } from "react-native"
import { NotesSection } from "@/components/note/NotesSection"
import { PodcastEpisodesCard } from "@/components/podcast/PodcastEpisodesCard"
import { CollapsibleSection } from "./CollapsibleSection"
import { RelatedTopicsSection } from "./RelatedTopicsSection"
import { TopicInfoContent } from "./TopicInfo"
import { TopicScanHistory } from "./TopicScanHistory"
import { TopicSettingsCard } from "./TopicSettingsCard"

/**
 * Presents the web Topic page's cards in their phone-width order.
 */
export function TopicPageCards({ topic }: { topic: TopicResponse }) {
	return (
		<View className="mx-4">
			{/* the prompt and recap precede the read-only configuration */}
			<CollapsibleSection title="Topic roast">
				<View className="rounded-lg border border-separator bg-card p-5 shadow-raised">
					<TopicInfoContent topic={topic} isCard />
				</View>
			</CollapsibleSection>
			<TopicSettingsCard topic={topic} />
			{/* the topic's history and neighboring topics follow its configuration */}
			<PodcastEpisodesCard topic={topic} />
			<TopicScanHistory topic={topic} />
			<NotesSection topic={topic} />
			<RelatedTopicsSection relatedTopics={topic.relatedTopics} />
		</View>
	)
}
