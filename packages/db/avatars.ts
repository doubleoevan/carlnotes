// the writes that change which avatar a user or a team shows: the published avatar, and an unchecked avatar shown to
// its uploader alone until its image moderation can run. each write takes the lock of its subject's unchecked image
// first

import type { avatarSources } from "@carlnotes/contracts/enums"
import { eq } from "drizzle-orm"
import { type DbHandle, db } from "./index"
import { teams } from "./schema/teams"
import { users } from "./schema/users"
import { refreshSessionUser } from "./sessions"
import { clearPendingObjectDeletion, deleteStoredObjects, recordPendingObjectDeletions } from "./store"
import {
	deleteUncheckedImage,
	deleteUncheckedImageById,
	lockUncheckedImageSubject,
	saveUncheckedImage,
	type UncheckedImageRow,
	type UncheckedImageSubject,
} from "./uncheckedImages"

// the file extension of each image type a stored avatar may have. svg is rejected: it is a document that can include
// a script
export const AVATAR_EXTENSIONS: Record<string, string> = {
	"image/png": "png",
	"image/jpeg": "jpg",
	"image/webp": "webp",
	"image/gif": "gif",
}

/**
 * Returns the media type a stored avatar is served as, read from the file extension. Falls back to png.
 */
export function toAvatarContentType(avatarKey: string): string {
	const fileExtension = avatarKey.split(".").pop() ?? ""
	return Object.keys(AVATAR_EXTENSIONS).find((type) => AVATAR_EXTENSIONS[type] === fileExtension) ?? "image/png"
}

/**
 * Points a user at an avatar source and its stored object, null for a source with none. Any unchecked avatar of the
 * user is dropped, and the objects nothing points at now are deleted.
 */
export async function replaceAvatar(
	userId: string,
	avatarSource: (typeof avatarSources)[number],
	avatarKey: string | null,
): Promise<void> {
	await writeUserAvatar({ userId, avatarSource, avatarKey })
}

/**
 * Saves an uploaded avatar as unchecked and shows it to its user alone: the published avatar stays as it is, the
 * user's sessions name the unchecked avatar, and its pending row is cleared so the upload's grace period never deletes
 * it. The unchecked avatar it replaces is deleted.
 */
export async function saveUncheckedAvatar(userId: string, avatarKey: string): Promise<void> {
	// save the unchecked image, name it on the user's row, and clear the new key's pending row, in one transaction
	const replacedAvatarKeys = await db.transaction(async (transaction) => {
		const replacedUncheckedImage = await saveUncheckedImage(transaction, {
			subjectKind: "userAvatar",
			subjectId: userId,
			uploaderUserId: userId,
			avatarKey,
		})
		const replacedUncheckedAvatarKeys = toReplacedAvatarKeys([replacedUncheckedImage?.avatarKey], avatarKey)

		// record the unchecked avatar that the upload replaces, then name the new one
		await recordPendingObjectDeletions({ handle: transaction, objectKeys: replacedUncheckedAvatarKeys })
		await transaction.update(users).set({ uncheckedAvatarKey: avatarKey }).where(eq(users.id, userId))
		await clearPendingObjectDeletion(avatarKey, transaction)
		return replacedUncheckedAvatarKeys
	})

	// write the unchecked avatar to the user's sessions, then delete the unchecked avatar it replaces
	await refreshSessionUser(userId)
	await deleteStoredObjects(replacedAvatarKeys)
}

/**
 * Points a team at an uploaded avatar's stored object, or at no avatar for null. Any unchecked avatar of the team is
 * dropped, and the objects nothing points at now are deleted.
 */
export async function replaceTeamAvatar(teamId: string, avatarKey: string | null): Promise<void> {
	await writeTeamAvatar({ teamId, avatarKey })
}

// a team avatar to save as unchecked: the team, the leader who uploaded it, and its stored object
export type SaveUncheckedTeamAvatarOptions = { teamId: string; uploaderUserId: string; avatarKey: string }

/**
 * Saves an uploaded team avatar as unchecked and shows it to its uploader alone: the team's avatar stays as it is, and
 * the upload's pending row is cleared so its grace period never deletes it. The unchecked avatar it replaces is
 * deleted.
 */
export async function saveUncheckedTeamAvatar({
	teamId,
	uploaderUserId,
	avatarKey,
}: SaveUncheckedTeamAvatarOptions): Promise<void> {
	// save the unchecked image and clear the new key's pending row, in one transaction
	const replacedAvatarKeys = await db.transaction(async (transaction) => {
		const replacedUncheckedImage = await saveUncheckedImage(transaction, {
			subjectKind: "teamAvatar",
			subjectId: teamId,
			uploaderUserId,
			avatarKey,
		})
		const replacedUncheckedAvatarKeys = toReplacedAvatarKeys([replacedUncheckedImage?.avatarKey], avatarKey)

		// record the unchecked avatar that the upload replaces
		await recordPendingObjectDeletions({ handle: transaction, objectKeys: replacedUncheckedAvatarKeys })
		await clearPendingObjectDeletion(avatarKey, transaction)
		return replacedUncheckedAvatarKeys
	})

	// delete the unchecked avatar that the upload replaces
	await deleteStoredObjects(replacedAvatarKeys)
}

