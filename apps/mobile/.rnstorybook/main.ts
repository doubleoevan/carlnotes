// the mobile component browser's config, with the stories beside the components, the controls and actions addons, and
// the backgrounds that the light and dark toggle reads
import type { StorybookConfig } from "@storybook/react-native"

const storybookConfig: StorybookConfig = {
	stories: ["../src/components/**/*.stories.tsx"],
	deviceAddons: ["@storybook/addon-ondevice-controls", "@storybook/addon-ondevice-actions"],
	features: { ondeviceBackgrounds: true },
}

export default storybookConfig
