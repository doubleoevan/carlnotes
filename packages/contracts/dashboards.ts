// the value sets and responses of a Dashboard, the page that copy calls Specials: its kinds, the items a view counts,
// who a snapshot is built for, the trend ranges, the limits that keep a place private, the snapshot each chart reads,
// and its page paths
import { z } from "zod"
import { profileIdentity } from "./profiles"
import { toProfilePath, toTeamPath } from "./seo"
import { teamIdentity } from "./teamIdentity"
import { toAlphabeticalTeams } from "./teams"
import type { ViewerCountPage } from "./viewerCounts"

export const dashboardKinds = ["topicDashboard", "podcastDashboard", "teamDashboard"] as const
export type DashboardKind = (typeof dashboardKinds)[number]

// one Dashboard: its kind, and the person or team it counts
export type DashboardSubject = { dashboardKind: DashboardKind; subjectId: string }

// what a view counts: a topic page, a finding, or a Topic Post page
export const viewItemKinds = ["topic", "finding", "topicPost"] as const
export type ViewItemKind = (typeof viewItemKinds)[number]

// the plays a Podcast Dashboard chart counts: audio plays, film plays, or both
export const dashboardPlayFormats = ["audio", "video", "both"] as const
export type DashboardPlayFormat = (typeof dashboardPlayFormats)[number]

// a chart's selection: an item kind on Topic and Team Dashboard, a play format on Podcast Dashboard
export type DashboardChartSelection = ViewItemKind | DashboardPlayFormat

// the selection one snapshot holds: a chart's selection, or the summary every page shows
export type DashboardSelection = DashboardChartSelection | "summary"

// who a snapshot is built for: anyone, or the owner and a team's active members, who see private items too
export const dashboardAccessLevels = ["public", "full"] as const
export type DashboardAccessLevel = (typeof dashboardAccessLevels)[number]

// the trend's ranges in completed UTC days, and the one it starts on
export const dashboardRangeDays = [7, 30, 90, 365] as const
export type DashboardRangeDays = (typeof dashboardRangeDays)[number]
export const DEFAULT_DASHBOARD_RANGE_DAYS: DashboardRangeDays = 30

// how many completed days the bar, the pie, the word cloud, and the map count
export const DASHBOARD_WINDOW_DAYS = 365

// how many days a daily count row is kept
export const DAILY_COUNT_RETENTION_DAYS = 400

// how many items the bar chart ranks, and how many findings the pie and the trend show before the rest fold into Other
export const DASHBOARD_TOP_ITEM_COUNT = 10

// how many words the word cloud keeps
export const WORD_CLOUD_WORD_LIMIT = 60

// each Dashboard kind's page name
export const DASHBOARD_PAGE_NAMES = {
	topicDashboard: "Topic Specials",
	podcastDashboard: "Podcast Specials",
	teamDashboard: "Team Specials",
} as const satisfies Record<DashboardKind, string>
export type DashboardPageName = (typeof DASHBOARD_PAGE_NAMES)[DashboardKind]

// each Dashboard kind's heading at the top of its page
export const DASHBOARD_PAGE_HEADINGS = {
	topicDashboard: "Topic Daily Specials",
	podcastDashboard: "Podcast Daily Specials",
	teamDashboard: "Team Daily Specials",
} as const satisfies Record<DashboardKind, string>

/**
 * Returns a value per Dashboard page name from a value per Dashboard kind, such as each page's user menu icon.
 */
export function toValuesByDashboardPageName<Value>(
	valuesByKind: Record<DashboardKind, Value>,
): Record<DashboardPageName, Value> {
	// pair each kind's page name with the kind's value
	const pageNameEntries = dashboardKinds.map((dashboardKind) => [
		DASHBOARD_PAGE_NAMES[dashboardKind],
		valuesByKind[dashboardKind],
	])
	return Object.fromEntries(pageNameEntries) as Record<DashboardPageName, Value>
}

// a person's own Dashboard kinds, their Topic and Podcast Dashboards
export const PERSONAL_DASHBOARD_KINDS = ["topicDashboard", "podcastDashboard"] as const satisfies DashboardKind[]

// what the user or visitor may read of a Dashboard: the full snapshot, the public snapshot, or a team's summary alone
export type DashboardReadAccess = DashboardAccessLevel | "summaryOnly"

// the most characters Carl's paragraph above the charts holds
export const DASHBOARD_PARAGRAPH_MAX_CHARS = 480

// where a view or a play came from, as Cloudflare reported it: a two-letter country code, the region and city names,
// the postal code and metro code, and the decimal coordinates exactly as sent. a view with no known country has no
// place
export type Place = {
	country: string
	region: string | null
	city: string | null
	postalCode: string | null
	metroCode: string | null
	latitude: string | null
	longitude: string | null
}

