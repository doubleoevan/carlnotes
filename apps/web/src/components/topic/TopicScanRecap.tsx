import {
	type NumberedTopicFindingListComponents,
	NumberedTopicFindingList as SharedFindingList,
} from "@carlnotes/core/components/NumberedTopicFindingList"
import {
	SafeNoteLink,
	type SafeNoteLinkComponents,
	type SafeNoteLinkProps,
} from "@carlnotes/core/components/SafeNoteLink"
// a scan recap is model-written from pages we don't control, so it renders through a limited Markdown subset

import type { TopicFinding } from "@carlnotes/contracts/findings"
import {
	TopicScanRecap as SharedTopicScanRecap,
	type TopicScanRecapComponents,
	type TopicScanRecapProps,
} from "@carlnotes/core/components/TopicScanRecap"
import { toNotesMarkdown as toSharedNotesMarkdown } from "@carlnotes/core/lib/topicScanRecap"
import { cn } from "@carlnotes/nightshift/classNames"
import Markdown from "markdown-to-jsx"
import type * as React from "react"
import { useLayoutEffect, useRef, useState } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { ScrollBox } from "@/components/common/ScrollBox"
import { SourceResultsChart } from "@/components/common/SourceResultsChart"
import { POPOVER_HEADING_CLASS, RECAP_HEADING_CLASS, STANDALONE_LINK_CLASS } from "@/lib/styleClasses"

// clip a long note to this many pixels when collapsed, measured against the rendered output
const COLLAPSED_MAX_HEIGHT = 132

// the destinations a note may actually link to: the kept Findings' stored urls, pages the feed already links to
export type AllowedScanNoteUrls = ReadonlySet<string>

// a finding link in a note
function FindingLink(props: SafeNoteLinkProps) {
	return <SafeNoteLink {...props} components={NOTE_LINK_COMPONENTS} />
}

// web links retain user-content attributes and sentence styling
const NOTE_LINK_COMPONENTS: SafeNoteLinkComponents = {
	Link: ({ href, children }) => (
		<AnchorLink href={href} isUserContent className="sentence-link">
			{children}
		</AnchorLink>
	),
	Text: ({ children }) => <span>{children}</span>,
}

// a heading at any level renders as one compact display-font line
function NoteHeading({ children }: { children?: React.ReactNode }) {
	return <div className={cn(RECAP_HEADING_CLASS, "mt-2.5 mb-1 first:mt-0")}>{children}</div>
}

// the Markdown subset a note may use
function toSafeNoteOptions(allowedUrls?: AllowedScanNoteUrls) {
	return {
		disableParsingRawHTML: true,
		overrides: {
			h1: { component: NoteHeading },
			h2: { component: NoteHeading },
			h3: { component: NoteHeading },
			h4: { component: NoteHeading },
			p: { props: { className: "my-1.5 leading-relaxed first:mt-0 last:mb-0" } },
			ul: { props: { className: "my-1.5 list-disc space-y-1 pl-4" } },
			ol: { props: { className: "my-1.5 list-decimal space-y-1 pl-4" } },
			li: { props: { className: "leading-relaxed" } },
			strong: { props: { className: "text-foreground font-semibold" } },
			hr: { props: { className: "border-separator my-2.5" } },
			a: { component: FindingLink, props: { allowedUrls } },
			img: { component: () => null },
		},
	}
}

/**
 * Renders model-written Markdown through the safe subset of elements. Only a url in allowedUrls becomes a link
 */
export function SafeNoteText({ note, allowedUrls }: { note: string; allowedUrls?: AllowedScanNoteUrls }) {
	return <Markdown options={toSafeNoteOptions(allowedUrls)}>{note}</Markdown>
}

/**
 * A scan note with findings inside of the scroll box.
 */
export function ScrollNote({
	note,
	allowedUrls,
	copyMarkdown,
	children,
}: {
	note: string
	allowedUrls?: AllowedScanNoteUrls
	copyMarkdown?: string
	children?: React.ReactNode
}) {
	return (
		<ScrollBox copyMarkdown={copyMarkdown}>
			<SafeNoteText note={note} allowedUrls={allowedUrls} />
			{children}
		</ScrollBox>
	)
}

/**
 * Copies note Markdown with this browser's origin, or relative links during server rendering.
 */
export function toNotesMarkdown(options: Parameters<typeof toSharedNotesMarkdown>[0]): string {
	return toSharedNotesMarkdown({ ...options, origin: typeof window === "undefined" ? "" : window.location.origin })
}

