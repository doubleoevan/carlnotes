// a scan recap is model-written from pages we don't control, so it renders through a limited Markdown subset.
// formatting is allowed, but a link only works when it points at a kept Finding's url. everything else is plain text
import type { TopicFinding } from "@shared/contracts"
import type { scanStatuses } from "@shared/enums"
import { isBudgetError } from "@shared/scanFailure"
import Markdown from "markdown-to-jsx"
import type * as React from "react"
import { useLayoutEffect, useRef, useState } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { CopyMarkdownButton } from "@/components/common/CopyMarkdownButton"
import {
	cn,
	durationMsBetween,
	POPOVER_HEADING_CLASS,
	THIN_SCROLLBAR_CLASS,
	toDollarLabel,
	toDurationLabel,
} from "@/lib/utils"

// the fields a scan recap popover reads, shared by the topic page's scan history and the Activity drill-down
export type ScanRecapFields = {
	// the outcome and, for a failed scan, its recorded reason, so the diary line matches what happened
	status: (typeof scanStatuses)[number]
	error: string | null
	startedAt: string
	finishedAt: string | null
	// set when the user stopped the scan, which is a different missing recap from a scan that simply had none written
	stoppedAt: string | null
	scanSummary: string | null
	costDollars: number | null
}

/**
 * The diary line standing in for a missing recap, in Carl's own voice: still reading while the scan runs,
 * what stopped a failed one, what a user's cancel interrupted, and for a scan that finished without notes,
 * that the findings still landed.
 */
export function toScanRecapPlaceholder(scan: Pick<ScanRecapFields, "status" | "error" | "stoppedAt">): string {
	// a failed scan says what stopped it, naming the wall Carl hits most often
	if (scan.status === "failed") {
		return isBudgetError(scan.error) ? "Today I ran out of coffee." : "This one didn't brew."
	}

	// the user stopped this scan, so there was never a recap to write. what Carl had already kept still stands
	if (scan.stoppedAt) {
		return "Carl stopped brewing.\nThis was in the pot."
	}

	// a scan that never finished is still being read. the break renders through the placeholder's whitespace-pre-line
	if (scan.status === "running") {
		return "I'm on my fifteenth mug.\nThe internet was busy today…"
	}

	// it succeeded, so the findings are real even though writing them up failed. saying "still reading" here would be a lie
	return "No entry for this one.\nThe raccoon stole my keyboard.\nFindings are there though."
}

// clip a long note to this many pixels when collapsed, measured against the rendered output
const COLLAPSED_MAX_HEIGHT = 132

// the destinations a note may actually link to: the kept Findings' stored urls, pages the feed already links to
export type AllowedNoteUrls = ReadonlySet<string>

// a finding link in a note. it renders as an anchor only for the Scan's own kept Finding urls,
// and otherwise prints its label and destination as plain text
function FindingLink({
	children,
	href,
	allowedUrls,
}: {
	children?: React.ReactNode
	href?: string
	allowedUrls?: AllowedNoteUrls
}) {
	// an allowed url renders as a link
	if (href && allowedUrls?.has(href)) {
		return (
			<AnchorLink href={href} className="text-link hover:underline">
				{children}
			</AnchorLink>
		)
	}

	// anything else prints its label and destination as plain text
	const [firstChild] = Array.isArray(children) ? children : [children]
	const label = typeof firstChild === "string" ? firstChild : null
	return (
		<span>
			{children}
			{href && href !== label ? ` (${href})` : ""}
		</span>
	)
}

// a heading at any level renders as one compact display-font line, since a model's chosen level is arbitrary here
function NoteHeading({ children }: { children?: React.ReactNode }) {
	return <div className="font-display text-foreground mt-2.5 mb-1 text-[13px] font-semibold first:mt-0">{children}</div>
}

