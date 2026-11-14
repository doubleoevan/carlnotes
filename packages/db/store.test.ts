// store tests: the object content key, the keys among nullable rows, deleteStoredObject, whose failed delete
// leaves the key pending with its failure and whose successful delete clears the key, the clear that counts the keys
// that were pending, and deletePendingStoredObjects, which deletes only the keys still pending
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { restoreConnectionPool, stubConnectionPool } from "./connectionPoolStub"
import { db } from "./index"
import {
	clearPendingObjectDeletions,
	deletePendingStoredObjects,
	deleteStoredObject,
	toResourceContentKey,
	toResourceImageKey,
	toStoredObjectKeys,
} from "./store"

// save the endpoint the environment had
const restoreEnvSettings = saveEnvSettings(["S3_ENDPOINT"])

// put the pool, the spies, and the endpoint back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()
	restoreEnvSettings()
})

// the resource content key is stable and namespaced by resource id, mirroring the attachment key layout
test("resourceContentKey namespaces content under the resource id", () => {
	expect(toResourceContentKey("abc123")).toBe("resources/abc123/content.md")
	expect(toResourceContentKey("abc123")).toBe(toResourceContentKey("abc123"))
})

// a Resource's images sit beside its content, one key for each position
test("toResourceImageKey namespaces an image under the resource id by its position", () => {
	expect(toResourceImageKey("abc123", 0)).toBe("resources/abc123/images/0.jpg")
	expect(toResourceImageKey("abc123", 5)).toBe("resources/abc123/images/5.jpg")
})

test("toStoredObjectKeys keeps the keys and drops the nulls", () => {
	expect(toStoredObjectKeys([{ objectKey: "a" }, { objectKey: null }, { objectKey: "b" }])).toEqual(["a", "b"])
})

// a failed delete is logged, and the key's pending row keeps the failure with its next try pushed back
test("a failed delete leaves the key pending with its failure", async () => {
	// an unconfigured bucket, so the delete fails before it reaches storage, and a pool that records the writes
	Bun.env.S3_ENDPOINT = ""
	const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
	const sentQueries = stubConnectionPool()

	// the delete reports its failure and writes it to the pending row, and clears nothing
	expect(await deleteStoredObject("topics/topic-1/attachments/attachment-1/notes.pdf")).toBe(false)
	expect(consoleErrorSpy).toHaveBeenCalledTimes(1)
	expect(sentQueries).toHaveLength(1)
	expect(sentQueries[0]?.text).toStartWith('update "pending_object_deletions"')
	expect(sentQueries[0]?.text).toContain("least(power(2,")
	expect(sentQueries[0]?.values).toContain("topics/topic-1/attachments/attachment-1/notes.pdf")
})

// a successful delete, of a present object or of one already gone, clears the key's pending row
test("a successful delete clears the key", async () => {
	// a configured bucket whose every delete succeeds
	Bun.env.S3_ENDPOINT = "https://bucket.example"
	Bun.env.S3_REGION ??= "auto"
	Bun.env.S3_BUCKET ??= "test"
	Bun.env.S3_ACCESS_KEY_ID ??= "key"
	Bun.env.S3_SECRET_ACCESS_KEY ??= "secret"
	spyOn(Bun.S3Client.prototype, "delete").mockResolvedValue(undefined)

	// a pool that records the writes
	const sentQueries = stubConnectionPool()

	// the delete succeeds and deletes the pending row alone
	expect(await deleteStoredObject("avatars/user-1/3f2a.png")).toBe(true)
	expect(sentQueries).toHaveLength(1)
	expect(sentQueries[0]?.text).toStartWith('delete from "pending_object_deletions"')
	expect(sentQueries[0]?.values).toEqual(["avatars/user-1/3f2a.png"])
})

// a save that names keys learns from the count that their objects were pending deletion
test("a clear of several keys returns how many were pending", async () => {
	const sentQueries = stubConnectionPool(() => [["images/a.jpg"]])
	expect(await clearPendingObjectDeletions(["images/a.jpg", "images/b.jpg"])).toBe(1)
	expect(sentQueries[0]?.text).toStartWith('delete from "pending_object_deletions"')
	expect(sentQueries[0]?.values).toEqual(["images/a.jpg", "images/b.jpg"])
	expect(await clearPendingObjectDeletions([])).toBe(0)
})

// a save of the same keys cleared their rows, so the objects it stored stay
test("a delete of pending objects skips a key that is no longer pending and records each deleted key again", async () => {
	// a configured bucket whose every delete succeeds, and a pool where the second and third keys are still pending
	Bun.env.S3_ENDPOINT = "https://bucket.example"
	const bucketDeleteSpy = spyOn(Bun.S3Client.prototype, "delete").mockResolvedValue(undefined)
	const sentQueries = stubConnectionPool(({ text }) =>
		text.startsWith("select") ? [["images/b.jpg"], ["images/c.jpg"]] : [],
	)
	await deletePendingStoredObjects(["images/a.jpg", "images/b.jpg", "images/c.jpg"], db)

	// the keys still pending are deleted in the order given, and are recorded again with a later try
	expect(bucketDeleteSpy.mock.calls.map(([objectKey]) => objectKey)).toEqual(["images/b.jpg", "images/c.jpg"])
	const recordedKeys = sentQueries.find(({ text }) => text.startsWith('insert into "pending_object_deletions"'))
	expect(recordedKeys?.values).toContain("images/b.jpg")
	expect(recordedKeys?.values).toContain("images/c.jpg")
	expect(recordedKeys?.values).not.toContain("images/a.jpg")
})

// the first object is the one a save looks for, so the others stay if it could not be deleted
test("a delete of pending objects keeps every object if the first delete fails", async () => {
	// an unconfigured bucket, so the first delete fails before it reaches storage
	Bun.env.S3_ENDPOINT = ""
	spyOn(console, "error").mockImplementation(() => {})
	const sentQueries = stubConnectionPool(({ text }) =>
		text.startsWith("select") ? [["images/a.jpg"], ["images/b.jpg"]] : [],
	)
	await deletePendingStoredObjects(["images/a.jpg", "images/b.jpg"], db)

	// the failure is written to the first key's row, and nothing else is deleted or recorded
	expect(sentQueries.map(({ text }) => text.split(" ")[0])).toEqual(["select", "update"])
	expect(sentQueries[1]?.values).toContain("images/a.jpg")
})
