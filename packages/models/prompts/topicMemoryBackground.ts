// the shared Journal section used by each prompt that reads takeaways
import { FALLBACK_PROMPT_TEMPLATES } from "./fetch"
import { writePrompt } from "./write"

/** Renders the background fragment with the takeaways and feedback in its untrusted block. */
export function writeTopicMemoryBackground(
	takeaways: string,
	template = FALLBACK_PROMPT_TEMPLATES["topic-memory-background"],
): string {
	return writePrompt(template, { takeaways })
}

/** Gives a previous registry version the background slot until the new templates are synced. */
export function toTopicMemoryPromptTemplate(template: string, topicMemoryBlock: string): string {
	if (template.includes("{{topicMemoryBlock}}") || !topicMemoryBlock) {
		return template
	}
	return `${template}\n\n{{topicMemoryBlock}}`
}
