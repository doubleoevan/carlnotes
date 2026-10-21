import type { MonthlyBudgetCutoffKind } from "@carlnotes/contracts/plans"
import { FULL_PODCAST_EPISODE_FINDINGS, SHORT_PODCAST_EPISODE_FINDINGS } from "@carlnotes/contracts/podcastEpisodes"

// what each monthly budget cutoff stops, as the spend meter and the plans page's monthly budget cutoff table say it
type MonthlyBudgetCutoffCopy = {
	// the line that the status line and the tooltip's heading say
	line: string
	// the spend meter list's own wording, where it says more than the line
	listLine?: string
	// the monthly budget cutoff table's own wording, where it says more than the line
	tableLine?: string
	// the tooltip's bullets
	tooltipLines: string[]
	// what the monthly budget cutoff table shows for a plan with no fixed share
	noShareLabel?: string
}

// the spoken questions cutoff's wording in the list and the table, with typed questions as a second sentence
const SPOKEN_QUESTIONS_LIST_LINE = "Speaking with Carl and Vienna pauses. You can still text with Carl"

// each cutoff's wording, keyed by the kind of spend it stops
export const MONTHLY_BUDGET_CUTOFF_COPY: Record<MonthlyBudgetCutoffKind, MonthlyBudgetCutoffCopy> = {
	spokenQuestions: {
		line: "Speaking with Carl and Vienna pauses",
		listLine: SPOKEN_QUESTIONS_LIST_LINE,
		tableLine: SPOKEN_QUESTIONS_LIST_LINE,
		tooltipLines: ["You can still text with Carl", "Speaking comes back on the 1st"],
	},
	fullPodcastEpisodes: {
		line: "New podcast episodes go short",
		tableLine: "New podcast episodes go short and replace the last short one",
		tooltipLines: [
			`Up to ${SHORT_PODCAST_EPISODE_FINDINGS} findings each, instead of ${FULL_PODCAST_EPISODE_FINDINGS}`,
			"Each one replaces the last short podcast episode",
		],
		noShareLabel: "Always short",
	},
	podcastEpisodes: {
		line: "New podcast episodes pause",
		tooltipLines: ["Podcast episodes you have keep playing", "New podcast episodes come back on the 1st"],
	},
	dailyScans: {
		line: "Daily brews go weekly",
		listLine: "Daily brews go weekly (this cutoff moves each day)",
		tooltipLines: [
			"This cutoff moves each day",
			"It sits where the rest of the fund covers your daily brews to the 1st",
		],
		noShareLabel: "Moves each day",
	},
	manualScans: {
		line: "Manual brews pause",
		tableLine: "Manual brews pause. Scheduled brews keep running",
		tooltipLines: ["Scheduled brews keep running", "Manual brews come back on the 1st"],
	},
}

// the last line of the spend meter's list and the monthly budget cutoff table, for the spent budget
export const SPENT_BUDGET_LIST_LINE = "Every brew pauses until the 1st"

/**
 * Returns a cutoff's wording in the spend meter's list.
 */
export function toCutoffListLine(kind: MonthlyBudgetCutoffKind): string {
	const { line, listLine } = MONTHLY_BUDGET_CUTOFF_COPY[kind]
	return listLine ?? line
}

/**
 * Returns a cutoff's wording in the monthly budget cutoff table.
 */
export function toCutoffTableLine(kind: MonthlyBudgetCutoffKind): string {
	const { line, tableLine } = MONTHLY_BUDGET_CUTOFF_COPY[kind]
	return tableLine ?? line
}
