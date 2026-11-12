// a user menu row: a visitor or account destination with its icon, or the signed-in user's own avatar on the
// profile row
import { authClient } from "@carlnotes/client/authClient"
import { toAvatarImagePath } from "@carlnotes/contracts/avatars"
import { toValuesByDashboardPageName } from "@carlnotes/contracts/dashboards"
import { toSessionProfileIdentity } from "@carlnotes/contracts/profiles"
import { SITE_URL } from "@carlnotes/contracts/site"
import type { UserMenuLinkProps } from "@carlnotes/core/components/UserMenuItems"
import { cn } from "@carlnotes/nightshift/classNames"
import { Activity, BookOpen, Coffee, Columns3Cog, LogIn, ShieldUser, User, UserPlus, Users } from "lucide-react-native"
import { View } from "react-native"
import { Avatar } from "@/components/branding/Avatar"
import { AnchorLink } from "@/components/common/AnchorLink"
import { DASHBOARD_PAGE_ICONS } from "@/components/dashboard/dashboardPageIcons"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"

// preserve native routing, hosted docs/Admin, and the web's exact icon choices
const MENU_ICONS = {
	Topics: Coffee,
	Teams: Users,
	Activity,
	Account: User,
	...toValuesByDashboardPageName(DASHBOARD_PAGE_ICONS),
	Plans: Columns3Cog,
	"What CarlNotes Is": BookOpen,
	Admin: ShieldUser,
	"Log in": LogIn,
	"Sign up": UserPlus,
}

/**
 * Renders a visitor or account destination as a menu row with its icon.
 */
export function MenuLink({
	label,
	text,
	href,
	isSelected,
	onSelect,
}: Omit<UserMenuLinkProps, "label" | "onSelect"> & {
	label: UserMenuLinkProps["label"] | "Log in" | "Sign up"
	onSelect?: () => void
}) {
	const MenuIcon = MENU_ICONS[label as keyof typeof MENU_ICONS]
	return (
		<AnchorLink
			href={href === "/docs" || href === "/admin" ? `${SITE_URL}${href}` : href}
			accessibilityLabel={text ?? label}
			onPress={onSelect}
			accessibilityState={{ selected: isSelected }}
			className={cn("min-h-12 flex-row items-center gap-2 rounded-md px-2 active:bg-accent", isSelected && "bg-accent")}
		>
			{/* the Café row draws the user's own avatar, a size up so its circle matches the other icons */}
			{label === "Café" ? <CafeMenuAvatar /> : <Icon as={MenuIcon} className="size-4 text-foreground" />}
			<Text numberOfLines={1} className="shrink text-sm">
				{text ?? label}
			</Text>
		</AnchorLink>
	)
}

// the signed-in user's own avatar, the Café row's icon
function CafeMenuAvatar() {
	const { data: session } = authClient().useSession()
	if (!session) {
		return null
	}
	const { userId, username, avatarVersion } = toSessionProfileIdentity(session.user)
	return (
		<View className="-m-0.5">
			<Avatar
				size={20}
				ownerId={userId}
				name={username}
				imageUrl={avatarVersion ? toAvatarImagePath(userId, avatarVersion) : null}
			/>
		</View>
	)
}