// a chart's count: the views or plays, and for Podcast Dashboard the split into podcast plays and film plays
const dashboardCountFields = {
	count: z.number(),
	podcastPlayCount: z.number().optional(),
	filmPlayCount: z.number().optional(),
}

// an item a chart names: its id, its plain-text title, and its page's path
const dashboardItemFields = { itemId: z.string(), title: z.string(), path: z.string() }

// one bar: an item and its count over the window
const dashboardBar = z.object({ ...dashboardItemFields, ...dashboardCountFields })
export type DashboardBar = z.infer<typeof dashboardBar>

// one pie slice or trend line: an item, or Other with no path for the findings past the top ten
const dashboardSeriesKeyFields = { key: z.string(), title: z.string(), path: z.string().nullable() }
const dashboardSlice = z.object({ ...dashboardSeriesKeyFields, ...dashboardCountFields })
export type DashboardSlice = z.infer<typeof dashboardSlice>

// one trend line's count per point, with the podcast and film split for Podcast Dashboard
const dashboardTrendLine = z.object({
	...dashboardSeriesKeyFields,
	counts: z.array(z.number()),
	podcastPlayCounts: z.array(z.number()).optional(),
	filmPlayCounts: z.array(z.number()).optional(),
})
export type DashboardTrendLine = z.infer<typeof dashboardTrendLine>

// one range of the trend: each point's first completed day as YYYY-MM-DD, oldest first, the days one point counts, 1
// or a week of 7, and a line per item
const dashboardTrend = z.object({
	days: z.array(z.string()),
	daysPerPoint: z.number(),
	lines: z.array(dashboardTrendLine),
})
export type DashboardTrend = z.infer<typeof dashboardTrend>

// one word of the word cloud and the count of the items whose titles hold it
const dashboardWord = z.object({ word: z.string(), ...dashboardCountFields })
export type DashboardWord = z.infer<typeof dashboardWord>

// one map pin: a place at its finest known level, a postal code or a city at Cloudflare's coordinates, or a country at
// its center, with its people, its views or plays, and the items viewed or played there. a snapshot built before
// postal codes were counted has no postalCode
const dashboardPin = z.object({
	placeLevel: z.enum(["city", "country"]),
	country: z.string(),
	region: z.string().nullable(),
	city: z.string().nullable(),
	postalCode: z.string().nullable().optional(),
	latitude: z.number().nullable(),
	longitude: z.number().nullable(),
	peopleCount: z.number(),
	...dashboardCountFields,
	items: z.array(dashboardBar),
})
export type DashboardPin = z.infer<typeof dashboardPin>

// every chart's data for one selection: the top ten bars, the pie, the trend per range, the words, and the pins
const dashboardSeries = z.object({
	bars: z.array(dashboardBar),
	slices: z.array(dashboardSlice),
	trends: z.record(z.string(), dashboardTrend),
	words: z.array(dashboardWord),
	pins: z.array(dashboardPin),
})
export type DashboardSeries = z.infer<typeof dashboardSeries>

// the summary strip's all-time numbers, which differ by kind
const dashboardSummary = z.discriminatedUnion("dashboardKind", [
	z.object({
		dashboardKind: z.literal("topicDashboard"),
		topicCount: z.number(),
		findingCount: z.number(),
		topicPostCount: z.number(),
		viewerCount: z.number(),
	}),
	z.object({
		dashboardKind: z.literal("podcastDashboard"),
		podcastCount: z.number(),
		podcastEpisodeCount: z.number(),
		podcastPlayCount: z.number(),
		filmPlayCount: z.number(),
	}),
	z.object({
		dashboardKind: z.literal("teamDashboard"),
		topicCount: z.number(),
		findingCount: z.number(),
		topicPostCount: z.number(),
		memberCount: z.number(),
		viewerCount: z.number(),
	}),
])
export type DashboardSummary = z.infer<typeof dashboardSummary>

// the summary fields that hold a count: every field of each kind's summary but its kind
export type DashboardSummaryCountKey<Summary = DashboardSummary> = Summary extends DashboardSummary
	? Exclude<keyof Summary, "dashboardKind">
	: never

// one of the summary strip's counts: the summary field it reads, the count, and its noun
type DashboardSummaryCount = { countKey: DashboardSummaryCountKey; count: number; noun: string }

