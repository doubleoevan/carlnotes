// the rebuild of the Dashboards a change touches. a change that takes an item out of what a reader may see deletes the
// Dashboards' snapshots at once and purges their edge copies without the page purge's debounce. such a change is a
// topic's visibility, owner, team, or deletion, a deleted Topic Post, or a removed podcast episode. a publication
// leaves the snapshots and share images in place until its rebuild writes new ones. either way a new snapshot
// generation starts, so a build that loaded before the change skips its write, and a rebuild starts for each
// Dashboard, or builds again if one is running
import type { DashboardSubject } from "@carlnotes/contracts/dashboards"
import { toLastCompletedUtcDay } from "@carlnotes/contracts/time"
import { db } from "@carlnotes/db"
import {
	deleteDashboardSnapshotRows,
	startDashboardSnapshotGeneration,
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
 * team topic's Team Dashboard. Their snapshots leave at once.
 */
export async function rebuildTopicDashboards(...dashboardTopics: DashboardTopic[]): Promise<void> {
	await rebuildDashboards({ dashboardTopics, shouldDeleteSnapshots: true })
}

/**
 * Rebuilds the Dashboards of the topics as they are now, and the owner's own Dashboards, which a topic leaving or
 * joining a team changes. Their snapshots leave at once.
 */
export async function rebuildTopicDashboardsById(...topicIds: string[]): Promise<void> {
	await rebuildDashboardsByTopicId({ topicIds, shouldDeleteSnapshots: true })
}

/**
 * Rebuilds the Dashboards of a topic after a publication on it. Their snapshots and share images stay until the
 * rebuild writes new ones, so a rebuild that fails leaves the last snapshots readable. A build that loaded before the
 * publication skips its write.
 */
export async function rebuildTopicDashboardsAfterPublication(topicId: string): Promise<void> {
	await rebuildDashboardsByTopicId({ topicIds: [topicId], shouldDeleteSnapshots: false })
}

// the topics whose Dashboards to rebuild, by id, and whether the Dashboards' snapshots leave at once
type RebuildDashboardsByTopicIdOptions = { topicIds: string[]; shouldDeleteSnapshots: boolean }

// rebuild the Dashboards of the topics as they are now, and their owners' own
async function rebuildDashboardsByTopicId({
	topicIds,
	shouldDeleteSnapshots,
}: RebuildDashboardsByTopicIdOptions): Promise<void> {
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
		const dashboardTopics = [...topicRows, ...topicRows.map(({ ownerId }) => ({ ownerId, teamId: null }))]
		await rebuildDashboards({ dashboardTopics, shouldDeleteSnapshots })
	} catch (error) {
		reportError(error, "dashboard", { topicIds: topicIds.join(",") })
	}
}

// the topics whose Dashboards to rebuild, and whether the Dashboards' snapshots leave at once
type RebuildDashboardsOptions = { dashboardTopics: DashboardTopic[]; shouldDeleteSnapshots: boolean }

// start the rebuild of each topic's Dashboards, after deleting the Dashboard's snapshots if they leave at once or
// starting a new snapshot generation if they stay, reporting a failure without failing the change that asked for it
async function rebuildDashboards({ dashboardTopics, shouldDeleteSnapshots }: RebuildDashboardsOptions): Promise<void> {
	// the owner's Topic and Podcast Dashboards, and a team topic's Team Dashboard
	const subjects = dashboardTopics.flatMap(({ ownerId, teamId }): DashboardSubject[] => [
		...(teamId ? [{ dashboardKind: "teamDashboard" as const, subjectId: teamId }] : []),
		...toPersonalDashboardSubjects(ownerId),
	])

	// each Dashboard once, rebuilt up to the last completed day
	const lastDay = toLastCompletedUtcDay()
	await Promise.all(
		toUniqueDashboardSubjects(subjects).map(async (subject) => {
			try {
				// the snapshots leave before the rebuild starts, with a new generation. snapshots that stay get the new
				// generation alone, so a build that loaded before the change never writes over the rebuild's snapshots
				if (shouldDeleteSnapshots) {
					await deleteDashboardSnapshots(subject)
				} else {
					await startDashboardSnapshotGeneration(subject)
				}

				// the rebuild reads the new generation, so its own write goes through
				await startDashboardRebuildWorkflow(subject, lastDay)
			} catch (error) {
				reportError(error, "dashboard", subject)
			}
		}),
	)
}

// delete one Dashboard's snapshots and share image and purge its edge copies. the route serves an empty Dashboard
// until the rebuild writes new snapshots. a build that loaded before the delete skips its write
async function deleteDashboardSnapshots(subject: DashboardSubject): Promise<void> {
	const imageKeys = await db.transaction((transaction) => deleteDashboardSnapshotRows(transaction, [subject]))
	await deleteStoredObjects(imageKeys)
	await purgeEdgeCacheTagAfterDeletion(toDashboardCacheTag(subject))
}
