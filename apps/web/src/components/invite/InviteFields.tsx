import { authClient } from "@carlnotes/client/authClient"
import { type InviteFieldElements, InviteFields as SharedInviteFields } from "@carlnotes/core/components/InviteFields"
import { type EmailProvider, toEmailProviders } from "@carlnotes/core/lib/emailProviders"
import { Link, Mail } from "lucide-react"
import { useState } from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { FieldLabel } from "@/components/common/FieldLabel"
import { Button } from "@/components/primitives/button"
import { Input } from "@/components/primitives/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/primitives/popover"
import { TagPill } from "@/components/topic/TagPicker"
import { toInviteUrl } from "@/lib/inviteUrl"
import { MENU_DIVIDER_CLASS, MENU_OPTION_CLASS } from "@/lib/styleClasses"
import { copyToClipboard } from "@/lib/utils"

// what the invite-by-link menu needs from its caller
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
}: {
	// what the section is called: Invites on a topic, Members on a team
	label: string
	invites: string[]
	// a returned string is the rejection shown under the field, null if the address was staged
	onAddEmail: (email: string) => string | null
	onAddUsername: (username: string) => void
	onRemoveInvite: (chip: string) => void
	// the invite-by-link menu, shown once the target is saved and has something to link to
	inviteLink?: InviteLink
}) {
	return (
		<SharedInviteFields
			label={label}
			invites={invites}
			onAddEmail={onAddEmail}
			onAddUsername={onAddUsername}
			onRemoveInvite={onRemoveInvite}
			inviteLink={inviteLink && <InviteLinkMenu inviteLink={inviteLink} />}
			elements={INVITE_FIELD_ELEMENTS}
		/>
	)
}

// the invite-by-link button and its menu: one row per webmail composer, then a plain copy
function InviteLinkMenu({ inviteLink }: { inviteLink: InviteLink }) {
	const { data: session } = authClient().useSession()
	// open state, closed by each row's handler
	const [isMenuOpen, setIsMenuOpen] = useState(false)

	// the subject line for the email composer
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
		// a webmail composer loads into the blank tab opened by the click. a mail client takes over this tab
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
		// copy the invite url, and report only a copy that landed
		if (await copyToClipboard(toInviteUrl(token))) {
			inviteLink.onCopied?.()
		}
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
				<PopoverContent align="start" className="w-52" bodyClassName="p-1">
					{/* one dropdown row per email provider */}
					{toEmailProviders(session?.user.email).map((emailProvider) => (
						<button
							key={emailProvider.key}
							type="button"
							onClick={() => void handleComposeEmail(emailProvider)}
							className={MENU_OPTION_CLASS}
						>
							<Mail className="size-4 shrink-0" />
							{emailProvider.label}
						</button>
					))}
					{/* the Copy link option below a divider */}
					<div className={MENU_DIVIDER_CLASS} />
					<button type="button" onClick={() => void handleCopyLink()} className={MENU_OPTION_CLASS}>
						<Link className="size-4 shrink-0" />
						Copy link
					</button>
				</PopoverContent>
			</Popover>
			<p className="text-muted-foreground mt-1.5 text-xs italic">
				{inviteLink.caption ?? "A fresh brew will be waiting to pour on their "}
				<AnchorLink href={inviteLink.link.href} className="sentence-link">
					{inviteLink.link.label}
				</AnchorLink>
			</p>
		</div>
	)
}

// browser controls preserve Enter submission and the invitation fields' password-manager exclusions
const INVITE_FIELD_ELEMENTS: InviteFieldElements = {
	Group: ({ children }) => <div className="space-y-2">{children}</div>,
	Row: ({ children }) => <div className="flex gap-2">{children}</div>,
	Chips: ({ children }) => <div className="flex flex-wrap gap-1.5">{children}</div>,
	Label: ({ children }) => <FieldLabel>{children}</FieldLabel>,
	Error: ({ children }) => <p className="text-destructive mt-1 text-xs">{children}</p>,
	Chip: TagPill,
	Input: ({ label, value, placeholder, kind, onChange, onSubmit }) => (
		<Input
			aria-label={label}
			type={kind === "email" ? "email" : "text"}
			value={value}
			placeholder={placeholder}
			name={kind === "email" ? "invite-address" : "invite-recipient"}
			autoComplete="off"
			data-1p-ignore
			data-lpignore="true"
			data-bwignore
			data-form-type="other"
			onChange={(event) => onChange(event.target.value)}
			onKeyDown={(event) => {
				if (event.key === "Enter") {
					// stage the invitation without submitting the surrounding form
					event.preventDefault()
					onSubmit()
				}
			}}
		/>
	),
	Button: ({ onPress, isDisabled }) => (
		<Button variant="outline" onClick={onPress} disabled={isDisabled}>
			Invite
		</Button>
	),
}
