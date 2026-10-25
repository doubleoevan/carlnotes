// every mobile story's frame, with the app's stylesheet, the light and dark toggle that switches the Uniwind theme, and
// the surface a story's parameter asks for
import "../global.css"
import { darkRoast, latte } from "@carlnotes/nightshift/colors"
import type { Preview } from "@storybook/react-native"
import { type ReactNode, useEffect } from "react"
import { View } from "react-native"
import { Uniwind } from "uniwind"

// the toggle's two themes, keyed by the backgrounds global's value
type StoryTheme = "light" | "dark"

const preview: Preview = {
	decorators: [
		(Story, { globals, parameters }) => (
			<StoryFrame
				theme={globals.backgrounds?.value === "dark" ? "dark" : "light"}
				isOnCard={parameters.surface === "card"}
			>
				<Story />
			</StoryFrame>
		),
	],
	parameters: {
		backgrounds: {
			options: {
				light: { name: "Latte", value: latte.background },
				dark: { name: "Dark roast", value: darkRoast.background },
			},
		},
	},
	initialGlobals: { backgrounds: { value: "light" } },
}

export default preview

// a story in the toggle's theme, on the page fill or a card's
function StoryFrame({ theme, isOnCard, children }: { theme: StoryTheme; isOnCard: boolean; children: ReactNode }) {
	// switch the theme the utilities read
	useEffect(() => {
		Uniwind.setTheme(theme)
	}, [theme])
	return <View className={`flex-1 items-start gap-3 p-4 ${isOnCard ? "bg-card" : "bg-background"}`}>{children}</View>
}
