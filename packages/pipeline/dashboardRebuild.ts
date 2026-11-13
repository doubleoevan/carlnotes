// the rebuild of the Dashboards a change touches: a topic's visibility, owner, team, or deletion, or a Topic Post's or
// podcast episode's publication. the Dashboards' snapshots leave at once, their edge copies are purged without the page
// purge's debounce, and a rebuild starts for each, or builds again if one is running
import type { DashboardSubject } from "@carlnotes/contracts/dashboards"
import { toLastCompletedUtcDay } from "@carlnotes/contracts/time"
import { db } from "@carlnotes/db"
import {
	deleteDashboardSnapshotRows,
	toPersonalDashboardSubjects,
	toUniqueDashboardSubjects,
} from "@carlnotes/db/dashboardSnapshotRows"
import { topics } from "@carlnotes/db/schema/topics"
import { deleteStoredObjects } from "@carlnotes/db/store"
import { purgeEdgeCacheTagAfterDeletion, toDashboardCacheTag } from "@carlnotes/server/edgePurge"
import { reportError } from "@carlnotes/server/monitoring"
import { inArray } from "drizzle-orm"
import { startDashboardRebuildWorkflow } from "./temporalClient"

// a topic's owner and team, which name its Dashboards
type DashboardTopic = { ownerId: string; teamId: string | null }

/**
 * Rebuilds the Dashboards of the topics, as they were and as they are: the owner's Topic and Podcast Dashboards, and a
 * team topic's Team Dashboard.
 */
export async function rebuildTopicDashboards(...dashboardTopics: DashboardTopic[]): Promise<void> {
	const subjects = dashboardTopics.flatMap(({ ownerId, teamId }): DashboardSubject[] => [
		...(teamId ? [{ dashboardKind: "teamDashboard" as const, subjectId: teamId }] : []),
		...toPersonalDashboardSubjects(ownerId),
	])
	await rebuildDashboards(subjects)
}

/**
 * Rebuilds the Dashboards of the topics as they are now, and the owner's own Dashboards, which a topic leaving or
 * joining a team changes.
 */
export async function rebuildTopicDashboardsById(...topicIds: string[]): Promise<void> {
	if (topicIds.length === 0) {
		return
	}

	// each topic's owner and team now, reporting a failed read without failing the change that asked for the rebuild
	try {
		const topicRows = await db
			.select({ ownerId: topics.ownerId, teamId: topics.teamId })
			.from(topics)
			.where(inArray(topics.id, topicIds))

		// the Dashboards of the topics as they are, and their owners' own
		await rebuildTopicDashboards(...topicRows, ...topicRows.map(({ ownerId }) => ({ ownerId, teamId: null })))
	} catch (error) {
		reportError(error, "dashboard", { topicIds: topicIds.join(",") })
	}
}

// delete each Dashboard's snapshots, purge its edge copies, and start its rebuild, reporting a failure without
// failing the change that asked for it
async function rebuildDashboards(subjects: DashboardSubject[]): Promise<void> {
	const lastDay = toLastCompletedUtcDay()
	await Promise.all(
		toUniqueDashboardSubjects(subjects).map(async (subject) => {
			try {
				// the snapshots leave first, and the route serves an empty Dashboard until the rebuild writes new ones. a build
				// that loaded before the delete skips its write
				const imageKeys = await db.transaction((transaction) => deleteDashboardSnapshotRows(transaction, [subject]))
				await deleteStoredObjects(imageKeys)
				await purgeEdgeCacheTagAfterDeletion(toDashboardCacheTag(subject))
				await startDashboardRebuildWorkflow(subject, lastDay)
			} catch (error) {
				reportError(error, "dashboard", subject)
			}
		}),
	)
}
