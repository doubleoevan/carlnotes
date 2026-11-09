import type { UpdatesMinutes, UpdatesResponse } from "@carlnotes/contracts/updates"
import { UpdatesList as SharedUpdatesList, type UpdatesListElements } from "@carlnotes/core/components/UpdatesList"
import { toReadingTimeLabel } from "@carlnotes/core/lib/labels"
import { cn } from "@carlnotes/nightshift/classNames"
import { Coffee } from "lucide-react"
import type { ReactNode } from "react"
import { PAGE_HEADER_CLASS, PAGE_TITLE_CLASS, RESOURCE_LIST_CARD_CLASS } from "@/lib/styleClasses"
import type { TopicFeedHandlers } from "@/providers/TopicFeedProvider"
import { TopicResourceWithTopicLink } from "./TopicResourceWithTopicLink"
import { UpdatesButton } from "./UpdatesButton"

// the browser elements the shared list composes, which the MCP view keeps too
const UPDATES_LIST_ELEMENTS: UpdatesListElements = {
	Card: ({ children }) => <section className={cn(RESOURCE_LIST_CARD_CLASS, "p-5")}>{children}</section>,
	Heading: ({ action, children }) => (
		<div className={cn(PAGE_HEADER_CLASS, "mb-4")}>
			<h2 className={PAGE_TITLE_CLASS}>
				<Coffee className="size-6" />
				{children}
			</h2>
			{action}
		</div>
	),
	Opener: ({ children }) => <p className="mb-4">{children}</p>,
	EmptyState: ({ children }) => <p className="text-muted-foreground text-sm">{children}</p>,
}

/**
 * Shows a list with the feed's rows, the site's links, and the Update button.
 */
export function UpdatesList({
	updates,
	placeholder,
	topicFeedHandlers,
	minutes,
	onSelectMinutes,
}: {
	updates?: UpdatesResponse
	placeholder?: ReactNode
	// what a row's note does on a read, a rating, a bookmark, or an open
	topicFeedHandlers: TopicFeedHandlers
	// the list's length, and what choosing a length in the Update button does
	minutes: UpdatesMinutes
	onSelectMinutes: (minutes: UpdatesMinutes) => void
}) {
	return (
		<SharedUpdatesList
			updates={updates}
			findings={updates && <UpdatesFindings updates={updates} topicFeedHandlers={topicFeedHandlers} />}
			placeholder={placeholder}
			action={<UpdatesButton minutes={minutes} onSelect={onSelectMinutes} />}
			elements={UPDATES_LIST_ELEMENTS}
		/>
	)
}

// each Finding as the feed shows it, with its Topic and reading time. the rows run past the card's padding, so their
// hover reaches the same inset as the feed's
function UpdatesFindings({
	updates,
	topicFeedHandlers,
}: {
	updates: UpdatesResponse
	topicFeedHandlers: TopicFeedHandlers
}) {
	return (
		<div className="-mx-4">
			{updates.findings.map((finding, index) => {
				const topic = updates.topics.find(({ id }) => id === finding.topicId)
				return (
					topic && (
						<TopicResourceWithTopicLink
							key={finding.findingId}
							resource={finding}
							topic={topic}
							rank={index + 1}
							latestPodcastEpisode={updates.podcastEpisodes.find(
								(podcastEpisode) => podcastEpisode.topicId === topic.id,
							)}
							topicFeedHandlers={topicFeedHandlers}
						>
							<span>{`· ${toReadingTimeLabel(finding)}`}</span>
						</TopicResourceWithTopicLink>
					)
				)
			})}
		</div>
	)
}
