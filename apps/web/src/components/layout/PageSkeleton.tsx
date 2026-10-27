import {
	type PageSkeletonElements,
	type PageSkeletonProps,
	PageSkeleton as SharedPageSkeleton,
	TableSkeleton as SharedTableSkeleton,
} from "@carlnotes/core/components/PageSkeleton"
import { cn } from "@carlnotes/nightshift/classNames"

/**
 * Draws the shared page loading layout with browser elements and reduced-motion support.
 */
export function PageSkeleton(props: PageSkeletonProps) {
	return <SharedPageSkeleton {...props} elements={PAGE_SKELETON_ELEMENTS} />
}

/**
 * Reserves topics while the rest of a profile is already visible.
 */
export function TableSkeleton() {
	return <SharedTableSkeleton elements={PAGE_SKELETON_ELEMENTS} />
}

// announce one loading state and hide decorative placeholders from assistive technology
const PAGE_SKELETON_ELEMENTS: PageSkeletonElements = {
	Root: ({ label, children }) => (
		<div role="status" aria-label={label} aria-busy="true">
			<div aria-hidden="true" className="motion-safe:animate-pulse">
				{children}
			</div>
		</div>
	),
	Stack: ({ className, children }) => <div className={cn("flex flex-col", className)}>{children}</div>,
	Row: ({ className, children }) => <div className={cn("flex items-center", className)}>{children}</div>,
	Shape: ({ className }) => <div className={cn("rounded bg-muted-foreground/20", className)} />,
}
