// the mobile component browser, a route only a development build shows
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useEffect, useMemo } from "react"
import { Uniwind } from "uniwind"
import { NIGHTSHIFT_STORYBOOK_THEME, NightshiftStorybookUI } from "../.rnstorybook/manager"
import { view } from "../.rnstorybook/storybook.requires"

export default function StorybookScreen() {
	// build the component browser once, on the first render, in the Nightshift frame, keeping the story it last showed
	// in AsyncStorage
	const StorybookUI = useMemo(
		() =>
			view.getStorybookUI({
				storage: AsyncStorage,
				theme: NIGHTSHIFT_STORYBOOK_THEME,
				CustomUIComponent: NightshiftStorybookUI,
			}),
		[],
	)

	// set the theme back to the system's once the component browser closes
	useEffect(() => () => Uniwind.setTheme("system"), [])
	return <StorybookUI />
}
