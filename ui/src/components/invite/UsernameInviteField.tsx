import { useState } from "react"
import { Button } from "@/components/primitives/button"
import { Input } from "@/components/primitives/input"

/**
 * The invite-by-username field. The entered username is returned to the caller,
 * which stages it for the save that creates its target. A username invite sends no email.
 * It shows up in the recipient's own page tables.
 */
export function UsernameInviteField({ onInvite }: { onInvite: (username: string) => void }) {
	const [username, setUsername] = useState("")

	// the leading @ is optional, and an empty field has nothing to hand over
	function handleInvite(): void {
		const invitedUsername = username.trim().replace(/^@/, "")
		if (invitedUsername === "") {
			return
		}
		onInvite(invitedUsername)
		setUsername("")
	}

	return (
		<div className="flex gap-2">
			<Input
				placeholder="or invite by @username…"
				value={username}
				name="invite-recipient"
				autoComplete="off"
				data-1p-ignore
				data-lpignore="true"
				data-bwignore
				data-form-type="other"
				aria-label="Invite by username"
				onChange={(event) => setUsername(event.target.value)}
				onKeyDown={(event) => {
					if (event.key === "Enter") {
						event.preventDefault()
						handleInvite()
					}
				}}
			/>
			<Button variant="outline" onClick={handleInvite}>
				Invite
			</Button>
		</div>
	)
}
