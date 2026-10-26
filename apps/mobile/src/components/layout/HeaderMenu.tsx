import { authClient } from "@carlnotes/client/authClient"
import { isAdminRole } from "@carlnotes/contracts/enums"
import { SITE_URL } from "@carlnotes/core/lib/pageHead"
import {
	Activity,
	BookOpen,
	CircleUserRound,
	Columns3Cog,
	LogOut,
	Menu,
	Moon,
	ShieldUser,
	Sun,
	User,
	Users,
} from "lucide-react-native"
import { type ComponentRef, useRef, useState } from "react"
import { View } from "react-native"
import { useUniwind } from "uniwind"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Sheet } from "@/components/common/Sheet"
import { Button } from "@/components/primitives/button"
import { Icon } from "@/components/primitives/icon"
import { Text } from "@/components/primitives/text"
import { TopicTutorialVideoDialog, TopicTutorialVideoIcon } from "@/components/topic/TopicTutorialVideoDialog"
import { useSignOut } from "@/hooks/useSignOut"
import { setThemePreference } from "@/theme"

/**
 * Matches the web hamburger's appearance controls, destinations, and account groups.
 */
export function HeaderMenu() {
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
	return (
		<>
			<Button
				ref={triggerRef}
				variant="ghost"
				size="icon-lg"
				className="ml-auto"
				accessibilityLabel="Menu"
				onPress={() => setIsOpen(true)}
			>
				<Icon as={Menu} className="size-5 text-hero-foreground" />
			</Button>
			{isOpen ? (
				<Sheet title="Menu" triggerRef={triggerRef} onClose={handleClose}>
					<ThemeMenu onClose={handleClose} />
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

// match the web's light and dark toggle
function ThemeMenu({ onClose }: { onClose: () => void }) {
	// offer the opposite palette and save the explicit choice
	const { theme } = useUniwind()
	const isDark = theme === "dark"
	const label = isDark ? "Light mode" : "Dark mode"
	const handleChange = (nextTheme: "light" | "dark"): void => {
		// apply and save the choice, then close the menu
		void setThemePreference(nextTheme)
		onClose()
	}
	return (
		<>
			<Button
				variant="ghost"
				className="min-h-12 justify-start gap-2 px-2"
				accessibilityLabel={label}
				onPress={() => handleChange(isDark ? "light" : "dark")}
			>
				<Icon as={isDark ? Sun : Moon} className="size-4 text-foreground" />
				<Text>{label}</Text>
			</Button>
			<MenuDivider />
		</>
	)
}

// preserve the web user menu's order and permission gate
function UserMenuItems({ onClose, onPlayTutorial }: { onClose: () => void; onPlayTutorial: () => void }) {
	// use the account's real identity and the shared native session cleanup
	const { data: session } = authClient().useSession()
	const { isPending, signOut } = useSignOut()
	return (
		<>
			{/* profile, teams, activity, and account */}
			{session ? (
				<MenuLink
					label="Profile"
					href={`${SITE_URL}/profiles/${session.user.id}`}
					icon={CircleUserRound}
					onClose={onClose}
				/>
			) : null}
			<MenuLink label="Teams" href={`${SITE_URL}/teams`} icon={Users} onClose={onClose} />
			<MenuLink label="Activity" href={`${SITE_URL}/activity`} icon={Activity} onClose={onClose} />
			<MenuLink label="Account" href="/settings" icon={User} onClose={onClose} />
			<MenuDivider />
			{/* plans, the tutorial, and docs */}
			<MenuLink label="Plans" href={`${SITE_URL}/plans`} icon={Columns3Cog} onClose={onClose} />
			<Button
				variant="ghost"
				className="min-h-12 justify-start gap-2 px-2"
				accessibilityLabel="Brew with Carl"
				onPress={onPlayTutorial}
			>
				<TopicTutorialVideoIcon size={16} />
				<Text>Brew with Carl</Text>
			</Button>
			<MenuLink label="What CarlNotes Is" href={`${SITE_URL}/docs`} icon={BookOpen} onClose={onClose} />
			<MenuDivider />
			{/* admin access and native sign-out */}
			{isAdminRole(session?.user.role) ? (
				<MenuLink label="Admin" href={`${SITE_URL}/admin`} icon={ShieldUser} onClose={onClose} />
			) : null}
			<Button
				variant="ghost"
				className="min-h-12 justify-start gap-2 px-2"
				accessibilityLabel="Sign out"
				disabled={isPending}
				onPress={() => void signOut()}
			>
				<Icon as={LogOut} className="size-4 text-foreground" />
				<Text>Sign out</Text>
			</Button>
		</>
	)
}

// keep destinations behind the app's link component
function MenuLink({
	label,
	href,
	icon,
	onClose,
}: {
	label: string
	href: string
	icon: typeof User
	onClose: () => void
}) {
	return (
		<AnchorLink
			href={href}
			accessibilityLabel={label}
			onPress={onClose}
			className="min-h-12 flex-row items-center gap-2 rounded-md px-2 active:bg-accent"
		>
			<Icon as={icon} className="size-4 text-foreground" />
			<Text className="text-sm">{label}</Text>
		</AnchorLink>
	)
}

// separate the same menu groups as the web
function MenuDivider() {
	return <View className="my-1 border-b border-separator" accessibilityElementsHidden />
}
