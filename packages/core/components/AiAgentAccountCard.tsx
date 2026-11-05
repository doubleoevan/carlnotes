import { AI_AGENT_API_KEY_LIMIT } from "@carlnotes/contracts/personalSources"
import { type ComponentType, useState } from "react"
import type { AiAgentAccountState } from "../hooks/useAiAgentAccount"
import type { AccountFieldElements } from "./AccountFields"

// platform controls share existing account fields and confirmations
export type AiAgentAccountElements = Pick<
	AccountFieldElements,
	"Card" | "Group" | "Heading" | "Text" | "Field" | "Button"
> & {
	Secret: ComponentType<{ children: string }>
	Confirm: ComponentType<{
		title: string
		children: string
		confirmLabel: string
		cancelLabel: string
		onConfirm: () => Promise<void>
		onClose: () => void
	}>
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
	const { Card, Group, Heading, Text, Field, Button, Secret, Confirm } = elements
	const [label, setLabel] = useState("")
	const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
	const [isCopied, setIsCopied] = useState(false)
	const activeKeyCount = account.keys.filter((key) => !key.revokedAt).length
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
			{account.aiAgents.map((aiAgent) => (
				<Group key={aiAgent.id}>
					<Text className="font-semibold">{aiAgent.label}</Text>
					<Text className="text-sm text-muted-foreground">
						{aiAgent.isConnected ? "Connected" : "Disconnected · existing entries remain"}
					</Text>
					{aiAgent.isConnected && (
						<Button
							label={`Disconnect ${aiAgent.label}`}
							isDisabled={account.isPending}
							onPress={() => setConfirmation({ kind: "aiAgent", id: aiAgent.id, label: aiAgent.label })}
						/>
					)}
				</Group>
			))}
			<Text className="mt-3 text-sm text-muted-foreground">
				Disconnecting stops new sends and refreshes. Existing read tokens may work until they expire. Delete Personal
				sources items separately to remove saved content.
			</Text>

			{/* key metadata and the secret that is displayed only on creation */}
			<Group>
				<Heading>AI Agent API keys</Heading>
				<Text className="text-sm text-muted-foreground">
					Keys can send to Topics you can edit. They cannot read your account. Keep them private.
				</Text>
			</Group>
			{account.secret && (
				<Group>
					<Text className="font-semibold">Copy this key now. It is shown only once.</Text>
					<Secret>{account.secret}</Secret>
					<Button
						label={isCopied ? "Key copied" : "Copy key"}
						onPress={() => {
							void onCopy(account.secret ?? "").then(setIsCopied)
						}}
					/>
					<Button
						label="Done — hide key"
						onPress={() => {
							account.dismissSecret()
							setIsCopied(false)
						}}
					/>
				</Group>
			)}
			{account.keys.map((key) => (
				<Group key={key.id}>
					<Text className="font-semibold">{key.label}</Text>
					<Text className="text-sm text-muted-foreground">{`…${key.lastFour} · ${key.revokedAt ? "Revoked" : "Active"} · created ${key.createdAt.slice(0, 10)} · ${key.lastUsedAt ? `last used ${key.lastUsedAt.slice(0, 10)}` : "never used"}`}</Text>
					{!key.revokedAt && (
						<Button
							label={`Revoke ${key.label}`}
							isDisabled={account.isPending}
							onPress={() => setConfirmation({ kind: "key", id: key.id, label: key.label })}
						/>
					)}
				</Group>
			))}
			{!account.isLoading && !account.hasError && !account.canCreate && (
				<Text className="mt-3 text-sm text-muted-foreground">
					Creating API keys requires Premium. Existing keys can still be revoked.
				</Text>
			)}
			{account.canCreate && (
				<Group>
					<Field label="Key label" value={label} onChange={setLabel} />
					<Button
						label="Create API key"
						isDisabled={
							account.isPending ||
							Boolean(account.secret) ||
							!label.trim() ||
							label.trim().length > 80 ||
							activeKeyCount >= AI_AGENT_API_KEY_LIMIT
						}
						onPress={() => {
							void account.createKey(label.trim())
							setIsCopied(false)
						}}
					/>
					{activeKeyCount >= AI_AGENT_API_KEY_LIMIT && (
						<Text>Ten keys are active. Revoke one before creating another.</Text>
					)}
				</Group>
			)}
			{confirmation && (
				<Confirm
					title={`${confirmation.kind === "aiAgent" ? "Disconnect" : "Revoke"} ${confirmation.label}?`}
					confirmLabel={confirmation.kind === "aiAgent" ? "Disconnect app" : "Revoke key"}
					cancelLabel="Cancel"
					onConfirm={handleConfirm}
					onClose={() => setConfirmation(null)}
				>
					{"New sends stop immediately. Existing Personal sources items stay until you delete them."}
				</Confirm>
			)}
		</Card>
	)
}
