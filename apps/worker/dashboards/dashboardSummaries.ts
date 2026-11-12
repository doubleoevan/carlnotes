// the summary strip's numbers for one Dashboard at both access levels: its topics, findings, and published Topic Posts
// with a team's members and its viewers, or its podcasts and published podcast episodes with their plays
import type { DashboardAccessLevel, DashboardSubject, DashboardSummary } from "@carlnotes/contracts/dashboards"
import { db } from "@carlnotes/db"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { findings } from "@carlnotes/db/schema/scans"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { topics } from "@carlnotes/db/schema/topics"
import { countActiveTeamMembers } from "@carlnotes/db/teamMembers"
import { and, countDistinct, eq, isNotNull, type SQL, sql } from "drizzle-orm"
import { type DashboardDailyCountRow, toSubjectTopicFilter } from "./dashboardDailyCountRows"
import { countRowGroups, toPlayCount } from "./dashboardItemCounts"

// a summary per access level
type DashboardSummaries = Record<DashboardAccessLevel, DashboardSummary>

// a public topic, the filter a public count adds
const IS_PUBLIC_TOPIC = sql`${topics.visibility} = 'public'`

/**
 * Returns the subject's summary at both access levels from its items and its window's daily count rows: the view rows
 * of every item kind for Topic and Team Dashboard, or the play rows of both formats for Podcast Dashboard. Returns null
 * if Redis fails to count the viewers.
 */
export async function loadDashboardSummaries(
	subject: DashboardSubject,
	dailyCountRows: DashboardDailyCountRow[],
): Promise<DashboardSummaries | null> {
	if (subject.dashboardKind === "podcastDashboard") {
		return loadPodcastSummaries(subject, dailyCountRows)
	}

	// the item counts, and the distinct viewers of the public items and of every item
	const itemCounts = await loadTopicItemCounts(subject)
	const viewerCounts = await countRowGroups([dailyCountRows.filter(({ isPublic }) => isPublic), dailyCountRows])
	if (!viewerCounts) {
		return null
	}
	const [publicViewerCount = 0, fullViewerCount = 0] = viewerCounts

	// a team's summary adds its active members before the viewers
	if (subject.dashboardKind === "teamDashboard") {
		const memberCount = await countActiveTeamMembers(subject.subjectId)
		return {
			public: { dashboardKind: "teamDashboard", ...itemCounts.public, memberCount, viewerCount: publicViewerCount },
			full: { dashboardKind: "teamDashboard", ...itemCounts.full, memberCount, viewerCount: fullViewerCount },
		}
	}
	return {
		public: { dashboardKind: "topicDashboard", ...itemCounts.public, viewerCount: publicViewerCount },
		full: { dashboardKind: "topicDashboard", ...itemCounts.full, viewerCount: fullViewerCount },
	}
}

// the topic, finding, and published Topic Post counts at one access level
type TopicItemCounts = { topicCount: number; findingCount: number; topicPostCount: number }

// the subject's topics, findings, and published Topic Posts, all of them and the public ones
async function loadTopicItemCounts(subject: DashboardSubject): Promise<Record<DashboardAccessLevel, TopicItemCounts>> {
	const subjectFilter = toSubjectTopicFilter(subject)
	const [topicCounts, findingCounts, topicPostCounts] = await Promise.all([
		countByAccessLevel(db.select(toCountColumns()).from(topics).where(subjectFilter)),
		countByAccessLevel(
			db
				.select(toCountColumns())
				.from(findings)
				.innerJoin(topics, eq(topics.id, findings.topicId))
				.where(subjectFilter),
		),
		countByAccessLevel(
			db
				.select(toCountColumns())
				.from(topicPosts)
				.innerJoin(topics, eq(topics.id, topicPosts.topicId))
				.where(and(subjectFilter, isNotNull(topicPosts.publishedAt))),
		),
	])

	// the counts at each access level
	return {
		public: {
			topicCount: topicCounts.public,
			findingCount: findingCounts.public,
			topicPostCount: topicPostCounts.public,
		},
		full: { topicCount: topicCounts.full, findingCount: findingCounts.full, topicPostCount: topicPostCounts.full },
	}
}

// the subject's podcasts, which are its topics with a published podcast episode, its published podcast episodes, and
// the window's podcast and film plays, all of them and the public ones
async function loadPodcastSummaries(
	subject: DashboardSubject,
	playRows: DashboardDailyCountRow[],
): Promise<DashboardSummaries> {
	const [podcastEpisodeCounts] = await db
		.select({
			publicPodcastCount: countDistinct(sql`case when ${IS_PUBLIC_TOPIC} then ${topics.id} end`),
			podcastCount: countDistinct(topics.id),
			...toCountColumns(),
		})
		.from(podcastEpisodes)
		.innerJoin(topics, eq(topics.id, podcastEpisodes.topicId))
		.where(and(toSubjectTopicFilter(subject), eq(podcastEpisodes.status, "published")))

	// the plays of each format, for the public podcast episodes and for all of them
	const toPlayCounts = (rows: DashboardDailyCountRow[]): { podcastPlayCount: number; filmPlayCount: number } => {
		const { podcastPlayCount = 0, filmPlayCount = 0 } = toPlayCount(rows)
		return { podcastPlayCount, filmPlayCount }
	}
	return {
		public: {
			dashboardKind: "podcastDashboard",
			podcastCount: podcastEpisodeCounts?.publicPodcastCount ?? 0,
			podcastEpisodeCount: podcastEpisodeCounts?.publicCount ?? 0,
			...toPlayCounts(playRows.filter(({ isPublic }) => isPublic)),
		},
		full: {
			dashboardKind: "podcastDashboard",
			podcastCount: podcastEpisodeCounts?.podcastCount ?? 0,
			podcastEpisodeCount: podcastEpisodeCounts?.count ?? 0,
			...toPlayCounts(playRows),
		},
	}
}

// a count of every row and of the rows on a public topic
function toCountColumns(): { publicCount: SQL.Aliased<number>; count: SQL.Aliased<number> } {
	return {
		publicCount: sql<number>`count(*) filter (where ${IS_PUBLIC_TOPIC})`.mapWith(Number).as("public_count"),
		count: sql<number>`count(*)`.mapWith(Number).as("count"),
	}
}

// one counted query's public and full counts
async function countByAccessLevel(
	query: Promise<{ publicCount: number; count: number }[]>,
): Promise<Record<DashboardAccessLevel, number>> {
	const [countRow] = await query
	return { public: countRow?.publicCount ?? 0, full: countRow?.count ?? 0 }
}
