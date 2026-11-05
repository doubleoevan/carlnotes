import { expect, test } from "bun:test"
import { buildPersonalSourcesContextPrompt } from "@carlnotes/pipeline/personalSources/contextPrompt"
import { checkPersonalSourcesContext, PERSONAL_SOURCES_CONTEXT_CASES } from "./personalSourcesContextCases"

test("all evaluation fixtures build bounded prompts without exposing deleted content or unresolved placeholders", async () => {
	for (const fixture of PERSONAL_SOURCES_CONTEXT_CASES) {
		const { prompt } = await buildPersonalSourcesContextPrompt(fixture)
		expect(prompt.length).toBeLessThan(84_000)
		expect(prompt).not.toContain("DELETED_PRIVATE_CANARY")
		expect(prompt).not.toContain("{{")
	}
})

test("deterministic evaluation checks reject empty, oversized, and injected output", () => {
	expect(checkPersonalSourcesContext("Useful replay evaluation context")).toBeUndefined()
	for (const output of ["", "x".repeat(8001), "PUBLISH_PUBLIC_NOW", "DELETED_PRIVATE_CANARY", "{{entries}}"]) {
		expect(checkPersonalSourcesContext(output)).toBeDefined()
	}
})
