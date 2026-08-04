import { AnchorLink } from "@/components/common/AnchorLink"
import { cn } from "@/lib/utils"

/**
 * The persona credit with links, shown in the footer and the hero popover.
 */
export function Attribution({ className, isFooter = false }: { className?: string; isFooter?: boolean }) {
	return (
		<div className={cn("text-left", className)}>
			{/* the persona credit and its links */}
			<p>
				{"The persona for CarlNotes was inspired by "}
				<AnchorLink href="https://www.linkedin.com/in/jake-van-clief-74b66915a/" className="text-link hover:underline">
					Jake Van Clief
				</AnchorLink>
				{". The real Jake runs "}
				<AnchorLink href="https://eduba.io" className="text-link hover:underline">
					Eduba
				</AnchorLink>
				{", an AI training and consulting company, makes excellent videos on "}
				<AnchorLink href="https://www.youtube.com/@JEVanClief" className="text-link hover:underline">
					YouTube
				</AnchorLink>
				{", and teaches AI systems over at "}
				<AnchorLink href="https://www.skool.com/cliefnotes" className="text-link hover:underline">
					Clief Notes
				</AnchorLink>
				{/* the footer flows the call-to-action inline right after the credit; the hero drops it to a line below */}
				{isFooter ? ". Go learn from him. Carl did." : "."}
			</p>
			{!isFooter && <p className="mt-1.5 text-center">Go learn from him. Carl did.</p>}
		</div>
	)
}