/**
 * Publishes an unchecked avatar that passed its check as its user's or its team's avatar, as an upload that passed is.
 * Returns false and changes nothing if a newer upload replaced the unchecked avatar, or a write dropped it, since it
 * was read.
 */
export async function publishUncheckedAvatar(uncheckedAvatar: UncheckedImageRow): Promise<boolean> {
	// an unchecked image with no stored object has no avatar to publish
	const { subjectKind, subjectId, avatarKey } = uncheckedAvatar
	if (!avatarKey) {
		return false
	}

	// a user's unchecked avatar becomes their uploaded avatar, and a team's becomes the team's
	return subjectKind === "userAvatar"
		? writeUserAvatar({
				userId: subjectId,
				avatarSource: "upload",
				avatarKey,
				publishedUncheckedAvatar: uncheckedAvatar,
			})
		: writeTeamAvatar({ teamId: subjectId, avatarKey, publishedUncheckedAvatar: uncheckedAvatar })
}

/**
 * Deletes an unchecked avatar that will never be published: its row, its stored object, and for a user's avatar the
 * unchecked avatar their sessions name. The published avatar stays as it is. Returns false and deletes nothing if a
 * newer upload replaced the unchecked avatar, or a write dropped it, since it was read.
 */
export async function deleteUncheckedAvatar(uncheckedAvatar: UncheckedImageRow): Promise<boolean> {
	// lock the subject, drop the unchecked image as it was read, and record its object as pending, in one transaction
	const deletedAvatarKeys = toReplacedAvatarKeys([uncheckedAvatar.avatarKey], null)
	const isUncheckedImageDeleted = await db.transaction(async (transaction) => {
		await lockUncheckedImageSubject(transaction, uncheckedAvatar)
		if (!(await deleteUncheckedImageById(transaction, uncheckedAvatar))) {
			return false
		}
		await recordPendingObjectDeletions({ handle: transaction, objectKeys: deletedAvatarKeys })

		// clear the unchecked avatar on the user's row
		if (uncheckedAvatar.subjectKind === "userAvatar") {
			await transaction.update(users).set({ uncheckedAvatarKey: null }).where(eq(users.id, uncheckedAvatar.subjectId))
		}
		return true
	})

	// an unchecked image that is no longer the one that was read keeps its object
	if (!isUncheckedImageDeleted) {
		return false
	}

	// a user's sessions stop naming the unchecked avatar, then its object is deleted
	if (uncheckedAvatar.subjectKind === "userAvatar") {
		await refreshSessionUser(uncheckedAvatar.subjectId)
	}
	await deleteStoredObjects(deletedAvatarKeys)
	return true
}

// a user's avatar write: the user, the source and the stored object to point at, and the unchecked avatar the
// write publishes, if it publishes one
type WriteUserAvatarOptions = {
	userId: string
	avatarSource: (typeof avatarSources)[number]
	avatarKey: string | null
	publishedUncheckedAvatar?: UncheckedImageRow
}

// point a user at an avatar, drop their unchecked avatar, write the avatar to their sessions, and delete the objects
// nothing points at now. a write that publishes an unchecked avatar returns false and changes nothing unless the
// user's row still names that upload
async function writeUserAvatar({
	userId,
	avatarSource,
	avatarKey,
	publishedUncheckedAvatar,
}: WriteUserAvatarOptions): Promise<boolean> {
	const replacedAvatarKeys = await db.transaction(async (transaction) => {
		// lock the subject, then read the previous and the unchecked keys with the row locked
		const uncheckedImageSubject = { subjectKind: "userAvatar", subjectId: userId } as const
		await lockUncheckedImageSubject(transaction, uncheckedImageSubject)
		const [user] = await transaction
			.select({ avatarKey: users.avatarKey, uncheckedAvatarKey: users.uncheckedAvatarKey })
			.from(users)
			.where(eq(users.id, userId))
			.for("update")

		// an unchecked avatar is published only if the user's row still names it
		if (publishedUncheckedAvatar && user?.uncheckedAvatarKey !== publishedUncheckedAvatar.avatarKey) {
			return null
		}

		// drop the unchecked image, then record the replaced keys as pending
		await dropUncheckedAvatar(transaction, { uncheckedImageSubject, publishedUncheckedAvatar })
		const lockedReplacedAvatarKeys = toReplacedAvatarKeys([user?.avatarKey, user?.uncheckedAvatarKey], avatarKey)
		await recordPendingObjectDeletions({ handle: transaction, objectKeys: lockedReplacedAvatarKeys })

		// write the avatar
		await transaction
			.update(users)
			.set({ avatarSource, avatarKey, uncheckedAvatarKey: null })
			.where(eq(users.id, userId))

		// clear an uploaded key's pending row
		if (avatarKey) {
			await clearPendingObjectDeletion(avatarKey, transaction)
		}
		return lockedReplacedAvatarKeys
	})

	// an unchecked avatar that the user's row no longer names was not published
	if (!replacedAvatarKeys) {
		return false
	}

	// write the avatar to the user's sessions, then delete the replaced objects, which nothing points at now
	await refreshSessionUser(userId)
	await deleteStoredObjects(replacedAvatarKeys)
	return true
}

