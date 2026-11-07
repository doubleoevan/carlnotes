import { type ComponentType, type ReactNode, useState } from "react"
import type { AiAgentAccountState } from "../hooks/useAiAgentAccount"
import type { ConfirmElementProps } from "../lib/confirmElement"
import { AI_PROVIDERS, type AiProvider } from "../lib/installDeeplinks"
import { type PersonalSourceConversationProvider, toPersonalSourceSenderProvider } from "../lib/personalSourcesCopy"
import type { AccountFieldElements } from "./AccountFields"
import { AiAgentApiKeys } from "./AiAgentApiKeys"

// platform controls share existing account fields and confirmations
export type AiAgentAccountElements = Pick<AccountFieldElements, "Card" | "Group" | "Heading" | "Text" | "Button"> & {
	// a one-line text field that can submit on the Enter key
	Field: ComponentType<{ label: string; value: string; onChange: (value: string) => void; onSubmit?: () => void }>
	Secret: ComponentType<{ children: string }>
	Confirm: ComponentType<ConfirmElementProps>
	// one connected app, with its icon and name on the left and its status or action on the right
	Row: ComponentType<{ children: ReactNode }>
	AppName: ComponentType<{ label: string; provider: PersonalSourceConversationProvider }>
	// one API key's name over its details, on the left of its row
	KeyName: ComponentType<{ label: string; details: string }>
	AddToAiDialog: ComponentType<{ initialProvider?: AiProvider; onClose: () => void }>
	DocsLink: ComponentType<{ href: string; children: string }>
}
type Confirmation = { kind: "aiAgent" | "key"; id: string; label: string }
type AiAgentAccountCardProps = {
	elements: AiAgentAccountElements
	account: AiAgentAccountState
	onCopy: (text: string) => Promise<boolean>
}

/**
 * Composes connection revocation and one-time API key controls for both account pages.
 */
export function AiAgentAccountCard({ elements, account, onCopy }: AiAgentAccountCardProps) {
	// hold only form input and the action awaiting explicit confirmation
	const { Card, Group, Heading, Text, Button, Confirm, Row, AppName, AddToAiDialog } = elements
	const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
	const [addToAiRequest, setAddToAiRequest] = useState<{ provider?: AiProvider } | null>(null)
	const handleConfirm = async (): Promise<void> => {
		if (!confirmation) {
			return
		}
		if (confirmation.kind === "aiAgent") {
			await account.revokeAiAgent(confirmation.id)
		} else {
			await account.revokeKey(confirmation.id)
		}
		setConfirmation(null)
	}

	return (
		<Card>
			{/* connection history and its account-wide revoke action */}
			<Heading>Connected AI apps</Heading>
			<Text className="mt-1 text-sm text-muted-foreground">
				Connect an app with Add to AI. CarlNotes receives only what you explicitly send or import; it cannot read your
				assistant account.
			</Text>
			{account.isLoading && <Text>Loading connections…</Text>}
			{account.hasError && (
				<Group>
					<Text>Could not load all connections and keys.</Text>
					<Button label="Try again" onPress={account.retry} />
				</Group>
			)}
			{account.error && <Text className="text-destructive">{account.error}</Text>}
			{!account.isLoading && !account.hasError && account.aiAgents.length === 0 && (
				<Text className="mt-3 text-sm">No connected AI apps yet.</Text>
			)}
			{account.aiAgents.map((aiAgent) => {
				const provider = toPersonalSourceSenderProvider(aiAgent.label)
				return (
					<Row key={aiAgent.id}>
						<AppName label={aiAgent.label} provider={provider} />
						{aiAgent.isConnected ? (
							<Button
								label="Disconnect"
								accessibilityLabel={`Disconnect ${aiAgent.label}`}
								isDisabled={account.isPending}
								onPress={() => setConfirmation({ kind: "aiAgent", id: aiAgent.id, label: aiAgent.label })}
							/>
						) : (
							<Button
								label="Reconnect"
								accessibilityLabel={`Reconnect ${aiAgent.label}`}
								isHighlighted
								onPress={() => setAddToAiRequest({ provider: AI_PROVIDERS.find((option) => option === provider) })}
							/>
						)}
					</Row>
				)
			})}
			<Group>
				<Button label="Add to AI" isHighlighted onPress={() => setAddToAiRequest({})} />
			</Group>

			{/* API keys for Premium, and for an account that lost Premium with keys left to revoke */}
			{(account.canCreate || account.keys.length > 0) && (
				<AiAgentApiKeys
					elements={elements}
					account={account}
					onCopy={onCopy}
					onRevokeKey={(key) => setConfirmation({ kind: "key", id: key.id, label: key.label })}
				/>
			)}
			{addToAiRequest && (
				<AddToAiDialog initialProvider={addToAiRequest.provider} onClose={() => setAddToAiRequest(null)} />
			)}
			{confirmation && (
				<Confirm
					title={`${confirmation.kind === "aiAgent" ? "Disconnect" : "Revoke"} ${confirmation.label}?`}
					confirmLabel={confirmation.kind === "aiAgent" ? "Disconnect app" : "Revoke key"}
					cancelLabel="Cancel"
					onConfirm={handleConfirm}
					onClose={() => setConfirmation(null)}
				>
					{`${confirmation.kind === "aiAgent" ? "This app" : "Any agent using this key"} loses access to CarlNotes immediately.`}
				</Confirm>
			)}
		</Card>
	)
}
