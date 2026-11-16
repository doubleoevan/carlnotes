// the mobile component browser, a route only a development build shows
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useLocalSearchParams } from "expo-router"
import { useEffect, useMemo } from "react"
import { restoreTheme } from "@/theme"
import { NIGHTSHIFT_STORYBOOK_THEME, NightshiftStorybookUI } from "../.rnstorybook/manager"
import { view } from "../.rnstorybook/storybook.requires"
import { createTopicMemoriesStorybook } from "../.rnstorybook/topicMemoriesStorybook"

export default function StorybookScreen() {
	// a direct story link opens its canvas without changing the browser's last selection
	const { story } = useLocalSearchParams<{ story?: string }>()
	const topicMemoryStoryId = story === "owner" || story === "read-only" || story === "empty" ? story : undefined
	const StorybookUI = useMemo(
		() =>
			topicMemoryStoryId
				? createTopicMemoriesStorybook(`topic-topicmemoriesdialog--${topicMemoryStoryId}`)
				: view.getStorybookUI({
						storage: AsyncStorage,
						theme: NIGHTSHIFT_STORYBOOK_THEME,
						CustomUIComponent: NightshiftStorybookUI,
					}),
		[topicMemoryStoryId],
	)

	// restore the app's appearance once the component browser closes
	useEffect(() => () => void restoreTheme(), [])
	return <StorybookUI />
}
