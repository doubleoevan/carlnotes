// a prompt fragment that has no variables of its own
import { fetchPromptTemplate, type PromptName } from "./fetch"
import { writePrompt } from "./write"

/**
 * Returns a prompt fragment with no variables, written and ready for a parent prompt's trusted variables.
 */
export async function loadPromptFragment(fragmentName: PromptName): Promise<string> {
	const { template } = await fetchPromptTemplate(fragmentName)
	return writePrompt(template, {})
}
