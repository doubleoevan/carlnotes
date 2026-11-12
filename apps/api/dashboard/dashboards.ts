// how much a user or visitor may read of a Dashboard, and the snapshot at that access level. the owner of Topic and
// Podcast Dashboards and a team's active members read the full snapshot, anyone else a team's page opens for reads its
// summary alone, and everyone else reads the public one

import { toAvatarKeyVersion } from "@carlnotes/contracts/avatars"
import {
	type DashboardAccessLevel,
	type DashboardKind,
	type DashboardReadAccess,
	type DashboardResponse,
	type DashboardSelection,
	type DashboardSeries,
	type DashboardSubject,
	type DashboardSubjectIdentity,
	type DashboardSummary,
	toDashboardReadAccess,
	toEmptyDashboardSummary,
} from "@carlnotes/contracts/dashboards"
import { db } from "@carlnotes/db"
import {
	pickDashboardSnapshotRow,
	toDashboardReadFilter,
	toDashboardSummaryRowFilter,
} from "@carlnotes/db/dashboardSnapshotRows"
import { dashboardSnapshots } from "@carlnotes/db/schema/dashboards"
import { users } from "@carlnotes/db/schema/users"
import { eq } from "drizzle-orm"
import { toProfileIdentity } from "../avatars"
import { loadTeamPageAccess } from "../team/teamPageAccess"

// how much a user or visitor may read of a Dashboard, and whose Dashboard it is
type DashboardAccess = { readAccess: DashboardReadAccess; subject: DashboardSubjectIdentity }

// a Dashboard's read without its subject
type DashboardSnapshotRead = Omit<DashboardResponse, "subject">

// the Dashboard, the selection its charts asked for, and how much the user or visitor may read
type LoadDashboardOptions = {
	dashboardKind: DashboardKind
	subjectId: string
	selection: DashboardSelection
	readAccess: DashboardReadAccess
}

// the user, or null for a visitor, and the Dashboard
type LoadDashboardAccessOptions = DashboardSubject & { userId: string | null }

/**
 * Returns how much a user or visitor may read of a Dashboard and whose Dashboard it is, or null if its person or team
 * does not exist or a private team's page does not open for them.
 */
export async function loadDashboardAccess({
	userId,
	dashboardKind,
	subjectId,
}: LoadDashboardAccessOptions): Promise<DashboardAccess | null> {
	if (dashboardKind !== "teamDashboard") {
		const [userRow] = await db
			.select({
				userId: users.id,
				username: users.username,
				avatarSource: users.avatarSource,
				avatarKey: users.avatarKey,
			})
			.from(users)
			.where(eq(users.id, subjectId))

		// the person reads all of their own Dashboards, and everyone else the public part
		const user = toProfileIdentity(userRow ?? null)
		if (!user) {
			return null
		}
		return {
			readAccess: toDashboardReadAccess(dashboardKind, userId === subjectId),
			subject: { subjectKind: "user", user },
		}
	}

	// a team's active members read all of it, and anyone else the summary, if its page opens for them
	const teamPageAccess = await loadTeamPageAccess(userId, subjectId)
	if (!teamPageAccess?.canOpen) {
		return null
	}
	const { team } = teamPageAccess
	return {
		readAccess: toDashboardReadAccess(dashboardKind, Boolean(teamPageAccess.role)),
		subject: {
			subjectKind: "team",
			team: { teamId: team.id, name: team.name, avatarVersion: toAvatarKeyVersion(team.avatarKey) },
		},
	}
}

/**
 * Loads a Dashboard's summary, paragraph, share image, and one selection's series at the read access given, or no
 * series for the summary selection. A missing full snapshot falls back to the public one, and a Dashboard not built yet
 * shows zeros.
 */
export async function loadDashboard({
	dashboardKind,
	subjectId,
	selection,
	readAccess,
}: LoadDashboardOptions): Promise<DashboardSnapshotRead> {
	// the summary, and the selection if the charts may be read, at the access level and the public one
	const subject = { dashboardKind, subjectId }
	const accessLevel: DashboardAccessLevel = readAccess === "full" ? "full" : "public"
	const canReadCharts = readAccess !== "summaryOnly"
	const isSeriesRead = canReadCharts && selection !== "summary"
	const snapshotRows = await db
		.select({
			selection: dashboardSnapshots.selection,
			accessLevel: dashboardSnapshots.accessLevel,
			day: dashboardSnapshots.day,
			body: dashboardSnapshots.body,
			contentHash: dashboardSnapshots.contentHash,
			paragraph: dashboardSnapshots.paragraph,
			imageKey: dashboardSnapshots.imageKey,
		})
		.from(dashboardSnapshots)
		.where(toDashboardReadFilter(subject, isSeriesRead ? ["summary", selection] : ["summary"], accessLevel))

	// the rows at the access level, and the public summary that names the share image
	const summaryRow = pickDashboardSnapshotRow(snapshotRows, "summary", accessLevel)
	const publicSummaryRow = pickDashboardSnapshotRow(snapshotRows, "summary", "public")
	const seriesRow = isSeriesRead ? pickDashboardSnapshotRow(snapshotRows, selection, accessLevel) : undefined

	// the summary, the paragraph and the share image only if the charts may be read, and the series
	return {
		day: summaryRow?.day ?? null,
		summary: (summaryRow?.body as DashboardSummary | undefined) ?? toEmptyDashboardSummary(dashboardKind),
		paragraph: canReadCharts ? (summaryRow?.paragraph ?? null) : null,
		imageUrl:
			canReadCharts && publicSummaryRow?.imageKey
				? toDashboardShareImagePath(subject, publicSummaryRow.contentHash)
				: null,
		series: (seriesRow?.body as DashboardSeries | undefined) ?? null,
	}
}

/**
 * Returns the object key of a Dashboard's current share image if its hash names it, or null otherwise.
 */
export async function loadDashboardShareImageKey(
	subject: DashboardSubject,
	contentHash: string,
): Promise<string | null> {
	const [summaryRow] = await db
		.select({ imageKey: dashboardSnapshots.imageKey, contentHash: dashboardSnapshots.contentHash })
		.from(dashboardSnapshots)
		.where(toDashboardSummaryRowFilter(subject, "public"))
	return summaryRow?.contentHash === contentHash ? summaryRow.imageKey : null
}

// the path the share image is served at, named by its public summary's hash so a new image gets a new url
function toDashboardShareImagePath({ dashboardKind, subjectId }: DashboardSubject, contentHash: string): string {
	return `/api/dashboards/${dashboardKind}/${encodeURIComponent(subjectId)}/share-image/${contentHash}.png`
}
