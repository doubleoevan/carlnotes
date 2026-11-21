import type { TopicResponse } from "@carlnotes/contracts/topics"
import { NotesSection } from "@/components/note/NotesSection"
import { PodcastEpisodesCard } from "@/components/podcast/PodcastEpisodesCard"
import { STACKED_CLOSED_DIVIDER_CLASS } from "@/components/topic/CollapsibleSection"
import { HydrateSection } from "@/components/topic/HydrateSection"
import { RelatedTopicsSection } from "@/components/topic/RelatedTopicsSection"
import { TopicInfoCard } from "@/components/topic/TopicInfoCard"
import { TopicScanHistory } from "@/components/topic/TopicScanHistory"
import { TopicSettingsCard } from "@/components/topic/TopicSettingsCard"

/**
 * The topic info card and its settings on the left, its podcast episodes, scan history, notes, and related topics on
 * the right.
 */
export function TopicViews({
	topic,
	onMakeTopicPublic,
	onReloadTopicPage,
	onNoteCountChange,
}: {
	topic: TopicResponse
	onMakeTopicPublic: () => void
	onReloadTopicPage: () => Promise<void>
	onNoteCountChange: (noteCount: number | null) => void
}) {
	return (
		<HydrateSection index={4}>
			<div className="grid gap-x-8 lg:grid-cols-[32rem_minmax(0,1fr)]">
				{/* the topic info card, then the settings card under it */}
				<div className="min-w-0">
					<TopicInfoCard topic={topic} onMakeTopicPublic={onMakeTopicPublic} />
					<TopicSettingsCard topic={topic} />
				</div>
				{/* the podcast episodes, the scan history, the notes, and the related topics, held to the column width so long
				    urls truncate */}
				<div className="min-w-0">
					<PodcastEpisodesCard topic={topic} onPodcastEpisodeRemoved={onReloadTopicPage} />
					<TopicScanHistory
						scans={topic.scans}
						scansPage={topic.scansPage}
						topicMemoryCount={topic.topicMemoryCount}
						canRateTopicMemories={topic.canRateTopicMemories}
						allowedUrls={new Set(topic.findings.map((finding) => finding.url))}
						findings={topic.findings}
						topic={{ id: topic.id, name: topic.name, prompt: topic.prompt }}
						canEdit={topic.canEdit}
						topicSources={topic.sources}
						onReloadTopicPage={onReloadTopicPage}
					/>
					{/* the notes on this topic, expanded by default with no note bodies loaded */}
					<NotesSection
						pageType="topic"
						pageId={topic.id}
						titleClassName="font-display text-xl"
						hasCompactHeader
						accordionItemClassName={topic.relatedTopics.length > 0 ? STACKED_CLOSED_DIVIDER_CLASS : undefined}
						onNoteCountChange={onNoteCountChange}
					/>
					{/* the topics nearest this one that the user may open */}
					<RelatedTopicsSection relatedTopics={topic.relatedTopics} />
				</div>
			</div>
		</HydrateSection>
	)
}
