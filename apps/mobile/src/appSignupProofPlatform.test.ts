// app signup proof platform tests: which proof a build sends
import { expect, test } from "bun:test"
import { toAppSignupProofPlatform } from "./appSignupProofPlatform"

// a development build sends the development proof on either platform
test("a development build sends the development proof", () => {
	expect(toAppSignupProofPlatform({ isDevelopment: true, os: "ios" })).toBe("development")
	expect(toAppSignupProofPlatform({ isDevelopment: true, os: "android" })).toBe("development")
})

// a release build attests on its platform, and a platform with no attestation sends nothing
test("a release build sends its platform's attestation", () => {
	expect(toAppSignupProofPlatform({ isDevelopment: false, os: "ios" })).toBe("ios")
	expect(toAppSignupProofPlatform({ isDevelopment: false, os: "android" })).toBe("android")
	expect(toAppSignupProofPlatform({ isDevelopment: false, os: "web" })).toBeNull()
})