// the Markdown subset a note may use. headings and lists get compact typography, anchors go through NoteLink
// with the kept urls, images render nothing, and disableParsingRawHTML leaves any embedded html as plain characters
function toSafeNoteOptions(allowedUrls?: AllowedNoteUrls) {
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
export function SafeNoteText({ note, allowedUrls }: { note: string; allowedUrls?: AllowedNoteUrls }) {
	return <Markdown options={toSafeNoteOptions(allowedUrls)}>{note}</Markdown>
}

/**
 * A bordered box that scrolls when its content overflows, with a thin visible scrollbar to indicate that it is scrollable.
 * With copyMarkdown set, a copy control floats on the corner instead of scrolling away, offering the box's content as Markdown for an AI.
 */
export function ScrollBox({ children, copyMarkdown }: { children: React.ReactNode; copyMarkdown?: string }) {
	return (
		<div className="group border-border relative rounded-md border">
			<div className={cn("max-h-72 overflow-y-auto p-2", THIN_SCROLLBAR_CLASS)}>{children}</div>
			{copyMarkdown && <CopyMarkdownButton markdown={copyMarkdown} />}
		</div>
	)
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
	allowedUrls?: AllowedNoteUrls
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
 * The copied notes as Markdown for an AI: the linked topic title, the prompt, the note, and the numbered findings as Markdown links.
 */
export function toNotesMarkdown({
	topicId,
	topicName,
	prompt,
	note,
	findings,
}: {
	topicId: string
	topicName: string
	prompt?: string
	note?: string | null
	findings?: TopicFinding[]
}): string {
	// the topic title links back to its page, so the pasted context can be followed to the source
	const title = `# [${topicName}](${window.location.origin}/topics/${topicId})`
	const findingLines = (findings ?? []).map(
		(finding, index) =>
			`${index + 1}. [${finding.title ?? finding.url}](${finding.url}) — ${finding.relevanceExplanation}`,
	)
	return [title, prompt, note, findingLines.join("\n")].filter(Boolean).join("\n\n")
}

/**
 * The numbered topic finding list: rank, linked title, host, and relevance explanation.
 */
export function NumberedTopicFindingList({ findings }: { findings: TopicFinding[] }) {
	return (
		<ol className="mt-3 space-y-2.5">
			{findings.map((finding, index) => (
				<li key={finding.findingId}>
					<AnchorLink href={finding.url} className="text-link hover:underline">
						{index + 1}. {finding.title ?? finding.url}
					</AnchorLink>
					{/* the host under the title, then the model's reason the finding was kept.
					    the reason reads at the note's own size, only the host line stays small */}
					{finding.source && <div className="text-muted-foreground text-xs">{finding.source}</div>}
					<p className="mt-0.5">{finding.relevanceExplanation}</p>
				</li>
			))}
		</ol>
	)
}

/**
 * A scan recap popover's body: the full summary with the topic scan's findings numbered below it,
 * then how long the scan took, and its cost.
 */
export function TopicScanRecap({
	scan,
	allowedUrls,
	findings,
	copyMarkdown,
}: {
	scan: ScanRecapFields
	allowedUrls?: AllowedNoteUrls
	findings?: TopicFinding[]
	copyMarkdown?: string
}) {
	const duration = toDurationLabel(durationMsBetween(scan.startedAt, scan.finishedAt))
	// the cost waits until the scan settles instead of reading as a finished scan that cost nothing
	const isCostShown = scan.status !== "running" && scan.costDollars !== null
	return (
		<>
			<h2 className={POPOVER_HEADING_CLASS}>Dear Diary</h2>
			{scan.scanSummary ? (
				<ScrollNote note={scan.scanSummary} allowedUrls={allowedUrls} copyMarkdown={copyMarkdown}>
					{findings && findings.length > 0 && <NumberedTopicFindingList findings={findings} />}
				</ScrollNote>
			) : (
				<p className="whitespace-pre-line">{toScanRecapPlaceholder(scan)}</p>
			)}
			{/* how long it took, and the spend when the api shared it with the owner or an admin */}
			{(duration || isCostShown) && (
				<div className="text-muted-foreground mt-3 space-y-0.5 border-t pt-2 text-xs">
					{duration && <div>{duration} taken</div>}
					{isCostShown && <div>cost: {toDollarLabel(scan.costDollars)}</div>}
				</div>
			)}
		</>
	)
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
	allowedUrls?: AllowedNoteUrls
	copyMarkdown?: string
	children?: React.ReactNode
}) {
	const contentRef = useRef<HTMLDivElement>(null)
	const [isOverflowing, setisOverflowing] = useState(false)
	const [isExpanded, setIsExpanded] = useState(false)

	// measure the rendered output against the collapsed height. overflow-hidden keeps scrollHeight at the full height,
	// and any children have rendered below the note by the time this measures. while expanded the clipped div is not mounted,
	// so the measurement keeps its last answer, and the toggle stays
	// biome-ignore lint/correctness/useExhaustiveDependencies: the note drives the rendered height we re-measure, not a value read here
	useLayoutEffect(() => {
		const element = contentRef.current
		if (element) {
			setisOverflowing(element.scrollHeight > COLLAPSED_MAX_HEIGHT + 4)
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
					className="text-link mt-1 text-xs hover:underline"
				>
					{isExpanded ? "Read less" : "Read more"}
				</button>
			)}
		</div>
	)
}
