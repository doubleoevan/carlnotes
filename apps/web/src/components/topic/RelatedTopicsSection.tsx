import {
	type RelatedTopic,
	type RelatedTopicsSectionElements,
	relatedTopicSortValues,
	RelatedTopicsSection as SharedRelatedTopicsSection,
} from "@carlnotes/core/components/RelatedTopicsSection"
import { cn } from "@carlnotes/nightshift/classNames"
import { SortableHeader } from "@/components/table/SortableHeader"
import { TableCard } from "@/components/table/TableCard"
import {
	ScriptedTablePagination,
	toScriptedPaginationCardClass,
	usePaginatedRowSort,
} from "@/components/table/TablePagination"
import { TopicNameLink } from "@/components/table/TopicNameLink"
import { TABLE_CLASS, TABLE_HEAD_CLASS, TABLE_ONLY_COLUMN_CLASS, TABLE_SCROLL_CLASS } from "@/lib/tableClasses"
import { CollapsibleSection } from "./CollapsibleSection"

export type { RelatedTopic } from "@carlnotes/core/components/RelatedTopicsSection"

/**
 * The table of the topics most related to a topic that the user may open, starting at five a page and sortable by name.
 * Its html holds the first rows for a browser without JavaScript.
 */
export function RelatedTopicsSection({
	relatedTopics,
	elements = RELATED_TOPICS_SECTION_ELEMENTS,
}: {
	relatedTopics: RelatedTopic[]
	// the topic page's elements, or an MCP view's with its own topic link
	elements?: RelatedTopicsSectionElements
}) {
	const { renderedRows, sort, pagination } = usePaginatedRowSort({
		rows: relatedTopics,
		valueByKey: relatedTopicSortValues,
	})
	return (
		<SharedRelatedTopicsSection
			relatedTopics={relatedTopics}
			renderedRows={renderedRows}
			sort={sort}
			pagination={<ScriptedTablePagination {...pagination} />}
			elements={elements}
		/>
	)
}

// the topic page's collapsible section and the DOM table with its one full-width column
export const RELATED_TOPICS_SECTION_ELEMENTS: RelatedTopicsSectionElements = {
	Section: ({ title, countLabel, children }) => (
		<CollapsibleSection value="related-topics" title={title} countLabel={countLabel}>
			{children}
		</CollapsibleSection>
	),
	Card: ({ children, rowCount }) => (
		<TableCard className={toScriptedPaginationCardClass(rowCount)}>{children}</TableCard>
	),
	Table: ({ children }) => (
		<div className={TABLE_SCROLL_CLASS}>
			<table className={TABLE_CLASS}>{children}</table>
		</div>
	),
	Head: ({ children }) => (
		<thead className={TABLE_HEAD_CLASS}>
			<tr>{children}</tr>
		</thead>
	),
	Header: ({ sort, sortKey, label }) => (
		<SortableHeader
			sort={sort}
			sortKey={sortKey}
			label={label}
			className={cn(TABLE_ONLY_COLUMN_CLASS, "py-2 font-normal")}
		/>
	),
	Body: ({ children }) => <tbody>{children}</tbody>,
	// every row keeps its line, which the card's bottom edge meets
	Row: ({ children, className }) => (
		<tr className={cn("border-b", className)}>
			<td className={cn(TABLE_ONLY_COLUMN_CLASS, "py-2")}>{children}</td>
		</tr>
	),
	TopicNameLink,
}