// a team's avatar write: the team, the stored object to point at or null for no avatar, and the unchecked avatar the
// write publishes, if it publishes one
type WriteTeamAvatarOptions = { teamId: string; avatarKey: string | null; publishedUncheckedAvatar?: UncheckedImageRow }

// point a team at an avatar, drop its unchecked avatar, and delete the objects nothing points at now. a write that
// publishes an unchecked avatar returns false and changes nothing unless the team is there and the unchecked image is
// still the one that was read
async function writeTeamAvatar({
	teamId,
	avatarKey,
	publishedUncheckedAvatar,
}: WriteTeamAvatarOptions): Promise<boolean> {
	const replacedAvatarKeys = await db.transaction(async (transaction) => {
		// lock the subject, then read the previous key with the row locked
		const uncheckedImageSubject = { subjectKind: "teamAvatar", subjectId: teamId } as const
		await lockUncheckedImageSubject(transaction, uncheckedImageSubject)
		const [team] = await transaction
			.select({ avatarKey: teams.avatarKey })
			.from(teams)
			.where(eq(teams.id, teamId))
			.for("update")

		// an unchecked avatar is published only to a team that is still there
		if (publishedUncheckedAvatar && !team) {
			return null
		}

		// drop the unchecked image. an unchecked avatar that is no longer the one that was read leaves nothing to publish
		const droppedUncheckedImage = await dropUncheckedAvatar(transaction, {
			uncheckedImageSubject,
			publishedUncheckedAvatar,
		})
		if (publishedUncheckedAvatar && !droppedUncheckedImage) {
			return null
		}

		// record the replaced keys as pending, then point the team at the new object
		const lockedReplacedAvatarKeys = toReplacedAvatarKeys(
			[team?.avatarKey, droppedUncheckedImage?.avatarKey],
			avatarKey,
		)
		await recordPendingObjectDeletions({ handle: transaction, objectKeys: lockedReplacedAvatarKeys })
		await transaction.update(teams).set({ avatarKey }).where(eq(teams.id, teamId))

		// clear an uploaded key's pending row
		if (avatarKey) {
			await clearPendingObjectDeletion(avatarKey, transaction)
		}
		return lockedReplacedAvatarKeys
	})

	// a team that is gone, or an unchecked avatar that is not the one read, publishes nothing
	if (!replacedAvatarKeys) {
		return false
	}

	// delete the replaced objects, which nothing points at now
	await deleteStoredObjects(replacedAvatarKeys)
	return true
}

// the unchecked image an avatar write drops: its subject, and the unchecked avatar the write publishes, if any
type DropUncheckedAvatarOptions = {
	uncheckedImageSubject: UncheckedImageSubject
	publishedUncheckedAvatar?: UncheckedImageRow
}

// drop a subject's unchecked avatar on the caller's transaction. a write that publishes an unchecked avatar drops it
// by its id and the time it was uploaded, and any other write drops whichever one the subject has. returns the dropped
// unchecked image, or null if nothing was dropped
function dropUncheckedAvatar(
	transaction: DbHandle,
	{ uncheckedImageSubject, publishedUncheckedAvatar }: DropUncheckedAvatarOptions,
): Promise<UncheckedImageRow | null> {
	return publishedUncheckedAvatar
		? deleteUncheckedImageById(transaction, publishedUncheckedAvatar)
		: deleteUncheckedImage(transaction, uncheckedImageSubject)
}

// the stored objects a write leaves with nothing pointing at them: each previous key that is set and is not the new one
function toReplacedAvatarKeys(previousAvatarKeys: (string | null | undefined)[], avatarKey: string | null): string[] {
	return previousAvatarKeys.filter(
		(previousAvatarKey): previousAvatarKey is string => Boolean(previousAvatarKey) && previousAvatarKey !== avatarKey,
	)
}
