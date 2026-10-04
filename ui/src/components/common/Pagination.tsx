import { ChevronLeft, ChevronRight } from "lucide-react"
import { type MouseEvent, type ReactNode, useLayoutEffect, useRef } from "react"
import { toPaginationSlots } from "@/lib/paginationSlots"
import { MENU_BUTTON_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

// one control in the row. its onClick saves where the control sits on screen
type PageControl = {
	linkedPageNumber: number
	label: ReactNode
	className: string
	isCurrentPage: boolean
	onClick: (event: MouseEvent<HTMLElement>) => void
}

// the row's accessible name, the current page from 1, and how many pages the list has.
// a row of buttons takes the callback that opens a page, and a row of links takes the callback that renders one link
type PaginationProps = { ariaLabel: string; pageNumber: number; pageCount: number } & (
	| { onOpenPage: (pageNumber: number) => void; renderPageLink?: undefined }
	| { renderPageLink: (pageControl: PageControl) => ReactNode; onOpenPage?: undefined }
)

/**
 * A centered row of controls that open a list's pages, between a previous and a next arrow.
 * A browser without JavaScript never shows a row of buttons.
 */
export function Pagination({ ariaLabel, pageNumber, pageCount, onOpenPage, renderPageLink }: PaginationProps) {
	// save where the clicked control sits on screen. the new page's rows change the height above the control
	const clickedControlRef = useRef<{ control: HTMLElement; top: number; linkedPageNumber: number } | null>(null)
	const saveClickedControlTop = (event: MouseEvent<HTMLElement>, linkedPageNumber: number): void => {
		clickedControlRef.current = {
			control: event.currentTarget,
			top: event.currentTarget.getBoundingClientRect().top,
			linkedPageNumber,
		}
	}

	// scroll the clicked control back to the height that it was clicked at, once the page that it opens is on screen
	useLayoutEffect(() => {
		const clickedControl = clickedControlRef.current
		if (clickedControl?.linkedPageNumber !== pageNumber) {
			return
		}
		if (clickedControl.control.isConnected) {
			window.scrollBy(0, clickedControl.control.getBoundingClientRect().top - clickedControl.top)
		}
		clickedControlRef.current = null
	}, [pageNumber])

	// a page control as a button that opens its page
	const renderPageButton = ({ linkedPageNumber, label, className, isCurrentPage, onClick }: PageControl) => (
		<button
			type="button"
			aria-current={isCurrentPage ? "page" : undefined}
			onClick={(event) => {
				// save where the button sits, then open its page
				onClick(event)
				onOpenPage?.(linkedPageNumber)
			}}
			className={className}
		>
			{label}
		</button>
	)

	// one control in the row, which opens a page of the list
	const renderPageControl = ({
		linkedPageNumber,
		label,
		isCurrentPage = false,
		isDisabled = false,
	}: {
		linkedPageNumber: number
		label: ReactNode
		isCurrentPage?: boolean
		isDisabled?: boolean
	}) =>
		// a disabled previous or next arrow is a plain span with no page to open
		isDisabled ? (
			<span
				aria-disabled
				className={cn(toPageControlClass({ isCurrentPage: false }), "pointer-events-none opacity-50")}
			>
				{label}
			</span>
		) : (
			(renderPageLink ?? renderPageButton)({
				linkedPageNumber,
				label,
				className: toPageControlClass({ isCurrentPage }),
				isCurrentPage,
				onClick: (event) => saveClickedControlTop(event, linkedPageNumber),
			})
		)
	return (
		<nav aria-label={ariaLabel} className={cn("justify-center py-2", renderPageLink ? "flex" : "hidden scripted:flex")}>
			<ul className="flex flex-wrap items-center justify-center gap-1">
				{/* the previous arrow */}
				<li>
					{renderPageControl({
						linkedPageNumber: pageNumber - 1,
						label: <ChevronLeft aria-label="Previous page" />,
						isDisabled: pageNumber === 1,
					})}
				</li>
				{/* the page numbers, with a gap where pages are left out */}
				{toPaginationSlots({ pageNumber, pageCount }).map((paginationSlot) =>
					typeof paginationSlot === "string" ? (
						<li
							key={paginationSlot}
							aria-hidden
							className={cn(PAGINATION_SLOT_CLASS, "text-muted-foreground text-center")}
						>
							…
						</li>
					) : (
						<li key={paginationSlot}>
							{renderPageControl({
								linkedPageNumber: paginationSlot,
								label: paginationSlot,
								isCurrentPage: paginationSlot === pageNumber,
							})}
						</li>
					),
				)}
				{/* the next arrow */}
				<li>
					{renderPageControl({
						linkedPageNumber: pageNumber + 1,
						label: <ChevronRight aria-label="Next page" />,
						isDisabled: pageNumber === pageCount,
					})}
				</li>
			</ul>
		</nav>
	)
}

// every slot in the row is one width, gaps included, so a row of a given length never shifts sideways
const PAGINATION_SLOT_CLASS = "w-10 shrink-0"

// a page control looks like a menu button, and the current page's control has the highlight color
function toPageControlClass({ isCurrentPage }: { isCurrentPage: boolean }): string {
	return cn(
		MENU_BUTTON_CLASS,
		PAGINATION_SLOT_CLASS,
		"justify-center px-0",
		isCurrentPage && "bg-primary text-primary-foreground border-primary hover:text-primary-foreground",
	)
}
