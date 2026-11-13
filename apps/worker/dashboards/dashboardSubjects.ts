// the Dashboards the nightly build rebuilds: each person and team whose topics, findings, Topic Posts, or podcast
// episodes have a daily count row in the window
import type { DashboardSubject } from "@carlnotes/contracts/dashboards"
import { db } from "@carlnotes/db"
import { toUniqueDashboardSubjects } from "@carlnotes/db/dashboardSnapshotRows"
import { dailyPlayCounts, dailyViewCounts } from "@carlnotes/db/schema/dailyCounts"
import { podcastEpisodes } from "@carlnotes/db/schema/podcast"
import { findings } from "@carlnotes/db/schema/scans"
import { topicPosts } from "@carlnotes/db/schema/topicPosts"
import { topics } from "@carlnotes/db/schema/topics"
import { and, eq, gte, inArray } from "drizzle-orm"
import { union } from "drizzle-orm/pg-core"

/**
 * Lists the Dashboards with a daily count row on or after the first day: a person's Topic Dashboard and a team's Team
 * Dashboard for views, and a person's Podcast Dashboard for plays.
 */
export async function listDashboardSubjects(firstDay: string): Promise<DashboardSubject[]> {
	// the topics whose own page, findings, or Topic Posts were viewed, as a subquery so no id list grows past the
	// parameter limit
	const viewedTopicIds = union(
		db
			.selectDistinct({ topicId: dailyViewCounts.itemId })
			.from(dailyViewCounts)
			.where(and(eq(dailyViewCounts.itemKind, "topic"), gte(dailyViewCounts.day, firstDay))),
		db
			.selectDistinct({ topicId: findings.topicId })
			.from(dailyViewCounts)
			.innerJoin(findings, eq(findings.id, dailyViewCounts.itemId))
			.where(and(eq(dailyViewCounts.itemKind, "finding"), gte(dailyViewCounts.day, firstDay))),
		db
			.selectDistinct({ topicId: topicPosts.topicId })
			.from(dailyViewCounts)
			.innerJoin(topicPosts, eq(topicPosts.id, dailyViewCounts.itemId))
			.where(and(eq(dailyViewCounts.itemKind, "topicPost"), gte(dailyViewCounts.day, firstDay))),
	)

	// the owners of the viewed topics, and the teams of the viewed team topics
	const viewedTopics = await db
		.selectDistinct({ ownerId: topics.ownerId, teamId: topics.teamId })
		.from(topics)
		.where(inArray(topics.id, viewedTopicIds))
	const topicSubjects = viewedTopics.flatMap(({ ownerId, teamId }): DashboardSubject[] => [
		{ dashboardKind: "topicDashboard", subjectId: ownerId },
		...(teamId ? [{ dashboardKind: "teamDashboard" as const, subjectId: teamId }] : []),
	])

	// the topics whose podcast episodes were played since the first day
	const playedTopicIds = db
		.selectDistinct({ topicId: podcastEpisodes.topicId })
		.from(dailyPlayCounts)
		.innerJoin(podcastEpisodes, eq(podcastEpisodes.id, dailyPlayCounts.podcastEpisodeId))
		.where(gte(dailyPlayCounts.day, firstDay))

	// each of those topics' owner
	const playedTopicOwners = await db
		.selectDistinct({ ownerId: topics.ownerId })
		.from(topics)
		.where(inArray(topics.id, playedTopicIds))
	const podcastSubjects = playedTopicOwners.map(
		({ ownerId }): DashboardSubject => ({ dashboardKind: "podcastDashboard", subjectId: ownerId }),
	)

	// each Dashboard once
	return toUniqueDashboardSubjects([...topicSubjects, ...podcastSubjects])
}
