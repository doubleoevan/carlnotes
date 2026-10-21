import { useState } from "react"
import { Button } from "@/components/primitives/button"
import { Input } from "@/components/primitives/input"

/**
 * The invite-by-email pair every invite shares: the address input and its button.
 * An entered address becomes a pill to send or delete. A rejection is shown below the field.
 */
export function EmailInviteField({
	placeholder = "invite by email…",
	onInvite,
}: {
	placeholder?: string
	// takes the entered address, lowercased. a returned string is the rejection shown below the field
	onInvite: (email: string) => Promise<string | null> | string | null
}) {
	const [email, setEmail] = useState("")
	const [rejection, setRejection] = useState<string | null>(null)

	// a rough shape check keeps empty and malformed emails out. the api validates for real
	const handleInvite = async (): Promise<void> => {
		const address = email.trim().toLowerCase()
		if (address === "") {
			return
		}
		if (!address.includes("@")) {
			setRejection("That needs to be an email address.")
			return
		}
		const inviteRejection = await onInvite(address)
		setRejection(inviteRejection)
		if (inviteRejection === null) {
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
						setRejection(null)
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
			{/* the rejection reads inline, under the field it answers */}
			{rejection && <p className="text-destructive mt-1 text-xs">{rejection}</p>}
		</div>
	)
}
