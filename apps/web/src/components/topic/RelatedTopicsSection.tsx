import type { TopicResponse } from "@carlnotes/contracts/topics"
import { cn } from "@carlnotes/nightshift/classNames"
import { PagedTableSection } from "@/components/table/PagedTableSection"
import { SortableHeader, type SortValue } from "@/components/table/SortableHeader"
import { TopicNameLink } from "@/components/table/TopicNameLink"
import { TABLE_ONLY_COLUMN_CLASS } from "@/lib/styleClasses"

// a related topic, with its latest podcast episode
export type RelatedTopic = TopicResponse["relatedTopics"][number]

// the sortable column's value: the topic's name
const relatedTopicSortValues: Record<string, (relatedTopic: RelatedTopic) => SortValue> = {
	topic: (relatedTopic) => relatedTopic.name,
}

/**
 * The table of the topics most related to a topic that the user may open, starting at five a page and sortable by name.
 * Each row is the topic's name linked to its page with its latest podcast episode's play button.
 */
export function RelatedTopicsSection({ relatedTopics }: { relatedTopics: RelatedTopic[] }) {
	return (
		<PagedTableSection
			value="related-topics"
			title="Similar topics"
			rows={relatedTopics}
			rowSortValues={relatedTopicSortValues}
			toRowKey={(relatedTopic) => relatedTopic.id}
			renderHeadings={(sort) => (
				<SortableHeader
					sort={sort}
					sortKey="topic"
					label="Topic"
					className={cn(TABLE_ONLY_COLUMN_CLASS, "py-2 font-normal")}
				/>
			)}
			renderRowCells={(relatedTopic) => (
				<td className={cn(TABLE_ONLY_COLUMN_CLASS, "py-2")}>
					<TopicNameLink topic={relatedTopic} />
				</td>
			)}
		/>
	)
}
