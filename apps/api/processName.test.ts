// the name the api's entry runs under
import { expect, test } from "bun:test"
import { readApiProcessName } from "./processName"

test("the entry runs as api unless PROCESS_NAME names web, and a typo stops the boot", () => {
	expect(readApiProcessName(undefined)).toBe("api")
	expect(readApiProcessName("")).toBe("api")
	expect(readApiProcessName("api")).toBe("api")
	expect(readApiProcessName("web")).toBe("web")
	expect(() => readApiProcessName("wbe")).toThrow("PROCESS_NAME must be api, web, or unset")
})
