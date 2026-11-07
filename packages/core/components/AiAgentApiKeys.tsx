// the API keys part of the AI Agent account card: the keys, the secret shown once, and the form that creates one
import { AI_AGENT_API_KEY_LIMIT } from "@carlnotes/contracts/personalSources"
import { AI_AGENT_API_KEY_LABEL_MAX_CHARS } from "@carlnotes/contracts/personalSourcesAccounts"
import { SITE_URL } from "@carlnotes/contracts/site"
import { useState } from "react"
import type { AiAgentAccountState } from "../hooks/useAiAgentAccount"
import type { AiAgentAccountElements } from "./AiAgentAccountCard"

// the send-only key steps in the docs
const AI_AGENT_API_KEYS_DOCS_URL = `${SITE_URL}/docs/account/add-to-ai/#send-only-api-keys`

// the platform's controls, the account's keys, and the copy and revoke actions
type AiAgentApiKeysProps = {
	elements: AiAgentAccountElements
	account: AiAgentAccountState
	onCopy: (text: string) => Promise<boolean>
	onRevokeKey: (key: AiAgentAccountState["keys"][number]) => void
}

/**
 * Lists a user's API keys and creates one if they may.
 */
export function AiAgentApiKeys({ elements, account, onCopy, onRevokeKey }: AiAgentApiKeysProps) {
	const { Group, Heading, Text, Field, Button, Secret, Row, KeyName, DocsLink } = elements

	// hold only the new key's label and whether copying the secret failed
	const [label, setLabel] = useState("")
	const [isCopyFailed, setIsCopyFailed] = useState(false)

	// the key is shown only once, so a failed copy keeps it on screen
	const handleCopySecret = async (): Promise<void> => {
		const isCopied = await onCopy(account.secret ?? "")
		setIsCopyFailed(!isCopied)
		if (isCopied) {
			account.dismissSecret()
		}
	}

	// a label within its length, with no action running, no secret left to copy, and room for another key
	const trimmedLabel = label.trim()
	const isAtKeyLimit = account.keys.length >= AI_AGENT_API_KEY_LIMIT
	const canCreateKey =
		!account.isPending &&
		!account.secret &&
		Boolean(trimmedLabel) &&
		trimmedLabel.length <= AI_AGENT_API_KEY_LABEL_MAX_CHARS &&
		!isAtKeyLimit

	// the button and the Enter key create the same way, and the field empties for the next key
	const handleCreateKey = (): void => {
		if (!canCreateKey) {
			return
		}
		setLabel("")
		void account.createKey(trimmedLabel)
	}

	return (
		<>
			{/* key metadata and the secret that is displayed only on creation */}
			<Group>
				<Heading>AI Agent API keys</Heading>
				<Text className="text-sm text-muted-foreground">
					Keys let your agents work with CarlNotes. Keep them private.
				</Text>
			</Group>
			{account.secret && (
				<Group>
					<Text className="font-semibold">Copy this key now. It is shown only once.</Text>
					<Secret>{account.secret}</Secret>
					<Button
						label="Copy key and hide"
						onPress={() => {
							void handleCopySecret()
						}}
					/>
					{isCopyFailed && (
						<Text className="text-destructive">The key was not copied. Select it and copy it by hand.</Text>
					)}
				</Group>
			)}
			{account.keys.map((key) => (
				<Row key={key.id}>
					<KeyName
						label={key.label}
						details={`…${key.lastFour} · created ${key.createdAt.slice(0, 10)} · ${key.lastUsedAt ? `last used ${key.lastUsedAt.slice(0, 10)}` : "never used"}`}
					/>
					<Button
						label="Revoke"
						accessibilityLabel={`Revoke ${key.label}`}
						isDisabled={account.isPending}
						onPress={() => onRevokeKey(key)}
					/>
				</Row>
			))}
			{!account.isLoading && !account.hasError && !account.canCreate && (
				<Text className="mt-3 text-sm text-muted-foreground">
					Creating API keys requires Premium. Existing keys can still be revoked.
				</Text>
			)}
			{account.canCreate && (
				<>
					<Row>
						<Field label="Key label" value={label} onChange={setLabel} onSubmit={handleCreateKey} />
						<Button label="Create API key" isDisabled={!canCreateKey} onPress={handleCreateKey} />
					</Row>
					{isAtKeyLimit && <Text className="mt-3">You have ten keys. Revoke one before creating another.</Text>}
				</>
			)}
			<Group>
				<DocsLink href={AI_AGENT_API_KEYS_DOCS_URL}>How to use API keys</DocsLink>
			</Group>
		</>
	)
}
