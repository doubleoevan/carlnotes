import type { ProfileIdentity } from "@shared/contracts"
import type * as React from "react"
import { UserAvatar } from "@/components/branding/UserAvatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { cn } from "@/lib/utils"

/**
 * A user's credit: their image and username, linking to their profile.
 */
export function UserProfileLink({
	user,
	avatarClassName = "size-6",
	className,
	label,
	isNewTab,
	...props
}: {
	user: ProfileIdentity
	avatarClassName?: string
	className?: string
	// the words before the username, like the topic byline's "Brewed by". omitted, the username stands alone
	label?: string
	// opens the profile in a new tab, for a link inside a table the user is still working in
	isNewTab?: boolean
} & React.ComponentProps<"a">) {
	// the rest props flow to the anchor, so a tooltip trigger can wrap this link asChild
	return (
		<AnchorLink
			href={`/profiles/${user.userId}`}
			{...(isNewTab ? { target: "_blank", rel: "noreferrer" } : {})}
			{...props}
			className={cn("inline-flex items-center gap-2 hover:underline", className)}
		>
			<UserAvatar
				userId={user.userId}
				username={user.username}
				avatarSource={user.avatarSource}
				className={avatarClassName}
			/>
			{label ? (
				<span className="text-muted-foreground">
					{label} <span className="text-link">{user.username}</span>
				</span>
			) : (
				<span className="text-link">{user.username}</span>
			)}
		</AnchorLink>
	)
}
