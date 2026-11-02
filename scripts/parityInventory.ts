// the reviewed inventory in apps/mobile/parity.md that the parity checks read: one table under each check's heading,
// each row a backticked name, a middle column, and a reason

/** The inventory the parity checks read. */
export const PARITY_INVENTORY_PATH = "apps/mobile/parity.md"

// a table row: the name in backticks, the middle column, and the reason
const INVENTORY_ROW_PATTERN = /^\|\s*`([^`]+)`\s*\|\s*([^|]*)\|\s*([^|]*)\|/

/** One inventory row: the name it lists, its middle column, such as a status or a kind, and its reason. */
export type InventoryRow = { name: string; status: string; reason: string }

// the inventory's text, and the heading its table sits under
type ParseInventoryTableOptions = { markdown: string; heading: string }

/**
 * Returns the rows of the table under a heading line, up to the next heading, one per backticked name. A heading or a
 * row inside a code fence or an HTML comment is left out, since the rendered page does not show it.
 */
export function parseInventoryTable({ markdown, heading }: ParseInventoryTableOptions): InventoryRow[] {
	// each shown row with a backticked name, from the shown heading up to the next shown heading
	const inventoryRows: InventoryRow[] = []
	const hiddenBlock: HiddenBlock = { fenceMarker: null, isInComment: false }
	let isInTable = false
	for (const line of markdown.split("\n")) {
		// a line the rendered page does not show
		if (isHiddenLine({ line, hiddenBlock })) {
			continue
		}

		// the heading starts the table
		if (!isInTable) {
			isInTable = line.trim() === heading
			continue
		}

		// the next heading ends it
		if (line.startsWith("## ")) {
			break
		}

		// a line that holds a row
		const rowMatch = INVENTORY_ROW_PATTERN.exec(line)
		if (rowMatch) {
			inventoryRows.push({
				name: rowMatch[1] ?? "",
				status: rowMatch[2]?.trim() ?? "",
				reason: rowMatch[3]?.trim() ?? "",
			})
		}
	}
	return inventoryRows
}

// the code fence's opening marker, if a fence is open, and whether an HTML comment is open
type HiddenBlock = { fenceMarker: string | null; isInComment: boolean }

// a line that opens or closes a code fence, and its marker
const FENCE_PATTERN = /^\s*(`{3,}|~{3,})/

// one line, and the code fence or HTML comment the lines before it left open
type IsHiddenLineOptions = { line: string; hiddenBlock: HiddenBlock }

// whether a line is hidden from the rendered page: a fence or comment edge, or a line inside one. updates the open
// block for the next line
function isHiddenLine({ line, hiddenBlock }: IsHiddenLineOptions): boolean {
	// a comment ends at its closing mark
	if (hiddenBlock.isInComment) {
		hiddenBlock.isInComment = !line.includes("-->")
		return true
	}

	// an open fence closes on a marker of the same character at least as long
	const fenceMarker = FENCE_PATTERN.exec(line)?.[1] ?? null
	if (hiddenBlock.fenceMarker !== null) {
		const isClosingFence = fenceMarker?.startsWith(hiddenBlock.fenceMarker) ?? false
		hiddenBlock.fenceMarker = isClosingFence ? null : hiddenBlock.fenceMarker
		return true
	}

	// a fence opens on a backtick or tilde marker
	if (fenceMarker !== null) {
		hiddenBlock.fenceMarker = fenceMarker
		return true
	}

	// a comment opens, and stays open past this line if it does not close on it. a line that starts with text before the
	// comment stays shown
	if (line.includes("<!--")) {
		hiddenBlock.isInComment = !line.includes("-->")
		return line.trimStart().startsWith("<!--")
	}
	return false
}
