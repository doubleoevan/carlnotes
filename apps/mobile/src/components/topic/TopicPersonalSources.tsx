import type { TopicResponse } from "@carlnotes/contracts/topics"
import {
	TopicPersonalSources as SharedTopicPersonalSources,
	type TopicPersonalSourcesProps,
} from "@carlnotes/core/components/TopicPersonalSources"
import { PersonalSourcesImportButton } from "./PersonalSourcesImportButton"
import { PERSONAL_SOURCES_ELEMENTS } from "./personalSourcesElements"

/**
 * Adapts the shared personal sources to native controls with an explicit web-only import explanation.
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
