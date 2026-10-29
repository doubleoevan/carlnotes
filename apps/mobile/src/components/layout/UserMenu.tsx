import { authClient } from "@carlnotes/client/authClient"
import { isAdminRole } from "@carlnotes/contracts/enums"
import {
	UserMenuItems as SharedUserMenuItems,
	type UserMenuElements,
	type UserMenuLinkProps,
} from "@carlnotes/core/components/UserMenuItems"
import { useAllUpdateBadges, useUserMenuUpdateBadges } from "@carlnotes/core/hooks/useUpdateCounts"
import { SITE_URL } from "@carlnotes/core/lib/pageHead"
import { toMenuTriggerLabel } from "@carlnotes/core/lib/updateCounts"
import { cn } from "@carlnotes/nightshift/classNames"
import { usePathname } from "expo-router"
import {
	Activity,
	BookOpen,
	CircleUserRound,
	Columns3Cog,
	LogIn,
	LogOut,
	Menu,
	ShieldUser,
	User,
	UserPlus,
	Users,
} from "lucide-react-native"
import { type ComponentRef, useRef, useState } from "react"
import { View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { YoutubePlayIcon } from "@/components/common/BrandIcon"
import { Sheet } from "@/components/common/Sheet"
import { UpdateCountBadge } from "@/components/common/UpdateCountBadge"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { TopicTutorialVideoDialog } from "@/components/topic/TopicTutorialVideoDialog"
import { useSignOut } from "@/hooks/useSignOut"
import { ThemeMenu } from "./ThemeMenu"

/**
 * Matches the web hamburger's appearance controls, destinations, and account groups.
 */
export function UserMenu() {
	// return focus to the hamburger when either sheet closes
	const [isOpen, setIsOpen] = useState(false)
	const [isTutorialOpen, setIsTutorialOpen] = useState(false)
	const triggerRef = useRef<ComponentRef<typeof View>>(null)
	const handleClose = (): void => setIsOpen(false)
	const handleTutorial = (): void => {
		// replace the menu with the native tutorial sheet
		setIsOpen(false)
		setIsTutorialOpen(true)
	}

	// the button's name reads the one summed badge: its own name, then each waiting group
	const updateBadges = useAllUpdateBadges()
	return (
		<>
			<Button
				ref={triggerRef}
				variant="ghost"
				size="icon-lg"
				className="ml-auto"
				accessibilityLabel={toMenuTriggerLabel("Menu", updateBadges)}
				onPress={() => setIsOpen(true)}
			>
				<Icon as={Menu} className="size-5 text-hero-foreground" />
				<UpdateCountBadge
					{...updateBadges}
					isDecorative
					className="absolute -top-0.5 -right-0.5"
					countBadgeClassName="text-xs"
				/>
			</Button>
			{isOpen ? (
				<Sheet title="Menu" triggerRef={triggerRef} onClose={handleClose}>
					<ThemeMenu onClose={handleClose} />
					<MenuDivider />
					<UserMenuItems onClose={handleClose} onPlayTutorial={handleTutorial} />
				</Sheet>
			) : null}
			{isTutorialOpen ? (
				<TopicTutorialVideoDialog
					opener="mobile-menu"
					triggerRef={triggerRef}
					onClose={() => setIsTutorialOpen(false)}
				/>
			) : null}
		</>
	)
}

// preserve the web user menu's order and permission gate
function UserMenuItems({ onClose, onPlayTutorial }: { onClose: () => void; onPlayTutorial: () => void }) {
	// use the account's real identity and the shared native session cleanup
	const { data: session } = authClient().useSession()
	const { isPending, signOut } = useSignOut()
	const pathname = usePathname()
	// what each row sums into its badge, the web's split
	const userMenuUpdateBadges = useUserMenuUpdateBadges()
	if (!session) {
		return (
			<>
				<USER_MENU_ELEMENTS.Action label="Brew with Carl" onSelect={onPlayTutorial} />
				<USER_MENU_ELEMENTS.Link label="What CarlNotes Is" href="/docs" isSelected={false} onSelect={onClose} />
				<MenuDivider />
				<MenuLink label="Log in" href="/sign-in" isSelected={false} onSelect={onClose} />
				<MenuLink label="Sign up" href="/sign-up" isSelected={false} onSelect={onClose} />
			</>
		)
	}
	return (
		<SharedUserMenuItems
			elements={USER_MENU_ELEMENTS}
			userId={session.user.id}
			isAdmin={isAdminRole(session.user.role)}
			pathname={pathname === "/settings" ? "/account" : pathname}
			onNavigate={onClose}
			onPlayTutorial={onPlayTutorial}
			onSignOut={() => void signOut()}
			isSigningOut={isPending}
			renderBadge={(label) => <UpdateCountBadge {...userMenuUpdateBadges[label]} countBadgeClassName="text-xs" />}
		/>
	)
}

// preserve native routing, hosted docs/Admin, and the web's exact icon choices
const MENU_ICONS = {
	Profile: CircleUserRound,
	Teams: Users,
	Activity,
	Account: User,
	Plans: Columns3Cog,
	"What CarlNotes Is": BookOpen,
	Admin: ShieldUser,
	"Log in": LogIn,
	"Sign up": UserPlus,
}
// render visitor and account destinations with the same link component
function MenuLink({
	label,
	href,
	isSelected,
	onSelect,
}: Omit<UserMenuLinkProps, "label"> & { label: UserMenuLinkProps["label"] | "Log in" | "Sign up" }) {
	const MenuIcon = MENU_ICONS[label as keyof typeof MENU_ICONS]
	return (
		<AnchorLink
			href={href === "/docs" || href === "/admin" ? `${SITE_URL}${href}` : href}
			accessibilityLabel={label}
			onPress={onSelect}
			accessibilityState={{ selected: isSelected }}
			className={cn("min-h-12 flex-row items-center gap-2 rounded-md px-2 active:bg-accent", isSelected && "bg-accent")}
		>
			<Icon as={MenuIcon} className="size-4 text-foreground" />
			<Text className="text-sm">{label}</Text>
		</AnchorLink>
	)
}

const USER_MENU_ELEMENTS: UserMenuElements = {
	Link: MenuLink,
	Action: ({ label, onSelect, isDisabled }) => (
		<Button
			variant="ghost"
			className="min-h-12 justify-start gap-2 px-2"
			accessibilityLabel={label}
			disabled={isDisabled}
			onPress={onSelect}
		>
			{label === "Brew with Carl" ? (
				<YoutubePlayIcon size={16} />
			) : (
				<Icon as={LogOut} className="size-4 text-foreground" />
			)}
			<Text>{label}</Text>
		</Button>
	),
	Divider: MenuDivider,
}

// separate the same menu groups as the web
function MenuDivider() {
	return <View className="my-1 border-b border-separator" accessibilityElementsHidden />
}
