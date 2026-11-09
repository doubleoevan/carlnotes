import {
	CARL_PITCH,
	HERO_CALL_TO_ACTION,
	HERO_IMAGE_ALT,
	HERO_IMAGE_SIZE,
	HERO_PITCH_LABEL,
	HERO_TAGLINE,
} from "@carlnotes/core/lib/homeHero"
import { type ComponentRef, useRef, useState } from "react"
import { Image, Pressable, View } from "react-native"
import { NoteIcon } from "@/components/branding/NoteIcon"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Sheet } from "@/components/common/Sheet"
import { toTouchTargetHitSlop } from "@/components/primitives/button"
import { Text } from "@/components/primitives/text"
import { useHomeLink } from "@/providers/SearchBarProvider"

// the hero image at the phone web's width, and its aspect ratio
const HERO_IMAGE_WIDTH = 112
const HERO_IMAGE_HEIGHT = Math.round((HERO_IMAGE_WIDTH * HERO_IMAGE_SIZE.height) / HERO_IMAGE_SIZE.width)

/**
 * A visitor's Home hero, the phone web's: Carl's image, the call to action with the pitch behind its note button, and
 * the tagline. The headline sits under the hero, beside the New Topic button. It scrolls with the page under the
 * pinned brand row, as the phone web's hero scrolls with the page.
 */
export function HomeHero() {
	// the pitch sheet, which returns focus to its button
	const [isPitchOpen, setIsPitchOpen] = useState(false)
	const pitchTriggerRef = useRef<ComponentRef<typeof View>>(null)
	const homeLink = useHomeLink()
	return (
		<View className="w-full gap-3 bg-hero px-4 pb-6">
			{/* Carl links home, and the copy sits beside him */}
			<View className="flex-row items-end gap-4">
				<AnchorLink href={homeLink.href} accessibilityLabel="CarlNotes home" className="shrink-0">
					<Image
						source={require("../../../assets/carl-hero.png")}
						accessibilityLabel={HERO_IMAGE_ALT}
						style={{ width: HERO_IMAGE_WIDTH, height: HERO_IMAGE_HEIGHT }}
					/>
				</AnchorLink>
				<View className="min-w-0 flex-1 gap-1 pb-2">
					<View className="flex-row flex-wrap items-end gap-1">
						<Text className="shrink text-sm font-bold text-hero-foreground">{HERO_CALL_TO_ACTION}</Text>
						<Pressable
							ref={pitchTriggerRef}
							accessibilityRole="button"
							accessibilityLabel={HERO_PITCH_LABEL}
							hitSlop={toTouchTargetHitSlop(24)}
							onPress={() => setIsPitchOpen(true)}
						>
							<NoteIcon />
						</Pressable>
					</View>
					<Text className="text-sm font-bold text-hero-accent">{HERO_TAGLINE}</Text>
				</View>
			</View>
			{/* the pitch, which the phone web shows in a popover from the note button */}
			{isPitchOpen ? (
				<Sheet title={HERO_PITCH_LABEL} triggerRef={pitchTriggerRef} onClose={() => setIsPitchOpen(false)}>
					<Text className="px-2 pb-2 text-sm">{CARL_PITCH}</Text>
				</Sheet>
			) : null}
		</View>
	)
}
