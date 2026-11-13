import { PAGE_SIZES } from "@carlnotes/contracts/pagination"
import {
	type RelatedTopic,
	type RelatedTopicsSectionElements,
	relatedTopicSortValues,
	RelatedTopicsSection as SharedRelatedTopicsSection,
} from "@carlnotes/core/components/RelatedTopicsSection"
import { usePaginatedRowSort } from "@carlnotes/core/hooks/usePaginatedRowSort"
import { View } from "react-native"
import { SortableHeader } from "@/components/table/SortableHeader"
import { TableCard, TableHeader, TableRow } from "@/components/table/TableCard"
import { TablePagination } from "@/components/table/TablePagination"
import { TopicNameLink } from "@/components/table/TopicNameLink"
import { CollapsibleSection } from "./CollapsibleSection"

/**
 * Renders the web's Similar topics table with linked names and the existing podcast player.
 */
export function RelatedTopicsSection({ relatedTopics }: { relatedTopics: RelatedTopic[] }) {
	// keep relevance order until the user sorts by name
	const { pageRows, sort, pagination } = usePaginatedRowSort({
		rows: relatedTopics,
		valueByKey: relatedTopicSortValues,
	})
	return (
		<SharedRelatedTopicsSection
			relatedTopics={relatedTopics}
			renderedRows={pageRows.map((row) => ({ row }))}
			sort={sort}
			pagination={
				relatedTopics.length > PAGE_SIZES[0] ? (
					<View className="px-4">
						<TablePagination pagination={pagination} />
					</View>
				) : null
			}
			elements={RELATED_TOPICS_SECTION_ELEMENTS}
		/>
	)
}

// the native collapsible section, card, and full-width rows
const RELATED_TOPICS_SECTION_ELEMENTS: RelatedTopicsSectionElements = {
	Section: CollapsibleSection,
	Card: TableCard,
	Table: ({ children }) => <View>{children}</View>,
	Head: TableHeader,
	Header: SortableHeader,
	Body: ({ children }) => <View>{children}</View>,
	Row: ({ children, hasSeparator }) => <TableRow isLast={!hasSeparator}>{children}</TableRow>,
	TopicNameLink,
}
