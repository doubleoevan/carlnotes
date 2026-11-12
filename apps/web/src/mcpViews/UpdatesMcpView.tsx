import type { Updates } from "@carlnotes/contracts/updates"
import { UpdatesList, type UpdatesListElements } from "@carlnotes/core/components/UpdatesList"
import { toReadingTimeLabel } from "@carlnotes/core/lib/labels"
import { cn } from "@carlnotes/nightshift/classNames"
import { Coffee } from "lucide-react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { PAGE_TITLE_CLASS, RESOURCE_LIST_CARD_CLASS, STANDALONE_LINE_LINK_CLASS } from "@/lib/styleClasses"
import { FindingsTable, type FindingsTableRow } from "./FindingsTable"
import { McpViewLink } from "./McpViewLink"
import { useMcpViewData } from "./mcpViewHost"
import { useMcpViewFindings } from "./useMcpViewFindings"

/**
 * The updates MCP view: the updates list the tool built, which is already marked read, so the MCP view makes no tool
 * call on load. A user's thumbs, bookmark, and read toggle call their tools through the host, and each row's Topic
 * moves to the Topic's findings.
 */
export function UpdatesMcpView({ updates }: { updates: Updates }) {
	const { updatesTopics, podcastEpisodes } = useMcpViewData()
	const { findings, topicFeedHandlers } = useMcpViewFindings(updates.findings)

	// each Finding beside its Topic, with the link to that Topic and its reading time under its title
	const findingsTableRows = findings.flatMap((topicFinding): FindingsTableRow[] => {
		const topic = updatesTopics?.find(({ id }) => id === topicFinding.topicId)
		if (!topic) {
			return []
		}
		const latestPodcastEpisode = podcastEpisodes.find((podcastEpisode) => podcastEpisode.topicId === topic.id)
		const titleLine = (
			<>
				<span>
					in{" "}
					<McpViewLink topicId={topic.id} href={topicFinding.topicPath} className={STANDALONE_LINE_LINK_CLASS}>
						{topic.name}
					</McpViewLink>
				</span>
				<span>{`· ${toReadingTimeLabel(topicFinding)}`}</span>
			</>
		)
		return [{ topicFinding, topic, latestPodcastEpisode, titleLine }]
	})
	return (
		<UpdatesList
			updates={updates}
			findings={
				<>
					<FindingsTable rows={findingsTableRows} topicFeedHandlers={topicFeedHandlers} />
					{updates.moreCount > 0 && (
						<AnchorLink href={updates.morePath} className={cn(STANDALONE_LINE_LINK_CLASS, "mt-4")}>
							{`and ${updates.moreCount} more`}
						</AnchorLink>
					)}
				</>
			}
			elements={UPDATES_LIST_ELEMENTS}
		/>
	)
}

// the browser elements the shared list composes. the heading is the MCP view's h1
const UPDATES_LIST_ELEMENTS: UpdatesListElements = {
	Card: ({ children }) => <section className={cn(RESOURCE_LIST_CARD_CLASS, "p-5")}>{children}</section>,
	Heading: ({ children }) => (
		<h1 className={cn(PAGE_TITLE_CLASS, "mb-4")}>
			<Coffee className="size-6" />
			{children}
		</h1>
	),
	Opener: ({ children }) => <p className="font-display antialiased leading-relaxed tracking-wide mb-4">{children}</p>,
	EmptyState: ({ children }) => <p className="text-muted-foreground text-sm">{children}</p>,
}
