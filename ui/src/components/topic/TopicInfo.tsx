import type { TopicFeed, TopicResponse } from "@shared/contracts"
import { Download, ExternalLink, Globe, Lock, Mail } from "lucide-react"
import type * as React from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { TopicScanFailure } from "@/components/topic/TopicScanFailure"
import { type AllowedNoteUrls, ScrollNote, TopicScanNote } from "@/components/topic/TopicScanRecap"
import { cn, POPOVER_HEADING_CLASS } from "@/lib/utils"

// the card variant carries the full topic response for its scan history
type TopicInfoProps = { topic: TopicFeed; isCard?: false } | { topic: TopicResponse; isCard: true }

// the visibility mapped to its icon and label
const VISIBILITY_METADATA = {
	private: { icon: Lock, label: "private" },
	public: { icon: Globe, label: "public" },
	invite: { icon: Mail, label: "invite" },
}

/**
 * The topic info content shared by the homepage popovers and the topic page card, isCard is used to distinguish the info variant
 */
export function TopicInfo(props: TopicInfoProps) {
	const { topic } = props
	return (
		<>
			{/* the card gets its own header from the accordion wrapping it, so this title is popover-only.
			    it sits outside the divide-y container below so no separator line renders under it */}
			{!props.isCard && <h2 className={POPOVER_HEADING_CLASS}>Topic roast</h2>}
			<div className="divide-separator divide-y divide-dashed">
				{/* a failed newest scan is stated plainly, so a topic whose sources are dead doesn't read as one that
				    found nothing. card only, since the feed payload carries no scan history */}
				{props.isCard && <FailedBrewSection scans={props.topic.scans} />}

				{/* the topic prompt */}
				<InfoSection label="Carl's Prompt">{topic.prompt || "—"}</InfoSection>

				{/* recap of the latest scan through the sanitized subset, citing only the kept findings' own urls.
				    the card clips the note with Read more, the popover shows the note in a scroll box */}
				{topic.scanSummary && (
					<InfoSection label="Carl's Notes">
						{props.isCard ? (
							<TopicScanNote note={topic.scanSummary} allowedUrls={toFindingUrls(topic)} />
						) : (
							<ScrollNote note={topic.scanSummary} allowedUrls={toFindingUrls(topic)} />
						)}
					</InfoSection>
				)}

				{/* attachments, one per row. a url links out to its page, a file downloads for the owner */}
				{topic.attachments.length > 0 && (
					<InfoSection label="Attachments">
						<div className="flex flex-col gap-1">
							{topic.attachments.map((attachment) => (
								<AttachmentPill key={attachment.id} attachment={attachment} isDownloadable={topic.isOwner} />
							))}
						</div>
					</InfoSection>
				)}

				{/* who may see the topic. card only, since the feed payload carries no visibility */}
				{props.isCard && <TopicVisibility visibility={props.topic.visibility} />}

				{/* the subscriber count */}
				<InfoSection label="Subscribers">{topic.subscriberCount.toLocaleString()}</InfoSection>
			</div>
		</>
	)
}

// the newest scan's failure called out plainly, whatever came before it. the sections below still describe the last succeeded scan
function FailedBrewSection({ scans }: { scans: TopicResponse["scans"] }) {
	// the newest scan whatever its outcome, so a failed one can be called out
	const latestScan = scans[0]
	if (latestScan?.status !== "failed") {
		return null
	}
	return (
		<InfoSection label="Last brew failed">
			<TopicScanFailure error={latestScan.error} />
			<p className="text-muted-foreground mt-1 text-xs">
				Carl will keep trying. Check this topic's sources if it keeps failing.
			</p>
		</InfoSection>
	)
}

// the urls a recap may cite and render as real links other urls can not be injected
function toFindingUrls(topic: TopicFeed | TopicResponse): AllowedNoteUrls {
	return new Set(topic.findings.map((finding) => finding.url))
}

// one attachment row. a url links out to its page, a file downloads for the owner. the label truncates and underlines on hover
function AttachmentPill({
	attachment,
	isDownloadable,
}: {
	attachment: TopicFeed["attachments"][number]
	isDownloadable: boolean
}) {
	// a failed attachment's object was cleaned up, so there is nothing to link to. show a plain failed marker
	if (attachment.status === "failed") {
		return <span className="text-muted-foreground truncate text-xs">{attachment.filename} · failed</span>
	}

	// a muted suffix while the processing workflow is still running, so the reader knows its context isn't ready yet
	const processing =
		attachment.status === "pending" ? <span className="text-muted-foreground shrink-0"> · processing</span> : null

	// a url attachment links out to its origin page, its url truncated and underlining on hover
	if (attachment.sourceUrl) {
		return (
			<AnchorLink
				href={attachment.sourceUrl}
				className="group text-secondary-foreground hover:text-foreground flex min-w-0 items-center gap-1 text-xs"
			>
				<span className="min-w-0 truncate group-hover:underline">{attachment.sourceUrl}</span>
				<ExternalLink aria-hidden="true" className="size-3 shrink-0" />
				{processing}
			</AnchorLink>
		)
	}

	// a file download must be a full request, so it bypasses AnchorLink's client-side routing
	if (isDownloadable) {
		return (
			<a
				href={`/api/attachments/${attachment.id}/download`}
				download={attachment.filename}
				className="group text-secondary-foreground hover:text-foreground flex min-w-0 items-center gap-1 text-xs"
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

// the visibility row: who may see the topic, with the icon that stands for it
function TopicVisibility({ visibility }: { visibility: TopicResponse["visibility"] }) {
	const visibilityMetadata = VISIBILITY_METADATA[visibility]
	return (
		<InfoSection label="Visibility">
			<span className="flex items-center gap-1.5">
				<visibilityMetadata.icon className="size-3.5" />
				{visibilityMetadata.label}
			</span>
		</InfoSection>
	)
}

// a labeled section, padded by default so the dashed rules sit evenly between sections. className overrides that padding
export function InfoSection({
	label,
	children,
	className,
}: {
	label: string
	children: React.ReactNode
	className?: string
}) {
	return (
		<div className={cn("py-3 first:pt-0 last:pb-0", className)}>
			<div className="text-muted-foreground font-display text-xs tracking-wide uppercase">{label}</div>
			<div className="text-foreground mt-1">{children}</div>
		</div>
	)
}
