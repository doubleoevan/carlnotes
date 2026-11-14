// what the unchecked image check tests share: the restore each test file runs after a test, the image moderation's
// verdicts, the unchecked image rows, the stubbed database and storage of a check, and the reads of the sent queries
import { mock, spyOn } from "bun:test"
import { restoreConnectionPool, type SentQuery, stubConnectionPool, toTableRow } from "@carlnotes/db/connectionPoolStub"
import { uncheckedImages } from "@carlnotes/db/schema/uncheckedImages"
import * as store from "@carlnotes/db/store"
import * as moderation from "@carlnotes/models/moderation"

// put the connection pool and every spy back
export function restoreUncheckedImageCheckTest(): void {
	restoreConnectionPool()
	mock.restore()
}

// the verdicts the image moderation returns
export const CLEAN = { outcome: "classified", verdict: { isViolation: false, category: null } } as const
export const FLAGGED = { outcome: "classified", verdict: { isViolation: true, category: "sexual" } } as const
export const FAILED = { outcome: "failed", error: new Error("timed out") } as const
export const SKIPPED = { outcome: "skipped" } as const

// when each unchecked image in these tests was uploaded, unless the test says otherwise
export const UPLOADED_AT = new Date()

// two public topics, each with a current image, by id
export const TWO_PUBLIC_TOPIC_ROWS: Record<string, [string | null, string]> = {
	"topic-1": ["current-hash", "public"],
	"topic-2": ["current-hash", "public"],
}

// an unchecked image row, uploaded just now unless the test says otherwise
function toUncheckedImageRow(columnValues: Record<string, unknown>): unknown[] {
	return toTableRow(uncheckedImages, { uploadedAt: UPLOADED_AT, attemptCount: 0, isPublished: false, ...columnValues })
}

// an unchecked topic image of topic-1 under a hash
export function toUncheckedTopicImageRow(columnValues: Record<string, unknown> = {}): unknown[] {
	return toUncheckedImageRow({
		id: "unchecked-topic",
		subjectKind: "topicImage",
		subjectId: "topic-1",
		uploaderUserId: "user-1",
		imageHash: "unchecked-hash",
		width: 1536,
		height: 1024,
		...columnValues,
	})
}

// an unchecked avatar of user-1
export function toUncheckedAvatarRow(): unknown[] {
	return toUncheckedImageRow({
		id: "unchecked-avatar",
		subjectKind: "userAvatar",
		subjectId: "user-1",
		avatarKey: "avatars/user-1/unchecked.png",
	})
}

// an unchecked film image of the film of episode-1
export function toUncheckedTopicPodcastEpisodeVideoImageRow(): unknown[] {
	return toUncheckedImageRow({
		id: "unchecked-film",
		subjectKind: "topicPodcastEpisodeVideoImage",
		subjectId: "episode-1",
		uploaderUserId: "user-1",
		imageHash: "unchecked-film-hash",
	})
}

// what the stubbed database holds: the unchecked images, each topic's current image hash and visibility by id, the
// unchecked images that a newer upload replaced while their check ran, and the avatar and unchecked avatar keys of
// user-1's locked row
type UncheckedImageFixture = {
	uncheckedImageRows: unknown[][]
	topicRowById?: Record<string, [string | null, string]>
	replacedUncheckedImageIds?: string[]
	lockedUserRow?: [string | null, string | null]
}

// the rows an unchecked image query returns: the sweep's page, or the one row a read or a delete names by its id
function toUncheckedImageQueryRows(
	{ text, values }: SentQuery,
	{ uncheckedImageRows, replacedUncheckedImageIds = [] }: UncheckedImageFixture,
): unknown[][] {
	// a page leaves out the unchecked images the sweep already read, up to the limit its last value names
	if (text.includes("order by")) {
		const unreadUncheckedImageRows = uncheckedImageRows.filter(
			(uncheckedImageRow) => !values.includes(uncheckedImageRow[0]),
		)
		return unreadUncheckedImageRows.slice(0, Number(values.at(-1)))
	}

	// an unchecked image that a newer upload replaced matches no read and no delete by its id and time
	const isReplaced = replacedUncheckedImageIds.includes(String(values[0]))
	return isReplaced ? [] : uncheckedImageRows.filter((uncheckedImageRow) => uncheckedImageRow[0] === values[0])
}

