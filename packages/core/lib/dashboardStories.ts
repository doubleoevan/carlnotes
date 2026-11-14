// the invented Dashboards the web and mobile stories and the MCP view tests show: the story user's Topic Dashboard and
// Podcast Dashboard, with a top ten, a pie with Other, a trend over each range, title words, and pins in four countries
import type {
	DashboardBar,
	DashboardPin,
	DashboardResponse,
	DashboardSeries,
	DashboardTrend,
} from "@carlnotes/contracts/dashboards"
import { toUtcDay } from "@carlnotes/contracts/time"

/**
 * The story user whose Dashboards they are.
 */
export const STORY_DASHBOARD_USER = {
	userId: "user-vienna",
	username: "vienna",
	avatarSource: "generated" as const,
	avatarVersion: null,
}

/**
 * The story team's subject and summary counts, which the Team Dashboard header stories show.
 */
export const STORY_TEAM_DASHBOARD_HEADER = {
	subject: { subjectKind: "team", team: { teamId: "team-roastery", name: "The Roastery", avatarVersion: null } },
	summary: {
		dashboardKind: "teamDashboard",
		topicCount: 8,
		findingCount: 260,
		topicPostCount: 3,
		memberCount: 5,
		viewerCount: 412,
	},
} satisfies Pick<DashboardResponse, "subject" | "summary">

// the topic titles the bars, slices, and lines name, most visited first
const TOPIC_TITLES = [
	"LLM tooling",
	"Agent frameworks",
	"Vector databases",
	"Prompt evals",
	"Coding assistants",
	"Model routing",
	"Local inference",
	"Speech models",
	"Retrieval pipelines",
	"Guardrails",
]

// each topic's bar, its visitors falling off down the list
const STORY_DASHBOARD_BARS: DashboardBar[] = TOPIC_TITLES.map((title, i) => ({
	itemId: `topic-${i}`,
	title,
	path: `/topics/topic-${i}`,
	count: Math.round(240 / (i + 1)),
}))

// a count split into podcast plays and film plays, for Podcast Dashboard under Both
function toStoryPlaySplit(count: number): { podcastPlayCount: number; filmPlayCount: number } {
	const podcastPlayCount = Math.round(count * 0.7)
	return { podcastPlayCount, filmPlayCount: count - podcastPlayCount }
}

// the same bars as podcast episodes, each split into podcast plays and film plays
const STORY_PODCAST_BARS: DashboardBar[] = STORY_DASHBOARD_BARS.slice(0, 6).map((bar, i) => ({
	...bar,
	title: `${bar.title}: the week`,
	path: `/topics/topic-${i}/llm/episodes/1/${i + 1}`,
	...toStoryPlaySplit(bar.count),
}))

// the last 30 days, oldest first
const STORY_DAYS = Array.from({ length: 30 }, (_, i) => toUtcDay(new Date(Date.UTC(2026, 9, 12 + i))))

// the top five bars' lines over the days, each a gentle wave
function toStoryTrend(bars: DashboardBar[]): DashboardTrend {
	return {
		days: STORY_DAYS,
		daysPerPoint: 1,
		lines: bars.slice(0, 5).map((bar, lineIndex) => ({
			key: bar.itemId,
			title: bar.title,
			path: bar.path,
			counts: STORY_DAYS.map((_, dayIndex) =>
				Math.max(0, Math.round((bar.count / 30) * (1 + Math.sin(dayIndex / 3 + lineIndex)))),
			),
		})),
	}
}

// the top five topics' lines
const STORY_TREND = toStoryTrend(STORY_DASHBOARD_BARS)

// the top five podcast episodes' lines, each day split into podcast plays and film plays
const STORY_PODCAST_TREND: DashboardTrend = {
	days: STORY_DAYS,
	daysPerPoint: 1,
	lines: toStoryTrend(STORY_PODCAST_BARS).lines.map((line) => ({
		...line,
		podcastPlayCounts: line.counts.map((count) => toStoryPlaySplit(count).podcastPlayCount),
		filmPlayCounts: line.counts.map((count) => toStoryPlaySplit(count).filmPlayCount),
	})),
}

// a place's pin with its one topic: a postal code or city at its coordinates, or a country at its center
function toStoryPin(
	pin: Partial<DashboardPin> & Pick<DashboardPin, "country" | "latitude" | "longitude" | "peopleCount">,
): DashboardPin {
	const item = STORY_DASHBOARD_BARS[0] ?? { itemId: "topic-0", title: "LLM tooling", path: "/topics/topic-0", count: 0 }
	return {
		placeLevel: "country",
		region: null,
		city: null,
		postalCode: null,
		count: pin.peopleCount + 4,
		items: [{ itemId: item.itemId, title: item.title, path: item.path, count: pin.peopleCount + 4 }],
		...pin,
	}
}

// a city's pin at one of its postal codes
function toStoryCityPin(
	pin: Pick<DashboardPin, "country" | "city" | "postalCode" | "latitude" | "longitude" | "peopleCount">,
): DashboardPin {
	return toStoryPin({ placeLevel: "city", ...pin })
}

