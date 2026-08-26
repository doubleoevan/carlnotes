// this script pushes each prompt's bundled template up to Langfuse
// run this with bun run prompts:sync. it needs LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY set to work
import { LangfuseClient } from "@langfuse/client"
import { FALLBACK_PROMPT_TEMPLATES, type PromptName } from "./fetch.ts"
import { FRONTMATTER_PATTERN, stripFrontmatter } from "./write.ts"

// require both keys up front. a silent no-op would be worse than the loud failure of an owner-run script
if (!Bun.env.LANGFUSE_PUBLIC_KEY || !Bun.env.LANGFUSE_SECRET_KEY) {
	throw new Error("LANGFUSE_PUBLIC_KEY and LANGFUSE_SECRET_KEY must be set to sync prompts")
}

const client = new LangfuseClient()

// the label this run writes, and the one it compares against so a re-run can still report "unchanged"
const syncLabel = Bun.argv.includes("--candidate") ? "candidate" : "production"

// which Doppler environment supplied the keys, and so which Langfuse project this script writes to, dev or prd.
const syncEnvironment = Bun.env.DOPPLER_ENVIRONMENT ?? "an unnamed environment"

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
		`synced ${promptNames.length} prompts to ${syncEnvironment} as ${syncLabel}: ${createdCount} created, ${updatedCount} updated, ${unchangedCount} unchanged`,
	)

	// a candidate run changes nothing live, so it says what still has to happen for the wording to reach users
	if (syncLabel === "candidate" && createdCount + updatedCount > 0) {
		console.log("these are candidates. promote them to production in Langfuse once a real scan's note reads right")
	}
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

	// what this label currently holds, or null if this prompt has never been synced under it
	const labeledPrompt = await fetchLabeledPrompt(name)

	// the prompt is unchanged only when both the body text and the config (version, model tier) match a config-only
	const isUnchanged =
		labeledPrompt !== null &&
		labeledPrompt.prompt === body &&
		labeledPrompt.config.version === config.version &&
		labeledPrompt.config.modelTier === config.modelTier
	if (isUnchanged) {
		return "unchanged"
	}

	// push a new version of the prompt under this run's label
	await client.prompt.create({ name, prompt: body, type: "text", labels: [syncLabel], config })
	return labeledPrompt === null ? "created" : "updated"
}

// what this run's label currently holds, or null if this prompt has never been synced under it
async function fetchLabeledPrompt(promptName: PromptName): Promise<{ prompt: string; config: PromptConfig } | null> {
	try {
		// fetch this run's label from the registry with caching disabled
		const prompt = await client.prompt.get(promptName, { label: syncLabel, cacheTtlSeconds: 0 })
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
