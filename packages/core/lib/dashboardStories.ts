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

// a city pin with its one topic, or a country's remainder
function toStoryPin(
	pin: Partial<DashboardPin> & Pick<DashboardPin, "country" | "latitude" | "longitude" | "peopleCount">,
): DashboardPin {
	const item = STORY_DASHBOARD_BARS[0] ?? { itemId: "topic-0", title: "LLM tooling", path: "/topics/topic-0", count: 0 }
	return {
		placeLevel: "country",
		region: null,
		city: null,
		count: pin.peopleCount + 4,
		items: [{ itemId: item.itemId, title: item.title, path: item.path, count: pin.peopleCount + 4 }],
		...pin,
	}
}

// pins in Paris, Berlin, and San Francisco, and the rest of France, the United States, and Japan at each country's
// center
export const STORY_DASHBOARD_PINS: DashboardPin[] = [
	toStoryPin({ placeLevel: "city", country: "FR", city: "Paris", latitude: 48.86, longitude: 2.35, peopleCount: 42 }),
	toStoryPin({ country: "FR", latitude: 46.23, longitude: 2.21, peopleCount: 9 }),
	toStoryPin({ placeLevel: "city", country: "DE", city: "Berlin", latitude: 52.52, longitude: 13.4, peopleCount: 31 }),
	toStoryPin({
		placeLevel: "city",
		country: "US",
		city: "San Francisco",
		latitude: 37.77,
		longitude: -122.42,
		peopleCount: 64,
	}),
	toStoryPin({ country: "US", latitude: 37.09, longitude: -95.71, peopleCount: 18 }),
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