// two Paris postal codes, Berlin, two San Francisco postal codes, one visitor each in Hinwil and Bend, and a place in
// Japan with no city at the country's center
export const STORY_DASHBOARD_PINS: DashboardPin[] = [
	toStoryCityPin({
		country: "FR",
		city: "Paris",
		postalCode: "75001",
		latitude: 48.86,
		longitude: 2.35,
		peopleCount: 42,
	}),
	toStoryCityPin({
		country: "FR",
		city: "Paris",
		postalCode: "75011",
		latitude: 48.86,
		longitude: 2.38,
		peopleCount: 9,
	}),
	toStoryCityPin({
		country: "DE",
		city: "Berlin",
		postalCode: "10115",
		latitude: 52.52,
		longitude: 13.4,
		peopleCount: 31,
	}),
	toStoryCityPin({
		country: "US",
		city: "San Francisco",
		postalCode: "94107",
		latitude: 37.77,
		longitude: -122.42,
		peopleCount: 64,
	}),
	toStoryCityPin({
		country: "US",
		city: "San Francisco",
		postalCode: "94110",
		latitude: 37.75,
		longitude: -122.42,
		peopleCount: 18,
	}),
	toStoryCityPin({
		country: "CH",
		city: "Hinwil",
		postalCode: "8340",
		latitude: 47.3,
		longitude: 8.84,
		peopleCount: 1,
	}),
	toStoryCityPin({
		country: "US",
		city: "Bend",
		postalCode: "97701",
		latitude: 44.06,
		longitude: -121.31,
		peopleCount: 1,
	}),
	toStoryPin({ country: "JP", latitude: 36.2, longitude: 138.25, peopleCount: 7 }),
]

// the topics series every chart of Topic Dashboard reads
export const STORY_TOPIC_SERIES: DashboardSeries = {
	bars: STORY_DASHBOARD_BARS,
	slices: [
		...STORY_DASHBOARD_BARS.slice(0, 5).map(({ itemId, title, path, count }) => ({ key: itemId, title, path, count })),
		{ key: "other", title: "Other", path: null, count: 120 },
	],
	trends: {
		"7": { days: STORY_DAYS.slice(-7), daysPerPoint: 1, lines: [] },
		"30": STORY_TREND,
		"90": STORY_TREND,
		"365": STORY_TREND,
	},
	words: [
		"tooling",
		"agents",
		"vector",
		"evals",
		"coding",
		"routing",
		"inference",
		"speech",
		"retrieval",
		"guardrails",
	].map((word, i) => ({ word, count: Math.round(90 / (i + 1)) })),
	pins: STORY_DASHBOARD_PINS,
}

/**
 * The story user's Topic Dashboard, as a visitor reads it.
 */
export const STORY_TOPIC_DASHBOARD: DashboardResponse = {
	subject: { subjectKind: "user", user: STORY_DASHBOARD_USER },
	day: "2026-11-10",
	summary: {
		dashboardKind: "topicDashboard",
		topicCount: 12,
		findingCount: 418,
		topicPostCount: 6,
		viewerCount: 1893,
	},
	paragraph:
		"LLM tooling pulled the most visitors again, about twice Agent frameworks. Paris and San Francisco led the map, and the last 30 days ran a little ahead of the 30 before.",
	imageUrl: null,
	series: STORY_TOPIC_SERIES,
}

/**
 * The story user's Podcast Dashboard with both formats, as a visitor reads it.
 */
export const STORY_PODCAST_DASHBOARD: DashboardResponse = {
	subject: { subjectKind: "user", user: STORY_DASHBOARD_USER },
	day: "2026-11-10",
	summary: {
		dashboardKind: "podcastDashboard",
		podcastCount: 4,
		podcastEpisodeCount: 37,
		podcastPlayCount: 2210,
		filmPlayCount: 840,
	},
	paragraph:
		"LLM tooling led the plays again, with films adding about a third on top of the podcasts. Plays in the last 30 days ran ahead of the 30 before.",
	imageUrl: null,
	series: {
		bars: STORY_PODCAST_BARS,
		slices: STORY_PODCAST_BARS.map(({ itemId, title, path, count, podcastPlayCount, filmPlayCount }) => ({
			key: itemId,
			title,
			path,
			count,
			podcastPlayCount,
			filmPlayCount,
		})),
		trends: {
			"7": { days: STORY_DAYS.slice(-7), daysPerPoint: 1, lines: [] },
			"30": STORY_PODCAST_TREND,
			"90": STORY_PODCAST_TREND,
			"365": STORY_PODCAST_TREND,
		},
		words: STORY_TOPIC_SERIES.words.map((word) => ({ ...word, ...toStoryPlaySplit(word.count) })),
		pins: STORY_DASHBOARD_PINS.map((pin) => ({
			...pin,
			...toStoryPlaySplit(pin.count),
			items: pin.items.map((item) => ({ ...item, ...toStoryPlaySplit(item.count) })),
		})),
	},
}