// whose Dashboard a page shows, for its subject header: a person on Topic and Podcast Dashboards, or a team
const dashboardSubjectIdentity = z.discriminatedUnion("subjectKind", [
	z.object({ subjectKind: z.literal("user"), user: profileIdentity }),
	z.object({ subjectKind: z.literal("team"), team: teamIdentity }),
])
export type DashboardSubjectIdentity = z.infer<typeof dashboardSubjectIdentity>

/**
 * Returns the name a Dashboard page shows for its subject: the person's username or the team's name.
 */
export function toDashboardSubjectName(subject: DashboardSubjectIdentity): string {
	return subject.subjectKind === "user" ? subject.user.username : subject.team.name
}

/**
 * Returns a Dashboard page's title: the person's possessive username or the team's name, then the page's name.
 */
export function toDashboardPageTitle(dashboardKind: DashboardKind, subjectName: string): string {
	const subjectTitleName = dashboardKind === "teamDashboard" ? subjectName : `${subjectName}'s`
	return `${subjectTitleName} ${DASHBOARD_PAGE_NAMES[dashboardKind]}`
}

/**
 * Returns what the user or visitor may read of a Dashboard: the owner and a team's members read the full snapshot, a
 * non-member reads a team's summary alone, and anyone else reads the public snapshot.
 */
export function toDashboardReadAccess(dashboardKind: DashboardKind, hasFullAccess: boolean): DashboardReadAccess {
	if (hasFullAccess) {
		return "full"
	}
	return dashboardKind === "teamDashboard" ? "summaryOnly" : "public"
}

// what the dashboard route returns: whose Dashboard it is, the summary strip, Carl's paragraph, the share image, the
// last completed day the snapshot counts, and one selection's series. a team's non-member gets no paragraph and no
// series
export const dashboardResponse = z.object({
	subject: dashboardSubjectIdentity,
	day: z.string().nullable(),
	summary: dashboardSummary,
	paragraph: z.string().nullable(),
	imageUrl: z.string().nullable(),
	series: dashboardSeries.nullable(),
})
export type DashboardResponse = z.infer<typeof dashboardResponse>

// the web map's Google Maps settings: the browser key and the Map ID its markers need, or null for either one unset
export const dashboardMapSettings = z.object({ apiKey: z.string().nullable(), mapId: z.string().nullable() })
export type DashboardMapSettings = z.infer<typeof dashboardMapSettings>

// the Dashboard routes' path params: the Dashboard's kind and the person or team it covers
export const dashboardParam = z.object({ dashboardKind: z.enum(dashboardKinds), subjectId: z.string() })

// the dashboard route's query: an item kind for Topic and Team Dashboard, or a format for Podcast Dashboard
export const dashboardQuery = z.object({
	itemKind: z.enum(viewItemKinds).optional(),
	format: z.enum(dashboardPlayFormats).optional(),
})

type DashboardQuery = z.infer<typeof dashboardQuery>

/**
 * Returns the dashboard route's query for a chart selection: a format by its own name, and an item kind otherwise.
 */
export function toDashboardQuery(selection: DashboardChartSelection): DashboardQuery {
	const playFormat = toDashboardPlayFormat(selection)
	return playFormat ? { format: playFormat } : { itemKind: viewItemKinds.find((itemKind) => itemKind === selection) }
}

/**
 * Returns the play format a chart selection names, or null for an item kind.
 */
export function toDashboardPlayFormat(selection: DashboardChartSelection): DashboardPlayFormat | null {
	return dashboardPlayFormats.find((format) => format === selection) ?? null
}

/**
 * Returns the selection a dashboard kind's page opens on: both formats for Podcast Dashboard, and topics for the
 * others.
 */
export function toDefaultDashboardSelection(dashboardKind: DashboardKind): DashboardChartSelection {
	return dashboardKind === "podcastDashboard" ? "both" : "topic"
}

/**
 * Returns a dashboard kind's summary with every count at zero, which a Dashboard shows before its first build.
 */
export function toEmptyDashboardSummary(dashboardKind: DashboardKind): DashboardSummary {
	if (dashboardKind === "podcastDashboard") {
		return { dashboardKind, podcastCount: 0, podcastEpisodeCount: 0, podcastPlayCount: 0, filmPlayCount: 0 }
	}

	// the topics, findings, and Topic Posts, then a team's members, then the viewer count
	const itemCounts = { topicCount: 0, findingCount: 0, topicPostCount: 0 }
	return dashboardKind === "teamDashboard"
		? { dashboardKind, ...itemCounts, memberCount: 0, viewerCount: 0 }
		: { dashboardKind, ...itemCounts, viewerCount: 0 }
}

// the path that opens the user's first team's Team Dashboard in alphabetical order, or the Teams page with no team
const TEAM_DASHBOARD_PATH = "/teams/specials"

