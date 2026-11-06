import { EMPTY_UPDATES_TEXT, UPDATES_TITLE, type Updates } from "@carlnotes/contracts/updates"
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
		<section className={cn(RESOURCE_LIST_CARD_CLASS, "p-5")}>
			<h1 className={cn(PAGE_TITLE_CLASS, "mb-4")}>
				<Coffee className="size-6" />
				{UPDATES_TITLE}
			</h1>
			{updates.findings.length === 0 ? (
				<p className="text-muted-foreground text-sm">{EMPTY_UPDATES_TEXT}</p>
			) : (
				<>
					{/* an updates list without an opener starts at its first Finding */}
					{updates.opener && <p className="mb-4">{updates.opener}</p>}
					<FindingsTable rows={findingsTableRows} topicFeedHandlers={topicFeedHandlers} />
					{updates.moreCount > 0 && (
						<AnchorLink href={updates.morePath} className={cn(STANDALONE_LINE_LINK_CLASS, "mt-4")}>
							{`and ${updates.moreCount} more`}
						</AnchorLink>
					)}
				</>
			)}
		</section>
	)
}
