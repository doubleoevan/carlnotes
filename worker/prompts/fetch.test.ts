// fetch.ts tests for the no-key prompt fallback path
import { expect, test } from "bun:test"
import { FALLBACK_PROMPT_TEMPLATES, fetchPromptTemplate } from "./fetch"

// without Langfuse keys, every prompt name resolves to its fallback Markdown with no registry link
test("fetchPromptTemplate returns the bundled template unmodified when Langfuse keys are unset", async () => {
	// clear both keys so the run is deterministic regardless of the calling shell's environment
	const previousPublicKey = Bun.env.LANGFUSE_PUBLIC_KEY
	const previousSecretKey = Bun.env.LANGFUSE_SECRET_KEY
	Bun.env.LANGFUSE_PUBLIC_KEY = undefined
	Bun.env.LANGFUSE_SECRET_KEY = undefined

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
		// restore whatever keys the calling shell had set, even if an assertion above threw
		Bun.env.LANGFUSE_PUBLIC_KEY = previousPublicKey
		Bun.env.LANGFUSE_SECRET_KEY = previousSecretKey
	}
})
