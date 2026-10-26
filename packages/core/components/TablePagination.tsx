import { PAGE_SIZES } from "@carlnotes/contracts/pagination"
import type { ComponentType, ReactNode } from "react"
import type { PaginationState } from "../hooks/usePagination"

// platform controls supply DOM or native semantics around the same footer
export type PageSizeSelectProps = {
	value: number
	options: readonly number[]
	onValueChange: (pageSize: number) => void
}
export type TablePageButtonProps = {
	direction: "previous" | "next"
	label: string
	isDisabled: boolean
	onPress: () => void
}
type Container = ComponentType<{ children: ReactNode }>
export type TablePaginationComponents = {
	Root: Container
	Rows: Container
	Select: ComponentType<PageSizeSelectProps>
	Pager: Container
	PageButton: ComponentType<TablePageButtonProps>
	Text: Container
}

/**
 * Renders the shared Rows selector and page controls, resetting the page when its size changes.
 */
export function TablePagination({
	pagination,
	components: { Root, Rows, Select, Pager, PageButton, Text },
}: {
	pagination: PaginationState
	components: TablePaginationComponents
}) {
	const { page, pageCount, pageSize, rowCount, setPage, setPageSize } = pagination
	if (rowCount <= PAGE_SIZES[0]) {
		return null
	}
	return (
		<Root>
			{/* the row count controls both apps' shared pagination state */}
			<Rows>
				<Text>Rows</Text>
				<Select
					value={pageSize}
					options={PAGE_SIZES}
					onValueChange={(pageSize) => {
						// return to the first page at the new size
						setPageSize(pageSize)
						setPage(0)
					}}
				/>
			</Rows>
			{/* a single page needs the size selector alone */}
			{pageCount > 1 && (
				<Pager>
					<PageButton
						direction="previous"
						label="Previous page"
						isDisabled={page === 0}
						onPress={() => setPage(page - 1)}
					/>
					<Text>
						Page {page + 1} of {pageCount}
					</Text>
					<PageButton
						direction="next"
						label="Next page"
						isDisabled={page >= pageCount - 1}
						onPress={() => setPage(page + 1)}
					/>
				</Pager>
			)}
		</Root>
	)
}
