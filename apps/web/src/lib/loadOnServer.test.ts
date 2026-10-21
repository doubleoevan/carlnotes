// a server read with a degraded fallback returns its value, or the fallback if it fails, and a failure outside a
// request throws no error
import { expect, test } from "bun:test"
import { readWithDegradedFallback } from "./loadOnServer"

test("a read that succeeds returns its value", async () => {
	expect(await readWithDegradedFallback(async () => "feed", null)).toBe("feed")
})

test("a read that fails returns the fallback without throwing outside a request", async () => {
	const failingRead = async (): Promise<string> => {
		throw new Error("the api is restarting")
	}
	expect(await readWithDegradedFallback(failingRead, null)).toBeNull()
})
