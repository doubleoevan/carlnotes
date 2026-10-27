import { userInvitePayload } from "@carlnotes/contracts/payloads"
import { type ComponentType, type ReactNode, useState } from "react"

type Container = ComponentType<{ children: ReactNode }>
export type InviteFieldElements = {
	Group: Container
	Row: Container
	Chips: Container
	Label: Container
	Error: Container
	Chip: ComponentType<{ label: string; onRemove: () => void }>
	Input: ComponentType<{
		label: string
		placeholder: string
		value: string
		kind: "email" | "username"
		onChange: (value: string) => void
		onSubmit: () => void
	}>
	Button: ComponentType<{ onPress: () => void; isDisabled: boolean }>
}

/**
 * Shares staged invitation chips, field behavior, and validation across team and topic forms.
 */
export function InviteFields({
	label,
	invites,
	onRemoveInvite,
	onAddEmail,
	onAddUsername,
	inviteLink,
	elements,
}: {
	label: string
	invites: string[]
	onRemoveInvite: (label: string) => void
	onAddEmail: (email: string) => Promise<string | null> | string | null
	onAddUsername: (username: string) => void
	inviteLink?: ReactNode
	elements: InviteFieldElements
}) {
	const { Group, Chips, Label, Chip } = elements
	return (
		<Group>
			<Label>{label}</Label>
			{invites.length > 0 && (
				<Chips>
					{invites.map((invite) => (
						<Chip key={invite} label={invite} onRemove={() => onRemoveInvite(invite)} />
					))}
				</Chips>
			)}
			<InviteInput kind="email" onInvite={onAddEmail} elements={elements} />
			<InviteInput
				kind="username"
				onInvite={(username) => {
					onAddUsername(username)
					return null
				}}
				elements={elements}
			/>
			{inviteLink}
		</Group>
	)
}

// keep entered text after a rejection and clear it only once the caller stages it
function InviteInput({
	kind,
	onInvite,
	elements: { Group, Row, Input, Button, Error: ErrorText },
}: {
	kind: "email" | "username"
	onInvite: (value: string) => Promise<string | null> | string | null
	elements: InviteFieldElements
}) {
	// track one field's request and error independently
	const [text, setText] = useState("")
	const [error, setError] = useState<string | null>(null)
	const [isPending, setIsPending] = useState(false)
	async function handleInvite(): Promise<void> {
		if (isPending || !text.trim()) {
			return
		}
		const validation = validateInviteText({ text, kind })
		if ("error" in validation) {
			setError(validation.error)
			return
		}
		const { value } = validation
		setIsPending(true)
		try {
			const rejection = await onInvite(value)
			setError(rejection)
			if (rejection === null) {
				setText("")
			}
		} catch (error) {
			setError(error instanceof Error ? error.message : "That invitation didn't go through. Try again.")
		} finally {
			setIsPending(false)
		}
	}
	return (
		<Group>
			<Row>
				<Input
					label={kind === "email" ? "Invite by email" : "Invite by username"}
					placeholder={kind === "email" ? "invite by email…" : "or invite by @username…"}
					kind={kind}
					value={text}
					onChange={(text) => {
						setText(text)
						setError(null)
					}}
					onSubmit={() => void handleInvite()}
				/>
				<Button isDisabled={isPending} onPress={() => void handleInvite()} />
			</Row>
			{error && <ErrorText>{error}</ErrorText>}
		</Group>
	)
}

// normalize each invite once and report the same field rejection on both platforms
function validateInviteText({
	text,
	kind,
}: {
	text: string
	kind: "email" | "username"
}): { value: string } | { error: string } {
	const value = kind === "email" ? text.trim().toLowerCase() : text.trim().replace(/^@/, "")
	const validation = userInvitePayload.safeParse(kind === "email" ? { email: value } : { username: value })
	return validation.success
		? { value }
		: { error: kind === "email" ? "That needs to be an email address." : "Enter a username." }
}
