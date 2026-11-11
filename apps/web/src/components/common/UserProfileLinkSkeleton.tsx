import { cn } from "@carlnotes/nightshift/classNames"
import { SKELETON_SHAPE_CLASS } from "@/lib/styleClasses"

/**
 * The loading state of a page's profile link, on the link's own line: the avatar and the username as placeholders,
 * for a page that reads whose profile it links to.
 */
export function UserProfileLinkSkeleton({ className }: { className?: string }) {
	return (
		<span aria-hidden="true" className={cn("inline-flex items-center gap-2", className)}>
			<span className={cn(SKELETON_SHAPE_CLASS, "size-6 rounded-full")} />
			<span className={cn(SKELETON_SHAPE_CLASS, "h-4 w-24")} />
		</span>
	)
}
