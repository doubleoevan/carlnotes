import { type ComponentType, Fragment, type ReactNode } from "react"
import type { RowSort } from "../hooks/useRowSort"

export type TableColumn<Row> = {
	key: string
	label: string
	width: number
	tooltip?: string
	isSortable?: boolean
	render: (row: Row) => ReactNode
	footer?: ReactNode
}
type Container = ComponentType<{ children: ReactNode }>
export type DataTableElements = {
	Table: ComponentType<{ children: ReactNode; columns: { key: string; width: number }[] }>
	Head: Container
	Body: Container
	Foot: Container
	Row: ComponentType<{ children: ReactNode; className?: string; hasSeparator?: boolean }>
	Cell: ComponentType<{ children: ReactNode; column: string }>
	Details?: ComponentType<{ children: ReactNode; columnCount: number }>
	Header: ComponentType<{
		column: { key: string; label: string; tooltip?: string; isSortable?: boolean }
		sort: RowSort
	}>
}

/**
 * Renders identical columns, rows, and totals through web or native table elements.
 */
export function DataTable<Row>({
	columns,
	renderedRows,
	getRowId,
	sort,
	renderRow,
	renderDetails,
	elements: { Table, Head, Body, Foot, Row: TableRow, Cell, Header, Details },
}: {
	columns: TableColumn<Row>[]
	renderedRows: { row: Row; className?: string }[]
	getRowId: (row: Row) => string
	sort: RowSort
	renderRow?: (row: Row, className?: string) => ReactNode
	renderDetails?: (row: Row) => ReactNode
	elements: DataTableElements
}) {
	const hasFooter = columns.some((column) => column.footer !== undefined)
	return (
		<Table columns={columns}>
			{/* headings share the same order and sort keys as their cells */}
			<Head>
				<TableRow>
					{columns.map((column) => (
						<Header key={column.key} column={column} sort={sort} />
					))}
				</TableRow>
			</Head>
			<Body>
				{renderedRows.map(({ row, className }, i) => {
					// domain rows keep their local state and expanded content while sharing headings and totals
					if (renderRow) {
						return <Fragment key={getRowId(row)}>{renderRow(row, className)}</Fragment>
					}
					const details = renderDetails?.(row)
					return (
						<Fragment key={getRowId(row)}>
							<TableRow className={className} hasSeparator={hasFooter || i < renderedRows.length - 1}>
								{columns.map((column) => (
									<Cell key={column.key} column={column.key}>
										{column.render(row)}
									</Cell>
								))}
							</TableRow>
							{Details && details && <Details columnCount={columns.length}>{details}</Details>}
						</Fragment>
					)
				})}
			</Body>
			{/* totals describe the complete data set supplied by the domain table */}
			{hasFooter && (
				<Foot>
					<TableRow>
						{columns.map((column) => (
							<Cell key={column.key} column={column.key}>
								{column.footer}
							</Cell>
						))}
					</TableRow>
				</Foot>
			)}
		</Table>
	)
}
