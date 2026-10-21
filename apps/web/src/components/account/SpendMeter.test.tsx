// spend meter tests: the cutoffs that share a circle, the status line under the bar, and the rendered circles and list
import { expect, test } from "bun:test"
import type { MonthlyBudgetCutoff } from "@carlnotes/contracts/plans"
import { renderToString } from "react-dom/server"
import { SpendMeter, toCutoffMarkers, toSpendMeterStatusLine } from "./SpendMeter"

// a plus user's cutoffs, with the daily scans cutoff at 80 percent
const PLUS_CUTOFFS: MonthlyBudgetCutoff[] = [
	{ kind: "spokenQuestions", budgetShare: 0.4 },
	{ kind: "fullPodcastEpisodes", budgetShare: 0.6 },
	{ kind: "podcastEpisodes", budgetShare: 0.75 },
	{ kind: "dailyScans", budgetShare: 0.8 },
	{ kind: "manualScans", budgetShare: 0.9 },
]

// cutoffs fifteen points apart each get a circle, and a daily scans cutoff five points past another shares its circle
test("a cutoff closer than nine points to the circle before it shares that circle", () => {
	const plusCutoffMarkers = toCutoffMarkers(PLUS_CUTOFFS)
	expect(plusCutoffMarkers.map((cutoffMarker) => cutoffMarker.percent)).toEqual([40, 60, 75, 90])
	expect(plusCutoffMarkers[2]?.monthlyBudgetCutoffs.map((cutoff) => cutoff.kind)).toEqual([
		"podcastEpisodes",
		"dailyScans",
	])

	// the free plan's two lowest cutoffs and a daily scans cutoff just past them share one circle
	const nearCutoffs: MonthlyBudgetCutoff[] = [
		{ kind: "spokenQuestions", budgetShare: 0.15 },
		{ kind: "podcastEpisodes", budgetShare: 0.2 },
		{ kind: "dailyScans", budgetShare: 0.22 },
		{ kind: "manualScans", budgetShare: 0.9 },
	]
	const cutoffMarkers = toCutoffMarkers(nearCutoffs)
	expect(cutoffMarkers.map((cutoffMarker) => cutoffMarker.percent)).toEqual([15, 90])
	expect(cutoffMarkers[0]?.monthlyBudgetCutoffs.map((cutoff) => cutoff.kind)).toEqual([
		"spokenQuestions",
		"podcastEpisodes",
		"dailyScans",
	])
})

// the line names the next cutoff, falls back to the share's message once every cutoff is passed, and says the budget is
// spent at 100 percent
test("the status line names the next cutoff until the budget is spent", () => {
	expect(toSpendMeterStatusLine({ budgetUsedShare: 0.65, monthlyBudgetCutoffs: PLUS_CUTOFFS })).toBe(
		"Next at 75%: new podcast episodes pause.",
	)
	expect(toSpendMeterStatusLine({ budgetUsedShare: 0.1, monthlyBudgetCutoffs: PLUS_CUTOFFS })).toBe(
		"Next at 40%: speaking with Carl and Vienna pauses.",
	)
	expect(toSpendMeterStatusLine({ budgetUsedShare: 0.95, monthlyBudgetCutoffs: PLUS_CUTOFFS })).toBe("Nearly out.")
	expect(toSpendMeterStatusLine({ budgetUsedShare: 1, monthlyBudgetCutoffs: PLUS_CUTOFFS })).toStartWith(
		"Dry until the 1st.",
	)
	expect(toSpendMeterStatusLine({ budgetUsedShare: 0.3, monthlyBudgetCutoffs: [] })).toBe("Full pot.")
})

// the free plan's cutoffs, with the daily scans cutoff at 58 percent
const FREE_CUTOFFS: MonthlyBudgetCutoff[] = [
	{ kind: "spokenQuestions", budgetShare: 0.15 },
	{ kind: "podcastEpisodes", budgetShare: 0.2 },
	{ kind: "dailyScans", budgetShare: 0.58 },
	{ kind: "manualScans", budgetShare: 0.9 },
]

// render the spend meter's server HTML at the given scan spend of the free plan's 300 cent budget
function renderSpendMeter(scanSpendCents: number, monthlyBudgetCutoffs: MonthlyBudgetCutoff[]): string {
	return renderToString(
		<SpendMeter
			scanSpendCents={scanSpendCents}
			chatSpendCents={0}
			podcastEpisodeSpendCents={0}
			budgetCents={300}
			monthlyBudgetCutoffs={monthlyBudgetCutoffs}
		/>,
	)
}

// each cutoff circle in the server HTML, with its percent label and its classes
function toCutoffCircles(html: string): { percentLabel: string; className: string }[] {
	return [...html.matchAll(/<button[^>]*class="([^"]*)"[^>]*>(\d+)<!-- -->%<\/button>/g)].map(
		([, className = "", percent]) => ({ percentLabel: `${percent}%`, className }),
	)
}

// 171 of 300 cents is 57 percent, past the two lowest cutoffs, which share a circle, and short of the daily scans one
test("the bar fades a passed circle, dashes the daily scans circle, and lists the spent budget last", () => {
	// three circles, the two lowest cutoffs sharing the first
	const html = renderSpendMeter(171, FREE_CUTOFFS)
	const cutoffCircles = toCutoffCircles(html)
	expect(cutoffCircles.map((cutoffCircle) => cutoffCircle.percentLabel)).toEqual(["15%", "58%", "90%"])

	// the passed circle fades, the daily scans circle has a dashed edge, and the manual scans circle is neither
	const [passedCircle, dailyScansCircle, manualScansCircle] = cutoffCircles
	expect(passedCircle?.className).toContain("opacity-45")
	expect(passedCircle?.className).not.toContain("border-dashed")
	expect(dailyScansCircle?.className).toContain("border-dashed")
	expect(dailyScansCircle?.className).not.toContain("opacity-45")
	expect(manualScansCircle?.className).not.toContain("opacity-45")
	expect(manualScansCircle?.className).not.toContain("border-dashed")

	// the list has a line for each cutoff and ends with the spent budget's line
	const listLines = [...html.matchAll(/<span class="[^"]*">([^<]*)<\/span><\/li>/g)].map(([, line]) => line)
	expect(listLines).toHaveLength(5)
	expect(listLines.at(-1)).toBe("Every brew pauses until the 1st")
})

// a budget with no cutoffs, such as an admin's with no override, shows the bar alone
test("the bar shows no circle and no list without cutoffs", () => {
	const html = renderSpendMeter(171, [])
	expect(toCutoffCircles(html)).toEqual([])
	expect(html).not.toContain("<ul")
})
