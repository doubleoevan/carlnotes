// the sweep time, the activity rows, and the stubbed connection pool that the notifications email tests share
import { type SentQuery, stubConnectionPool } from "@carlnotes/db/connectionPoolStub"

// the sweep's time, after the send hour, and the day it counts for
export const NOW = new Date("2026-11-06T16:00:00Z")
export const TODAY = "2026-11-06"

// the Topic every row is on, as an activity read selects it: id, owner, visibility, team, and name
export const TOPIC_COLUMNS = ["topic-1", "owner-1", "public", null, "Coffee"]

// no Finding and no Podcast Episode: the Finding's id and title, then the Podcast Episode's id, title, season, number,
// and publish time
export const NO_FINDING_OR_PODCAST_EPISODE = [null, null, null, null, null, null, null]

// no Topic Post: its id and title, which every row ends with
export const NO_TOPIC_POST = [null, null]

/**
 * Returns the time a row was created, some minutes before the sweep.
 */
export function toCreatedAt(minutesAgo: number): Date {
	return new Date(NOW.getTime() - minutesAgo * 60_000)
}

/**
 * Returns an activity row by one author an hour ago: recipient, username, a reaction's type or a comment's body, time,
 * then the target columns.
 */
export function toActivityRow(username: string, typeOrBody: string, minutesAgo = 60): unknown[] {
	return [
		"owner-1",
		username,
		typeOrBody,
		toCreatedAt(minutesAgo),
		...TOPIC_COLUMNS,
		...NO_FINDING_OR_PODCAST_EPISODE,
		...NO_TOPIC_POST,
	]
}

/**
 * Returns a reaction row by one author.
 */
export function toReactionRow(username: string, minutesAgo = 60): unknown[] {
	return toActivityRow(username, "insightful", minutesAgo)
}

// what marks the reads that go to a Topic Post's author: the recipients are matched against the post's author
export const TOPIC_POST_AUTHOR_READ = '"topic_posts"."author_user_id" in'

// what the stubbed connection pool returns: the reactions on the owner's things, the comments on them, the end of
// the recipient's last email, the time of their last quiet day's check, whether today already has a row of theirs,
// and whether the day's row is free to take
type SweepRows = {
	reactionRows?: unknown[][]
	commentRows?: unknown[][]
	lastActivityEndAt?: Date | null
	lastQuietCheckAt?: Date | null
	hasRowToday?: boolean
	isDayFree?: boolean
}

/**
 * Stubs a connection pool that returns the given rows to the sweep's reads, with the mention, comment reaction, and
 * reply reads empty. Once a quiet day is recorded, the recipients read finds nobody, as the database's filter on today
 * does.
 */
export function stubSweepRows({
	reactionRows = [],
	commentRows = [],
	lastActivityEndAt = null,
	lastQuietCheckAt = null,
	hasRowToday = false,
	isDayFree = true,
}: SweepRows): SentQuery[] {
	// the recipient's address, the end of their last email's time, and the time of their last quiet day's check, until
	// today has a row of theirs
	let hasTodayRow = hasRowToday
	const toRecipientRows = (): unknown[][] =>
		hasTodayRow ? [] : [["owner-1", "owner@example.com", lastActivityEndAt, lastQuietCheckAt]]

	// a quiet day's insert returns nothing and takes the day, and an email's returns the row it took
	const toSendInsertRows = (values: unknown[]): unknown[][] => {
		if (values.includes(true)) {
			hasTodayRow = true
			return []
		}
		return isDayFree ? [["owner-1"]] : []
	}

	// each read's rows by what its sql names, with a reaction to a comment, a reply, and a Topic Post's author's
	// reads empty
	return stubConnectionPool(({ text, values }) => {
		if (text.includes('"target_comments"') || text.includes(TOPIC_POST_AUTHOR_READ)) {
			return []
		}
		const rowsByRead: [string, () => unknown[][]][] = [
			['from "reactions"', () => reactionRows],
			['from "comments"', () => commentRows],
			['from "users"', toRecipientRows],
			['insert into "notifications_email_sends"', () => toSendInsertRows(values)],
		]
		return rowsByRead.find(([readText]) => text.includes(readText))?.[1]() ?? []
	})
}
