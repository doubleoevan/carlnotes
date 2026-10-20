// monthly budget cutoff table tests: a row for each cutoff in order, each plan's share, the labels for no fixed share,
// and the docs page's copy of the table
import { expect, test } from "bun:test"
import { toMonthlyBudgetCutoffRows } from "./MonthlyBudgetCutoffTable"

// the docs page that keeps a copy of the table
const DOCS_PLANS_AND_LIMITS_URL = new URL(
	"../../../../docs/src/content/docs/account/plans-and-limits.md",
	import.meta.url,
)

// the rows follow the order the plans stop each kind of spend, and end with the spent budget
test("the monthly budget cutoff table has a row per cutoff and ends with the spent budget", () => {
	const monthlyBudgetCutoffRows = toMonthlyBudgetCutoffRows()
	expect(monthlyBudgetCutoffRows.map((monthlyBudgetCutoffRow) => monthlyBudgetCutoffRow.line)).toEqual([
		"Speaking with Carl and Vienna pauses. You can still text Carl",
		"New podcast episodes go short and replace the last short one",
		"New podcast episodes pause",
		"Daily brews go weekly",
		"Manual brews pause. Scheduled brews keep running",
		"Every brew pauses until the 1st",
	])
})

// each plan's share reads as a percent, and a plan with no fixed share reads the cutoff's own label
test("each plan's cell is its share, or the cutoff's label without a fixed share", () => {
	const monthlyBudgetCutoffRows = toMonthlyBudgetCutoffRows()
	expect(monthlyBudgetCutoffRows[0]?.planCells).toEqual({ free: "15%", plus: "40%", premium: "50%" })
	expect(monthlyBudgetCutoffRows[1]?.planCells).toEqual({ free: "Always short", plus: "60%", premium: "70%" })
	expect(monthlyBudgetCutoffRows[2]?.planCells).toEqual({ free: "20%", plus: "75%", premium: "85%" })
	expect(monthlyBudgetCutoffRows[3]?.planCells).toEqual({
		free: "Moves each day",
		plus: "Moves each day",
		premium: "Moves each day",
	})
	expect(monthlyBudgetCutoffRows[5]?.planCells).toEqual({ free: "100%", plus: "100%", premium: "100%" })
})

// the docs page keeps its own markdown table, which the docs search reads, and it must match the plans page's table
// cell for cell, header included
test("the docs' cutoff table matches the plans page's monthly budget cutoff table", async () => {
	// the section under the docs page's cutoffs heading
	const docsMarkdown = await Bun.file(DOCS_PLANS_AND_LIMITS_URL).text()
	const docsSection = docsMarkdown.split("## When the coffee fund runs low")[1]?.split("\n## ")[0] ?? ""

	// its table, each row split into its cells, without the divider row
	const docsTableRows = docsSection
		.split("\n")
		.filter((line) => line.startsWith("|") && !line.startsWith("| ---"))
		.map((line) =>
			line
				.split("|")
				.slice(1, -1)
				.map((cell) => cell.trim()),
		)

	// the plans page's header and rows, in the same shape
	const monthlyBudgetCutoffTableRows = [
		["", "Free", "Plus", "Premium"],
		...toMonthlyBudgetCutoffRows().map(({ line, planCells }) => [
			line,
			planCells.free,
			planCells.plus,
			planCells.premium,
		]),
	]
	expect(docsTableRows).toEqual(monthlyBudgetCutoffTableRows)
})
