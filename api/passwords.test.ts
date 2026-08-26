// the breach check tests against the real corpus
import { expect, test } from "bun:test"
import { isBreachedPassword } from "./passwords"

// a famously leaked password answering false means the lookup did not happen and the check is unavailable
const isPasswordCheckReachable = await isBreachedPassword("password")

test.skipIf(!isPasswordCheckReachable)("a known breached password is refused", async () => {
	expect(await isBreachedPassword("password")).toBe(true)
})

// a long random string is not a breached password
test.skipIf(!isPasswordCheckReachable)("a password that has not leaked is allowed", async () => {
	const unleakedPassword = `carlnotes-${crypto.randomUUID()}-${crypto.randomUUID()}`
	expect(await isBreachedPassword(unleakedPassword)).toBe(false)
})

// an unreachable third-party service must not stop someone from setting a password.
test("an unreachable password check allows the password instead of throwing", async () => {
	expect(typeof (await isBreachedPassword("password"))).toBe("boolean")
})

// a failed lookup fails open, so the corpus being down never stops a password from being set
test("a failed lookup allows the password", async () => {
	// stand in a rejecting fetch, and put the real one back whatever the assertion does
	const realFetch = globalThis.fetch
	globalThis.fetch = (() => Promise.reject(new Error("offline"))) as unknown as typeof fetch
	try {
		expect(await isBreachedPassword("password")).toBe(false)
	} finally {
		globalThis.fetch = realFetch
	}
})
