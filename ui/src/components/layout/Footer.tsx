import { useLocation } from "react-router-dom"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Attribution } from "@/components/layout/Attribution"
import { DocsLink } from "@/components/layout/DocsLink"
import { cn } from "@/lib/utils"

/**
 * The global footer
 */
export function Footer() {
	return (
		<footer className="text-muted-foreground border-separator mx-auto max-w-5xl border-t px-safe py-6 text-center text-sm">
			<Attribution isFooter />
			<FooterLegal />
			<p className="mt-2">Carl read all of it.</p>
		</footer>
	)
}

// the copyright and license line, then the legal link row, each centered with a readable gap between items.
// the link for the page currently open is underlined
function FooterLegal() {
	const { pathname } = useLocation()
	return (
		<div className="mt-3 space-y-1.5">
			{/* the copyright, the license, and the raccoon line */}
			<div className="flex flex-wrap justify-center gap-x-6 gap-y-1">
				<span>© 2026 CarlNotes</span>
				<span>AGPL-3.0 licensed.</span>
				<span>Take the code. Leave the raccoon.</span>
			</div>
			{/* the docs, the source, the license, and the legal pages. the current page's link stays underlined */}
			<div className="flex flex-wrap justify-center gap-x-6 gap-y-1">
				<DocsLink className="text-link hover:underline" />
				<AnchorLink href="https://github.com/doubleoevan/carlnotes" className="text-link hover:underline">
					Source Code
				</AnchorLink>
				<AnchorLink
					href="https://github.com/doubleoevan/carlnotes/blob/main/LICENSE"
					className="text-link hover:underline"
				>
					License
				</AnchorLink>
				<AnchorLink href="/privacy" className={cn("text-link hover:underline", pathname === "/privacy" && "underline")}>
					Privacy
				</AnchorLink>
				<AnchorLink href="/terms" className={cn("text-link hover:underline", pathname === "/terms" && "underline")}>
					Terms
				</AnchorLink>
			</div>
		</div>
	)
}
