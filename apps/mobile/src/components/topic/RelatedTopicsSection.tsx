import { PAGE_SIZES } from "@carlnotes/contracts/pagination"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import { usePaginatedRowSort } from "@carlnotes/core/hooks/usePaginatedRowSort"
import { View } from "react-native"
import { SortableHeader } from "@/components/table/SortableHeader"
import { TableCard, TableHeader, TableRow } from "@/components/table/TableCard"
import { TablePagination } from "@/components/table/TablePagination"
import { TopicNameLink } from "@/components/table/TopicNameLink"
import { CollapsibleSection } from "./CollapsibleSection"

// the Topic column uses the same case-insensitive sort as every table
const topicSortValues = { name: (topic: TopicResponse["relatedTopics"][number]) => topic.name }

/**
 * Matches the web's Similar topics table with linked names and the existing podcast player.
 */
export function RelatedTopicsSection({ relatedTopics }: Pick<TopicResponse, "relatedTopics">) {
	// keep relevance order until the user sorts by name
	const { pageRows, sort, pagination } = usePaginatedRowSort({
		rows: relatedTopics,
		valueByKey: topicSortValues,
		initialPageSize: 5,
	})
	const hasPagination = relatedTopics.length > PAGE_SIZES[0]
	if (relatedTopics.length === 0) {
		return null
	}
	return (
		<CollapsibleSection title="Similar topics">
			<TableCard>
				{/* the same sortable Topic column as the web */}
				<TableHeader>
					<SortableHeader sort={sort} sortKey="name" label="Topic" />
				</TableHeader>
				{/* topic names and podcast buttons reuse the shared native table row */}
				{pageRows.map((topic, index) => (
					<TableRow key={topic.id} isLast={index === pageRows.length - 1 && !hasPagination}>
						<TopicNameLink topic={topic} />
					</TableRow>
				))}
				{hasPagination ? (
					<View className="px-4">
						<TablePagination pagination={pagination} />
					</View>
				) : null}
			</TableCard>
		</CollapsibleSection>
	)
}
