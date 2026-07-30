import type { TopicFeedResponse } from "@shared/contracts"
import type { MouseEvent } from "react"
import { AccordionContent, AccordionItem, AccordionTrigger } from "@/components/primitives/accordion"
import { Topic } from "./Topic"

// how long the jump waits for the accordion to settle. the open and close animations in animations.css run
// 200ms, and the rest is margin, since a jump fired mid-animation aims at a position that is still moving
const SCROLL_SETTLE_DELAY_MS = 300

// snap the clicked trigger to the top of the viewport, but only when the click opens the section.
// data-state still holds the pre-click value here, since Radix flips it on a later re-render
function scrollTriggerToTop(event: MouseEvent<HTMLButtonElement>): void {
	const trigger = event.currentTarget
	const isOpenBeforeClick = trigger.getAttribute("data-state") === "open"
	if (!isOpenBeforeClick) {
		setTimeout(() => trigger.scrollIntoView({ behavior: "instant", block: "start" }), SCROLL_SETTLE_DELAY_MS)
	}
}

// the section titles mapped to their section key
const SECTION_TITLE = {
	yours: "Your topics",
	subscribed: "Your subscribed topics",
	featured: "Featured topics",
	popular: "Popular topics",
}

// a topic feed section with its key and its topic feeds
type TopicSectionProps = { section: TopicFeedResponse["sections"][number] }

/**
 * A collapsible section of topics: "Your topics", "Your subscribed topics", "Featured topics", or "Popular topics"
 */
export function TopicSection({ section }: TopicSectionProps) {
	return (
		<AccordionItem value={section.key}>
			<AccordionTrigger onClick={scrollTriggerToTop}>
				<span className="font-display flex-1 text-xl">{SECTION_TITLE[section.key]}</span>
				{/* the topic count */}
				<span className="text-muted-foreground text-sm">
					{section.topics.length} {section.topics.length === 1 ? "topic" : "topics"}
				</span>
			</AccordionTrigger>
			<AccordionContent>
				{/* the section topics, or Carl's empty line */}
				{section.topics.length === 0 && (
					<p className="text-muted-foreground pb-4 text-sm">{`Carl hasn't filed anything here yet.`}</p>
				)}
				{section.topics.map((topic, index) => (
					<Topic key={topic.id} topic={topic} index={index} />
				))}
			</AccordionContent>
		</AccordionItem>
	)
}
