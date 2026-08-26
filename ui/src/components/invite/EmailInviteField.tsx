import { useState } from "react"
import { Button } from "@/components/primitives/button"
import { Input } from "@/components/primitives/input"

/**
 * The invite-by-email pair every invite shares: the address input and its button.
 * An entered address becomes a pill to send or delete. A refusal is shown below the field.
 */
export function EmailInviteField({
	placeholder = "invite by email…",
	onInvite,
}: {
	placeholder?: string
	// takes the entered address, lowercased. a returned string is the refusal shown below the field
	onInvite: (email: string) => Promise<string | null> | string | null
}) {
	const [email, setEmail] = useState("")
	const [refusal, setRefusal] = useState<string | null>(null)

	// a rough shape check keeps empty and malformed emails out. the api validates for real
	const handleInvite = async (): Promise<void> => {
		const address = email.trim().toLowerCase()
		if (address === "") {
			return
		}
		if (!address.includes("@")) {
			setRefusal("That needs to be an email address.")
			return
		}
		const inviteResponse = await onInvite(address)
		setRefusal(inviteResponse)
		if (inviteResponse === null) {
			setEmail("")
		}
	}

	return (
		<div>
			{/* the input and its button */}
			<div className="flex gap-2">
				<Input
					type="email"
					placeholder={placeholder}
					value={email}
					name="invite-address"
					autoComplete="off"
					data-1p-ignore
					data-lpignore="true"
					data-bwignore
					data-form-type="other"
					aria-label="Invite by email"
					onChange={(event) => {
						setEmail(event.target.value)
						setRefusal(null)
					}}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault()
							void handleInvite()
						}
					}}
				/>
				<Button variant="outline" onClick={() => void handleInvite()}>
					Invite
				</Button>
			</div>
			{/* the refusal reads inline, under the field it answers */}
			{refusal && <p className="text-destructive mt-1 text-xs">{refusal}</p>}
		</div>
	)
}
