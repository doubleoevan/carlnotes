import { NO_SCRIPT_ROW_LIMIT } from "@shared/seo"
import { SCRIPTED_HIDDEN_CLASS } from "@/lib/styleClasses"
import { cn } from "@/lib/utils"

// a row a paged list renders, and its classes for a browser with JavaScript
export type RenderedRow<Row> = { row: Row; className: string }

// the page shown, from 1, and how many rows a page holds
type ToRenderedRowsOptions = { pageNumber: number; pageSize: number }

/**
 * The rows a paged list renders, in order: the rows of the page shown, and the list's first NO_SCRIPT_ROW_LIMIT
 * rows. A row off the page is hidden with JavaScript, and the page's first row drops its dashed separator.
 */
export function toRenderedRows<Row>(rows: Row[], { pageNumber, pageSize }: ToRenderedRowsOptions): RenderedRow<Row>[] {
	// the index range of the page shown
	const pageStartIndex = (pageNumber - 1) * pageSize
	const pageEndIndex = pageStartIndex + pageSize
	return rows.flatMap((row, index) => {
		// leave out a row past the limit that is off the page
		const isOnPage = index >= pageStartIndex && index < pageEndIndex
		if (!isOnPage && index >= NO_SCRIPT_ROW_LIMIT) {
			return []
		}
		return [
			{ row, className: cn(!isOnPage && SCRIPTED_HIDDEN_CLASS, index === pageStartIndex && "scripted:after:hidden") },
		]
	})
}
