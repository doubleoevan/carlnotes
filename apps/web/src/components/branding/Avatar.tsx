import { AVATAR_COLOR, toAvatarInitials, toAvatarTint } from "@carlnotes/contracts/avatars"
import { cn } from "@carlnotes/nightshift/classNames"
import { useState } from "react"
import { AVATAR_CLASS } from "@/lib/styleClasses"

/**
 * An avatar: the stored image at imageUrl, or the owner's initials on a tinted circle.
 * An image url that fails to load shows the initials instead.
 * A screen reader skips the initials, as it skips the image with its empty alt.
 */
export function Avatar({
	imageUrl,
	ownerId,
	name,
	className,
}: {
	// the image url at the avatar's version, or null for the initials
	imageUrl: string | null
	// the user or team id, which picks the tint
	ownerId: string
	name: string
	className?: string
}) {
	const [brokenImageUrl, setBrokenImageUrl] = useState<string | null>(null)
	return (
		<span className={cn(AVATAR_CLASS, "size-8", className)}>
			{imageUrl && imageUrl !== brokenImageUrl ? (
				<img src={imageUrl} alt="" onError={() => setBrokenImageUrl(imageUrl)} className="size-full object-cover" />
			) : (
				<AvatarInitials ownerId={ownerId} name={name} />
			)}
		</span>
	)
}

// the initials on a tinted circle, drawn from the same id and name everywhere
function AvatarInitials({ ownerId, name }: { ownerId: string; name: string }) {
	return (
		<svg viewBox="0 0 32 32" className="size-full" aria-hidden="true">
			<circle cx="16" cy="16" r="16" fill={toAvatarTint(ownerId)} />
			<text
				x="16"
				y="16"
				fill={AVATAR_COLOR}
				fontSize="13"
				textAnchor="middle"
				dominantBaseline="central"
				className="font-display"
			>
				{toAvatarInitials(name)}
			</text>
		</svg>
	)
}
