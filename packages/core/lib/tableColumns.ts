export type TableColumnWidths = Readonly<Record<string, number>>

/**
 * Sizes table columns while leaving room beside the fixed first column on narrow screens.
 */
export function toTableColumnWidths({
	columns,
	viewportWidth,
	fontScale,
}: {
	columns: TableColumnWidths
	viewportWidth: number
	fontScale: number
}): Record<string, number> {
	// scale every column with text and keep the first column below half the viewport
	const entries = Object.entries(columns)
	const scale = Math.max(1, fontScale)
	const widths = Object.fromEntries(entries.map(([key, width]) => [key, width * scale]))
	const firstKey = entries[0]?.[0]
	if (!firstKey || viewportWidth <= 0) {
		return widths
	}
	widths[firstKey] = Math.min(widths[firstKey] ?? 0, viewportWidth * 0.48)

	// fill wide containers without manufacturing a horizontal scroll range
	const totalWidth = Object.values(widths).reduce((total, width) => total + width, 0)
	widths[firstKey] += Math.max(0, viewportWidth - totalWidth)
	return widths
}
