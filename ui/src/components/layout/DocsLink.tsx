import { BookOpen } from "lucide-react"
import { AnchorLink } from "@/components/common/AnchorLink"

/**
 * The link to the docs, used everywhere the docs are linked from.
 * The docs are their own server-rendered site, so it opens in a new tab instead of navigating away from the app.
 */
export function DocsLink({
	className,
	hasIcon = false,
	label = "What CarlNotes is",
	onNavigate,
}: {
	className: string
	// a menu row shows the icon its siblings show. a plain link in a text row shows none
	hasIcon?: boolean
	// what the link shows
	label?: string
	onNavigate?: () => void
}) {
	return (
		<AnchorLink href="/docs" target="_blank" rel="noopener noreferrer" onClick={onNavigate} className={className}>
			{hasIcon && <BookOpen className="size-4" />}
			{label}
		</AnchorLink>
	)
}
