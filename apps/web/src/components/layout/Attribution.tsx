import { cn } from "@carlnotes/nightshift/classNames"
import { AnchorLink } from "@/components/common/AnchorLink"

/**
 * The persona credit with links, shown in the hero's persona popover.
 */
export function Attribution({ className }: { className?: string }) {
	return (
		// data-nosnippet keeps google from quoting the persona credit as if it described the site
		<div data-nosnippet className={cn("text-left", className)}>
			{/* the persona credit and its links */}
			<p>
				{"The persona for CarlNotes was inspired by "}
				<AnchorLink href="https://www.linkedin.com/in/jake-van-clief-74b66915a/" className="sentence-link">
					Jake Van Clief
				</AnchorLink>
				{". The real Jake runs "}
				<AnchorLink href="https://eduba.io" className="sentence-link">
					Eduba
				</AnchorLink>
				{", an AI training and consulting company, makes excellent videos on "}
				<AnchorLink href="https://www.youtube.com/@JEVanClief" className="sentence-link">
					YouTube
				</AnchorLink>
				{", and teaches AI systems over at "}
				<AnchorLink href="https://www.skool.com/cliefnotes" className="sentence-link">
					Clief Notes
				</AnchorLink>
				{"."}
			</p>
			{/* the call to action, centered on its own line */}
			<p className="mt-1.5 text-center">Go learn from him. Carl did.</p>
		</div>
	)
}