// each Dashboard kind's page path after its person's or team's own page
const DASHBOARD_PATH_SUFFIXES: Record<DashboardKind, string> = {
	topicDashboard: "specials/topics",
	podcastDashboard: "specials/podcasts",
	teamDashboard: "specials",
}

/**
 * Returns a Dashboard's page path: after the person's profile for Topic and Podcast Dashboards, and after the team's
 * page for Team Dashboard.
 */
export function toDashboardPath({ dashboardKind, subjectId }: DashboardSubject): string {
	// the person's profile or the team's page, then the kind's page after it
	const encodedSubjectId = encodeURIComponent(subjectId)
	const subjectPath = dashboardKind === "teamDashboard" ? toTeamPath(encodedSubjectId) : toProfilePath(encodedSubjectId)
	return `${subjectPath}/${DASHBOARD_PATH_SUFFIXES[dashboardKind]}`
}

/**
 * Returns the Team Dashboard path of a user's first team in alphabetical order, or the Teams page with no team.
 */
export function toFirstTeamDashboardPath(userTeams: { teamId: string; name: string }[]): string {
	// the first team's Team Dashboard, or the Teams page with no team
	const [firstTeam] = toAlphabeticalTeams(userTeams)
	return firstTeam ? toDashboardPath({ dashboardKind: "teamDashboard", subjectId: firstTeam.teamId }) : "/teams"
}

/**
 * Returns whether a path is a team's Team Dashboard, or the path that opens the user's first team's.
 */
export function isTeamDashboardPath(pathname: string): boolean {
	return /^\/teams\/(?:[^/]+\/)?specials\/?$/.test(pathname)
}

/**
 * Returns a person's three Dashboard pages in menu order, each with its kind, name, and path: their own Topic and
 * Podcast Dashboards, and Team Dashboard, which opens their first team's.
 */
export function toDashboardPageLinks(
	userId: string,
): { dashboardKind: DashboardKind; label: DashboardPageName; path: string }[] {
	return dashboardKinds.map((dashboardKind) => ({
		dashboardKind,
		label: DASHBOARD_PAGE_NAMES[dashboardKind],
		path:
			dashboardKind === "teamDashboard" ? TEAM_DASHBOARD_PATH : toDashboardPath({ dashboardKind, subjectId: userId }),
	}))
}

/**
 * Returns the Dashboards a page's viewer count line links to: a profile page's Topic and Podcast Dashboards, a team
 * page's Team Dashboard, and none for a Topic Post page.
 */
export function toDashboardLinks({ kind, id }: ViewerCountPage): { label: string; path: string }[] {
	const dashboardKinds: readonly DashboardKind[] =
		kind === "profile" ? PERSONAL_DASHBOARD_KINDS : kind === "team" ? ["teamDashboard"] : []
	return dashboardKinds.map((dashboardKind) => ({
		label: DASHBOARD_PAGE_NAMES[dashboardKind],
		path: toDashboardPath({ dashboardKind, subjectId: id }),
	}))
}

/**
 * Returns the summary strip's counts in order, each with its field and noun: topics, findings, Topic Posts, and
 * viewers on Topic Dashboard, podcasts, podcast episodes, podcast plays, and film plays on Podcast Dashboard, and
 * topics, findings, Topic Posts, members, and viewers on Team Dashboard.
 */
export function toDashboardSummaryCounts(summary: DashboardSummary): DashboardSummaryCount[] {
	if (summary.dashboardKind === "podcastDashboard") {
		return [
			{ countKey: "podcastCount", count: summary.podcastCount, noun: "podcast" },
			{ countKey: "podcastEpisodeCount", count: summary.podcastEpisodeCount, noun: "podcast episode" },
			{ countKey: "podcastPlayCount", count: summary.podcastPlayCount, noun: "podcast play" },
			{ countKey: "filmPlayCount", count: summary.filmPlayCount, noun: "film play" },
		]
	}

	// the topics, findings, and Topic Posts, then a team's members, then the viewer count
	const itemCounts: DashboardSummaryCount[] = [
		{ countKey: "topicCount", count: summary.topicCount, noun: "topic" },
		{ countKey: "findingCount", count: summary.findingCount, noun: "finding" },
		{ countKey: "topicPostCount", count: summary.topicPostCount, noun: "post" },
	]
	const viewerCount: DashboardSummaryCount = { countKey: "viewerCount", count: summary.viewerCount, noun: "visitor" }
	return summary.dashboardKind === "teamDashboard"
		? [...itemCounts, { countKey: "memberCount", count: summary.memberCount, noun: "member" }, viewerCount]
		: [...itemCounts, viewerCount]
}
