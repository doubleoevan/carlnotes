// unsubscribe token tests: a signed token round-trips, and a tampered or garbage one is rejected
import { expect, test } from "bun:test"
import { signUnsubscribeToken, verifyUnsubscribeToken } from "./unsubscribe"

// a fixed secret so the HMAC signature is deterministic when the environment doesn't provide one
Bun.env.BETTER_AUTH_SECRET ??= "unsubscribe-test-secret"

// signing then verifying returns the payload, while a swapped payload or malformed token returns null
test("unsubscribe token round-trips and rejects tampering", async () => {
	// a freshly signed token decodes back to its payload
	const unsubscribeToken = await signUnsubscribeToken({ userId: "u1", topicId: "t1" })
	expect(await verifyUnsubscribeToken(unsubscribeToken)).toEqual({ userId: "u1", topicId: "t1" })

	// a payload swapped under the original signature fails verification
	const [, signature] = unsubscribeToken.split(".")
	const forged = `${Buffer.from(JSON.stringify({ userId: "u2", topicId: "t1" })).toString("base64url")}.${signature}`
	expect(await verifyUnsubscribeToken(forged)).toBeNull()

	// a malformed token fails too
	expect(await verifyUnsubscribeToken("not-a-token")).toBeNull()
})
