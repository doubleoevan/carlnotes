import type { TopicResponse } from "@carlnotes/contracts/topics"
import {
	TopicPersonalSources as SharedTopicPersonalSources,
	type TopicPersonalSourcesProps,
} from "@carlnotes/core/components/TopicPersonalSources"
import { PersonalSourcesImportButton } from "./PersonalSourcesImportButton"
import { PERSONAL_SOURCES_ELEMENTS } from "./personalSourcesElements"

/**
 * Adapts the personal sources to browser controls and local conversation imports.
 */
export function TopicPersonalSources({
	topic,
	state,
}: {
	topic: TopicResponse
	state?: TopicPersonalSourcesProps["state"]
}) {
	return (
		<SharedTopicPersonalSources
			topic={topic}
			state={state}
			elements={PERSONAL_SOURCES_ELEMENTS}
			renderImport={(props) => <PersonalSourcesImportButton {...props} />}
		/>
	)
}
