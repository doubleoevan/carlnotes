// avatar write tests: a published avatar drops the unchecked avatar before it, an unchecked avatar leaves the published
// avatar alone and outlives its upload's grace period, a team's avatar follows the same rules, an unchecked avatar is
// published or deleted only if it is still the one that was read, and an unchecked avatar that will never be published
// leaves no object
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import {
	deleteUncheckedAvatar,
	publishUncheckedAvatar,
	replaceAvatar,
	replaceTeamAvatar,
	saveUncheckedAvatar,
	saveUncheckedTeamAvatar,
} from "./avatars"
import { restoreConnectionPool, type SentQuery, stubConnectionPool, toTableRow } from "./connectionPoolStub"
import { uncheckedImages } from "./schema/uncheckedImages"
import * as sessions from "./sessions"
import * as store from "./store"
import type { UncheckedImageRow } from "./uncheckedImages"

// a user's published upload, their unchecked upload, and a new upload
const PUBLISHED_AVATAR_KEY = "avatars/user-1/published.png"
const UNCHECKED_AVATAR_KEY = "avatars/user-1/unchecked.png"
const NEW_AVATAR_KEY = "avatars/user-1/new.png"

// the pool's own query and every spy, put back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
})

// spy the session refresh and the object delete, which reach Redis and object storage
function spyAvatarSideEffects(): { refreshSessionUserSpy: ReturnType<typeof spyOn>; deletedObjectKeys: string[] } {
	const deletedObjectKeys: string[] = []
	const refreshSessionUserSpy = spyOn(sessions, "refreshSessionUser").mockResolvedValue(undefined)

	// keep each deleted key, in the order the deletes ran
	spyOn(store, "deleteStoredObjects").mockImplementation(async (objectKeys: string[]) => {
		deletedObjectKeys.push(...objectKeys)
	})
	return { refreshSessionUserSpy, deletedObjectKeys }
}

// the keys the sent queries recorded as pending deletions, and the keys whose pending row they cleared
function toPendingKeys(sentQueries: SentQuery[]): { recordedKeys: unknown[]; clearedKeys: unknown[] } {
	const recordedKeys = sentQueries
		.filter(({ text }) => text.startsWith('insert into "pending_object_deletions"'))
		.flatMap(({ values }) => values.filter((value) => typeof value === "string"))

	// the key each pending row delete names
	const clearedKeys = sentQueries
		.filter(({ text }) => text.startsWith('delete from "pending_object_deletions"'))
		.map(({ values }) => values[0])
	return { recordedKeys, clearedKeys }
}

// a team's published upload and its unchecked upload
const PUBLISHED_TEAM_AVATAR_KEY = "avatars/teams/team-1/published.png"
const UNCHECKED_TEAM_AVATAR_KEY = "avatars/teams/team-1/unchecked.png"

// when each unchecked image in these tests was uploaded
const UPLOADED_AT = new Date("2026-11-13T10:00:00.000Z")

// an unchecked avatar of a kind as the sweep read it
function toUncheckedAvatar(
	subjectKind: "userAvatar" | "teamAvatar",
	subjectId: string,
	avatarKey: string,
): UncheckedImageRow {
	return { id: "unchecked-1", subjectKind, subjectId, avatarKey, uploadedAt: UPLOADED_AT } as UncheckedImageRow
}

// an unchecked image row of a kind, with an avatar key
function toUncheckedAvatarRow(
	subjectKind: "userAvatar" | "teamAvatar",
	subjectId: string,
	avatarKey: string,
): unknown[] {
	return toTableRow(uncheckedImages, { ...toUncheckedAvatar(subjectKind, subjectId, avatarKey) })
}

// whether the sent queries wrote anything: a row, an unchecked image, or a pending deletion
function hasWrite(sentQueries: SentQuery[]): boolean {
	return sentQueries.some(({ text }) => /^(insert|update|delete) /.test(text))
}

