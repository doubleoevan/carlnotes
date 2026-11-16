// the shared Journal section used by each prompt that reads topic memories
import { FALLBACK_PROMPT_TEMPLATES } from "./fetch"
import { writePrompt } from "./write"

/** Renders the background fragment with the topic memories and feedback in its untrusted block. */
export function writeTopicMemoryBackground(
	topicMemories: string,
	template = FALLBACK_PROMPT_TEMPLATES["topic-memory-background"],
): string {
	return writePrompt(template, { topicMemories })
}

/** Gives a previous registry version the background slot until the new templates are synced. */
export function toTopicMemoryPromptTemplate(template: string, topicMemoryBlock: string): string {
	if (template.includes("{{topicMemoryBlock}}") || !topicMemoryBlock) {
		return template
	}
	return `${template}\n\n{{topicMemoryBlock}}`
}
