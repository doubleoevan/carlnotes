import type { TopicDetails } from "@carlnotes/contracts/topics"
import { TopicPersonalSourcesSection as SharedTopicPersonalSourcesSection } from "@carlnotes/core/components/TopicPersonalSourcesSection"
import { copyToClipboard } from "@/lib/utils"
import { PERSONAL_SOURCES_ELEMENTS } from "./personalSourcesElements"

/**
 * Adapts the shared sender-only section for Topic info and Artisanal Blend.
 */
export function TopicPersonalSourcesSection({ topic, className }: { topic: TopicDetails; className?: string }) {
	return (
		<SharedTopicPersonalSourcesSection
			topic={topic}
			className={className}
			elements={PERSONAL_SOURCES_ELEMENTS}
			onCopy={copyToClipboard}
		/>
	)
}