// a new published upload replaces the published one and the unchecked one, and the user's row names no unchecked
// avatar
test("a published avatar deletes the upload it replaces and the unchecked avatar before it", async () => {
	const { refreshSessionUserSpy, deletedObjectKeys } = spyAvatarSideEffects()
	const sentQueries = stubConnectionPool(({ text }) =>
		text.includes("for update") ? [[PUBLISHED_AVATAR_KEY, UNCHECKED_AVATAR_KEY]] : [],
	)
	await replaceAvatar("user-1", "upload", NEW_AVATAR_KEY)

	// both replaced keys are recorded and deleted, and the new key's pending row is cleared
	const { recordedKeys, clearedKeys } = toPendingKeys(sentQueries)
	expect(recordedKeys).toEqual([PUBLISHED_AVATAR_KEY, UNCHECKED_AVATAR_KEY])
	expect(clearedKeys).toEqual([NEW_AVATAR_KEY])
	expect(deletedObjectKeys).toEqual([PUBLISHED_AVATAR_KEY, UNCHECKED_AVATAR_KEY])

	// the row points at the new upload with no unchecked one, the unchecked image is dropped, and the sessions are
	// refreshed
	const userUpdate = sentQueries.find(({ text }) => text.startsWith('update "users"'))
	expect(userUpdate?.values.slice(0, 3)).toEqual(["upload", NEW_AVATAR_KEY, null])
	expect(sentQueries.some(({ text }) => text.startsWith('delete from "unchecked_images"'))).toBe(true)
	expect(refreshSessionUserSpy).toHaveBeenCalledWith("user-1")
})

// publishing the unchecked upload itself keeps its object
test("publishing an unchecked avatar keeps its own object", async () => {
	const { deletedObjectKeys } = spyAvatarSideEffects()
	stubConnectionPool(({ text }) => (text.includes("for update") ? [[PUBLISHED_AVATAR_KEY, UNCHECKED_AVATAR_KEY]] : []))
	await replaceAvatar("user-1", "upload", UNCHECKED_AVATAR_KEY)
	expect(deletedObjectKeys).toEqual([PUBLISHED_AVATAR_KEY])
})

// an unchecked avatar is named on the user's row, clears its pending row, and deletes the unchecked avatar before it
test("an unchecked avatar leaves the published avatar, clears its own pending row, and replaces an earlier one", async () => {
	const { refreshSessionUserSpy, deletedObjectKeys } = spyAvatarSideEffects()
	const sentQueries = stubConnectionPool(({ text }) =>
		text.includes('from "unchecked_images"')
			? [toUncheckedAvatarRow("userAvatar", "user-1", UNCHECKED_AVATAR_KEY)]
			: [],
	)
	await saveUncheckedAvatar("user-1", NEW_AVATAR_KEY)

	// the user's row names the unchecked avatar and nothing else changes on it
	const userUpdate = sentQueries.find(({ text }) => text.startsWith('update "users"'))
	expect(userUpdate?.text).toContain('set "unchecked_avatar_key" = $1')
	expect(userUpdate?.values[0]).toBe(NEW_AVATAR_KEY)

	// the earlier unchecked avatar's object goes, and the new upload's pending row is cleared so its grace period never
	// deletes it
	const { recordedKeys, clearedKeys } = toPendingKeys(sentQueries)
	expect(recordedKeys).toEqual([UNCHECKED_AVATAR_KEY])
	expect(clearedKeys).toEqual([NEW_AVATAR_KEY])
	expect(deletedObjectKeys).toEqual([UNCHECKED_AVATAR_KEY])
	expect(refreshSessionUserSpy).toHaveBeenCalledWith("user-1")
})

// a team's reset leaves it with no avatar and deletes both its upload and its unchecked avatar
test("a team avatar reset deletes the team's upload and its unchecked avatar", async () => {
	const { deletedObjectKeys } = spyAvatarSideEffects()
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes("for update")) {
			return [["avatars/teams/team-1/published.png"]]
		}

		// the dropped unchecked image returns its row
		return text.startsWith('delete from "unchecked_images"')
			? [toUncheckedAvatarRow("teamAvatar", "team-1", "avatars/teams/team-1/unchecked.png")]
			: []
	})
	await replaceTeamAvatar("team-1", null)

	// the team's row has no avatar, and both objects are deleted
	const teamUpdate = sentQueries.find(({ text }) => text.startsWith('update "teams"'))
	expect(teamUpdate?.values[0]).toBeNull()
	expect(deletedObjectKeys).toEqual(["avatars/teams/team-1/published.png", "avatars/teams/team-1/unchecked.png"])
})

