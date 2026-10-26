import { Fragment, type ReactNode } from "react"
import { toPaginationSlots } from "../lib/paginationSlots"

// each platform draws a slot and supplies its own link or press handling
export type PageControlProps = {
	pageNumber: number
	kind: "previous" | "page" | "next"
	label: string
	isCurrentPage: boolean
	isDisabled: boolean
}
export type PaginationComponents = { renderControl: (props: PageControlProps) => ReactNode; renderGap: () => ReactNode }

/**
 * Renders the previous arrow, numbered pages, gaps, and next arrow in one shared order.
 */
export function Pagination({
	pageNumber,
	pageCount,
	label,
	components: { renderControl, renderGap },
}: {
	pageNumber: number
	pageCount: number
	label: string
	components: PaginationComponents
}) {
	return (
		<>
			{/* the previous control */}
			{renderControl({
				pageNumber: pageNumber - 1,
				kind: "previous",
				label: `${label}: previous page`,
				isDisabled: pageNumber <= 1,
				isCurrentPage: false,
			})}
			{/* numbered pages and omitted ranges */}
			{toPaginationSlots({ pageNumber, pageCount }).map((slot) => (
				<Fragment key={slot}>
					{typeof slot === "string"
						? renderGap()
						: renderControl({
								pageNumber: slot,
								kind: "page",
								label: `${label}: page ${slot} of ${pageCount}`,
								isCurrentPage: slot === pageNumber,
								isDisabled: false,
							})}
				</Fragment>
			))}
			{/* the next control */}
			{renderControl({
				pageNumber: pageNumber + 1,
				kind: "next",
				label: `${label}: next page`,
				isDisabled: pageNumber >= pageCount,
				isCurrentPage: false,
			})}
		</>
	)
}
