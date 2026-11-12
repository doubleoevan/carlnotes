// carl's paragraph above a Dashboard's charts, written nightly on the platform's key from the summary strip's counts,
// the last 30 days against the 30 before, and the country names of the map's pins

import { toCountryName } from "@carlnotes/contracts/countryNames"
import {
	DASHBOARD_PAGE_NAMES,
	DASHBOARD_PARAGRAPH_MAX_CHARS,
	type DashboardKind,
	type DashboardSeries,
	type DashboardSubject,
	type DashboardSummary,
	type DashboardSummaryCountKey,
	toDashboardSummaryCounts,
} from "@carlnotes/contracts/dashboards"
import { toOneLineText } from "@carlnotes/contracts/text"
import { DAY_MS } from "@carlnotes/contracts/time"
import { countRateLimitHit } from "@carlnotes/db/redisRateLimits"
import { CHEAP_COST_PER_MILLION_TOKENS, tokenCost } from "@carlnotes/models/budget"
import { cheapModel, LOW_REASONING_PROVIDER_OPTIONS } from "@carlnotes/models/models"
import { type BuiltPrompt, fetchPromptTemplate, promptTelemetry } from "@carlnotes/models/prompts/fetch"
import { writePrompt } from "@carlnotes/models/prompts/write"
import { generateText } from "ai"

// the paragraph is four short sentences at most. the cheap model's reasoning counts toward the limit and can take up to
// about 1,700 tokens at low effort, so the limit leaves room for both
const MAX_PARAGRAPH_OUTPUT_TOKENS = 4096

// the most one paragraph can cost, for the prompt's instructions and numbers and the output
const MAX_PARAGRAPH_INPUT_TOKENS = 1500
const MAX_PARAGRAPH_DOLLARS = tokenCost(
	MAX_PARAGRAPH_INPUT_TOKENS + MAX_PARAGRAPH_OUTPUT_TOKENS,
	CHEAP_COST_PER_MILLION_TOKENS,
)

// the most the paragraphs may cost in one UTC day on the platform's key, and the calls that allows
const PLATFORM_PARAGRAPH_DAILY_DOLLARS = 2
const PLATFORM_PARAGRAPH_DAILY_LIMIT = Math.floor(PLATFORM_PARAGRAPH_DAILY_DOLLARS / MAX_PARAGRAPH_DOLLARS)

// the most paragraphs one Dashboard gets in a UTC day, enough for a nightly build's two levels and two rebuilds
const DASHBOARD_PARAGRAPH_DAILY_LIMIT = 6

// how long the paragraph's model call may take before it aborts
const PARAGRAPH_TIMEOUT_MS = 30_000

// how many countries the paragraph is given, and how many days each period counts
const MAX_PARAGRAPH_COUNTRIES = 3
const PERIOD_DAYS = 30

// what each page's audience came to
const AUDIENCE_SUBJECTS: Record<DashboardKind, string> = {
	topicDashboard: "their topics, findings, and posts",
	podcastDashboard: "their podcasts and films",
	teamDashboard: "the team's topics, findings, and posts",
}

// the label each summary count's line gives the model
const SUMMARY_COUNT_LABELS: Record<DashboardSummaryCountKey, string> = {
	topicCount: "Topics",
	findingCount: "Findings",
	topicPostCount: "Published posts",
	viewerCount: "Visitors in the last year",
	podcastCount: "Podcasts",
	podcastEpisodeCount: "Published podcast episodes",
	podcastPlayCount: "Podcast plays in the last year",
	filmPlayCount: "Film plays in the last year",
	memberCount: "Team members",
}

// the summary a paragraph is written from, and the series of the page's default selection
export type DashboardParagraphInput = { summary: DashboardSummary; series: DashboardSeries | null }

// whether a paragraph's allowance check took one, or found the Dashboard's own allowance or the platform's spent
type DashboardParagraphAllowance = "taken" | "dashboardLimitReached" | "platformLimitReached"

/**
 * Builds the paragraph prompt from counts and country names alone. Every value is the app's own.
 */
export async function buildDashboardParagraphPrompt({
	summary,
	series,
}: DashboardParagraphInput): Promise<BuiltPrompt> {
	// the template, and the numbers and places it is written from
	const { template, registryPrompt } = await fetchPromptTemplate("write-dashboard-paragraph")
	const { numberLines, placeLines } = toDashboardParagraphLines({ summary, series })
	const prompt = writePrompt(
		template,
		{},
		{
			pageName: DASHBOARD_PAGE_NAMES[summary.dashboardKind],
			audienceSubject: AUDIENCE_SUBJECTS[summary.dashboardKind],
			maxChars: String(DASHBOARD_PARAGRAPH_MAX_CHARS),
			numbersBlock: numberLines.join("\n"),
			placesBlock: placeLines.join("\n"),
		},
	)

	// the prompt with its name, for the trace
	return { prompt, name: "write-dashboard-paragraph", registryPrompt }
}

