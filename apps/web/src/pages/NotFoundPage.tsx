import { AnchorLink } from "@/components/common/AnchorLink"
import { usePageTitle } from "@/hooks/usePageTitle"
import { STANDALONE_LINK_CLASS } from "@/lib/styleClasses"

/**
 * The catch-all for a url no route matches, which a typo'd or stale link lands on, instead of a broken site.
 */
export function NotFoundPage() {
	usePageTitle("Not found")
	return (
		<main className="mx-auto max-w-3xl px-4 py-16 text-center">
			{/* the page title and a plain explanation */}
			<h1 className="font-display text-2xl">{"There's no page here"}</h1>
			<p className="text-muted-foreground mt-3 text-sm leading-relaxed">
				Carl read this whole site and never found that page. The link may be old, or a letter or two off.
			</p>
			{/* a link back to the home page */}
			<p className="mt-6 text-sm">
				<AnchorLink href="/" className={STANDALONE_LINK_CLASS}>
					Back to your topics
				</AnchorLink>
			</p>
		</main>
	)
}
