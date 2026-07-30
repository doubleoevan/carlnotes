import type { scanStatuses } from "@shared/enums"
import { isBudgetError } from "@shared/scanFailure"
import Markdown from "markdown-to-jsx"
import type * as React from "react"
import { useLayoutEffect, useRef, useState } from "react"
import { AnchorLink } from "@/components/layout/AnchorLink"
import { cn, durationMsBetween, POPOVER_HEADING_CLASS, toDollarLabel, toDurationLabel } from "@/lib/utils"

// the fields a scan recap popover reads, shared by the topic page's scan history and the Activity drill-down
export type ScanRecapFields = {
	// the outcome and, for a failed scan, its recorded reason, so the diary line matches what happened
	status: (typeof scanStatuses)[number]
	error: string | null
	startedAt: string
	finishedAt: string | null
	scanSummary: string | null
	cost: number | null
}

/**
 * The diary line standing in for a missing recap, in Carl's own voice: still reading while the scan runs,
 * what stopped a failed one, and for a scan that finished without notes, that the findings still landed.
 */
export function toScanRecapPlaceholder(scan: Pick<ScanRecapFields, "status" | "error">): string {
	// a failed scan says what stopped it, naming the wall Carl hits most often
	if (scan.status === "failed") {
		return isBudgetError(scan.error) ? "Today I ran out of coffee." : "This one didn't brew."
	}

	// a scan that never finished is still being read. the break renders through the placeholder's whitespace-pre-line
	if (scan.status === "running") {
		return "I'm on my fifth mug.\nThe internet was busy today…"
	}

	// it succeeded, so the findings are real even though writing them up failed. saying "still reading" here would be a lie
	return "No entry for this one.\nThe raccoon stole my keyboard.\nFindings are all there though."
}

// clip a long note to this many pixels when collapsed, measured against the rendered output
const COLLAPSED_MAX_HEIGHT = 132

// a heading at any level renders as one compact display-font line, since a model's chosen level is arbitrary here
function NoteHeading({ children }: { children: React.ReactNode }) {
	return <div className="font-display text-foreground mt-2.5 mb-1 text-[13px] font-semibold first:mt-0">{children}</div>
}

// map each Markdown element to the compact card typography, so a model's headings and lists stay
// tight inside the narrow panels they render in. links route through AnchorLink like everywhere else
const MARKDOWN_OPTIONS = {
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
		a: { component: AnchorLink, props: { className: "text-link hover:underline" } },
	},
} as const

// render a scan recap's Markdown with the compact card typography
function ScanMarkdown({ markdown }: { markdown: string }) {
	return <Markdown options={MARKDOWN_OPTIONS}>{markdown}</Markdown>
}

/**
 * A bordered box that scrolls when its content overflows, with a thin visible scrollbar to indicate that it is scrollable
 */
export function ScrollBox({ children }: { children: React.ReactNode }) {
	return (
		<div className="border-border max-h-72 overflow-y-auto rounded-md border p-2 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-muted-foreground/40 [&::-webkit-scrollbar-track]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar]:w-1.5">
			{children}
		</div>
	)
}

/**
 * Markdown inside the scroll box for notes that can be long
 */
export function ScrollNote({ markdown }: { markdown: string }) {
	return (
		<ScrollBox>
			<ScanMarkdown markdown={markdown} />
		</ScrollBox>
	)
}

/**
 * A scan recap popover's body: Carl's full summary, then how long the scan took and its cost. Reused by
 * the topic page's scan history and the Activity page's per-scan drill-down.
 */
export function TopicScanRecap({ scan }: { scan: ScanRecapFields }) {
	const duration = toDurationLabel(durationMsBetween(scan.startedAt, scan.finishedAt))
	return (
		<>
			<h2 className={POPOVER_HEADING_CLASS}>Dear Diary</h2>
			{scan.scanSummary ? (
				<ScrollNote markdown={scan.scanSummary} />
			) : (
				<p className="whitespace-pre-line">{toScanRecapPlaceholder(scan)}</p>
			)}
			{/* how long it took, and the spend when the api shared it with the owner or an admin */}
			{(duration || scan.cost !== null) && (
				<div className="text-muted-foreground mt-3 space-y-0.5 border-t pt-2 text-xs">
					{duration && <div>{duration} taken</div>}
					{scan.cost !== null && <div>cost: {toDollarLabel(scan.cost)}</div>}
				</div>
			)}
		</>
	)
}

/**
 * Scan recap Markdown, clipped with a Read more / Read less toggle once it grows past the collapsed height.
 */
export function TopicScanNote({ markdown }: { markdown: string }) {
	const contentRef = useRef<HTMLDivElement>(null)
	const [isOverflowing, setIsOverflowing] = useState(false)
	const [isExpanded, setIsExpanded] = useState(false)

	// measure the rendered output against the collapsed height. overflow-hidden keeps scrollHeight at the full height
	// biome-ignore lint/correctness/useExhaustiveDependencies: Markdown drives the rendered height we re-measure, not a value read here
	useLayoutEffect(() => {
		const element = contentRef.current
		setIsOverflowing(element !== null && element.scrollHeight > COLLAPSED_MAX_HEIGHT + 4)
	}, [markdown])

	// only clip when the note actually overflows and the reader hasn't expanded it
	const isClipped = isOverflowing && !isExpanded
	return (
		<div>
			{/* the note, clipped to the collapsed height while long and closed */}
			<div className="relative">
				<div
					ref={contentRef}
					className={cn(isClipped && "overflow-hidden")}
					style={isClipped ? { maxHeight: COLLAPSED_MAX_HEIGHT } : undefined}
				>
					<ScanMarkdown markdown={markdown} />
				</div>
				{/* a soft fade tells the reader the note continues below the clip */}
				{isClipped && (
					<div className="from-card pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t to-transparent" />
				)}
			</div>
			{/* the toggle appears only for a note long enough to clip */}
			{isOverflowing && (
				<button
					type="button"
					onClick={() => setIsExpanded(!isExpanded)}
					className="text-link mt-1 text-xs hover:underline"
				>
					{isExpanded ? "Read less" : "Read more"}
				</button>
			)}
		</div>
	)
}
