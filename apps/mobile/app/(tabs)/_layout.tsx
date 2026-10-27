import { Tabs } from "expo-router"

/**
 * Preserves the feed and search routes while the shared header provides navigation.
 */
export default function TabLayout() {
	return (
		<Tabs screenOptions={{ headerShown: false }} tabBar={() => null}>
			<Tabs.Screen name="index" options={{ title: "Home" }} />
			<Tabs.Screen name="search" options={{ title: "Search" }} />
			<Tabs.Screen name="settings" options={{ title: "Account" }} />
		</Tabs>
	)
}
