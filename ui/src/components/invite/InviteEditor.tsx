import type { Invite } from "@shared/contracts"
import { Link, X } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"
import { sendCreateTopicInvite, sendRevokeInvite, sendUserInvite } from "@/clients/topicClient"
import { InviteFields } from "@/components/invite/InviteFields"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"

// send the usernames staged in the editor once the topic save gives them a topic to open
export async function sendPendingUsernameInvites(topicId: string, usernames: string[]): Promise<void> {
	for (const username of usernames) {
		const refusal = await sendUserInvite({ topicId }, { username })
		if (refusal) {
			toast.error(`The invitation to @${username} didn't go through.`)
		} else {
			toast(`Invited @${username}. They'll find it on their Activity page.`)
		}
	}
}

/**
 * The topic's invite editor: staged addresses and usernames as chips to send on save,
 * and the invite links that are still pending, each revocable on its own.
 */
export function InviteEditor({
	topic,
	emailInvites,
	usernameInvites,
	onEmailInvitesChange,
	onUsernameInvitesChange,
}: {
	// only a saved topic has pending invites to list
	topic?: { id: string; name: string; invites: Invite[] }
	// the staged email addresses, sent as email invitations by the save
	emailInvites: string[]
	// the staged usernames, sent as user invitations by the save
	usernameInvites: string[]
	onEmailInvitesChange: (emailInvites: string[]) => void
	onUsernameInvitesChange: (usernameInvites: string[]) => void
}) {
	// only the pending invites. the email addresses are the chips, and this list follows the revokes made here
	const [linkInvites, setLinkInvites] = useState(() => (topic?.invites ?? []).filter((invite) => !invite.email))

	// chips mix the staged addresses and the staged usernames, told apart by the @ in front of the username
	const invites = [...emailInvites, ...usernameInvites.map((username) => `@${username}`)]
	const handleRemoveInvite = (invite: string): void => {
		if (invite.startsWith("@")) {
			onUsernameInvitesChange(usernameInvites.filter((username) => `@${username}` !== invite))
			return
		}
		onEmailInvitesChange(emailInvites.filter((email) => email !== invite))
	}

	// delete an invite request
	const handleRevokeInvite = async (inviteId: string): Promise<void> => {
		await sendRevokeInvite(topic?.id ?? "", inviteId)
		setLinkInvites((previousInvites) => previousInvites.filter((invite) => invite.id !== inviteId))
	}

	// a token needs a saved topic, and the new link joins the list so its row shows straight away
	const topicId = topic?.id
	const createToken = async (source: "compose" | "copy-link"): Promise<string | null> => {
		if (!topicId) {
			return null
		}
		try {
			const invite = await sendCreateTopicInvite(topicId, source)
			setLinkInvites((previousInvites) => [...previousInvites, invite])
			return invite.token
		} catch (error) {
			console.error("invite create failed", error)
			toast.error("That invite link didn't get made. Try again.")
			return null
		}
	}
	return (
		<InviteFields
			label="Followers"
			invites={invites}
			inviteLink={
				topic
					? {
							subjectName: topic.name,
							toBody: (inviteUrl: string) => `Carl reads this topic and takes notes. Follow here: ${inviteUrl}`,
							createToken,
							link: { label: "topic page", href: `/topics/${topic.id}` },
							onCopied: () => toast.success("Invite link copied. Anyone holding it can follow."),
						}
					: undefined
			}
			onRemoveInvite={handleRemoveInvite}
			onAddEmail={(email) => {
				if (emailInvites.includes(email)) {
					return "That address is already invited."
				}
				onEmailInvitesChange([...emailInvites, email])
				return null
			}}
			onAddUsername={(username) => {
				if (!usernameInvites.includes(username)) {
					onUsernameInvitesChange([...usernameInvites, username])
				}
			}}
		>
			{linkInvites.length > 0 && (
				<ul className="space-y-1">
					{linkInvites.map((invite) => (
						<InviteRow key={invite.id} invite={invite} onRevokeInvite={() => void handleRevokeInvite(invite.id)} />
					))}
				</ul>
			)}
		</InviteFields>
	)
}

// one live link. it names nobody, so the remaining uses are all there is to show
function InviteRow({ invite, onRevokeInvite }: { invite: Invite; onRevokeInvite: () => void }) {
	const label = `Link, ${invite.maxUses - invite.usedCount} of ${invite.maxUses} left`
	return (
		<li className="text-muted-foreground flex items-center gap-2 text-xs">
			<Link className="size-3.5" />
			<span>{label}</span>
			<Tooltip>
				<TooltipTrigger asChild>
					<button type="button" onClick={onRevokeInvite} className="hover:text-foreground ml-auto" aria-label="Revoke">
						<X className="size-3.5" />
					</button>
				</TooltipTrigger>
				<TooltipContent>Close this invitation</TooltipContent>
			</Tooltip>
		</li>
	)
}
