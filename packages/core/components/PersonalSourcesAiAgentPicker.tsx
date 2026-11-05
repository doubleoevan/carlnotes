import {
	fetchConnectedAiAgents,
	fetchPersonalSourcesConnectionNudge,
	sendDismissPersonalSourcesNudge,
} from "@carlnotes/client/aiAgentClient"
import {
	fetchPersonalSourcesAiAgentRecommendations,
	sendAddPersonalSourcesAiAgent,
} from "@carlnotes/client/personalSourcesClient"
import { useQuery } from "@tanstack/react-query"
import { useRef, useState } from "react"
import type { AiAgentAccountElements } from "./AiAgentAccountCard"

type PersonalSourcesAiAgentPickerProps = {
	userId: string
	topicId: string
	elements: Pick<AiAgentAccountElements, "Group" | "Heading" | "Text" | "Button">
	onChanged: () => Promise<void>
}

/**
 * Offers live connected apps and an explicit, dismissible setup nudge without sending any content.
 */
export function PersonalSourcesAiAgentPicker({
	userId,
	topicId,
	elements,
	onChanged,
}: PersonalSourcesAiAgentPickerProps) {
	// connection metadata and the consent notice share no private content with this picker
	const { Group, Heading, Text, Button } = elements
	const aiAgents = useQuery({
		queryKey: ["personalSources-ai-agents", userId],
		queryFn: fetchConnectedAiAgents,
		gcTime: 0,
	})
	const nudge = useQuery({
		queryKey: ["personalSources-nudge", userId],
		queryFn: fetchPersonalSourcesConnectionNudge,
		gcTime: 0,
	})
	const recommendations = useQuery({
		queryKey: ["personalSources-ai-agent-recommendations", userId, topicId],
		queryFn: () => fetchPersonalSourcesAiAgentRecommendations(topicId),
		gcTime: 0,
		staleTime: 60_000,
	})
	const [error, setError] = useState<string | null>(null)
	const [isPending, setIsPending] = useState(false)
	const isMutating = useRef(false)
	const connectedAiAgents = aiAgents.data?.aiAgents.filter((aiAgent) => aiAgent.isConnected) ?? []
	const handleAdd = async (clientId: string): Promise<void> => {
		if (isMutating.current) {
			return
		}
		isMutating.current = true
		setIsPending(true)
		setError(null)
		try {
			await sendAddPersonalSourcesAiAgent({ topicId, clientId })
			await onChanged().catch(() => {
				setError("App added. Could not refresh Personal sources. Reopen this Topic to see it.")
			})
		} catch {
			setError("Could not add the app. Reconnect it, then try again.")
		} finally {
			isMutating.current = false
			setIsPending(false)
		}
	}
	const handleDismiss = async (): Promise<void> => {
		if (!nudge.data?.consentCreatedAt) {
			return
		}
		try {
			await sendDismissPersonalSourcesNudge(nudge.data.consentCreatedAt)
			await nudge.refetch()
		} catch {
			setError("Could not dismiss the connection notice. Try again.")
		}
	}

	return (
		<Group>
			<Heading>AI Agent Sources</Heading>
			{nudge.data?.consentCreatedAt && (
				<Group>
					<Text>
						An AI app is connected. Add it here, then explicitly ask it to send a summary to this Topic. Connecting
						never imports chat history.
					</Text>
					<Button
						label="Dismiss connection notice"
						onPress={() => {
							void handleDismiss()
						}}
					/>
				</Group>
			)}
			{aiAgents.isPending && <Text>Loading connected apps…</Text>}
			{aiAgents.isError && (
				<Group>
					<Text>Could not load connected apps.</Text>
					<Button
						label="Retry connected apps"
						onPress={() => {
							void aiAgents.refetch()
						}}
					/>
				</Group>
			)}
			{!aiAgents.isPending && !aiAgents.isError && connectedAiAgents.length === 0 && (
				<Text>
					Use Add to AI to connect an app, then return here. You can also import selected conversations without
					connecting.
				</Text>
			)}
			{connectedAiAgents.map((aiAgent) => (
				<Group key={aiAgent.id}>
					{recommendations.data?.aiAgentIds.includes(aiAgent.id) && (
						<Text>Suggested from at least three matching sends you accepted in the last 30 days.</Text>
					)}
					<Button
						label={`Add ${aiAgent.label}`}
						isDisabled={isPending}
						onPress={() => {
							const clientId = aiAgent.clientIds[0]
							if (clientId) {
								void handleAdd(clientId)
							}
						}}
					/>
				</Group>
			))}
			{error && <Text className="text-destructive">{error}</Text>}
		</Group>
	)
}
