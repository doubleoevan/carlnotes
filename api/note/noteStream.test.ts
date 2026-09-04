// broker tests for the in-process note fan-out
import { expect, test } from "bun:test"
import { notifyNoteUpdate, onNoteUpdate, toDirectConnectionString } from "./noteStream"

// a local notify delivers the update bytes straight to this instance's subscribers
test("a subscriber receives a locally merged update", async () => {
	// collect what the subscriber sees
	const received: (string | null)[] = []
	const stopListening = onNoteUpdate("n1", (update) => received.push(update))

	// the local emit is synchronous even when the cross-instance notify cannot reach a database
	await notifyNoteUpdate("n1", "dXBkYXRl")
	expect(received).toEqual(["dXBkYXRl"])
	stopListening()
})

// unsubscribing stops delivery, and other notes never leak in
test("unsubscribe stops delivery and keys stay per note", async () => {
	// two subscribers on two notes
	const receivedA: (string | null)[] = []
	const receivedB: (string | null)[] = []
	const stopA = onNoteUpdate("na", (update) => receivedA.push(update))
	const stopB = onNoteUpdate("nb", (update) => receivedB.push(update))

	// only the matching key delivers
	await notifyNoteUpdate("na", "one")
	expect(receivedA).toEqual(["one"])
	expect(receivedB).toEqual([])

	// after unsubscribing, nothing more arrives
	stopA()
	await notifyNoteUpdate("na", "two")
	expect(receivedA).toEqual(["one"])
	stopB()
})

// neon's pooler accepts a LISTEN and then delivers no notifications, and raises no error doing it.
// a pooled url here would silently stop note edits from reaching the app's other instances
test("toDirectConnectionString never hands LISTEN a pooled host", () => {
	const original = { direct: process.env.DATABASE_URL_DIRECT, databaseUrl: process.env.DATABASE_URL }
	try {
		// the direct url wins outright when it is configured
		process.env.DATABASE_URL_DIRECT = "postgres://user@ep-cool-1.us-east-2.aws.neon.tech/carlnotes"
		process.env.DATABASE_URL = "postgres://user@ep-cool-1-pooler.us-east-2.aws.neon.tech/carlnotes"
		expect(toDirectConnectionString()).toBe("postgres://user@ep-cool-1.us-east-2.aws.neon.tech/carlnotes")

		// without one, the pooled host is rewritten to its direct form
		process.env.DATABASE_URL_DIRECT = ""
		expect(toDirectConnectionString()).toBe("postgres://user@ep-cool-1.us-east-2.aws.neon.tech/carlnotes")
		expect(toDirectConnectionString()).not.toContain("-pooler.")

		// no database at all means no listener to start, instead of a broken connection string
		process.env.DATABASE_URL = ""
		expect(toDirectConnectionString()).toBeFalsy()
	} finally {
		// an absent variable is restored by removing it, since "" is a value the code reads differently
		if (original.direct === undefined) {
			delete process.env.DATABASE_URL_DIRECT
		} else {
			process.env.DATABASE_URL_DIRECT = original.direct
		}
		if (original.databaseUrl === undefined) {
			delete process.env.DATABASE_URL
		} else {
			process.env.DATABASE_URL = original.databaseUrl
		}
	}
})
