import { Link, Mail } from "lucide-react"
import { useState } from "react"
import { authClient } from "@/clients/authClient"
import { toInviteUrl } from "@/clients/topicClient"
import { AnchorLink } from "@/components/common/AnchorLink"
import { FieldLabel } from "@/components/common/FieldLabel"
import { EmailInviteField } from "@/components/invite/EmailInviteField"
import { UsernameInviteField } from "@/components/invite/UsernameInviteField"
import { Button } from "@/components/primitives/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { TagPill } from "@/components/topic/TagPicker"
import { type EmailProvider, toEmailProviders } from "@/lib/emailProviders"
import { copyWithDocument } from "@/lib/utils"

// an email provider option inside the invite-by-link dropdown menu
const EMAIL_PROVIDER_OPTION_CLASS = "hover:bg-accent flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-sm"

// what the invite-by-link menu needs from its owner
export type InviteLink = {
	subjectName: string
	// the sentence the composer opens with, around the invite url
	toBody: (inviteUrl: string) => string
	// source says which menu row asked for the token
	createToken: (source: "compose" | "copy-link") => Promise<string | null>
	// the caption ending just before the link
	// default is: "A fresh brew will be waiting to pour on their " <link>
	caption?: string
	link: { label: string; href: string }
	onCopied?: () => void
}

/**
 * The invite fields every invite shares: one header, the staged invites as chips under it,
 * the email and username inputs whose placeholders show the labels, and the invite-by-link menu.
 * The user's save is what sends the staged entries.
 */
export function InviteFields({
	label,
	invites,
	onAddEmail,
	onAddUsername,
	onRemoveInvite,
	inviteLink,
	children,
}: {
	// what the section is called: Invites on a topic, Members on a team
	label: string
	invites: string[]
	// a returned string is the refusal shown under the field, null when the address was staged
	onAddEmail: (email: string) => string | null
	onAddUsername: (username: string) => void
	onRemoveInvite: (chip: string) => void
	// the invite-by-link menu, shown once the target is saved and has something to link to
	inviteLink?: InviteLink
	// whatever the surface shows under the fields, like a topic's live link rows
	children?: React.ReactNode
}) {
	return (
		<div className="space-y-2">
			<FieldLabel>{label}</FieldLabel>
			{/* the staged invites as chips, each removable until the save that sends them */}
			{invites.length > 0 && (
				<div className="flex flex-wrap gap-1.5">
					{invites.map((invite) => (
						<TagPill key={invite} label={invite} onRemove={() => onRemoveInvite(invite)} />
					))}
				</div>
			)}
			<EmailInviteField onInvite={onAddEmail} />
			<UsernameInviteField onInvite={onAddUsername} />
			{inviteLink && <InviteLinkMenu inviteLink={inviteLink} />}
			{children}
		</div>
	)
}

// the invite-by-link button and its menu: one row per webmail composer, then a plain copy
function InviteLinkMenu({ inviteLink }: { inviteLink: InviteLink }) {
	const { data: session } = authClient.useSession()
	// the menu is controlled so selecting a row closes the menu
	const [isMenuOpen, setIsMenuOpen] = useState(false)

	// the words the invitation puts into whichever composer opens
	const subject = `Join ${inviteLink.subjectName} on CarlNotes`

	// close the menu and open the email composer in a new tab with the invite link
	const handleComposeEmail = async (emailProvider: EmailProvider): Promise<void> => {
		setIsMenuOpen(false)
		const emailComposer = emailProvider.opensInNewTab ? window.open("", "_blank", "noopener,noreferrer") : null
		const token = await inviteLink.createToken("compose")
		if (!token) {
			emailComposer?.close()
			return
		}
		// the mail client takes over this tab, and every webmail composer opens in the blank tab from the click
		const composeEmailUrl = emailProvider.toUrl(
			subject,
			inviteLink.toBody(toInviteUrl(token)),
			session?.user.email ?? null,
		)
		if (emailComposer) {
			emailComposer.location.href = composeEmailUrl
			return
		}
		window.location.href = composeEmailUrl
	}

	// close the menu and create a link then copy it to the clipboard
	const handleCopyLink = async (): Promise<void> => {
		setIsMenuOpen(false)
		const token = await inviteLink.createToken("copy-link")
		if (!token) {
			return
		}
		// some browsers refuse the clipboard api even over https, so a rejected copy falls back
		const inviteUrl = toInviteUrl(token)
		try {
			await navigator.clipboard.writeText(inviteUrl)
		} catch {
			// fallback to copy using an off-screen textarea if the clipboard fails
			copyWithDocument(inviteUrl)
		}
		inviteLink.onCopied?.()
	}
	return (
		<div>
			<Popover open={isMenuOpen} onOpenChange={setIsMenuOpen}>
				<PopoverTrigger asChild>
					<Button variant="outline" size="sm">
						<Link className="size-3.5" />
						Invite by link
					</Button>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-52 p-1">
					{/* one dropdown row per email provider */}
					{toEmailProviders(session?.user.email).map((emailProvider) => (
						<button
							key={emailProvider.key}
							type="button"
							onClick={() => void handleComposeEmail(emailProvider)}
							className={EMAIL_PROVIDER_OPTION_CLASS}
						>
							<Mail className="size-4 shrink-0" />
							{emailProvider.label}
						</button>
					))}
					{/* copy to clipboard sits below a divider */}
					<div className="bg-border my-1 h-px" />
					<button type="button" onClick={() => void handleCopyLink()} className={EMAIL_PROVIDER_OPTION_CLASS}>
						<Link className="size-4 shrink-0" />
						Copy link
					</button>
				</PopoverContent>
			</Popover>
			<p className="text-muted-foreground mt-1.5 text-xs italic">
				{inviteLink.caption ?? "A fresh brew will be waiting to pour on their "}
				<AnchorLink href={inviteLink.link.href} className="text-link hover:underline">
					{inviteLink.link.label}
				</AnchorLink>
			</p>
		</div>
	)
}
