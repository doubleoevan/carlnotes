import type { TopicPersonalSources } from "@carlnotes/contracts/personalSources"
import type { ReactNode } from "react"
import {
	PERSONAL_SOURCES_PRIVACY_NOTICE,
	PERSONAL_SOURCES_RETENTION_NOTICE,
	toPersonalSourcesContextLabel,
} from "../lib/personalSourcesCopy"
import type { AiAgentAccountElements } from "./AiAgentAccountCard"

type TopicPersonalSourcesCardProps = {
	elements: Pick<AiAgentAccountElements, "Card" | "Heading" | "Text" | "Button" | "Group">
	personalSources?: TopicPersonalSources
	isLoading: boolean
	hasError: boolean
	onRetry: () => void
	children: ReactNode
}

/**
 * Presents the shared personal sources disclosures, counts, and readiness states around platform controls.
 */
export function TopicPersonalSourcesCard({
	elements,
	personalSources,
	isLoading,
	hasError,
	onRetry,
	children,
}: TopicPersonalSourcesCardProps) {
	const { Card, Heading, Text, Button, Group } = elements
	return (
		<Card>
			{/* privacy and retention precede every receiving control */}
			<Heading>Personal sources</Heading>
			<Text className="mt-2 text-sm">{PERSONAL_SOURCES_PRIVACY_NOTICE}</Text>
			<Text className="mt-2 text-sm text-muted-foreground">{PERSONAL_SOURCES_RETENTION_NOTICE}</Text>
			{isLoading && <Text>Loading your Personal sources…</Text>}
			{hasError && (
				<Group>
					<Text>Could not load your personal sources.</Text>
					<Button label="Retry Personal sources" onPress={onRetry} />
				</Group>
			)}
			{personalSources && !hasError && (
				<Group>
					<Text className="text-sm">{toPersonalSourcesContextLabel(personalSources.context)}</Text>
					<Text className="text-sm text-muted-foreground">
						{"Personal sources do not count toward the ten fetched Sources. Week counts start Monday at 00:00 UTC."}
					</Text>
					{personalSources.sources.length === 0 && personalSources.canReceive && (
						<Text>
							No receiving Sources yet. Add an app, import selected conversations, or manually forward an email.
						</Text>
					)}
					{!personalSources.canReceive && (
						<Text>New receiving is not enabled. You can still read and delete saved entries.</Text>
					)}
					{children}
				</Group>
			)}
		</Card>
	)
}
