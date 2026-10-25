// a bordered box that scrolls its overflow, with a tab stop, the highlight scrollbar, and an optional copy button

import { cn } from "@carlnotes/nightshift/classNames"
import type * as React from "react"
import { useEffect } from "react"
import { useScrollRegionTabStop } from "@/hooks/useScrollRegionTabStop"
import { HIGHLIGHT_SCROLLBAR_CLASS, SCROLL_REGION_FOCUS_CLASS } from "@/lib/styleClasses"
import { CopyMarkdownButton } from "./CopyMarkdownButton"

/**
 * A bordered box that scrolls when its content overflows, with a thin visible scrollbar to indicate that it is
 * scrollable. With copyMarkdown set, a copy button stays on the corner instead of scrolling away, offering the box's
 * content as Markdown for an AI. With scrollToTopOn set, a change of that value scrolls the box back to its top.
 */
export function ScrollBox({
	children,
	copyMarkdown,
	scrollToTopOn,
	className,
	boxClassName,
}: {
	children: React.ReactNode
	copyMarkdown?: string
	scrollToTopOn?: unknown
	// the scrolling element's own classes, for a caller that bounds its height
	className?: string
	// the bordered box's classes, for a caller that lets the box shrink
	boxClassName?: string
}) {
	// the scrolling element and its tab stop
	const { ref: scrollBoxRef, tabIndex } = useScrollRegionTabStop<HTMLDivElement>()

	// a change of scrollToTopOn scrolls the box back to its top
	// biome-ignore lint/correctness/useExhaustiveDependencies: the value is the trigger, read through the ref
	useEffect(() => {
		scrollBoxRef.current?.scrollTo({ top: 0 })
	}, [scrollToTopOn])
	return (
		<div className={cn("group border-primary/50 relative rounded-md border", boxClassName)}>
			<div
				ref={scrollBoxRef}
				tabIndex={tabIndex}
				className={cn("max-h-72 overflow-y-auto p-2", HIGHLIGHT_SCROLLBAR_CLASS, SCROLL_REGION_FOCUS_CLASS, className)}
			>
				{children}
			</div>
			{copyMarkdown && <CopyMarkdownButton markdown={copyMarkdown} />}
		</div>
	)
}
