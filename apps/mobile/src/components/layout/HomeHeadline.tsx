import { HERO_HEADLINE_FIRST_SENTENCE, HERO_HEADLINE_LAST_SENTENCE } from "@carlnotes/core/lib/homeHero"
import { router } from "expo-router"
import { useState } from "react"
import { Text as NativeText, View } from "react-native"
import { ShimmerText } from "@/components/common/ShimmerText"
import { toTypeRoleStyle } from "@/typeRoleStyles"

// the last sentence with non-breaking spaces, so a narrow row moves "All of it." to the next line as one unit
const LAST_SENTENCE_UNBROKEN = HERO_HEADLINE_LAST_SENTENCE.replaceAll(" ", " ")

// the headline starts at the page title's size and shrinks to fit one row beside New Topic, never below the web's
// phone size. the line height keeps the page title's ratio
const PAGE_TITLE_STYLE = toTypeRoleStyle("pageTitle")
const HEADLINE_MAX_FONT_SIZE = PAGE_TITLE_STYLE.fontSize ?? 24
const HEADLINE_MIN_FONT_SIZE = 18
const HEADLINE_LINE_HEIGHT_SCALE = (PAGE_TITLE_STYLE.lineHeight ?? 32) / HEADLINE_MAX_FONT_SIZE

/**
 * The Home headline, on both faces, the web's under its search bar: a light wipes across it once, with its last sentence in
 * the link color, which opens Topics. It takes the largest size that fits one row beside New Topic, down to the web's
 * phone size, and on a row too narrow even then its last sentence moves to the next line as one unit.
 */
export function HomeHeadline() {
	// the row's width for the headline, and the headline's one-line width at the largest size
	const [availableWidth, setAvailableWidth] = useState(0)
	const [naturalWidth, setNaturalWidth] = useState(0)

	// shrink the font by the share of the one-line width that fits, within the size limits
	const fittedFontSize =
		availableWidth && naturalWidth ? (HEADLINE_MAX_FONT_SIZE * availableWidth) / naturalWidth : HEADLINE_MAX_FONT_SIZE
	const fontSize = Math.max(HEADLINE_MIN_FONT_SIZE, Math.min(HEADLINE_MAX_FONT_SIZE, Math.floor(fittedFontSize)))
	const headlineStyle = { ...PAGE_TITLE_STYLE, fontSize, lineHeight: Math.round(fontSize * HEADLINE_LINE_HEIGHT_SCALE) }
	return (
		<View className="min-w-0 flex-1" onLayout={(event) => setAvailableWidth(event.nativeEvent.layout.width)}>
			{/* a hidden one-line copy at the largest size, measured in a wide box so it never wraps */}
			<View pointerEvents="none" aria-hidden className="absolute top-0 left-0 w-[1000px] opacity-0">
				<NativeText
					numberOfLines={1}
					style={PAGE_TITLE_STYLE}
					className="self-start"
					onLayout={(event) => setNaturalWidth(event.nativeEvent.layout.width)}
				>
					{`${HERO_HEADLINE_FIRST_SENTENCE} ${LAST_SENTENCE_UNBROKEN}`}
				</NativeText>
			</View>
			<ShimmerText className="shrink">
				<NativeText accessibilityRole="header" style={headlineStyle} className="text-foreground">
					{`${HERO_HEADLINE_FIRST_SENTENCE} `}
					<NativeText
						accessibilityRole="link"
						className="text-link underline"
						onPress={() => router.navigate("/topics")}
					>
						{LAST_SENTENCE_UNBROKEN}
					</NativeText>
				</NativeText>
			</ShimmerText>
		</View>
	)
}
