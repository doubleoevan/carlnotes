// what reaction and comment reads share: the author joined to a row and the cursor of a paged read
import { isInsideSocialEditTime } from "@carlnotes/contracts/social"
import { db } from "@carlnotes/db"
import { reports } from "@carlnotes/db/schema/reports"
import { users } from "@carlnotes/db/schema/users"
import { and, eq, exists, isNull, type SQL, type SQLWrapper, sql } from "drizzle-orm"

// who reads a comment: the user, null for a visitor, whether they may delete anyone's on this Topic, and whether
// they may share one with Carl
export type SocialReader = { userId: string | null; canModerate: boolean; canShare: boolean }

// a cursor's two parts: a creation time in milliseconds and a row id
const SOCIAL_CURSOR_PATTERN = /^(\d{1,13})_([\w-]+)$/

// the author's name and avatar, from the user row joined to a reaction or a comment
export const socialAuthorColumns = {
	username: users.username,
	avatarSource: users.avatarSource,
	avatarKey: users.avatarKey,
}

// those columns as a read returns them, all null for a row with no author
export type SocialAuthorRow = { username: string | null; avatarSource: string | null; avatarKey: string | null }

/**
 * Returns what a reader may do with a comment: whether they wrote it, edit it if they wrote it inside its edit time,
 * and delete it if they wrote it or may moderate.
 */
export function toCommentPermissions(
	row: { authorUserId: string | null; createdAt: Date },
	reader: SocialReader,
): { isAuthor: boolean; isEditable: boolean; canDelete: boolean } {
	const isAuthor = reader.userId !== null && row.authorUserId === reader.userId
	return {
		isAuthor,
		isEditable: isAuthor && isInsideSocialEditTime(row.createdAt),
		canDelete: isAuthor || reader.canModerate,
	}
}

/**
 * Returns the column that says whether the reader holds a report of a comment, however an admin resolved it. A visitor
 * holds none.
 */
export function toIsReportedColumn(userId: string | null, commentIdColumn: SQLWrapper): SQL.Aliased<boolean> {
	// one lookup per row, on the index of a reporter's subjects
	const reporterFilter = userId
		? exists(
				db
					.select({ id: reports.id })
					.from(reports)
					.where(
						and(
							eq(reports.reporterUserId, userId),
							eq(reports.subjectKind, "comment"),
							eq(reports.subjectId, sql`${commentIdColumn}::text`),
							isNull(reports.withdrawnAt),
						),
					),
			)
		: sql`false`
	return sql<boolean>`${reporterFilter}`.as("is_reported")
}

/**
 * Returns the cursor that names a row's place in a paged read: its creation time and its id.
 */
export function toSocialCursor(row: { createdAt: Date; id: string }): string {
	return `${row.createdAt.getTime()}_${row.id}`
}

/**
 * Returns the filter for the rows after a cursor, in a newest-first read or an oldest-first one, or none for a first
 * page or a cursor that does not parse.
 */
export function toAfterSocialCursorFilter(
	columns: { createdAt: SQLWrapper; id: SQLWrapper },
	cursor: string | undefined,
	order: "newestFirst" | "oldestFirst" = "newestFirst",
): SQL | undefined {
	// a cursor is a creation time in milliseconds and an id, and any other text reads from the start
	const [, createdAtMs, id] = SOCIAL_CURSOR_PATTERN.exec(cursor ?? "") ?? []
	if (!createdAtMs || !id) {
		return undefined
	}

	// the rows before the cursor's row in a newest-first read, and after it in an oldest-first one
	const cursorRow = sql`(${new Date(Number(createdAtMs)).toISOString()}::timestamptz, ${id})`
	return order === "newestFirst"
		? sql`(${columns.createdAt}, ${columns.id}) < ${cursorRow}`
		: sql`(${columns.createdAt}, ${columns.id}) > ${cursorRow}`
}