// an unchecked team avatar never touches the team's row
test("an unchecked team avatar leaves the team's row alone", async () => {
	spyAvatarSideEffects()
	const sentQueries = stubConnectionPool()
	await saveUncheckedTeamAvatar({
		teamId: "team-1",
		uploaderUserId: "user-1",
		avatarKey: "avatars/teams/team-1/new.png",
	})
	expect(sentQueries.some(({ text }) => text.startsWith('update "teams"'))).toBe(false)
	expect(toPendingKeys(sentQueries).clearedKeys).toEqual(["avatars/teams/team-1/new.png"])
})

// a rejected unchecked avatar is deleted, and the user's row and sessions stop naming it
test("deleting an unchecked avatar drops its row, its object, and the unchecked avatar the user's row names", async () => {
	const { refreshSessionUserSpy, deletedObjectKeys } = spyAvatarSideEffects()
	const sentQueries = stubConnectionPool(({ text }) =>
		text.startsWith('delete from "unchecked_images"')
			? [toUncheckedAvatarRow("userAvatar", "user-1", UNCHECKED_AVATAR_KEY)]
			: [],
	)
	expect(await deleteUncheckedAvatar(toUncheckedAvatar("userAvatar", "user-1", UNCHECKED_AVATAR_KEY))).toBe(true)

	// the unchecked image goes by its id and the time it was uploaded, under the subject's lock, with its object recorded
	// as pending
	expect(sentQueries[0]?.text).toContain("pg_advisory_xact_lock")
	const uncheckedImageDelete = sentQueries.find(({ text }) => text.startsWith('delete from "unchecked_images"'))
	expect(uncheckedImageDelete?.values).toEqual(["unchecked-1", UPLOADED_AT.toISOString()])
	expect(toPendingKeys(sentQueries).recordedKeys).toEqual([UNCHECKED_AVATAR_KEY])

	// the object goes, and the published avatar's columns are never written
	expect(deletedObjectKeys).toEqual([UNCHECKED_AVATAR_KEY])
	const userUpdate = sentQueries.find(({ text }) => text.startsWith('update "users"'))
	expect(userUpdate?.text).toContain('set "unchecked_avatar_key" = $1')
	expect(userUpdate?.text).not.toContain('"avatar_key" = ')
	expect(refreshSessionUserSpy).toHaveBeenCalledWith("user-1")
})

// an unchecked avatar that a newer upload replaced while its check ran is not the sweep's to delete
test("deleting an unchecked avatar that a newer upload replaced deletes nothing", async () => {
	const { refreshSessionUserSpy, deletedObjectKeys } = spyAvatarSideEffects()
	const sentQueries = stubConnectionPool()
	expect(await deleteUncheckedAvatar(toUncheckedAvatar("userAvatar", "user-1", UNCHECKED_AVATAR_KEY))).toBe(false)

	// the delete by id and time matched no row, so nothing else is written and no object goes
	const writeQueries = sentQueries.filter(({ text }) => /^(insert|update|delete) /.test(text))
	expect(writeQueries.map(({ text }) => text.split(" where ")[0])).toEqual(['delete from "unchecked_images"'])
	expect(deletedObjectKeys).toEqual([])
	expect(refreshSessionUserSpy).not.toHaveBeenCalled()
})

// an unchecked avatar that passed its check becomes the user's avatar in the transaction that confirms the user's row
// still names it
test("an unchecked avatar is published if the user's row still names it, and its row goes by id and time", async () => {
	const { refreshSessionUserSpy, deletedObjectKeys } = spyAvatarSideEffects()
	const sentQueries = stubConnectionPool(({ text }) => {
		if (text.includes("for update")) {
			return [[PUBLISHED_AVATAR_KEY, UNCHECKED_AVATAR_KEY]]
		}

		// the dropped unchecked image returns its row
		return text.startsWith('delete from "unchecked_images"')
			? [toUncheckedAvatarRow("userAvatar", "user-1", UNCHECKED_AVATAR_KEY)]
			: []
	})
	expect(await publishUncheckedAvatar(toUncheckedAvatar("userAvatar", "user-1", UNCHECKED_AVATAR_KEY))).toBe(true)

	// the subject's lock comes first, and the unchecked image goes by its id and the time it was uploaded, never by its
	// subject
	expect(sentQueries[0]?.text).toContain("pg_advisory_xact_lock")
	expect(sentQueries[0]?.values).toEqual(["unchecked-image:userAvatar:user-1"])
	const uncheckedImageDelete = sentQueries.find(({ text }) => text.startsWith('delete from "unchecked_images"'))
	expect(uncheckedImageDelete?.values).toEqual(["unchecked-1", UPLOADED_AT.toISOString()])

	// the user's row points at the unchecked avatar as an upload that passed, and only the avatar it replaces is deleted
	const userUpdate = sentQueries.find(({ text }) => text.startsWith('update "users"'))
	expect(userUpdate?.values.slice(0, 3)).toEqual(["upload", UNCHECKED_AVATAR_KEY, null])
	expect(deletedObjectKeys).toEqual([PUBLISHED_AVATAR_KEY])
	expect(refreshSessionUserSpy).toHaveBeenCalledWith("user-1")
})

