import { darkRoast, latte } from "@carlnotes/nightshift/colors"
import { router, Tabs, usePathname } from "expo-router"
import { House, Settings } from "lucide-react-native"
import { useUniwind } from "uniwind"
import { useHomeLink } from "@/providers/SearchBarProvider"

/**
 * Keeps Home and Settings in the native navigation bar under the protected stack.
 */
export default function TabLayout() {
	// take navigation colors from the current Nightshift palette
	const { theme } = useUniwind()
	const palette = theme === "dark" ? darkRoast : latte
	const homeLink = useHomeLink()
	const isSearch = usePathname() === "/search"
	return (
		<Tabs
			screenOptions={{
				headerShown: false,
				tabBarActiveTintColor: palette.primary,
				tabBarInactiveTintColor: palette.mutedForeground,
				tabBarStyle: { backgroundColor: palette.background, borderTopColor: palette.border },
				tabBarLabelStyle: { fontFamily: "Karla" },
			}}
		>
			{/* the two authenticated top-level destinations */}
			<Tabs.Screen
				name="index"
				listeners={{
					tabPress: (event) => {
						// apply the logo's search return to the bottom home button too
						event.preventDefault()
						homeLink.onPress()
						router.navigate(homeLink.href)
					},
				}}
				options={{
					title: "Home",
					tabBarAccessibilityLabel: "Home",
					tabBarIcon: ({ color, size }) => <House color={isSearch ? palette.primary : color} size={size} />,
					tabBarLabelStyle: isSearch ? { fontFamily: "Karla", color: palette.primary } : { fontFamily: "Karla" },
				}}
			/>
			{/* hide only the button. href: null redirects away from the route in Expo Router 58 */}
			<Tabs.Screen name="search" options={{ tabBarButton: () => null, tabBarItemStyle: { display: "none" } }} />
			<Tabs.Screen
				name="settings"
				options={{
					title: "Settings",
					tabBarAccessibilityLabel: "Settings",
					tabBarIcon: ({ color, size }) => <Settings color={color} size={size} />,
				}}
			/>
		</Tabs>
	)
}
