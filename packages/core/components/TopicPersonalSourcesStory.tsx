import { toTestTopicResponse } from "@carlnotes/contracts/topicFeedTestFixtures"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import type { ComponentType } from "react"
import {
	PERSONAL_SOURCES_SOURCE_STORY,
	TOPIC_PERSONAL_SOURCES_STORY,
	usePersonalSourceStory,
} from "../lib/personalSourcesStories"
import { PersonalSourceCard } from "./PersonalSourceCard"
import type { TopicPersonalSourcesElements, TopicPersonalSourcesProps } from "./TopicPersonalSources"

// every platform uses the same loaded settings and receiving fixture
export type TopicPersonalSourcesStoryProps = {
	Component: ComponentType<{ topic: TopicResponse; state?: TopicPersonalSourcesProps["state"] }>
	elements: TopicPersonalSourcesElements
	variant?: "ready" | "empty" | "loading" | "failed"
}

/**
 * Supplies the same loaded settings fixture to each platform's real component.
 */
export function TopicPersonalSourcesStory({ Component, elements, variant = "ready" }: TopicPersonalSourcesStoryProps) {
	// keep Source deletion local to the story
	const sourceState = usePersonalSourceStory(variant)
	const personalSources =
		variant === "empty" ? { ...TOPIC_PERSONAL_SOURCES_STORY, sources: [] } : TOPIC_PERSONAL_SOURCES_STORY
	return (
		<Component
			topic={toTestTopicResponse({ visibility: "private", isTopicOwner: true })}
			state={{
				personalSources,
				isLoading: variant === "loading",
				hasError: variant === "failed",
				onRetry: () => {},
				children: (
					<>
						{variant === "ready" && (
							<PersonalSourceCard source={PERSONAL_SOURCES_SOURCE_STORY} state={sourceState} elements={elements} />
						)}
					</>
				),
			}}
		/>
	)
}
