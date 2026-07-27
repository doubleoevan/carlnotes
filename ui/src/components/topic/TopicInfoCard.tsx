import type { TopicResponse } from "@shared/contracts"
import { Download, ExternalLink, Globe, Lock, Mail } from "lucide-react"
import type * as React from "react"
import { AnchorLink } from "@/components/AnchorLink"
import { ScanNote } from "@/components/ScanNote.tsx"
import { cn, toAgeLabel, toDollarLabel, toDurationLabel, WEB_SOURCE } from "@/lib/utils"

// the visibility mapped to its icon and label
const VISIBILITY_METADATA = {
	private: { icon: Lock, label: "private" },
	public: { icon: Globe, label: "public" },
	invite: { icon: Mail, label: "invite" },
}

/**
 * The topic info card, showing the topic's prompt, scan summary, sources, attachments, and schedule
 */
export function TopicInfoCard({ topic }: { topic: TopicResponse }) {
	const visibilityMetadata = VISIBILITY_METADATA[topic.visibility]
	// the default source is the web search source. custom sources are everything else
	const hasSearchSource = topic.sources.some((source) => source.kind === "search")
	const customSources = topic.sources.filter((source) => source.kind !== "search")
	// how long the last scan took, shown under the last scan age
	const lastScanDuration = toDurationLabel(topic.lastScanDurationMs)
	// the newest scan whatever its outcome, so a failed one can be called out. the sections below still describe the last succeeded scan
	const latestScan = topic.scans[0]
	return (
		<div className="divide-separator border-separator bg-card mt-2 h-fit divide-y divide-dashed rounded-lg border p-5 text-sm shadow-sm">
			{/* a failed newest scan is stated plainly, so a topic whose sources are dead doesn't read as one that found nothing */}
			{latestScan?.status === "failed" && (
				<InfoSection label="Last brew failed">
					<p className="text-destructive">{latestScan.error ?? "The pot was empty."}</p>
					<p className="text-muted-foreground mt-1 text-xs">
						Carl will keep trying. Check this topic's sources if it keeps failing.
					</p>
				</InfoSection>
			)}

			{/* recap of the latest scan as rendered Markdown, clipped with a Read more toggle when long */}
			{topic.scanSummary && (
				<InfoSection label="Carl's Notes">
					<ScanNote markdown={topic.scanSummary} />
				</InfoSection>
			)}

			{/* the topic prompt */}
			<InfoSection label="Carl's Prompt">{topic.prompt || "—"}</InfoSection>

			{/* the default web search source line first, then one line per custom source */}
			<InfoSection label="Sources">
				<div className="space-y-1">
					<SourceLine
						sourceKind={WEB_SOURCE.label}
						summary={hasSearchSource ? WEB_SOURCE.summary : "off"}
						isMuted={!hasSearchSource}
					/>
					{customSources.map((source) => (
						<SourceLine key={source.id} sourceKind={source.kind} summary={source.summary} />
					))}
				</div>
			</InfoSection>

			{/* attachments, one per row. a url links out to its page, a file downloads for the owner */}
			{topic.attachments.length > 0 && (
				<InfoSection label="Attachments">
					<div className="flex flex-col gap-1">
						{topic.attachments.map((attachment) => (
							<AttachmentPill key={attachment.id} attachment={attachment} isOwner={topic.isOwner} />
						))}
					</div>
				</InfoSection>
			)}

			{/* the frequency, the last scan age, and how long that scan took */}
			<InfoSection label="Schedule">
				{topic.frequency}
				<div className="text-muted-foreground mt-0.5 text-xs">
					last scan {topic.lastScanAt ? toAgeLabel(topic.lastScanAt) : "never"}
				</div>
				{lastScanDuration && <div className="text-muted-foreground text-xs">{lastScanDuration} taken</div>}
			</InfoSection>

			{/* the visibility icon and label */}
			<InfoSection label="Visibility">
				<span className="flex items-center gap-1.5">
					<visibilityMetadata.icon className="size-3.5" />
					{visibilityMetadata.label}
				</span>
			</InfoSection>

			{/* this month's total scan spend, visible to the owner or an admin */}
			{topic.monthCost !== null && <InfoSection label="Cost this month">{toDollarLabel(topic.monthCost)}</InfoSection>}
		</div>
	)
}

// one attachment chip. a url links out to its origin page in a new tab. it truncates and underlines on hover.
// a file downloads for the owner and is a plain pill for everyone else
function AttachmentPill({
	attachment,
	isOwner,
}: {
	attachment: TopicResponse["attachments"][number]
	isOwner: boolean
}) {
	// a failed attachment's object was cleaned up, so there is nothing to link to. show a plain failed marker
	if (attachment.status === "failed") {
		return <span className="text-muted-foreground truncate text-xs">{attachment.filename} · failed</span>
	}

	// a muted suffix while the processing workflow is still running, so the reader knows its context isn't ready yet
	const processing =
		attachment.status === "pending" ? <span className="text-muted-foreground shrink-0"> · processing</span> : null

	// a url attachment links out to its origin page. its truncates and underlines on hover
	if (attachment.sourceUrl) {
		return (
			<AnchorLink
				href={attachment.sourceUrl}
				className="group text-secondary-foreground hover:text-foreground flex items-center gap-1 text-xs"
			>
				<span className="min-w-0 truncate group-hover:underline">{attachment.sourceUrl}</span>
				<ExternalLink aria-hidden="true" className="size-3 shrink-0" />
				{processing}
			</AnchorLink>
		)
	}

	// a file download must be a full request, so it bypasses AnchorLink's client-side routing
	if (isOwner) {
		return (
			<a
				href={`/api/attachments/${attachment.id}/download`}
				download={attachment.filename}
				className="group text-secondary-foreground hover:text-foreground flex items-center gap-1 text-xs"
			>
				<span className="min-w-0 truncate group-hover:underline">{attachment.filename}</span>
				<Download aria-hidden="true" className="size-3 shrink-0" />
				{processing}
			</a>
		)
	}

	// a non-owner sees a plain, non-downloadable file name
	return (
		<span className="text-secondary-foreground flex items-center truncate text-xs">
			{attachment.filename}
			{processing}
		</span>
	)
}

// one line in the sources section: the source icon, the source kind, and its config summary
function SourceLine({ sourceKind, summary, isMuted }: { sourceKind: string; summary: string; isMuted?: boolean }) {
	return (
		<div className={cn("flex min-w-0 items-baseline gap-1.5", isMuted && "text-muted-foreground")}>
			{/* TODO: replace with a source icon */}
			<span aria-hidden="true" className="text-muted-foreground shrink-0 text-xs">
				◈
			</span>
			<span className="min-w-0 break-words">
				{sourceKind}
				{summary && <span className="text-muted-foreground"> — {summary}</span>}
			</span>
		</div>
	)
}

// a labeled section inside the info card
function InfoSection({ label, children }: { label: string; children: React.ReactNode }) {
	return (
		<div className="py-3 first:pt-0 last:pb-0">
			<div className="text-muted-foreground font-display text-xs tracking-wide uppercase">{label}</div>
			<div className="text-foreground mt-1">{children}</div>
		</div>
	)
}
