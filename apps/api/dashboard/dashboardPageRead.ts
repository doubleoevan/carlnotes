// a Dashboard's page read: the head and the default selection's snapshot, served to visitors and to every reader
// without full access from one copy per Dashboard
import {
	type DashboardSubject,
	toDashboardReadAccess,
	toDefaultDashboardSelection,
} from "@carlnotes/contracts/dashboards"
import type { DashboardPageRead, DashboardUserState } from "@carlnotes/contracts/pageReads"
import { readVisitorPage, toVisitorDashboardPageKey } from "@carlnotes/db/visitorPageCaches"
import { loadDashboardPageHead } from "./dashboardPageHead"
import { type DashboardAccess, loadDashboard, loadDashboardAccess } from "./dashboards"

// the user, null for a visitor, and the Dashboard
type ReadDashboardPageReadOptions = DashboardSubject & { userId: string | null }

/**
 * Returns a Dashboard's page read, or null if its person or team does not exist or is a private team, whose page has no
 * head for any reader. A visitor reads the Dashboard's copy. A user with full access reads it fresh, and any other user reads
 * the copy with their own part beside it, or a fresh read of a Dashboard that has no copy.
 */
export async function readDashboardPageRead({
	userId,
	dashboardKind,
	subjectId,
}: ReadDashboardPageReadOptions): Promise<DashboardPageRead | null> {
	const dashboardSubject = { dashboardKind, subjectId }
	if (!userId) {
		return readVisitorDashboardPageRead(dashboardSubject)
	}

	// the user's access, and a full read of their own Dashboard or their team's
	const dashboardAccess = await loadDashboardAccess({ userId, dashboardKind, subjectId })
	if (!dashboardAccess) {
		return null
	}
	if (dashboardAccess.readAccess === "full") {
		return buildDashboardPageRead({ dashboardSubject, dashboardAccess, userState: { hasFullAccess: true } })
	}

	// every other user shares the visitors' copy, or reads fresh a Dashboard that visitors may not open
	const userState = { hasFullAccess: false }
	const visitorPageRead = await readVisitorDashboardPageRead(dashboardSubject)
	return visitorPageRead
		? { ...visitorPageRead, userState }
		: buildDashboardPageRead({ dashboardSubject, dashboardAccess, userState })
}

// a visitor's page read of a Dashboard, from its copy, or null for one that visitors may not open
function readVisitorDashboardPageRead(dashboardSubject: DashboardSubject): Promise<DashboardPageRead | null> {
	return readVisitorPage({
		key: toVisitorDashboardPageKey(dashboardSubject),
		pageKind: "dashboard",
		load: async () => {
			const dashboardAccess = await loadDashboardAccess({ userId: null, ...dashboardSubject })
			return dashboardAccess ? buildDashboardPageRead({ dashboardSubject, dashboardAccess, userState: null }) : null
		},
		isShared: (dashboardPageRead) => dashboardPageRead !== null,
	})
}

// the Dashboard, the reader's access to it, and the reader's own part, null for a visitor
type BuildDashboardPageReadOptions = {
	dashboardSubject: DashboardSubject
	dashboardAccess: DashboardAccess
	userState: DashboardUserState | null
}

// build the head and the default selection's snapshot at the reader's access together
async function buildDashboardPageRead({
	dashboardSubject,
	dashboardAccess,
	userState,
}: BuildDashboardPageReadOptions): Promise<DashboardPageRead | null> {
	// a read at the public read access shares its snapshot with the head, and any other read leaves the head its own
	const { dashboardKind, subjectId } = dashboardSubject
	const dashboardRead = loadDashboard({
		dashboardKind,
		subjectId,
		selection: toDefaultDashboardSelection(dashboardKind),
		readAccess: dashboardAccess.readAccess,
	})
	const isPublicRead = dashboardAccess.readAccess === toDashboardReadAccess(dashboardKind, false)
	const [head, dashboard] = await Promise.all([
		loadDashboardPageHead(dashboardKind, subjectId, isPublicRead ? dashboardRead : undefined),
		dashboardRead,
	])
	return head ? { head, dashboard: { subject: dashboardAccess.subject, ...dashboard }, userState } : null
}
