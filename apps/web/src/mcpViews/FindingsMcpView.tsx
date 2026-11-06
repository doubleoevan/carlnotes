import type { TopicFinding } from "@carlnotes/contracts/findings"
import { EMPTY_FILTERED_FINDINGS } from "@carlnotes/core/lib/topicFeedLabels"
import { cn } from "@carlnotes/nightshift/classNames"
import { ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/primitives/button"
import { TableCard } from "@/components/table/TableCard"
import { TopicNameLink } from "@/components/table/TopicNameLink"
import { FindingsTable } from "./FindingsTable"
import { McpViewSubscribeButton } from "./McpViewSubscribeButton"
import { findMcpViewPodcastEpisode, PAGE_FAILED_TEXT, useMcpViewData } from "./mcpViewHost"
import { useFindingPages } from "./useFindingPages"
import { useMcpViewFindings } from "./useMcpViewFindings"

// the findings an MCP view shows if its tool result has none, one list so the rows below never reset on each render
const NO_TOPIC_FINDINGS: TopicFinding[] = []

/**
 * The findings MCP view: the feed's findings as a table under the topic's name, its latest podcast episode's play button,
 * and Follow. A user's thumbs, bookmark, and read toggle call their tools through the host, and its pages call the
 * tool that opened it with its cursor.
 */
export function FindingsMcpView() {
	const { topic, topicFindings: mcpViewTopicFindings = NO_TOPIC_FINDINGS } = useMcpViewData()
	const { findings: topicFindings, topicFeedHandlers } = useMcpViewFindings(mcpViewTopicFindings)
	const findingPages = useFindingPages(topic?.id)
	if (!topic) {
		return null
	}

	const latestPodcastEpisode = topic.latestPodcastEpisode
		? findMcpViewPodcastEpisode(topic.latestPodcastEpisode.id)
		: null
	return (
		<div>
			{/* the topic's name with its latest podcast episode's play button, and Follow */}
			<div className="mb-2 flex items-center justify-between gap-3">
				<span className="font-display min-w-0 text-lg">
					<TopicNameLink topic={topic} />
				</span>
				<McpViewSubscribeButton topicId={topic.id} isSubscribed={topic.isSubscribed} />
			</div>
			{/* the page's findings, or the line a Topic with none shows */}
			{topicFindings.length ? (
				<TableCard className={cn("px-3 py-1", findingPages.isLoading && "opacity-60")}>
					<FindingsTable
						rows={topicFindings.map((topicFinding) => ({ topicFinding, topic, latestPodcastEpisode }))}
						topicFeedHandlers={topicFeedHandlers}
					/>
				</TableCard>
			) : (
				<p className="text-muted-foreground text-sm">{EMPTY_FILTERED_FINDINGS}</p>
			)}
			{/* the page before and the page after, shown once there is more than one */}
			{(findingPages.hasPreviousPage || findingPages.hasNextPage) && (
				<div className="mt-3 flex justify-end gap-2">
					<Button
						size="sm"
						variant="outline"
						disabled={!findingPages.hasPreviousPage || findingPages.isLoading}
						onClick={findingPages.openPreviousPage}
					>
						<ChevronLeft aria-hidden className="size-4" />
						Previous
					</Button>
					<Button
						size="sm"
						variant="outline"
						disabled={!findingPages.hasNextPage || findingPages.isLoading}
						onClick={findingPages.openNextPage}
					>
						Next
						<ChevronRight aria-hidden className="size-4" />
					</Button>
				</div>
			)}
			{findingPages.hasPageFailed && (
				<p role="alert" className="text-destructive mt-2 text-right text-sm">
					{PAGE_FAILED_TEXT}
				</p>
			)}
		</div>
	)
}
