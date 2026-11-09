import { TABLE_PAGE_SIZE } from "@carlnotes/contracts/pagination"
import { useState } from "react"

// tables on both platforms share zero-based pages and the same page-size choices
export type PaginationState = {
	page: number
	pageCount: number
	pageSize: number
	rowCount: number
	setPage: (page: number) => void
	setPageSize: (pageSize: number) => void
}

// the page shown, how many pages there are, and how to open another, which page buttons read
export type PageSelection = Pick<PaginationState, "page" | "pageCount" | "setPage">

/**
 * Selects a table's page and clamps it when its rows or page size change.
 */
export function usePagination<Row>(
	rows: Row[],
	initialPageSize: number = TABLE_PAGE_SIZE,
): {
	pageRows: Row[]
	pagination: PaginationState
} {
	// keep an updated row set from stranding the reader on an empty page
	const [pageSize, setPageSize] = useState(initialPageSize)
	const [page, setPage] = useState(0)
	const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
	const currentPage = Math.min(page, pageCount - 1)
	return {
		pageRows: rows.slice(currentPage * pageSize, (currentPage + 1) * pageSize),
		pagination: { page: currentPage, pageCount, pageSize, setPage, setPageSize, rowCount: rows.length },
	}
}
