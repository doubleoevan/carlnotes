import type { ActivityResponse } from "@carlnotes/contracts/activity"
import { CHAT_NAME } from "@carlnotes/contracts/chat"
import type { MonthlyBudgetCutoff } from "@carlnotes/contracts/plans"
import { PODCAST_NAME } from "@carlnotes/contracts/podcastEpisodes"
import { toSharePercent, toSharePercentLabel } from "./labels"
import { MONTHLY_BUDGET_CUTOFF_COPY, SPENT_BUDGET_LIST_LINE, toCutoffListLine } from "./monthlyBudgetCutoffCopy"

// messages for each percentage of the budget spent, lowest threshold last so the first match wins. a budget with
// cutoffs names its next cutoff instead, until every cutoff is passed
const BUDGET_MESSAGES = [
	{ budgetUsedPercent: 100, line: "Dry until the 1st. Carl is still reading. He just can't file notes." },
	{ budgetUsedPercent: 90, line: "Nearly out." },
	{ budgetUsedPercent: 60, line: "Getting low." },
	{ budgetUsedPercent: 0, line: "Full pot." },
] as const

// how close two cutoffs may sit, in percentage points, before they share one circle, so no circles overlap on a phone
const MIN_CIRCLE_GAP_PERCENT = 9

// one circle on the bar: where it sits, and the cutoffs it marks, lowest first
export type CutoffMarker = { percent: number; monthlyBudgetCutoffs: MonthlyBudgetCutoff[] }

// the share of the monthly budget spent, and the cutoffs it is measured against, lowest share first
export type CutoffProgress = { budgetUsedShare: number; monthlyBudgetCutoffs: MonthlyBudgetCutoff[] }

// the spend and cutoff fields both platform meters render
export type SpendMeterProps = Pick<
	ActivityResponse,
	"scanSpendCents" | "chatSpendCents" | "podcastEpisodeSpendCents" | "budgetCents" | "monthlyBudgetCutoffs"
>

// one ordered spend segment and the shared meter's amounts, legend, and visibility
export type SpendSegment = {
	key: string
	colorClass: string
	label: string
	cents: number
	widthPercent: number
}
export type SpendMeterModel = {
	totalCents: number
	budgetUsedShare: number
	budgetUsedPercent: number
	hasMonthlyBudgetCutoffs: boolean
	isUpgradeVisible: boolean
	spendSegments: SpendSegment[]
	legendSegments: SpendSegment[]
	cutoffRows: { key: string; budgetShare: number; line: string }[]
}

/**
 * Returns the amounts, ordered segments, and visibility rules both budget meters render.
 */
export function toSpendMeterModel({
	scanSpendCents,
	chatSpendCents,
	podcastEpisodeSpendCents,
	budgetCents,
	monthlyBudgetCutoffs,
}: SpendMeterProps): SpendMeterModel {
	// calculate the raw share and the rounded percentage shown beside the upgrade link
	const totalCents = scanSpendCents + chatSpendCents + podcastEpisodeSpendCents
	const budgetUsedShare = budgetCents > 0 ? totalCents / budgetCents : 1
	const budgetUsedPercent = toSharePercent(Math.min(1, budgetUsedShare))

	// order the spend segments and clamp their widths to the budget
	const spendSegments = [
		{ key: "scans", colorClass: "bg-primary", label: "Brews", cents: scanSpendCents },
		{
			key: "podcastEpisodes",
			colorClass: "bg-spend-podcast-episode",
			label: PODCAST_NAME,
			cents: podcastEpisodeSpendCents,
		},
		{ key: "chat", colorClass: "bg-spend-chat", label: CHAT_NAME, cents: chatSpendCents },
	].map((segment) => ({
		...segment,
		widthPercent: budgetCents > 0 ? Math.min(100, (segment.cents / budgetCents) * 100) : 0,
	}))

	return {
		totalCents,
		budgetUsedShare,
		budgetUsedPercent,
		hasMonthlyBudgetCutoffs: monthlyBudgetCutoffs.length > 0,
		isUpgradeVisible: budgetUsedPercent >= 100,
		spendSegments,
		legendSegments: spendSegments.filter(({ key, cents }) => key !== "podcastEpisodes" || cents > 0),
		cutoffRows: toCutoffRows(monthlyBudgetCutoffs),
	}
}

