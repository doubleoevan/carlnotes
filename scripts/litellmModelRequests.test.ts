import { expect, test } from "bun:test"
import { readSourceFiles } from "./sourceFiles"

// SDK provider construction and raw model routes are owned by the model package's shared transport and adapters
const LITELLM_REQUESTS_FILE = "packages/models/models.ts"
const LITELLM_KEY_API_FILE = "packages/models/litellmProxy.ts"
const MODEL_PROVIDER_IMPORT_PATTERN =
	/["'](?:@ai-sdk\/(?:openai(?:-compatible)?|anthropic|google(?:-vertex)?|gateway)|openai|@anthropic-ai\/sdk|@google\/genai)["']/
const SDK_GATEWAY_MODEL_PATTERN = /\bmodel:\s*["'`][\w-]+\/[\w.-]+/
const MODEL_HTTP_ENDPOINT_PATTERN =
	/api\.(?:openai|anthropic)\.com|api\.fireworks\.ai|generativelanguage\.googleapis\.com|\/(?:gemini\/v1beta|chat\/completions|moderations|embeddings)/
const FETCH_CALL_PATTERN = /\bfetch\s*\(/

test("model SDKs and direct inference requests use the shared LiteLLM transport", () => {
	// find provider construction or raw model HTTP requests that bypass the shared transport
	const sourceFiles = readSourceFiles(["apps", "packages", "evals", "scripts"])
	const bypasses = sourceFiles.filter(({ filePath, fileText }) => {
		if (filePath === LITELLM_REQUESTS_FILE || /(?:\.test|TestFixtures)\.tsx?$/.test(filePath)) {
			return false
		}

		// key management uses the same base URL for its admin requests
		const isModelHttpCall =
			MODEL_HTTP_ENDPOINT_PATTERN.test(fileText) ||
			(filePath !== LITELLM_KEY_API_FILE && fileText.includes("LITELLM_BASE_URL"))
		return (
			MODEL_PROVIDER_IMPORT_PATTERN.test(fileText) ||
			SDK_GATEWAY_MODEL_PATTERN.test(fileText) ||
			(isModelHttpCall && FETCH_CALL_PATTERN.test(fileText))
		)
	})

	// name each bypass so its caller can move onto the shared transport
	expect(bypasses.map(({ filePath }) => filePath)).toEqual([])
})

test("the local OpenCode client sends LiteLLM redaction for all of its models", async () => {
	const config = await Bun.file("opencode.json").json()
	expect(config.provider.litellm.options.headers["x-litellm-enable-message-redaction"]).toBe("true")
})
