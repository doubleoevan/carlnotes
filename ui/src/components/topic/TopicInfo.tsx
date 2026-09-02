import type { TopicFeed, TopicResponse } from "@shared/contracts"
import { DEFAULT_SOURCES, toDefaultSource } from "@shared/sources"
import { AudioLines, Diamond, Download, ExternalLink, Globe, Link, Lock, Mail, Plug, Puzzle, Rss } from "lucide-react"
import type * as React from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { BrandIcon } from "@/components/common/BrandIcon"
import { UserProfileLink } from "@/components/common/UserProfileLink"
import { ShareTopicButton } from "@/components/share/ShareTopic"
import { TopicScanFailure } from "@/components/topic/TopicScanFailure"
import {
	type AllowedScanNoteUrls,
	NumberedTopicFindingList,
	SafeNoteText,
	ScrollBox,
	ScrollNote,
	TopicScanNote,
	toNotesMarkdown,
} from "@/components/topic/TopicScanRecap"
import { MENU_BUTTON_CLASS, POPOVER_HEADING_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

// each source's icon, keyed by the label the line renders. a default source is keyed by its own label instead of its kind
const SOURCE_ICON: Record<string, SourceIcon> = {
	web: Globe,
	url: Link,
	rss: Rss,
	podcast: AudioLines,
	composio: Plug,
	plugin: Puzzle,
	// the four that are somebody's brand use that brand's own logo
	reddit: (props) => <BrandIcon brand="reddit" {...props} />,
	youtube: (props) => <BrandIcon brand="youtube" {...props} />,
	x: (props) => <BrandIcon brand="x" {...props} />,
	bluesky: (props) => <BrandIcon brand="bluesky" {...props} />,
}

// a source's icon is either a lucide icon or one of the brand logos, and both take just a class
type SourceIcon = (props: { className?: string }) => React.ReactNode

// the card variant includes the full topic response for its scan history
type TopicInfoProps =
	| { topic: TopicFeed; isCard?: false; onMakeTopicPublic?: undefined }
	| { topic: TopicResponse; isCard: true; onMakeTopicPublic?: () => void }

// the visibility mapped to its icon and label
const VISIBILITY_METADATA = {
	private: { icon: Lock, label: "private" },
	public: { icon: Globe, label: "public" },
	invite: { icon: Mail, label: "invite" },
}

// the prompt length that fills the scroll box's max-h-72 limit
const SCROLLING_PROMPT_CHARS = 900

/**
 * The topic info content shared by the homepage popovers and the topic page card, isCard is used to distinguish the info variant
 */
export function TopicInfo(props: TopicInfoProps) {
	const { topic } = props
	// the topic scan's ranked topic findings list with the content offered to copy to the clipboard as Markdown for AI
	const topicFindings = topic.findings.length > 0 ? <NumberedTopicFindingList findings={topic.findings} /> : null
	const notesMarkdown = toNotesMarkdown({
		topicId: topic.id,
		topicName: topic.name,
		prompt: topic.prompt,
		note: topic.scanSummary,
		findings: topic.findings,
	})
	return (
		<>
			{/* the card gets its own header from the accordion wrapping it, so this title is popover-only */}
			{!props.isCard && <h2 className={POPOVER_HEADING_CLASS}>Topic roast</h2>}
			{/* the sections run together. a solid rule stands over Visibility and over the closing row */}
			<div>
				{/* a failed newest scan is stated plainly, so a topic whose sources are dead doesn't read as one that
				    found nothing. card only, since the feed payload has no scan history */}
				{props.isCard && <FailedBrewSection scans={props.topic.scans} />}

				{/* who tuned this topic, leading the roast because it frames everything under it */}
				{topic.owner && (
					<InfoSection label="Carl's Barista">
						<div className="flex items-center justify-between gap-3">
							<UserProfileLink user={topic.owner} />
							<ShareTopicButton
								topic={topic}
								// the card is already bg-card, so the button takes the muted surface to stand off it
								className={cn(MENU_BUTTON_CLASS, "bg-muted hover:bg-accent")}
								onMakeTopicPublic={props.onMakeTopicPublic}
							/>
						</div>
					</InfoSection>
				)}

				{/* the topic prompt, through the same sanitized subset the recap uses.
				    a url the owner typed can only become a link if the scan kept it as a finding */}
				<InfoSection label="Carl's Prompt">
					<TopicPrompt prompt={topic.prompt} allowedUrls={toFindingUrls(topic)} />
				</InfoSection>

				{/* recap of the latest scan through the sanitized subset, citing only the kept findings' own urls,
				    with the numbered findings below it. the card clips with Read more up to a max height that scrolls */}
				{topic.scanSummary && (
					<InfoSection label={topic.findings.length > 0 ? `Carl's Top ${topic.findings.length}` : "Carl's Notes"}>
						{props.isCard ? (
							<TopicScanNote note={topic.scanSummary} allowedUrls={toFindingUrls(topic)} copyMarkdown={notesMarkdown}>
								{topicFindings}
							</TopicScanNote>
						) : (
							<ScrollNote note={topic.scanSummary} allowedUrls={toFindingUrls(topic)} copyMarkdown={notesMarkdown}>
								{topicFindings}
							</ScrollNote>
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

				{/* the topic sources are only in the popover */}
				{!props.isCard && <TopicSourcesSection sources={topic.sources} />}

				{/* who may see the topic, under its own rule. the card always shows it, and the popup
				    shows it only when it is not public. most feed topics are public, so showing it
				    everywhere would add nothing */}
				{(props.isCard || topic.visibility !== "public") && (
					<>
						<div className="bg-separator h-px" />
						<TopicVisibility visibility={topic.visibility} />
					</>
				)}

				{/* the second rule stands over the closing row */}
				<div className="bg-separator h-px" />

				{/* the team count on the left and the follower count on the right close the roast in one plain row */}
				<div className="flex items-center justify-between gap-3 pt-3 text-sm">
					<span>{`${topic.teamCount.toLocaleString()} team${topic.teamCount === 1 ? "" : "s"}`}</span>
					<span>{`${topic.subscriberCount.toLocaleString()} follower${topic.subscriberCount === 1 ? "" : "s"}`}</span>
				</div>
			</div>
		</>
	)
}

// the newest scan's failure called out plainly, whatever came before it
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

// the urls a recap may cite and render as real links. no other url can be injected
function toFindingUrls(topic: TopicFeed | TopicResponse): AllowedScanNoteUrls {
	return new Set(topic.findings.map((finding) => finding.url))
}

// one attachment row
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

	// a muted suffix while the attachment processing workflow is still running, so the user knows its context isn't ready yet
	const isProcessing = attachment.status === "pending"
	const processing = isProcessing ? <span className="text-muted-foreground shrink-0"> · processing</span> : null

	// a pending attachment's page has been fetched but not screened by llm-guard, so it reads as plain text until it is ready.
	if (attachment.sourceUrl && isProcessing) {
		return (
			<span className="text-secondary-foreground flex min-w-0 items-center truncate text-xs">
				{attachment.sourceUrl}
				{processing}
			</span>
		)
	}

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

/**
 * The topic's prompt. A prompt long enough to run past the scroll box's limit scrolls inside one instead.
 */
export function TopicPrompt({ prompt, allowedUrls }: { prompt: string | null; allowedUrls?: AllowedScanNoteUrls }) {
	if (!prompt) {
		return "—"
	}

	// a short prompt reads as its own paragraph. only a long one earns the box's border and scrollbar
	const promptText = <SafeNoteText note={prompt} allowedUrls={allowedUrls} />
	return prompt.length > SCROLLING_PROMPT_CHARS ? <ScrollBox>{promptText}</ScrollBox> : promptText
}

// a labeled section with its uppercase label above its content
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
			{/* a long unbroken token like a url wraps here instead of pushing the card wider than the page */}
			<div className="text-foreground mt-1 break-words">{children}</div>
		</div>
	)
}

// the sources section: a line per default source first, then one line per custom source
export function TopicSourcesSection({ sources }: { sources: TopicFeed["sources"] }) {
	// the default sources that are on, and the custom ones left after them
	const defaultSourceKeys = new Set(sources.flatMap((source) => toDefaultSource(source.sourceKind)?.key ?? []))
	const customSources = sources.filter((source) => !toDefaultSource(source.sourceKind))
	return (
		<InfoSection label="Sources">
			<div className="space-y-1">
				{DEFAULT_SOURCES.map((defaultSource) => (
					<TopicSource
						key={defaultSource.key}
						sourceKind={defaultSource.label}
						summary={defaultSourceKeys.has(defaultSource.key) ? defaultSource.summary : "off"}
						isMuted={!defaultSourceKeys.has(defaultSource.key)}
					/>
				))}
				{customSources.map((source) => (
					<TopicSource
						key={source.id}
						sourceKind={source.sourceKind}
						summary={source.summary}
						screening={toScreeningNote(source)}
					/>
				))}
			</div>
		</InfoSection>
	)
}

// one line in the sources section
function TopicSource({
	sourceKind,
	summary,
	isMuted,
	screening,
}: {
	sourceKind: string
	summary: string
	isMuted?: boolean
	screening?: string | null
}) {
	// a source kind with no icon of its own still gets a neutral marker
	const SourceIcon = SOURCE_ICON[sourceKind] ?? Diamond
	return (
		<div className={cn("flex min-w-0 items-baseline gap-1.5", (isMuted || screening) && "text-muted-foreground")}>
			{/* an svg has no baseline of its own, so it aligns by its box bottom and sits high.
			    the nudge drops it down to the text */}
			<SourceIcon aria-hidden="true" className="text-muted-foreground size-3.5 shrink-0 translate-y-0.5" />
			<span className="min-w-0 truncate">
				{sourceKind}
				{summary && <span className="text-muted-foreground"> — {summary}</span>}
				{screening && <span className="text-muted-foreground"> · {screening}</span>}
			</span>
		</div>
	)
}

// what a source that has not passed its llm-guard screen reads as. only its owner ever sees this.
export function toScreeningNote(source: { status: string; error: string | null }): string | null {
	if (source.status === "pending") {
		return "checking"
	}
	return source.status === "failed" ? (source.error ?? "failed") : null
}
