import type { ProfileIdentity } from "@carlnotes/contracts/profiles"
import { UserProfileLink } from "@/components/common/UserProfileLink"

/**
 * The tooltip of a reaction type that people chose: the type in bold over a list of who chose it, each avatar and
 * username linking to that person's profile.
 */
export function ReactionUsersTooltip({
	label,
	users,
	moreUsersLabel,
}: {
	label: string
	users: ProfileIdentity[]
	moreUsersLabel: string | null
}) {
	// a modal behind the tooltip turns pointer events off for the page, and these links still need them
	return (
		<div className="pointer-events-auto">
			<p className="font-semibold">{label}</p>
			<ul className="mt-1.5 space-y-1">
				{users.map((user) => (
					<li key={user.userId}>
						<UserProfileLink user={user} avatarClassName="size-4" className="gap-1.5" nameClassName="text-inherit" />
					</li>
				))}
			</ul>
			{moreUsersLabel && <p className="mt-1">{moreUsersLabel}</p>}
		</div>
	)
}
