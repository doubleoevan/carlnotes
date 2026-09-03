import { toast } from "sonner"
import { sendCreateTopicInvite, sendUserInvite } from "@/clients/topicClient"
import { InviteFields } from "@/components/invite/InviteFields"

// send the usernames staged in the editor once the topic save gives them a topic to open
export async function sendPendingUsernameInvites(topicId: string, usernames: string[]): Promise<void> {
	for (const username of usernames) {
		const rejection = await sendUserInvite({ topicId }, { username })
		if (rejection) {
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
	// only a saved topic can hand out a link, since the token needs its id
	topic?: { id: string; name: string }
	// the staged email addresses, sent as email invitations by the save
	emailInvites: string[]
	// the staged usernames, sent as user invitations by the save
	usernameInvites: string[]
	onEmailInvitesChange: (emailInvites: string[]) => void
	onUsernameInvitesChange: (usernameInvites: string[]) => void
}) {
	// chips mix the staged addresses and the staged usernames, told apart by the @ in front of the username
	const invites = [...emailInvites, ...usernameInvites.map((username) => `@${username}`)]
	const handleRemoveInvite = (invite: string): void => {
		if (invite.startsWith("@")) {
			onUsernameInvitesChange(usernameInvites.filter((username) => `@${username}` !== invite))
			return
		}
		onEmailInvitesChange(emailInvites.filter((email) => email !== invite))
	}

	// a token needs a saved topic
	const topicId = topic?.id
	const createToken = async (source: "compose" | "copy-link"): Promise<string | null> => {
		if (!topicId) {
			return null
		}
		try {
			const invite = await sendCreateTopicInvite(topicId, source)
			if (invite === "limited") {
				toast.error("Daily invite limit reached. It resets tomorrow.")
				return null
			}
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
		/>
	)
}
