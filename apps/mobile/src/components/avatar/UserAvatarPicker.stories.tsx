import { AVATAR_UPLOAD_FAILED_TEXT } from "@carlnotes/core/lib/imageUpload"
import type { Meta, StoryObj } from "@storybook/react-native"
import { PAGE_AVATAR_SIZE } from "@/components/branding/Avatar"
import { UserAvatarPicker } from "./UserAvatarPicker"

// the avatar at rest, after the first tap shows the camera overlay, whose second tap opens the picker menu, after a
// failed upload, and with the line under an upload shown to the user alone, at the picker's own size and at a page
// header's
const meta = {
	title: "Avatar/UserAvatarPicker",
	component: UserAvatarPicker,
	parameters: { webReference: "apps/web/src/components/avatar/UserAvatarPicker.tsx" },
	args: { userId: "storybook-user", username: "vienna" },
} satisfies Meta<typeof UserAvatarPicker>
export default meta
type Story = StoryObj<typeof meta>
export const Default: Story = {}
export const OverlayShown: Story = { args: { isCameraInitiallyShown: true } }
export const UploadError: Story = { args: { initialError: AVATAR_UPLOAD_FAILED_TEXT } }
export const UncheckedPhoto: Story = { args: { isUncheckedLineShown: true } }
export const UncheckedPhotoInPageHeader: Story = { args: { isUncheckedLineShown: true, size: PAGE_AVATAR_SIZE } }