// the rows a film query returns: the image a publish replaces with its private topic, or the film's current image
// hash, its topic and that topic's visibility, and its id
function toTopicPodcastEpisodeVideoQueryRows({ text }: SentQuery): unknown[][] {
	return text.includes("for no key update")
		? [["film-hash-before", "topic-1", "private"]]
		: [["film-hash-before", "topic-1", "public", "film-1"]]
}

// stub the database with the unchecked images and their subjects, the stored objects, and the image moderation's
// verdicts
export function stubUncheckedImageCheck(
	uncheckedImageFixture: UncheckedImageFixture,
	...classifications: moderation.ModerationClassification[]
): { sentQueries: SentQuery[]; classifyImageSpy: ReturnType<typeof spyOn>; deletedObjectKeys: string[] } {
	// the unchecked images, and the film a check or a publish reads
	const { topicRowById = { "topic-1": ["current-hash", "public"] }, lockedUserRow } = uncheckedImageFixture
	const sentQueries = stubConnectionPool((sentQuery) => {
		const { text, values } = sentQuery
		if (text.includes('from "unchecked_images"')) {
			return toUncheckedImageQueryRows(sentQuery, uncheckedImageFixture)
		}

		// the film of an unchecked film image
		if (text.includes('from "topic_podcast_episode_videos"')) {
			return toTopicPodcastEpisodeVideoQueryRows(sentQuery)
		}

		// a topic by its id, or no row for a topic that is gone
		if (text.includes('from "topics"')) {
			const topicRow = topicRowById[String(values[0])]
			return topicRow ? [[topicRow[0], String(values[0]), topicRow[1]]] : []
		}

		// user-1's locked row for an avatar's write, or the user's id for a check's read of its subject
		if (text.includes('from "users"')) {
			return text.includes("for update") && lockedUserRow ? [lockedUserRow] : [["user-1"]]
		}
		return []
	})

	// every stored object exists and reads as a few bytes, and each delete is kept
	const deletedObjectKeys: string[] = []
	spyOn(store, "attachmentExists").mockResolvedValue(true)
	spyOn(store, "getAttachmentBytes").mockResolvedValue(new Uint8Array([1, 2, 3]))
	spyOn(store, "deleteStoredObjects").mockImplementation(async (objectKeys: string[]) => {
		deletedObjectKeys.push(...objectKeys)
	})

	// the delete of an unchecked image's files that are still pending is kept too
	spyOn(store, "deletePendingStoredObjects").mockImplementation(async (objectKeys: string[]) => {
		deletedObjectKeys.push(...objectKeys)
	})

	// the verdicts, one for each check in order
	const classifyImageSpy = spyOn(moderation, "classifyImage")
	for (const classification of classifications) {
		classifyImageSpy.mockResolvedValueOnce(classification)
	}
	return { sentQueries, classifyImageSpy, deletedObjectKeys }
}

// the deletes of an unchecked image that the sent queries hold
export function toUncheckedImageDeletes(sentQueries: SentQuery[]): SentQuery[] {
	return sentQueries.filter(({ text }) => text.startsWith('delete from "unchecked_images"'))
}

// the keys the sent queries recorded as pending deletions
export function toPendingDeletionKeys(sentQueries: SentQuery[]): unknown[] {
	return sentQueries
		.filter(({ text }) => text.startsWith('insert into "pending_object_deletions"'))
		.flatMap(({ values }) => values.filter((value) => typeof value === "string"))
}
