// fetch.ts tests for the no-key prompt fallback path and the registry's variable drift
import { expect, spyOn, test } from "bun:test"
import * as monitoring from "@carlnotes/server/monitoring"
import { saveEnvSettings } from "@carlnotes/server/savedEnvSettings"
import { PromptManager } from "@langfuse/client"
import { FALLBACK_PROMPT_TEMPLATES, fetchPromptTemplate, hasSameVariables } from "./fetch"

// without Langfuse keys, every prompt name resolves to its fallback Markdown with no registry link
test("fetchPromptTemplate returns the bundled template unmodified when Langfuse keys are unset", async () => {
	// clear both keys so the run is deterministic regardless of the calling shell's environment
	const restoreEnvSettings = saveEnvSettings(["LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY"])
	delete Bun.env.LANGFUSE_PUBLIC_KEY
	delete Bun.env.LANGFUSE_SECRET_KEY

	// fetch every fallback prompt name, restoring the environment regardless of the outcome
	try {
		const promptNames = Object.keys(FALLBACK_PROMPT_TEMPLATES) as (keyof typeof FALLBACK_PROMPT_TEMPLATES)[]
		for (const name of promptNames) {
			// each name resolves to its fallback template with no registry link
			const promptTemplate = await fetchPromptTemplate(name)
			expect(promptTemplate.template).toBe(FALLBACK_PROMPT_TEMPLATES[name])
			expect(promptTemplate.name).toBe(name)
			expect(promptTemplate.registryPrompt).toBeUndefined()
		}
	} finally {
		// restore whatever keys the calling shell had set, even when the test threw
		restoreEnvSettings()
	}
})

// a registry prompt asking for different variables serves the bundled template on every call, logs every call, and
// reports to Sentry once per prompt name for the process, so a real drift alerts and its repeats stop
test("fetchPromptTemplate reports a prompt's variable drift once per process and logs every call", async () => {
	// fake keys reach the registry, whose prompt get is stubbed to serve a template with a renamed variable
	const restoreEnvSettings = saveEnvSettings(["LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY"])
	Bun.env.LANGFUSE_PUBLIC_KEY = "pk-test"
	Bun.env.LANGFUSE_SECRET_KEY = "sk-test"
	// stub the registry's prompt get, and quiet the log and the report so their call counts are the assertion
	const promptGetSpy = spyOn(PromptManager.prototype, "get").mockImplementation((async (name: string) => ({
		name,
		version: 9,
		prompt: "{{renamedVariable}}",
		isFallback: false,
	})) as unknown as PromptManager["get"])
	const consoleErrorSpy = spyOn(console, "error").mockImplementation(() => {})
	const reportErrorSpy = spyOn(monitoring, "reportError").mockImplementation(() => {})

	// fetch one prompt twice and a second prompt once, restoring everything regardless of the outcome
	try {
		for (const name of ["chat-conduct", "chat-conduct", "chat-docs-guide"] as const) {
			const promptTemplate = await fetchPromptTemplate(name)
			expect(promptTemplate.template).toBe(FALLBACK_PROMPT_TEMPLATES[name])
			expect(promptTemplate.registryPrompt).toBeUndefined()
		}

		// every call logs, and each prompt name reports once
		expect(consoleErrorSpy).toHaveBeenCalledTimes(3)
		expect(reportErrorSpy).toHaveBeenCalledTimes(2)
		expect(reportErrorSpy.mock.calls.map((call) => call[2]?.prompt)).toEqual(["chat-conduct", "chat-docs-guide"])
	} finally {
		// put the registry, the log, the report, and the keys back, even if the test threw
		promptGetSpy.mockRestore()
		consoleErrorSpy.mockRestore()
		reportErrorSpy.mockRestore()
		restoreEnvSettings()
	}
})

// the prompt registry is for editing wording between deploys, not for changing which variables a prompt takes
test("hasSameVariables spots a renamed prompt variable", () => {
	expect(hasSameVariables("Kept:\n{{keptFindingsBlock}}", "Kept:\n{{keptResourcesBlock}}")).toBe(false)
})

// wording, order, and repeats are exactly what the prompt registry is allowed to change
test("hasSameVariables ignores wording, order, and repeats", () => {
	expect(hasSameVariables("{{a}} then {{b}}", "Rewritten: {{b}}, {{a}} again {{a}}")).toBe(true)
})

// every bundled prompt template is its own contract, so each must agree with itself
test("every bundled prompt template agrees with itself", () => {
	for (const [name, template] of Object.entries(FALLBACK_PROMPT_TEMPLATES)) {
		expect(hasSameVariables(template, template), `${name} must match itself`).toBe(true)
	}
})
