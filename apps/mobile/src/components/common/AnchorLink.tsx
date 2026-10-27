import { showClientError } from "@carlnotes/client/apiClient"
import { toCtaTag } from "@carlnotes/contracts/signupCta"
import { Slot } from "@rn-primitives/slot"
import * as Linking from "expo-linking"
import { type Href, Link } from "expo-router"
import * as WebBrowser from "expo-web-browser"
import { type GestureResponderEvent, Pressable, type PressableProps } from "react-native"
import { toNativePath } from "@/nativePath"
import { captureVisitEvent } from "@/visitAnalytics"

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
	href: destination,
	shouldReplace,
	shouldDismissTo,
	asChild = false,
	onPress,
	...props
}: AnchorLinkProps) {
	const href = typeof destination === "string" ? toNativePath(destination) : destination
	// let Expo Router own internal navigation and replacement
	const Component = asChild ? Slot : Pressable
	const isInternal = typeof href !== "string" || href.startsWith("/")
	if (isInternal) {
		return (
			<Link
				href={href}
				replace={shouldReplace}
				dismissTo={shouldDismissTo}
				onPress={(event) => {
					// report only an intentional CTA tag, never arbitrary link parameters
					onPress?.(event as GestureResponderEvent)
					const tag = toCtaTag(
						typeof href === "string"
							? new URL(href, "https://carlnotes.com").searchParams.get("cta")
							: typeof href.params?.cta === "string"
								? href.params.cta
								: null,
					)
					if (!event.defaultPrevented && tag) {
						captureVisitEvent("visit_cta_clicked", { cta: tag })
					}
				}}
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

/**
 * Opens web content in the app's browser and supported schemes in their system app.
 */
export async function openExternalLink(href: string): Promise<void> {
	try {
		if (/^https?:\/\//i.test(href)) {
			await WebBrowser.openBrowserAsync(href, { presentationStyle: WebBrowser.WebBrowserPresentationStyle.PAGE_SHEET })
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
