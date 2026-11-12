// a full title in the shadcn tooltip at a place in pixels, for a title a chart draws
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"

/**
 * Shows a full title in the tooltip at a place in pixels inside its positioned box.
 */
export function PlacedTitleTooltip({ title, x, y }: { title: string; x: number; y: number }) {
	return (
		<Tooltip open>
			<TooltipTrigger asChild>
				<span className="pointer-events-none absolute size-0" style={{ left: x, top: y }} />
			</TooltipTrigger>
			<TooltipContent>{title}</TooltipContent>
		</Tooltip>
	)
}
