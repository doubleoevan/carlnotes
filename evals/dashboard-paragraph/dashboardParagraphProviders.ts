// the dashboard paragraph eval's promptfoo provider, which runs the paragraph writer under test

import type { DashboardSeries } from "@carlnotes/contracts/dashboards"
import { writeDashboardParagraph } from "@carlnotes/pipeline/dashboardParagraph"
import type { ApiProvider, CallApiContextParams, ProviderResponse } from "promptfoo"
import type { DashboardParagraphCase } from "./dashboardParagraphCases"

// the variables that a case gives the writer
type DashboardParagraphVariables = Omit<DashboardParagraphCase, "description" | "rubric">

// the writer under test. its output is the paragraph
export const dashboardParagraphWriter: ApiProvider = {
	id: () => "dashboard-paragraph-writer",
	callApi: writeCaseParagraph,
}

// write one case's paragraph through the app's own writer
async function writeCaseParagraph(_renderedPrompt: string, context?: CallApiContextParams): Promise<ProviderResponse> {
	const dashboardParagraphVariables = context?.vars as DashboardParagraphVariables
	const { summary, ...seriesVariables } = dashboardParagraphVariables
	return { output: await writeDashboardParagraph({ summary, series: toCaseSeries(seriesVariables) }) }
}

/**
 * Returns a case's series: a year trend with each period's count on its last day, and a pin per country, most people
 * first.
 */
export function toCaseSeries({
	lastPeriodCount,
	priorPeriodCount,
	countries,
}: Omit<DashboardParagraphVariables, "summary">): DashboardSeries {
	const counts = Array.from({ length: 60 }, (_, i) => (i === 29 ? priorPeriodCount : i === 59 ? lastPeriodCount : 0))
	const pins = countries.map((country, i) => ({
		placeLevel: "country" as const,
		country,
		region: null,
		city: null,
		latitude: null,
		longitude: null,
		peopleCount: countries.length - i,
		count: countries.length - i,
		items: [],
	}))
	return {
		bars: [],
		slices: [],
		trends: {
			"90": {
				days: counts.map((_, i) => `day-${i}`),
				daysPerPoint: 1,
				lines: [{ key: "all", title: "", path: null, counts }],
			},
		},
		words: [],
		pins,
	}
}
