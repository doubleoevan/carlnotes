// the mobile component browser, a route only a development build shows
import AsyncStorage from "@react-native-async-storage/async-storage"
import { useEffect, useMemo } from "react"
import { Uniwind } from "uniwind"
import { view } from "../.rnstorybook/storybook.requires"

export default function StorybookScreen() {
	// build the component browser once, on the first render, keeping the story it last showed in AsyncStorage
	const StorybookUI = useMemo(() => view.getStorybookUI({ storage: AsyncStorage }), [])

	// set the theme back to the system's once the component browser closes
	useEffect(() => () => Uniwind.setTheme("system"), [])
	return <StorybookUI />
}
