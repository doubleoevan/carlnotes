// this script pushes each prompt's fallback template up to Langfuse as a production-labeled version. git stays canonical.
// this script is the only writer, so a prompt edited in the Langfuse UI is an experiment that the next run overwrites
// run this with bun run prompts:sync. it needs LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY set to work
import { LangfuseClient } from "@langfuse/client"
import { FALLBACK_PROMPT_TEMPLATES, type PromptName } from "./fetch.ts"
import { FRONTMATTER_PATTERN, stripFrontmatter } from "./write.ts"

// require both keys up front. a silent no-op would be worse than the loud failure of an owner-run script
if (!Bun.env.LANGFUSE_PUBLIC_KEY || !Bun.env.LANGFUSE_SECRET_KEY) {
	throw new Error("LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY must be set to sync prompts")
}

const client = new LangfuseClient()

// the config fields Langfuse stores alongside a prompt version, read back to detect a config-only change
type PromptConfig = { version?: number; modelTier?: string }

/**
 * Syncs every codebase prompt to Langfuse and logs created, updated, and unchanged counts.
 */
async function syncPrompts(): Promise<void> {
	// gather each prompt's outcome as it syncs
	const promptNames = Object.keys(FALLBACK_PROMPT_TEMPLATES) as PromptName[]
	const outcomes = await Promise.all(promptNames.map(syncPrompt))

	// report the totals so a re-run's "0 created, 0 updated, # unchanged" can confirm that nothing drifted
	const createdCount = outcomes.filter((outcome) => outcome === "created").length
	const updatedCount = outcomes.filter((outcome) => outcome === "updated").length
	const unchangedCount = outcomes.filter((outcome) => outcome === "unchanged").length
	console.log(
		`synced ${promptNames.length} prompts: ${createdCount} created, ${updatedCount} updated, ${unchangedCount} unchanged`,
	)
}

// sync one prompt, creating it if missing, pushing a new version if the body changed, or reporting it unchanged
async function syncPrompt(name: PromptName): Promise<"created" | "updated" | "unchanged"> {
	// the body Langfuse stores drops the frontmatter but keeps the premium-tier markers which matches what the worker fetches
	const template = FALLBACK_PROMPT_TEMPLATES[name]
	const body = stripFrontmatter(template)

	// carry the frontmatter's version and model tier as config, for cross-referencing a trace back to its wording
	const config = {
		version: Number(readFrontmatterField(template, "version")),
		modelTier: readFrontmatterField(template, "model tier"),
	}

	// the current production prompt version, or null if this prompt has never been synced
	const productionPrompt = await fetchProductionPrompt(name)

	// the prompt is unchanged only when both the body text and the config (version, model tier) match
	// a config-only bump requires a new version even if the wording didn't change
	const isUnchanged =
		productionPrompt !== null &&
		productionPrompt.prompt === body &&
		productionPrompt.config.version === config.version &&
		productionPrompt.config.modelTier === config.modelTier
	if (isUnchanged) {
		return "unchanged"
	}

	// push a new production version of the prompt
	await client.prompt.create({ name, prompt: body, type: "text", labels: ["production"], config })
	return productionPrompt === null ? "created" : "updated"
}

// the current production version's body and config, or null if the prompt has never been synced
async function fetchProductionPrompt(promptName: PromptName): Promise<{ prompt: string; config: PromptConfig } | null> {
	try {
		// fetch the production version from the registry with caching disabled
		const prompt = await client.prompt.get(promptName, { label: "production", cacheTtlSeconds: 0 })
		return { prompt: prompt.prompt, config: (prompt.config ?? {}) as PromptConfig }
	} catch {
		// most commonly a 404 for a never-synced prompt. any other failure surfaces loudly at create() instead
		return null
	}
}

// read a "key: value" line from a template's frontmatter block only, never from the prompt body
function readFrontmatterField(template: string, key: string): string {
	const frontmatter = template.match(FRONTMATTER_PATTERN)?.[0] ?? ""
	const match = frontmatter.match(new RegExp(`^${key}:\\s*(.+)$`, "m"))
	if (!match?.[1]) {
		throw new Error(`prompt frontmatter is missing the "${key}" field`)
	}
	return match[1].trim()
}

await syncPrompts()