/**
 * Returns the lines of numbers and the lines of countries, most people first, that a paragraph is written from.
 */
export function toDashboardParagraphLines({ summary, series }: DashboardParagraphInput): {
	numberLines: string[]
	placeLines: string[]
} {
	const countries = toCountryNames(series)
	return {
		numberLines: toNumberLines(summary, series),
		placeLines: countries.length > 0 ? countries.map((country) => `- ${country}`) : ["- none known"],
	}
}

/**
 * Takes one paragraph from the Dashboard's allowance for the day, then from the platform's. A Dashboard past its own
 * allowance never spends the platform's.
 */
export async function takeDashboardParagraphAllowance(
	day: string,
	{ dashboardKind, subjectId }: DashboardSubject,
): Promise<DashboardParagraphAllowance> {
	// the Dashboard's own allowance
	const isWithinDashboardLimit = await countRateLimitHit({
		key: `dashboard-paragraphs:${day}:${dashboardKind}:${subjectId}`,
		rateLimitWindowMs: DAY_MS,
		limit: DASHBOARD_PARAGRAPH_DAILY_LIMIT,
	})
	if (!isWithinDashboardLimit) {
		return "dashboardLimitReached"
	}

	// the platform's allowance on its key
	const isWithinPlatformLimit = await countRateLimitHit({
		key: `dashboard-paragraphs:${day}`,
		rateLimitWindowMs: DAY_MS,
		limit: PLATFORM_PARAGRAPH_DAILY_LIMIT,
	})
	return isWithinPlatformLimit ? "taken" : "platformLimitReached"
}

/**
 * Writes one paragraph within the paragraph limit on the platform's key. Throws an error on an empty result.
 */
export async function writeDashboardParagraph(input: DashboardParagraphInput): Promise<string> {
	const paragraphPrompt = await buildDashboardParagraphPrompt(input)
	const { text } = await generateText({
		model: cheapModel(),
		prompt: paragraphPrompt.prompt,
		maxOutputTokens: MAX_PARAGRAPH_OUTPUT_TOKENS,
		providerOptions: LOW_REASONING_PROVIDER_OPTIONS,
		abortSignal: AbortSignal.timeout(PARAGRAPH_TIMEOUT_MS),
		...promptTelemetry(paragraphPrompt),
	})

	// an empty paragraph is a failed call, and a long one is cut at the limit
	const paragraph = toOneLineText(text).slice(0, DASHBOARD_PARAGRAPH_MAX_CHARS)
	if (!paragraph) {
		throw new Error("Empty dashboard paragraph")
	}
	return paragraph
}

// the summary strip's counts, then the last 30 days against the 30 before
function toNumberLines(summary: DashboardSummary, series: DashboardSeries | null): string[] {
	// the summary strip's lines, the count word, and the views or plays of each period, each person counted once per
	// item and day
	const summaryLines = toDashboardSummaryCounts(summary).map(
		({ countKey, count }) => `- ${SUMMARY_COUNT_LABELS[countKey]}: ${count}`,
	)
	const countWord = summary.dashboardKind === "podcastDashboard" ? "Plays" : "Visits"
	const dayCounts = sumTrendDays(series)
	const lastPeriodCount = sumCounts(dayCounts.slice(-PERIOD_DAYS))
	const priorPeriodCount = sumCounts(dayCounts.slice(-2 * PERIOD_DAYS, -PERIOD_DAYS))

	// the counts, then the two periods
	return [
		...summaryLines,
		`- ${countWord} in the last ${PERIOD_DAYS} days: ${lastPeriodCount}`,
		`- ${countWord} in the ${PERIOD_DAYS} days before that: ${priorPeriodCount}`,
	]
}

// the 90-day trend's count per day, summed across its lines, oldest first. it is the longest range with a point per
// day, and it covers both periods
function sumTrendDays(series: DashboardSeries | null): number[] {
	const quarterTrend = series?.trends["90"]
	if (!quarterTrend) {
		return []
	}
	return quarterTrend.days.map((_, i) => quarterTrend.lines.reduce((sum, { counts }) => sum + (counts[i] ?? 0), 0))
}

// counts summed
function sumCounts(counts: number[]): number {
	return counts.reduce((sum, count) => sum + count, 0)
}

// the countries of the map's pins, by name, the most people first
function toCountryNames(series: DashboardSeries | null): string[] {
	const peopleByCountry = new Map<string, number>()
	for (const { country, peopleCount } of series?.pins ?? []) {
		peopleByCountry.set(country, (peopleByCountry.get(country) ?? 0) + peopleCount)
	}

	// name each country in English, leaving out a code with no name
	return [...peopleByCountry]
		.sort((first, second) => second[1] - first[1])
		.flatMap(([country]) => toCountryName(country) ?? [])
		.slice(0, MAX_PARAGRAPH_COUNTRIES)
}
