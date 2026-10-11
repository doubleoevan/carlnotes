// store tests: the object content key, the keys among nullable rows, and deleteStoredObject, whose failed delete
// leaves the key pending with its failure and whose successful delete clears the key
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { restoreConnectionPool, stubConnectionPool } from "../db/connectionPoolStub"
import { deleteStoredObject, toResourceContentKey, toStoredObjectKeys } from "./store"

// the endpoint the environment had
const originalEndpoint = Bun.env.S3_ENDPOINT

// put the pool, the spies, and the endpoint back after each test
afterEach(() => {
	restoreConnectionPool()
	mock.restore()

	// an endpoint the environment never set stays unset
	if (originalEndpoint === undefined) {
		delete Bun.env.S3_ENDPOINT
	} else {
		Bun.env.S3_ENDPOINT = originalEndpoint
	}
})

// the resource content key is stable and namespaced by resource id, mirroring the attachment key layout
test("resourceContentKey namespaces content under the resource id", () => {
	expect(toResourceContentKey("abc123")).toBe("resources/abc123/content.md")
	expect(toResourceContentKey("abc123")).toBe(toResourceContentKey("abc123"))
})

// a row still uploading has no key yet, and the keys that exist are returned in order
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
