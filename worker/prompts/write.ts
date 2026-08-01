// prompt templates are Markdown files in this directory with YAML frontmatter for humans and a {{variable}} body for the model
// writing a prompt strips the frontmatter and template comments, then replaces each {{variable}} with its runtime value
//
// the first variable map is untrusted and gets wrapped in a delimiter, so that page content, uploaded documents, and topic text
// read as data rather than as instructions. the second map is the app's own numbers and dates

// the frontmatter block at the top of every template. documentation only, never parsed at runtime.
// exported so that sync.ts can read individual fields from it without re-typing this pattern
export const FRONTMATTER_PATTERN = /^---\r?\n[\s\S]*?\r?\n---\r?\n/

// author-facing template comments, like the premium-tier markers. they never reach the model
const TEMPLATE_COMMENT_PATTERN = /<!--[\s\S]*?-->\r?\n?/g

// the premium-tier span with its markers and wording. not added to the prompt for the cheap tier
const PREMIUM_TIER_PATTERN = /<!-- premium-tier -->[\s\S]*?<!-- \/premium-tier -->\r?\n?/

// one {{variable}} placeholder in a template body
const PLACEHOLDER_PATTERN = /\{\{(\w+)\}\}/g

// the tag name of the delimiter that fences an untrusted value
const UNTRUSTED_DATA_TAG = "untrusted-data"

// a delimiter tag written by the value itself, with any nonce. stripped so a value cannot close its own delimiter
const FORGED_DELIMITER_PATTERN = /<\/?untrusted-data[^>]*>/gi

/**
 * Writes the model-ready prompt: strips the frontmatter and comments, then fills in each {{variable}}.
 * Untrusted values are wrapped in a delimiter.
 */
export function writePrompt(
	template: string,
	untrustedVariables: Record<string, string>,
	trustedVariables: Record<string, string> = {},
): string {
	// strip the frontmatter and comments first, so any comment inside a variable's value survives untouched
	const body = template.replace(FRONTMATTER_PATTERN, "").replace(TEMPLATE_COMMENT_PATTERN, "")

	// wrap every untrusted value in one random nonce, which a value's own text has no way to guess
	const nonce = crypto.randomUUID()
	const values: Record<string, string> = { ...trustedVariables }
	for (const [name, value] of Object.entries(untrustedVariables)) {
		values[name] = fenceUntrusted(value, nonce)
	}

	// fill every placeholder in one pass, so a {{variable}} inside a filled-in value is never itself filled in
	const prompt = body.replace(PLACEHOLDER_PATTERN, (placeholder, name) => values[name] ?? placeholder)
	return prompt.trim()
}

/**
 * Wraps an untrusted value in this call's delimiter, after removing the delimiter tags and backticks it carries,
 * so the value cannot close the delimiter around it.
 */
export function fenceUntrusted(value: string, nonce: string): string {
	const data = value.replace(FORGED_DELIMITER_PATTERN, "").replaceAll("`", "")
	return `<${UNTRUSTED_DATA_TAG}-${nonce}>\n${data}\n</${UNTRUSTED_DATA_TAG}-${nonce}>`
}

/**
 * Removes a template's premium-tier content. Run it before writePrompt, which strips the markers it looks for.
 */
export function filterPremiumPrompt(template: string): string {
	return template.replace(PREMIUM_TIER_PATTERN, "")
}

/**
 * Strips a template's frontmatter, keeping its template comments. Used to push a prompt body up to the registry.
 */
export function stripFrontmatter(template: string): string {
	return template.replace(FRONTMATTER_PATTERN, "")
}