// list the budget cutoffs in order, with the spent budget last
function toCutoffRows(monthlyBudgetCutoffs: MonthlyBudgetCutoff[]): SpendMeterModel["cutoffRows"] {
	return [
		...monthlyBudgetCutoffs.map((cutoff) => ({
			key: cutoff.kind,
			budgetShare: cutoff.budgetShare,
			line: toCutoffListLine(cutoff.kind),
		})),
		{ key: "spent", budgetShare: 1, line: SPENT_BUDGET_LIST_LINE },
	]
}

/**
 * Returns the shared passed and moving states for a budget checkpoint.
 */
export function toCutoffMarkerState({ monthlyBudgetCutoffs, budgetUsedShare }: CutoffProgress): {
	isCutoffMarkerPassed: boolean
	isCutoffMarkerMoving: boolean
} {
	return {
		isCutoffMarkerPassed: budgetUsedShare >= (monthlyBudgetCutoffs[0]?.budgetShare ?? 1),
		isCutoffMarkerMoving: monthlyBudgetCutoffs.every((cutoff) => cutoff.kind === "dailyScans"),
	}
}

/**
 * Returns the circles that mark the cutoffs on the bar, lowest first. A cutoff that sits closer than
 * MIN_CIRCLE_GAP_PERCENT to the circle before it shares that circle.
 */
export function toCutoffMarkers(monthlyBudgetCutoffs: MonthlyBudgetCutoff[]): CutoffMarker[] {
	const cutoffMarkers: CutoffMarker[] = []
	for (const monthlyBudgetCutoff of monthlyBudgetCutoffs) {
		// join the circle before it if the two would overlap, or start a circle of its own
		const percent = toSharePercent(monthlyBudgetCutoff.budgetShare)
		const previousCutoffMarker = cutoffMarkers.at(-1)
		if (previousCutoffMarker && percent - previousCutoffMarker.percent < MIN_CIRCLE_GAP_PERCENT) {
			previousCutoffMarker.monthlyBudgetCutoffs.push(monthlyBudgetCutoff)
		} else {
			cutoffMarkers.push({ percent, monthlyBudgetCutoffs: [monthlyBudgetCutoff] })
		}
	}
	return cutoffMarkers
}

/**
 * Returns the status line under the bar: the spent line at 100%, the next cutoff while one is ahead, and otherwise the
 * message for the share spent.
 */
export function toSpendMeterStatusLine({ budgetUsedShare, monthlyBudgetCutoffs }: CutoffProgress): string {
	// the next cutoff, if the budget is not spent and one is still ahead
	const nextMonthlyBudgetCutoff = monthlyBudgetCutoffs.find((cutoff) => budgetUsedShare < cutoff.budgetShare)
	if (budgetUsedShare < 1 && nextMonthlyBudgetCutoff) {
		return `Next at ${toCutoffClause(nextMonthlyBudgetCutoff)}.`
	}

	// the message for the share spent
	const budgetUsedPercent = toSharePercent(Math.min(1, budgetUsedShare))
	const budgetMessage =
		BUDGET_MESSAGES.find((message) => budgetUsedPercent >= message.budgetUsedPercent) ?? BUDGET_MESSAGES[0]
	return budgetMessage.line
}

/**
 * Formats a monthly budget cutoff as a percentage and its explanation.
 */
export function toCutoffClause(monthlyBudgetCutoff: MonthlyBudgetCutoff): string {
	const { line } = MONTHLY_BUDGET_CUTOFF_COPY[monthlyBudgetCutoff.kind]
	return `${toSharePercentLabel(monthlyBudgetCutoff.budgetShare)}: ${line.charAt(0).toLowerCase()}${line.slice(1)}`
}
