// the web's elements for a chart point's detail
import type { DashboardPointDetailElements } from "@carlnotes/core/components/DashboardPointDetail"
import { cn } from "@carlnotes/nightshift/classNames"
import { ScrollBox } from "@/components/common/ScrollBox"
import { Button } from "@/components/primitives/button"
import { TitleTooltip } from "./TitleTooltip"

// the title sits in the window's or panel's header, so its element draws nothing. each item's title opens its page,
// underlined in the text color around it. a trend line's swatch sits before its title, its count beside it, and its full
// title shows in a tooltip if it is cut off. a long list scrolls in its box, and the highlighted trend line shows in
// bold in its color
export const POINT_DETAIL_ELEMENTS: DashboardPointDetailElements = {
	Title: () => null,
	Line: ({ children }) => <p>{children}</p>,
	Items: ({ children }) => (
		<ScrollBox className="max-h-56 py-1" boxClassName="my-1">
			<ul>{children}</ul>
		</ScrollBox>
	),
	Item: ({ children, countLine, color, isHighlighted, onPress }) => (
		<li
			className={cn("flex items-baseline gap-3 py-0.5", isHighlighted && "font-semibold")}
			style={isHighlighted ? { color } : undefined}
		>
			{color && <span className="size-2 shrink-0 self-center rounded-full" style={{ backgroundColor: color }} />}
			<TitleTooltip title={children}>
				{onPress ? (
					<button
						type="button"
						onClick={onPress}
						className="min-w-0 flex-1 truncate text-left underline underline-offset-2"
					>
						{children}
					</button>
				) : (
					<span className="min-w-0 flex-1 truncate">{children}</span>
				)}
			</TitleTooltip>
			<span className={cn("shrink-0 tabular-nums", !isHighlighted && "opacity-70")}>{countLine}</span>
		</li>
	),
	Total: ({ children }) => <p className="mt-1 text-right font-semibold">{children}</p>,
	OpenButton: ({ children, label, onPress }) => (
		<Button size="sm" variant="outline" aria-label={label} onClick={onPress} className="mt-2">
			{children}
		</Button>
	),
}
