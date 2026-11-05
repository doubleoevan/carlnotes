import { authClient } from "@carlnotes/client/authClient"
import type { PersonalSource } from "@carlnotes/contracts/personalSources"
import type { TopicResponse } from "@carlnotes/contracts/topics"
import type { ComponentProps, ReactNode } from "react"
import { usePersonalSource } from "../hooks/usePersonalSource"
import { useTopicPersonalSources } from "../hooks/useTopicPersonalSources"
import type { AiAgentAccountElements } from "./AiAgentAccountCard"
import { PersonalSourceCard, type PersonalSourceElements } from "./PersonalSourceCard"
import { PersonalSourcesAiAgentPicker } from "./PersonalSourcesAiAgentPicker"
import { TopicPersonalSourcesCard } from "./TopicPersonalSourcesCard"

export type TopicPersonalSourcesElements = Omit<AiAgentAccountElements, "Button"> & PersonalSourceElements
export type PersonalSourcesImportControlProps = {
	topicId: string
	isDisabled: boolean
	onImported: () => Promise<void>
}
export type TopicPersonalSourcesProps = {
	topic: TopicResponse
	elements: TopicPersonalSourcesElements
	renderImport: (props: PersonalSourcesImportControlProps) => ReactNode
	state?: Omit<ComponentProps<typeof TopicPersonalSourcesCard>, "elements">
}

/**
 * Restricts Personal sources controls to the current editor and retires all private state when account or Topic changes.
 */
export function TopicPersonalSources(props: TopicPersonalSourcesProps) {
	return props.state ? (
		<TopicPersonalSourcesCard {...props.state} elements={props.elements} />
	) : (
		<EditablePersonalSources {...props} />
	)
}

// scope live reads and controls to the signed-in editor
function EditablePersonalSources(props: TopicPersonalSourcesProps) {
	const { data: session } = authClient().useSession()
	return session && props.topic.canEdit ? (
		<PersonalSourcesInstance key={`${session.user.id}:${props.topic.id}`} userId={session.user.id} {...props} />
	) : null
}

// share loaded state and setup order while platforms supply only their controls
function PersonalSourcesInstance({
	userId,
	topic,
	elements,
	renderImport,
}: TopicPersonalSourcesProps & { userId: string }) {
	const personalSources = useTopicPersonalSources(topic)
	const handleChanged = async (): Promise<void> => {
		await personalSources.refetch()
	}
	return (
		<TopicPersonalSourcesCard
			elements={elements}
			personalSources={personalSources.data}
			isLoading={personalSources.isPending}
			hasError={personalSources.isError}
			onRetry={() => {
				void personalSources.refetch()
			}}
		>
			{/* entries remain readable while receiving is paused */}
			{personalSources.data?.sources.map((source) => (
				<LivePersonalSource
					key={source.id}
					topicId={topic.id}
					source={source}
					elements={elements}
					onChanged={handleChanged}
				/>
			))}
			{/* show setup when receiving is available */}
			{personalSources.data?.canReceive && (
				<PersonalSourcesAiAgentPicker
					userId={userId}
					topicId={topic.id}
					elements={elements}
					onChanged={handleChanged}
				/>
			)}
			{personalSources.data?.canReceive &&
				renderImport({ topicId: topic.id, isDisabled: false, onImported: handleChanged })}
		</TopicPersonalSourcesCard>
	)
}

// scope deletion to the mounted Source and account
function LivePersonalSource({
	topicId,
	source,
	elements,
	onChanged,
}: {
	topicId: string
	source: PersonalSource
	elements: TopicPersonalSourcesElements
	onChanged: () => Promise<void>
}) {
	const state = usePersonalSource({ topicId, source, onChanged })
	return <PersonalSourceCard source={source} state={state} elements={elements} />
}
