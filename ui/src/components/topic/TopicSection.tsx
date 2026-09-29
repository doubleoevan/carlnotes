import type { TopicFeedResponse, TopicSectionKey } from "@shared/contracts"
import { getRouteApi, Link } from "@tanstack/react-router"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { type MouseEvent, type ReactNode, useLayoutEffect, useRef } from "react"
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/primitives/accordion"
import { toPaginationSlots } from "@/lib/paginationSlots"
import { MENU_BUTTON_CLASS, RAIL_TEXT_INSET } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"
import { Topic } from "./Topic"

// every section shows this many topics per page
const TOPICS_PER_PAGE = 5

// the homepage route, whose search says which page each section shows
const homeRoute = getRouteApi("/_layout/")

// the section titles mapped to their section key
const SECTION_TITLE = {
	yours: "Your topics",
	subscribed: "Your subscribed topics",
	featured: "Featured topics",
	popular: "Popular topics",
}

// a topic feed section with its key and its topic feeds, or an empty section's call to action
type TopicSectionProps = { section: TopicFeedResponse["sections"][number]; onNewTopicChat: () => void }

/**
 * A collapsible section of topics: "Your topics", "Your subscribed topics", "Featured topics", or "Popular topics"
 */
export function TopicSection({ section, onNewTopicChat }: TopicSectionProps) {
	// pick the topics from the page the url names. a page number past the last page stays on the last page
	const pageCount = Math.max(1, Math.ceil(section.topics.length / TOPICS_PER_PAGE))
	const pageNumber = Math.min(homeRoute.useSearch()[section.key] ?? 1, pageCount)
	const pageTopics = section.topics.slice((pageNumber - 1) * TOPICS_PER_PAGE, pageNumber * TOPICS_PER_PAGE)
	return (
		<AccordionItem value={section.key}>
			<AccordionTrigger onClick={scrollTriggerToTop} className="pb-1">
				<span className="font-display flex-1 text-xl">{SECTION_TITLE[section.key]}</span>
				{/* the topic count, inset to end on the same line as the quota line above it */}
				<span className={cn("text-muted-foreground text-sm", RAIL_TEXT_INSET)}>
					{section.topics.length} {section.topics.length === 1 ? "topic" : "topics"}
				</span>
			</AccordionTrigger>
			{/* a closed section is rendered in the HTML but hidden, so a crawler reaches its topics and its page links */}
			<AccordionContent forceMount>
				{/* the section topics, or a call to action to start one */}
				{section.topics.length === 0 && (
					<p className="text-muted-foreground pl-4 pb-4 text-sm">
						<button type="button" onClick={onNewTopicChat} className="text-link hover:underline">
							Give Carl a topic. You know the one.
						</button>
					</p>
				)}
				{pageTopics.map((topic, index) => (
					<Topic key={topic.id} topic={topic} index={index} />
				))}
				{/* the links to the section's pages */}
				{pageCount > 1 && (
					<TopicSectionPagination sectionKey={section.key} pageNumber={pageNumber} pageCount={pageCount} />
				)}
			</AccordionContent>
		</AccordionItem>
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

// a centered row of links to a section's pages, between a previous and a next link
function TopicSectionPagination({
	sectionKey,
	pageNumber,
	pageCount,
}: {
	sectionKey: TopicSectionKey
	pageNumber: number
	pageCount: number
}) {
	// save where the clicked link sits on screen. the new page's topics change the height above the link
	const clickedLinkRef = useRef<{ link: HTMLElement; top: number; linkedPageNumber: number } | null>(null)
	const saveClickedLinkTop = (event: MouseEvent<HTMLAnchorElement>, linkedPageNumber: number): void => {
		clickedLinkRef.current = {
			link: event.currentTarget,
			top: event.currentTarget.getBoundingClientRect().top,
			linkedPageNumber,
		}
	}

	// scroll the clicked link back to the height it was clicked at, once the page it links to is on screen
	useLayoutEffect(() => {
		const clickedLink = clickedLinkRef.current
		if (clickedLink?.linkedPageNumber !== pageNumber) {
			return
		}
		if (clickedLink.link.isConnected) {
			window.scrollBy(0, clickedLink.link.getBoundingClientRect().top - clickedLink.top)
		}
		clickedLinkRef.current = null
	}, [pageNumber])

	// one link in the row, to a page of this section
	const renderPageLink = ({
		linkedPageNumber,
		label,
		isCurrent = false,
		isDisabled = false,
	}: {
		linkedPageNumber: number
		label: ReactNode
		isCurrent?: boolean
		isDisabled?: boolean
	}) =>
		// a disabled previous or next arrow is a span instead of a link to the page already shown
		isDisabled ? (
			<span aria-disabled className={cn(toPageLinkClass(false), "pointer-events-none opacity-50")}>
				{label}
			</span>
		) : (
			<Link
				to="/"
				search={(search) => ({ ...search, [sectionKey]: linkedPageNumber === 1 ? undefined : linkedPageNumber })}
				replace
				resetScroll={false}
				// mark a link active only on an exact url match. a partial match also marks the first page's link active
				activeOptions={{ exact: true }}
				onClick={(event) => saveClickedLinkTop(event, linkedPageNumber)}
				aria-current={isCurrent ? "page" : undefined}
				className={toPageLinkClass(isCurrent)}
			>
				{label}
			</Link>
		)
	return (
		<nav aria-label={`${SECTION_TITLE[sectionKey]} pages`} className="flex justify-center py-2">
			<ul className="flex flex-wrap items-center justify-center gap-1">
				<li>
					{renderPageLink({
						linkedPageNumber: pageNumber - 1,
						label: <ChevronLeft aria-label="Previous page" />,
						isDisabled: pageNumber === 1,
					})}
				</li>
				{toPaginationSlots({ pageNumber, pageCount }).map((paginationSlot) =>
					typeof paginationSlot === "string" ? (
						<li
							key={paginationSlot}
							aria-hidden
							className={cn(PAGINATION_SLOT_CLASS, "text-muted-foreground text-center")}
						>
							…
						</li>
					) : (
						<li key={paginationSlot}>
							{renderPageLink({
								linkedPageNumber: paginationSlot,
								label: paginationSlot,
								isCurrent: paginationSlot === pageNumber,
							})}
						</li>
					),
				)}
				<li>
					{renderPageLink({
						linkedPageNumber: pageNumber + 1,
						label: <ChevronRight aria-label="Next page" />,
						isDisabled: pageNumber === pageCount,
					})}
				</li>
			</ul>
		</nav>
	)
}

// every slot in the row is one width, gaps included, so a row of a given length never shifts sideways
const PAGINATION_SLOT_CLASS = "w-10 shrink-0"

// a page link looks like a menu button, and the current page's link has the highlight color
function toPageLinkClass(isCurrent: boolean): string {
	return cn(
		MENU_BUTTON_CLASS,
		PAGINATION_SLOT_CLASS,
		"justify-center px-0",
		isCurrent && "bg-primary text-primary-foreground border-primary hover:text-primary-foreground",
	)
}
