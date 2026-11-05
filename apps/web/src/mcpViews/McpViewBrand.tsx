import { CoffeeMug } from "@/components/branding/CoffeeMug"
import { AnchorLink } from "@/components/common/AnchorLink"

/**
 * Opens the connected CarlNotes site through the host with the site's coffee mug.
 */
export function McpViewBrand({ className }: { className?: string }) {
	return (
		<AnchorLink
			href="/"
			isNewTab
			target="_blank"
			rel="noopener noreferrer"
			aria-label="Open CarlNotes in a new tab"
			className={className}
		>
			<span className="text-muted-foreground inline-flex items-center gap-2 text-sm font-semibold hover:underline">
				<CoffeeMug className="text-primary size-5 shrink-0" />
				CarlNotes
			</span>
		</AnchorLink>
	)
}
