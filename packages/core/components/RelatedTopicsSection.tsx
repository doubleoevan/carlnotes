import { PAGE_SIZES } from "@carlnotes/contracts/pagination"
import { toCountLabel } from "@carlnotes/contracts/text"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import type { ComponentType, ReactNode } from "react"
import type { RowSort } from "../hooks/useRowSort"

// a related topic, with its latest podcast episode
export type RelatedTopic = TopicResponse["relatedTopics"][number]

// the sortable column's value: the topic's name
export const relatedTopicSortValues = { topic: (relatedTopic: RelatedTopic) => relatedTopic.name }

type Container = ComponentType<{ children: ReactNode }>
export type RelatedTopicsSectionElements = {
	// the collapsible section with its title and its count at the far right
	Section: ComponentType<{ title: string; countLabel: string; children: ReactNode }>
	// the card around the table and its pagination, which knows how many rows it holds
	Card: ComponentType<{ children: ReactNode; rowCount: number }>
	Table: Container
	Head: Container
	Header: ComponentType<{ sort: RowSort; sortKey: string; label: string }>
	Body: Container
	// one row with its line under it, except under the last row of a table with no pagination
	Row: ComponentType<{ children: ReactNode; className?: string; hasSeparator: boolean }>
	TopicNameLink: ComponentType<{ topic: RelatedTopic }>
}

/**
 * Renders the Similar topics table: the topics most related to a topic that the user may open, sortable by name, each
 * row the topic's name linked to its page with its latest podcast episode's play button. A topic with no related
 * topics renders nothing.
 */
export function RelatedTopicsSection({
	relatedTopics,
	renderedRows,
	sort,
	pagination,
	elements: { Section, Card, Table, Head, Header, Body, Row, TopicNameLink },
}: {
	relatedTopics: RelatedTopic[]
	// the sorted rows the table renders, from the platform's paginated sort over relatedTopics
	renderedRows: { row: RelatedTopic; className?: string }[]
	sort: RowSort
	pagination: ReactNode
	elements: RelatedTopicsSectionElements
}) {
	// nothing renders without related topics, and the pagination shows past the smallest page size
	if (relatedTopics.length === 0) {
		return null
	}
	const hasPagination = relatedTopics.length > PAGE_SIZES[0]
	return (
		<Section title="Similar topics" countLabel={toCountLabel(relatedTopics.length, "topic")}>
			<Card rowCount={relatedTopics.length}>
				<Table>
					{/* the sortable Topic column */}
					<Head>
						<Header sort={sort} sortKey="topic" label="Topic" />
					</Head>
					<Body>
						{renderedRows.map(({ row, className }, i) => (
							<Row key={row.id} className={className} hasSeparator={hasPagination || i < renderedRows.length - 1}>
								<TopicNameLink topic={row} />
							</Row>
						))}
					</Body>
				</Table>
				{pagination}
			</Card>
		</Section>
	)
}
