import { showClientError } from "@carlnotes/client/apiClient"
import { Slot } from "@rn-primitives/slot"
import * as Linking from "expo-linking"
import { type Href, Link } from "expo-router"
import * as WebBrowser from "expo-web-browser"
import { type GestureResponderEvent, Pressable, type PressableProps } from "react-native"

// every mobile link supplies a destination and an accessible name
export type AnchorLinkProps = PressableProps & {
	href: Href
	accessibilityLabel: string
	shouldReplace?: boolean
	shouldDismissTo?: boolean
	asChild?: boolean
}

/**
 * Routes internal links, browser links, and supported system links through their native destinations.
 */
export function AnchorLink({
	href,
	shouldReplace,
	shouldDismissTo,
	asChild = false,
	onPress,
	...props
}: AnchorLinkProps) {
	// let Expo Router own internal navigation and replacement
	const Component = asChild ? Slot : Pressable
	const isInternal = typeof href !== "string" || href.startsWith("/")
	if (isInternal) {
		return (
			<Link
				href={href}
				replace={shouldReplace}
				dismissTo={shouldDismissTo}
				onPress={(event) => onPress?.(event as GestureResponderEvent)}
				asChild
			>
				<Component {...props} accessibilityRole="link" />
			</Link>
		)
	}

	// notify the caller without waiting for recording before opening the destination
	const handlePress = (event: GestureResponderEvent): void => {
		onPress?.(event)
		if (!event.defaultPrevented) {
			void openExternalLink(href)
		}
	}
	return <Component {...props} onPress={handlePress} accessibilityRole="link" />
}

// open web content in the app's browser and supported schemes in their system app
async function openExternalLink(href: string): Promise<void> {
	try {
		if (/^https?:\/\//i.test(href)) {
			await WebBrowser.openBrowserAsync(href)
		} else if (/^(mailto|tel|sms):/i.test(href)) {
			await Linking.openURL(href)
		} else {
			throw new Error("unsupported link scheme")
		}
	} catch (error) {
		console.error("link open failed", error)
		showClientError("That link didn't open. Carl suggests trying again.")
	}
}