// a newer upload saved as unchecked while the check ran stays unchecked, and the checked upload is never published
// over it
test("an unchecked avatar that a newer upload replaced while its check ran is not published", async () => {
	const { refreshSessionUserSpy, deletedObjectKeys } = spyAvatarSideEffects()
	const sentQueries = stubConnectionPool(({ text }) =>
		text.includes("for update") ? [[PUBLISHED_AVATAR_KEY, NEW_AVATAR_KEY]] : [],
	)
	expect(await publishUncheckedAvatar(toUncheckedAvatar("userAvatar", "user-1", UNCHECKED_AVATAR_KEY))).toBe(false)

	// nothing is written: the newer unchecked avatar, the user's row, and both objects stay
	expect(hasWrite(sentQueries)).toBe(false)
	expect(deletedObjectKeys).toEqual([])
	expect(refreshSessionUserSpy).not.toHaveBeenCalled()
})

// a team's unchecked avatar is confirmed by its unchecked image's row, because a team's row names no unchecked avatar
test("an unchecked team avatar is published only if it is still the one that was read", async () => {
	const { deletedObjectKeys } = spyAvatarSideEffects()
	const uncheckedTeamAvatar = toUncheckedAvatar("teamAvatar", "team-1", UNCHECKED_TEAM_AVATAR_KEY)

	// an unchecked avatar that a newer upload replaced: the delete by id and time matches no row
	const replacedUncheckedImageQueries = stubConnectionPool(({ text }) =>
		text.includes("for update") ? [[PUBLISHED_TEAM_AVATAR_KEY]] : [],
	)
	expect(await publishUncheckedAvatar(uncheckedTeamAvatar)).toBe(false)
	expect(replacedUncheckedImageQueries.some(({ text }) => text.startsWith('update "teams"'))).toBe(false)
	expect(deletedObjectKeys).toEqual([])

	// the unchecked avatar as it was read, whose delete by id and time returns its row
	restoreConnectionPool()
	const uncheckedQueries = stubConnectionPool(({ text }) => {
		if (text.includes("for update")) {
			return [[PUBLISHED_TEAM_AVATAR_KEY]]
		}

		// the dropped unchecked image returns its row
		return text.startsWith('delete from "unchecked_images"')
			? [toUncheckedAvatarRow("teamAvatar", "team-1", UNCHECKED_TEAM_AVATAR_KEY)]
			: []
	})

	// the publish writes the team's row and deletes the avatar it replaces
	expect(await publishUncheckedAvatar(uncheckedTeamAvatar)).toBe(true)
	const teamUpdate = uncheckedQueries.find(({ text }) => text.startsWith('update "teams"'))
	expect(teamUpdate?.values[0]).toBe(UNCHECKED_TEAM_AVATAR_KEY)
	expect(deletedObjectKeys).toEqual([PUBLISHED_TEAM_AVATAR_KEY])
})

// a team deleted while its unchecked avatar was checked has no row to publish to
test("an unchecked team avatar is not published to a team that is gone", async () => {
	const { deletedObjectKeys } = spyAvatarSideEffects()
	const sentQueries = stubConnectionPool()
	expect(await publishUncheckedAvatar(toUncheckedAvatar("teamAvatar", "team-1", UNCHECKED_TEAM_AVATAR_KEY))).toBe(false)
	expect(hasWrite(sentQueries)).toBe(false)
	expect(deletedObjectKeys).toEqual([])
})
