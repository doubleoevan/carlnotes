// a public Dashboard's share image is a 1200 by 630 png of its bars, and a Dashboard with no bars has none
import { expect, test } from "bun:test"
import {
	DASHBOARD_SHARE_IMAGE_HEIGHT,
	DASHBOARD_SHARE_IMAGE_WIDTH,
	toDashboardShareImagePng,
} from "./dashboardShareImage"

// a png's width and height, from its header chunk
function toPngSize(png: Uint8Array): { width: number; height: number } {
	const view = new DataView(png.buffer, png.byteOffset, png.byteLength)
	return { width: view.getUint32(16), height: view.getUint32(20) }
}

test("the share image is a 1200 by 630 png", async () => {
	// two topics' bars, one with a title too long to fit
	const bars = [
		{
			itemId: "topic-1",
			title: "Coffee roasting at home with a popcorn popper and a thermometer",
			path: "/t/1",
			count: 9,
		},
		{ itemId: "topic-2", title: "Espresso grinders", path: "/t/2", count: 4 },
	]
	const png = await toDashboardShareImagePng({ dashboardKind: "topicDashboard", bars })

	// a png at the open graph size
	expect(png).not.toBeNull()
	expect(Buffer.from(png?.subarray(1, 4) ?? []).toString()).toBe("PNG")
	expect(toPngSize(png ?? new Uint8Array())).toEqual({
		width: DASHBOARD_SHARE_IMAGE_WIDTH,
		height: DASHBOARD_SHARE_IMAGE_HEIGHT,
	})
})

test("a Dashboard with no bars has no share image", async () => {
	expect(await toDashboardShareImagePng({ dashboardKind: "podcastDashboard", bars: [] })).toBeNull()
})
