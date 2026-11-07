import { useLocalSearchParams } from "expo-router"
import { type ComponentRef, createContext, type ReactNode, type RefObject, useContext } from "react"
import { View } from "react-native"

// the section a PageScreen opens at, which the matching SectionAnchor fills in
export type SectionTargetRef = RefObject<ComponentRef<typeof View> | null>
export const SectionTargetContext = createContext<SectionTargetRef | null>(null)

/**
 * Marks a section that a link opens its PageScreen at with `?section=<name>`, the screen's equivalent of a web anchor.
 */
export function SectionAnchor({ name, children }: { name: string; children: ReactNode }) {
	const { section } = useLocalSearchParams<{ section?: string }>()
	const sectionTargetRef = useContext(SectionTargetContext)

	// Android removes a plain wrapper view from the native tree, and a removed view cannot be measured
	return (
		<View ref={section === name ? sectionTargetRef : undefined} collapsable={false}>
			{children}
		</View>
	)
}
