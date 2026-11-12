// a chart point's detail in a panel over its chart: the point's title and a Close button over the shared detail, named
// for assistive tech by the title and closed by Escape
import { DashboardPointDetail, type DashboardPointDetailProps } from "@carlnotes/core/components/DashboardPointDetail"
import { cn } from "@carlnotes/nightshift/classNames"
import { X } from "lucide-react"
import type { CSSProperties } from "react"
import { Button } from "@/components/primitives/button"
import { POINT_DETAIL_ELEMENTS } from "./pointDetailElements"

// the point's detail, closing the panel, and where the panel sits over its chart and how wide it is
type PointDetailPanelProps = DashboardPointDetailProps & {
	onClose: () => void
	className: string
	style: CSSProperties
}

/**
 * Shows a point's detail in a panel over its chart, with its title and a Close button at the top.
 */
export function PointDetailPanel({ onClose, className, style, ...detailProps }: PointDetailPanelProps) {
	return (
		<div
			role="dialog"
			aria-label={detailProps.point.title}
			className={cn(
				"bg-popover text-popover-foreground absolute z-10 rounded-md border p-3 text-sm shadow-md",
				className,
			)}
			style={style}
			onKeyDown={(event) => event.key === "Escape" && onClose()}
		>
			{/* the title and the Close button */}
			<div className="mb-1 flex items-start justify-between gap-2">
				<strong>{detailProps.point.title}</strong>
				<Button variant="ghost" size="icon-sm" className="-mt-1 -mr-1" aria-label="Close" onClick={onClose}>
					<X />
				</Button>
			</div>

			{/* the point's detail */}
			<DashboardPointDetail {...detailProps} elements={POINT_DETAIL_ELEMENTS} />
		</div>
	)
}
