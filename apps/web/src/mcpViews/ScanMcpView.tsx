import {
	type McpFinishedScanStatus,
	type McpRunningScanStatus,
	type McpScanPodcastEpisode,
	type McpScanStatus,
	type McpScanStop,
	SCAN_STOP_FAILED_TEXT,
	toIdleScanLine,
} from "@carlnotes/contracts/mcpScanStatus"
import { toCountLabel } from "@carlnotes/contracts/text"
import { SCAN_RUNNING_LABEL, STOP_SCAN_LABEL } from "@carlnotes/core/lib/labels"
import { CirclePause } from "lucide-react"
import { useState } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { IconButton } from "@/components/common/IconButton"
import { SourceResultsChart } from "@/components/common/SourceResultsChart"
import { PodcastEpisodePlayButton } from "@/components/podcast/PodcastEpisodePlayButton"
import { UnpublishedPodcastEpisodeCard } from "@/components/podcast/UnpublishedPodcastEpisodeCard"
import { Button } from "@/components/primitives/button"
import { TopicScanRecap } from "@/components/topic/TopicScanRecap"
import { STANDALONE_LINE_LINK_CLASS } from "@/lib/styleClasses"
import { McpViewLink } from "./McpViewLink"
import { callMcpViewTool, findMcpViewPodcastEpisode, toToolResultText } from "./mcpViewHost"
import { useScanStatus } from "./useScanStatus"

/**
 * The scan MCP view: a Topic's running Scan with its kept count and each Source's counts, the same recap the topic page shows
 * once it finishes, or the empty state with neither. It polls read_scan_status until nothing more can change.
 */
export function ScanMcpView({ firstScanStatus }: { firstScanStatus: McpScanStatus }) {
	const { mcpScanStatus, isPodcastEpisodeWatchOver, stopWatching } = useScanStatus(firstScanStatus)
	const [stopText, setStopText] = useState<string | null>(null)

	// a stopped Scan shows the tool's own words, and what it kept stays on the Topic's findings
	if (stopText) {
		return (
			<div className="space-y-3">
				<p className="text-sm">{stopText}</p>
				<ScanFindingsLink mcpScanStatus={mcpScanStatus} />
			</div>
		)
	}
	if (mcpScanStatus.state === "idle") {
		return <p className="text-muted-foreground p-5 text-sm">{toIdleScanLine(mcpScanStatus)}</p>
	}
	if (mcpScanStatus.state === "running") {
		return (
			<RunningScan
				mcpScanStatus={mcpScanStatus}
				onStopped={(toolResultText) => {
					stopWatching()
					setStopText(toolResultText)
				}}
			/>
		)
	}
	return <FinishedScan mcpScanStatus={mcpScanStatus} isPodcastEpisodeWatchOver={isPodcastEpisodeWatchOver} />
}

// a running Scan: what it kept so far, each Source's counts once gathering ends, and the stop button if the user may stop it
function RunningScan({
	mcpScanStatus,
	onStopped,
}: {
	mcpScanStatus: McpRunningScanStatus
	onStopped: (toolResultText: string) => void
}) {
	const { topicId, sourceResults, keptCount, startedAt, canStop } = mcpScanStatus
	const [isStopping, setIsStopping] = useState(false)
	const [stopError, setStopError] = useState<string | null>(null)

	// a stop that found nothing running leaves the next poll to show the recap
	const stopScan = async (): Promise<void> => {
		setIsStopping(true)
		setStopError(null)
		const toolResult = await callMcpViewTool("stop_scan", { topic_id: topicId }).catch(() => null)
		setIsStopping(false)
		if (!toolResult || toolResult.isError) {
			setStopError(toolResult ? toToolResultText(toolResult.content) : SCAN_STOP_FAILED_TEXT)
			return
		}
		const mcpScanStop = toolResult.structuredContent as McpScanStop | undefined
		if (mcpScanStop?.status === "stopped") {
			onStopped(toToolResultText(toolResult.content))
		}
	}
	return (
		<div className="space-y-3">
			<div className="flex min-h-9 items-center gap-1">
				<span className="shimmer-text text-base font-semibold">{SCAN_RUNNING_LABEL}</span>
				{canStop && !isStopping && (
					<IconButton tooltip={STOP_SCAN_LABEL} onClick={() => void stopScan()}>
						<CirclePause className="size-3.75" />
					</IconButton>
				)}
			</div>
			{stopError && (
				<p role="alert" className="text-muted-foreground text-sm">
					{stopError}
				</p>
			)}
			<p className="text-muted-foreground text-sm">{`${toCountLabel(keptCount, "finding")} kept so far`}</p>
			{sourceResults && (
				<SourceResultsChart
					sourceResults={sourceResults.sources}
					scannedAt={startedAt}
					earlierKeptCount={sourceResults.earlierKeptCount}
					earlierFoundCount={sourceResults.earlierFoundCount}
				/>
			)}
		</div>
	)
}

// a finished Scan: the topic page's recap, its Podcast Episode, and the move to its Topic's findings
function FinishedScan({
	mcpScanStatus,
	isPodcastEpisodeWatchOver,
}: {
	mcpScanStatus: McpFinishedScanStatus
	isPodcastEpisodeWatchOver: boolean
}) {
	return (
		<div className="space-y-3">
			<TopicScanRecap scan={mcpScanStatus} />
			<ScanPodcastEpisode
				podcastEpisode={mcpScanStatus.podcastEpisode}
				topicPath={mcpScanStatus.topicPath}
				isPodcastEpisodeWatchOver={isPodcastEpisodeWatchOver}
			/>
			<ScanFindingsLink mcpScanStatus={mcpScanStatus} />
		</div>
	)
}

// the recap's Podcast Episode: a play button once it publishes, or the recording card while it is on its way, with a
// link to the Topic's page once the MCP view stops watching
function ScanPodcastEpisode({
	podcastEpisode,
	topicPath,
	isPodcastEpisodeWatchOver,
}: {
	podcastEpisode: McpScanPodcastEpisode
	topicPath: string
	isPodcastEpisodeWatchOver: boolean
}) {
	if (podcastEpisode.state === "none") {
		return null
	}
	if (podcastEpisode.state !== "published") {
		return (
			<>
				<UnpublishedPodcastEpisodeCard podcastEpisode={null} />
				{isPodcastEpisodeWatchOver && (
					<AnchorLink href={topicPath} className={STANDALONE_LINE_LINK_CLASS}>
						Listen on CarlNotes once it's ready
					</AnchorLink>
				)}
			</>
		)
	}

	// the play button needs the player's shape, which the tool result has unless the caller may not play it
	const playablePodcastEpisode = findMcpViewPodcastEpisode(podcastEpisode.podcastEpisodeId)
	return playablePodcastEpisode ? (
		<div className="flex min-w-0 items-center gap-3">
			<PodcastEpisodePlayButton podcastEpisode={playablePodcastEpisode} size="default" />
			<span className="min-w-0 text-sm font-semibold">{playablePodcastEpisode.title}</span>
		</div>
	) : (
		<AnchorLink href={podcastEpisode.pagePath} className={STANDALONE_LINE_LINK_CLASS}>
			Listen on CarlNotes
		</AnchorLink>
	)
}

// the move to the Topic's findings, which opens on the site after an earlier move
function ScanFindingsLink({ mcpScanStatus }: { mcpScanStatus: McpScanStatus }) {
	return (
		<Button asChild size="sm" variant="outline">
			<McpViewLink topicId={mcpScanStatus.topicId} href={mcpScanStatus.topicPath}>
				See the findings
			</McpViewLink>
		</Button>
	)
}