/**
 * The numbered topic finding list: rank, linked title, host, and relevance explanation.
 */
export function NumberedTopicFindingList({ findings }: { findings: TopicFinding[] }) {
	return <SharedFindingList findings={findings} components={FINDING_LIST_COMPONENTS} />
}

// platform list elements keep the shared Finding composition readable and accessible
const FINDING_LIST_COMPONENTS: NumberedTopicFindingListComponents = {
	List: ({ children }) => <ol className="mt-3 space-y-2.5">{children}</ol>,
	Row: ({ children }) => <li>{children}</li>,
	Link: ({ href, children }) => (
		<AnchorLink href={href} isUserContent className={STANDALONE_LINK_CLASS}>
			{children}
		</AnchorLink>
	),
	Source: ({ children }) => <div className="text-muted-foreground text-xs">{children}</div>,
	Explanation: ({ children }) => <p className="mt-0.5">{children}</p>,
}

/**
 * A scan recap popover's body: the full summary with the topic scan's findings numbered below it, the source
 * footnotes chart if the scan has results, then how long the scan took, and its cost.
 */
export function TopicScanRecap(props: TopicScanRecapProps) {
	return (
		<>
			<h2 className={POPOVER_HEADING_CLASS}>Dear Diary</h2>
			<SharedTopicScanRecap {...props} components={SCAN_RECAP_COMPONENTS} />
		</>
	)
}

// DOM-only typography and note renderers surround the shared diary composition
const SCAN_RECAP_COMPONENTS: TopicScanRecapComponents = {
	ScrollBox,
	SafeNoteText,
	FindingList: NumberedTopicFindingList,
	SourceResultsChart,
	Placeholder: ({ children }) => <p className="whitespace-pre-line">{children}</p>,
	Footer: ({ duration, costLabel }) => (
		<div className="text-muted-foreground mt-3 flex items-center justify-between gap-3 text-xs">
			<span>{duration && `${duration} taken`}</span>
			{costLabel !== null && <span>cost: {costLabel}</span>}
		</div>
	),
}

/**
 * A scan recap note, clipped with a Read more / Read less toggle once it grows past the collapsed height.
 * It displays a scrollbar if the note overflows its window height.
 */
export function TopicScanNote({
	note,
	allowedUrls,
	copyMarkdown,
	children,
}: {
	note: string
	allowedUrls?: AllowedScanNoteUrls
	copyMarkdown?: string
	children?: React.ReactNode
}) {
	const contentRef = useRef<HTMLDivElement>(null)
	const [isOverflowing, setIsOverflowing] = useState(false)
	const [isExpanded, setIsExpanded] = useState(false)

	// measure the rendered output against the collapsed height
	// biome-ignore lint/correctness/useExhaustiveDependencies: the note drives the rendered height we re-measure, not a value read here
	useLayoutEffect(() => {
		const element = contentRef.current
		if (element) {
			setIsOverflowing(element.scrollHeight > COLLAPSED_MAX_HEIGHT + 4)
		}
	}, [note])

	return (
		<div>
			{isExpanded ? (
				// the expanded note and findings scroll inside a bounded box, so the card keeps its
				// height and Read less stays just below
				<ScrollBox copyMarkdown={copyMarkdown}>
					<SafeNoteText note={note} allowedUrls={allowedUrls} />
					{children}
				</ScrollBox>
			) : (
				<div className="relative">
					{/* the note, clipped to the collapsed height while long and closed */}
					<div
						ref={contentRef}
						className={cn(isOverflowing && "overflow-hidden")}
						style={isOverflowing ? { maxHeight: COLLAPSED_MAX_HEIGHT } : undefined}
					>
						<SafeNoteText note={note} allowedUrls={allowedUrls} />
						{children}
					</div>
					{/* a soft fade tells the user the note continues below the clip */}
					{isOverflowing && (
						<div className="from-card pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t to-transparent" />
					)}
				</div>
			)}
			{/* the toggle appears only for a note long enough to clip */}
			{isOverflowing && (
				<button
					type="button"
					onClick={() => setIsExpanded(!isExpanded)}
					className={cn(STANDALONE_LINK_CLASS, "mt-1 text-xs")}
				>
					{isExpanded ? "Read less" : "Read more"}
				</button>
			)}
		</div>
	)
}
