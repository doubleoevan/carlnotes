import { type FooterElements, Footer as SharedFooter } from "@carlnotes/core/components/Footer"
import { SITE_URL } from "@carlnotes/core/lib/pageHead"
import { View } from "react-native"
import { AnchorLink } from "@/components/common/AnchorLink"
import { toTouchTargetHitSlop } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"

/**
 * Shows the web's shared footer at the end of a native page's scrolling content.
 */
export function Footer() {
	return <SharedFooter elements={FOOTER_ELEMENTS} />
}

// native links open the existing public pages in the system browser view
const FOOTER_ELEMENTS: FooterElements = {
	Root: ({ children }) => <View className="w-full max-w-5xl self-center px-4 py-6">{children}</View>,
	Legal: ({ children }) => <View className="mt-3 gap-1.5">{children}</View>,
	Row: ({ children }) => (
		<View className="flex-row flex-wrap items-center justify-center gap-x-6 gap-y-1">{children}</View>
	),
	Text: ({ children }) => <Text className="text-center text-sm text-muted-foreground">{children}</Text>,
	Closing: ({ children }) => <Text className="mt-2 text-center text-sm text-muted-foreground">{children}</Text>,
	Link: ({ href, children }) => (
		<AnchorLink
			href={href.startsWith("/") ? `${SITE_URL}${href}` : href}
			accessibilityLabel={children}
			className="min-h-5 justify-center"
			hitSlop={toTouchTargetHitSlop(20)}
		>
			<Text className="text-center text-sm text-link">{children}</Text>
		</AnchorLink>
	),
}
