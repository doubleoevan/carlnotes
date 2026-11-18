import {
	CARL_PITCH,
	HERO_CALL_TO_ACTION,
	HERO_IMAGE_ALT,
	HERO_IMAGE_SIZE,
	HERO_PITCH_LABEL,
	HERO_TAGLINE,
} from "@carlnotes/core/lib/homeHero"
import { type ComponentRef, useRef, useState } from "react"
import { Image, Pressable, useWindowDimensions, View } from "react-native"
import { NoteIcon } from "@/components/branding/NoteIcon"
import { AnchorLink } from "@/components/common/AnchorLink"
import { Sheet } from "@/components/common/Sheet"
import { Text } from "@/components/primitives/text"
import { PageActionMenu } from "@/components/search/PageActionMenu"
import { SearchBar } from "@/components/search/SearchBar"
import { useSearchBar } from "@/providers/SearchBarProvider"

// the search inset includes the toolbar border, and the note fits on one line of copy
const SEARCH_ICON_INSET = 13
const HERO_COPY_CLASS = "text-[13px] leading-tight font-bold"
const HERO_NOTE_SIZE = 16

/**
 * A visitor's Home hero, the phone web's: Carl's image, the call to action with the pitch behind its note button, and
 * the tagline. The headline sits under the hero, beside the New Topic button. It scrolls with the page under the
 * pinned brand row, as the phone web's hero scrolls with the page.
 */
export function HomeHero() {
	// the pitch sheet, which returns focus to its button
	const [isPitchOpen, setIsPitchOpen] = useState(false)
	const pitchTriggerRef = useRef<ComponentRef<typeof View>>(null)
	// fit the image to the same column as the phone web and align it with the search icon
	const { filters } = useSearchBar()
	const { width } = useWindowDimensions()
	const narrowImageColumnWidth = width < 370 ? 136 : 148
	const imageColumnWidth = width >= 460 ? 116 : narrowImageColumnWidth
	const imageWidth = imageColumnWidth - SEARCH_ICON_INSET
	const imageHeight = (imageWidth * HERO_IMAGE_SIZE.height) / HERO_IMAGE_SIZE.width

	return (
		<View className="w-full">
			{/* the illustration lines up with the toolbar's search icon and extends behind the toolbar */}
			<View className="flex-row items-end gap-4 bg-hero px-4 pb-6">
				<AnchorLink
					href="/"
					accessibilityLabel="CarlNotes home"
					className="-mb-2"
					style={{ marginLeft: SEARCH_ICON_INSET }}
				>
					<Image
						source={require("../../../assets/carl-hero.png")}
						accessibilityLabel={HERO_IMAGE_ALT}
						className="rounded-lg"
						style={{ width: imageWidth, height: imageHeight }}
					/>
				</AnchorLink>
				{/* the pitch button includes its copy so it has a full-size touch target */}
				<View className="min-w-0 flex-1 self-center gap-1 pb-1.5">
					<Pressable
						ref={pitchTriggerRef}
						accessibilityRole="button"
						accessibilityLabel={`${HERO_CALL_TO_ACTION} ${HERO_PITCH_LABEL}`}
						className="min-h-12 justify-center"
						onPress={() => setIsPitchOpen(true)}
					>
						<Text className={`${HERO_COPY_CLASS} text-hero-foreground`}>
							{HERO_CALL_TO_ACTION} <NoteIcon size={HERO_NOTE_SIZE} />
						</Text>
					</Pressable>
					<Text className={`${HERO_COPY_CLASS} text-hero-accent`}>{HERO_TAGLINE}</Text>
				</View>
			</View>
			{/* the native search toolbar crosses the hero's lower edge */}
			<View className="z-10 -mt-3">
				<SearchBar filters={filters} hasSort={false} actions={<PageActionMenu page="Home" />} />
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
