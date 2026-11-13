import { toCountLabel } from "@carlnotes/contracts/text"
import type { TopicFeedResponse } from "@carlnotes/contracts/topics"
import { TOPIC_SECTION_TITLES } from "@carlnotes/core/lib/topicFeedLabels"
import { getRouteApi, Link } from "@tanstack/react-router"
import type { MouseEvent } from "react"
import { AccordionSection } from "@/components/common/AccordionSection"
import { Pagination } from "@/components/common/Pagination"
import { toRenderedRows } from "@/lib/renderedRows"
import { NewTopicEmptyCard } from "./NewTopicEmptyCard"
import { Topic } from "./Topic"

// every section shows this many topics per page
const TOPICS_PER_PAGE = 5

// the Topics page's route, whose search says which page each section shows
const topicsRoute = getRouteApi("/_layout/topics/")

// a topic feed section with its key and its topic feeds, or an empty section's call to action
type TopicSectionProps = { section: TopicFeedResponse["sections"][number]; onNewTopicChat: () => void }

/**
 * A collapsible section of topics: "Your topics", "Your followed topics", "Featured topics", or "Popular topics"
 */
export function TopicSection({ section, onNewTopicChat }: TopicSectionProps) {
	// the topics the section renders: the page the url names, and the first NO_SCRIPT_ROW_LIMIT topics for a reader without JavaScript.
	// a page number past the last page stays on the last page
	const pageCount = Math.max(1, Math.ceil(section.topics.length / TOPICS_PER_PAGE))
	const pageNumber = Math.min(topicsRoute.useSearch()[section.key] ?? 1, pageCount)
	const renderedTopics = toRenderedRows(section.topics, { pageNumber, pageSize: TOPICS_PER_PAGE })
	return (
		// a closed section is rendered in the HTML but hidden, so a crawler reaches its topics and its page links
		<AccordionSection
			value={section.key}
			title={TOPIC_SECTION_TITLES[section.key]}
			countLabel={toCountLabel(section.topics.length, "topic")}
			isContentKept
			onTriggerClick={scrollTriggerToTop}
		>
			{/* the section topics, or a call to action to start one */}
			{section.topics.length === 0 && <NewTopicEmptyCard onNewTopicChat={onNewTopicChat} />}
			{/* the topics, each at its position on its page */}
			{renderedTopics.map(({ row: topic, className }, index) => (
				<Topic key={topic.id} topic={topic} index={index % TOPICS_PER_PAGE} className={className} />
			))}
			{/* the links to the section's pages, with the same space above as below */}
			{pageCount > 1 && (
				<Pagination
					ariaLabel={`${TOPIC_SECTION_TITLES[section.key]} pages`}
					className="pt-4 pb-2"
					pageNumber={pageNumber}
					pageCount={pageCount}
					rowCount={section.topics.length}
					renderPageLink={({ linkedPageNumber, label, className, isCurrentPage, onClick }) => (
						<Link
							to="/topics"
							search={(search) => ({
								...search,
								[section.key]: linkedPageNumber === 1 ? undefined : linkedPageNumber,
							})}
							replace
							resetScroll={false}
							// mark a link active only on an exact url match.
							// a partial match also marks the first page's link active
							activeOptions={{ exact: true }}
							onClick={onClick}
							aria-current={isCurrentPage ? "page" : undefined}
							className={className}
						>
							{label}
						</Link>
					)}
				/>
			)}
		</AccordionSection>
	)
}

// how long the jump waits for the accordion to settle
const SCROLL_SETTLE_DELAY_MS = 300

// snap the clicked trigger to the top of the viewport, but only if the click opens the section
function scrollTriggerToTop(event: MouseEvent<HTMLButtonElement>): void {
	const trigger = event.currentTarget
	const isOpenBeforeClick = trigger.getAttribute("data-state") === "open"
	if (!isOpenBeforeClick) {
		setTimeout(() => trigger.scrollIntoView({ behavior: "instant", block: "start" }), SCROLL_SETTLE_DELAY_MS)
	}
}
