import { authClient } from "@carlnotes/client/authClient"
import { Tabs } from "expo-router"

/**
 * Preserves the feed and search routes while the shared header provides navigation.
 */
export default function TabLayout() {
	const { data: session } = authClient().useSession()
	return (
		<Tabs screenOptions={{ headerShown: false }} tabBar={() => null}>
			<Tabs.Screen name="index" options={{ title: "Home" }} />
			<Tabs.Screen name="search" options={{ title: "Search" }} />
			<Tabs.Protected guard={Boolean(session)}>
				<Tabs.Screen name="settings" options={{ title: "Account" }} />
			</Tabs.Protected>
		</Tabs>
	)
}
