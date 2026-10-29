// tests for the Terms version: which accepted versions are current, and the rejection body a stale account gets
import { expect, test } from "bun:test"
import { isTermsOutdatedResponse, isTermsVersionCurrent, TERMS_VERSION } from "./terms"

// only the published version is current. null is an account that never accepted, and undefined is an api with no
// version to compare, which asks for nothing
test("the published version alone is current", () => {
	expect(isTermsVersionCurrent(TERMS_VERSION)).toBe(true)
	expect(isTermsVersionCurrent("2026-01-01")).toBe(false)
	expect(isTermsVersionCurrent(null)).toBe(false)
	expect(isTermsVersionCurrent(undefined)).toBe(true)
})

// the version is a date, so the Terms page's first line and the constant can be compared by eye
test("the version is a calendar date", () => {
	expect(TERMS_VERSION).toMatch(/^\d{4}-\d{2}-\d{2}$/)
})

// the rejection body is recognized by its marker
test("the terms-outdated response is recognized", () => {
	expect(isTermsOutdatedResponse({ rejection: "termsOutdated", termsVersion: TERMS_VERSION })).toBe(true)
	expect(isTermsOutdatedResponse({ rejection: "objectionable", category: "hate" })).toBe(false)
})
