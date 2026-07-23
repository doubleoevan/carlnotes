// prompt templates are markdown files in this directory with YAML frontmatter for humans and a {{variable}} body for the model
// writing a prompt strips the frontmatter and template comments, then replaces each {{variable}} with its runtime value

// the frontmatter block at the top of every template. documentation only, never parsed at runtime.
// exported so that sync.ts can read individual fields from it without re-typing this pattern
export const FRONTMATTER_PATTERN = /^---\r?\n[\s\S]*?\r?\n---\r?\n/

// author-facing template comments, like the premium-tier markers. they never reach the model
const TEMPLATE_COMMENT_PATTERN = /<!--[\s\S]*?-->\r?\n?/g

// the premium-tier span with its markers and wording. not added to the prompt for the cheap tier
const PREMIUM_TIER_PATTERN = /<!-- premium-tier -->[\s\S]*?<!-- \/premium-tier -->\r?\n?/

/**
 * Writes the model-ready prompt
 * strips the template's frontmatter and comments, then interpolates the {{variable}} placeholders.
 */
export function writePrompt(template: string, variables: Record<string, string>): string {
	// strip the template plumbing before interpolation, so comments inside the variables' content survive untouched
	let prompt = template.replace(FRONTMATTER_PATTERN, "").replace(TEMPLATE_COMMENT_PATTERN, "")

	// replace each placeholder. the function replacement keeps dollar signs in values literal
	for (const [name, value] of Object.entries(variables)) {
		prompt = prompt.replaceAll(`{{${name}}}`, () => value)
	}
	return prompt.trim()
}

/**
 * Filters a prompt template's premium-tier content out.
 * it must be run before writePrompt, whose comment stripping removes the markers.
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
