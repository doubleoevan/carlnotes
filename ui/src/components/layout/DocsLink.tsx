import { BookOpen } from "lucide-react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"

/**
 * The link to the docs, which every piece of chrome offering it renders through here.
 * The docs are their own server-rendered site, so it opens in a new tab instead of navigating away from the app.
 */
export function DocsLink({
	className,
	hasIcon = false,
	onNavigate,
}: {
	className: string
	// a menu row shows the icon its siblings show. a plain link in a text row shows none
	hasIcon?: boolean
	onNavigate?: () => void
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<AnchorLink href="/docs" target="_blank" rel="noopener noreferrer" onClick={onNavigate} className={className}>
					{hasIcon && <BookOpen className="size-4" />}
					Docs
				</AnchorLink>
			</TooltipTrigger>
			<TooltipContent>How Carl takes his coffee</TooltipContent>
		</Tooltip>
	)
}
