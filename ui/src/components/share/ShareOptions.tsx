import { Check, Mail, MessageSquare } from "lucide-react"
import type * as React from "react"
import { AnchorLink } from "@/components/common/AnchorLink"
import { BrandIcon } from "@/components/common/BrandIcon"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/primitives/tooltip"
import { cn } from "@/lib/utils"

// how long the copied confirmation stays up
export const COPIED_FEEDBACK_MS = 1500

// one size for every icon in the share menu, so the labels line up
export const SHARE_OPTION_ICON_CLASS = "size-4 shrink-0"

// every option in the share menu, whichever kind it is
export const SHARE_OPTION_CLASS =
	"hover:bg-accent focus-visible:bg-accent flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-sm focus-visible:outline-none"

// the invite option's label, which doubles as the key its copied confirmation is held under
export const INVITE_LABEL = "Invite"

// the platforms a page gets posted to
export const POST_PLATFORM_TARGETS = [
	{
		// the label is "x.com" instead of the single letter, which no icon distinguishes
		label: "x.com",
		icon: <BrandIcon brand="x" className={SHARE_OPTION_ICON_CLASS} />,
		toUrl: (url: string, title: string) => `https://x.com/intent/post?url=${url}&text=${title}`,
	},
	{
		label: "Bluesky",
		icon: <BrandIcon brand="bluesky" className={SHARE_OPTION_ICON_CLASS} />,
		toUrl: (url: string, title: string) => `https://bsky.app/intent/compose?text=${title}%20${url}`,
	},
	{
		label: "LinkedIn",
		icon: <BrandIcon brand="linkedin" className={SHARE_OPTION_ICON_CLASS} />,
		toUrl: (url: string) => `https://www.linkedin.com/sharing/share-offsite/?url=${url}`,
	},
	{
		label: "Reddit",
		icon: <BrandIcon brand="reddit" className={SHARE_OPTION_ICON_CLASS} />,
		toUrl: (url: string, title: string) => `https://reddit.com/submit?url=${url}&title=${title}`,
	},
]

// the two options that send an invite link to one person instead of posting it
const EMAIL_TARGET = {
	label: "Email",
	icon: <Mail className={SHARE_OPTION_ICON_CLASS} />,
	toUrl: (url: string, title: string) => `mailto:?subject=${title}&body=${url}`,
}
const TEXT_TARGET = {
	label: "Text",
	icon: <MessageSquare className={SHARE_OPTION_ICON_CLASS} />,
	// "?&body=" instead of either separator alone, the one spelling both ios and android open
	toUrl: (url: string, title: string) => `sms:?&body=${title}%20${url}`,
}
export const SEND_TARGETS = [TEXT_TARGET, EMAIL_TARGET]

// a share menu option per platform, live on a public page and disabled with a call-to-action handler otherwise
export function ShareTargetOptions({
	shareTargets,
	isPublic,
	encodedUrl,
	encodedTitle,
	reason,
	onDisabledOptionClick,
}: {
	shareTargets: { label: string; icon: React.ReactNode; toUrl: (url: string, title: string) => string }[]
	isPublic: boolean
	encodedUrl: string
	encodedTitle: string
	reason: string
	onDisabledOptionClick?: () => void
}) {
	return (
		<>
			{shareTargets.map((shareTarget) =>
				isPublic ? (
					<AnchorLink
						key={shareTarget.label}
						href={shareTarget.toUrl(encodedUrl, encodedTitle)}
						className={SHARE_OPTION_CLASS}
					>
						{shareTarget.icon}
						{shareTarget.label}
					</AnchorLink>
				) : (
					<DisabledShareOption
						key={shareTarget.label}
						label={shareTarget.label}
						icon={shareTarget.icon}
						disabledReason={reason}
						onClick={onDisabledOptionClick}
					/>
				),
			)}
		</>
	)
}

// a share option that is disabled for a subject that is not public
export function DisabledShareOption({
	label,
	icon,
	disabledReason,
	onClick,
}: {
	label: string
	icon?: React.ReactNode
	disabledReason: string
	// only passed in as a call-to-action for the owner
	onClick?: () => void
}) {
	return (
		<Tooltip>
			<TooltipTrigger asChild>
				<button
					type="button"
					aria-disabled={onClick ? undefined : "true"}
					onClick={onClick}
					className={cn(
						"text-muted-foreground/60 flex min-h-10 w-full items-center gap-2 rounded-md px-2 text-sm",
						onClick ? "hover:bg-accent cursor-pointer" : "cursor-not-allowed",
					)}
				>
					{icon}
					{label}
				</button>
			</TooltipTrigger>
			<TooltipContent>{disabledReason}</TooltipContent>
		</Tooltip>
	)
}

// the clipboard option, which shows a confirmation in place
export function CopyLinkOption({
	label,
	icon,
	className,
	isCopied,
	onCopy,
}: {
	label: string
	icon?: React.ReactNode
	className?: string
	isCopied: boolean
	onCopy: () => void
}) {
	return (
		<button type="button" onClick={onCopy} className={cn(className, isCopied && "text-primary")}>
			{icon}
			{isCopied ? "Copied" : label}
			{isCopied && <Check className="ml-auto size-4" />}
		</button>
	)
}
