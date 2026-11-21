// the Redis copies of the status reads a page's poll sends: a film's, a Topic Post Discussion's, and a Scan's, their
// keys and lifetimes, the read-through load that fills one, and the delete that every status write runs
import { STATUS_FIRST_POLL_MS } from "@carlnotes/contracts/statusReads"
import { cacheJson, deleteRedisKeys } from "./redis"

// the subjects a status read reads: a podcast episode's film, a Topic Post's discussion, and a Topic's latest Scan
export type StatusReadKind = keyof typeof STATUS_FIRST_POLL_MS

// how long each copy lives: twice its poll's first interval, so one reader's next poll still finds it. every status
// write deletes its copy, so a change shows on the next poll
export const STATUS_READ_TTL_MS: Record<StatusReadKind, number> = {
	topicVideo: STATUS_FIRST_POLL_MS.topicVideo * 2,
	topicPostDiscussion: STATUS_FIRST_POLL_MS.topicPostDiscussion * 2,
	scan: STATUS_FIRST_POLL_MS.scan * 2,
}

// a status read's kind, the id of its subject (the podcast episode, the Topic Post, or the Topic), and the load of its
// row
type ReadStatusReadOptions<StatusRow> = {
	statusKind: StatusReadKind
	subjectId: string
	load: () => Promise<StatusRow>
}

/**
 * Returns the key of a status read's copy.
 */
export function toStatusReadKey(statusKind: StatusReadKind, subjectId: string): string {
	return `status:${statusKind}:${subjectId}`
}

/**
 * Returns a status read's row from its copy, or loads it on a miss and stores it for its kind's lifetime. A missing
 * subject's null is never stored. While Redis is unreachable each read loads the row.
 */
export function readStatusRead<StatusRow>({
	statusKind,
	subjectId,
	load,
}: ReadStatusReadOptions<StatusRow>): Promise<StatusRow> {
	return cacheJson({
		key: toStatusReadKey(statusKind, subjectId),
		ttlMs: STATUS_READ_TTL_MS[statusKind],
		load,
		isStorable: (statusRow) => statusRow !== null,
	})
}

/**
 * Deletes the status copies of the subjects, so the next status read loads the status a write just saved.
 */
export async function clearStatusReads(statusKind: StatusReadKind, ...subjectIds: string[]): Promise<void> {
	await deleteRedisKeys(...subjectIds.map((subjectId) => toStatusReadKey(statusKind, subjectId)))
}
