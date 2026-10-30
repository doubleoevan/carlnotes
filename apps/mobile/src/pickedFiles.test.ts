// the picked file shapes: document and image assets, a document typed by its suffix, unnamed camera shots, accepted media, renamed re-encodes, and
// the account guard around preparing them

import { expect, test } from "bun:test"
import { CHAT_ATTACHMENT_ACCEPT, DOCX_TYPE, TOPIC_ATTACHMENT_ACCEPT } from "@carlnotes/contracts/attachmentTypes"
import {
	isPickedImage,
	type PickedFile,
	toAcceptedMedia,
	toPickedDocument,
	toPickedImage,
	toPreparedPickedFiles,
	toRenamedFileName,
} from "./pickedFiles"

// a document asset keeps its name, type, and size
test("a document asset reads as a picked file from Files", () => {
	expect(
		toPickedDocument({ uri: "file:///cache/paper.pdf", name: "paper.pdf", mimeType: "application/pdf", size: 1200 }),
	).toEqual({
		uri: "file:///cache/paper.pdf",
		name: "paper.pdf",
		mimeType: "application/pdf",
		byteSize: 1200,
	})
	expect(toPickedDocument({ uri: "file:///cache/notes.docx", name: "Notes.DOCX", mimeType: "" }).mimeType).toBe(
		DOCX_TYPE,
	)
	expect(
		toPickedDocument({ uri: "file:///cache/blob", name: "blob", mimeType: "application/octet-stream" }).mimeType,
	).toBe("application/octet-stream")
})

// a camera shot arrives unnamed, so it is named by its kind and type
test("an unnamed camera shot is named photo by its type", () => {
	const pickedFile = toPickedImage({ uri: "file:///cache/shot.jpg", mimeType: "image/jpeg", fileSize: 3_000_000 })
	expect(pickedFile).toMatchObject({ name: "photo.jpeg", byteSize: 3_000_000 })
	expect(isPickedImage(pickedFile)).toBe(true)
	expect(toPickedImage({ uri: "file:///cache/clip", type: "video", fileName: null }).name).toBe("video.mp4")
})

// chat takes images and video, a topic takes images and no video
test("the accept lists say which media they take", () => {
	expect(toAcceptedMedia(CHAT_ATTACHMENT_ACCEPT)).toEqual({ isImageAccepted: true, isVideoAccepted: true })
	expect(toAcceptedMedia(TOPIC_ATTACHMENT_ACCEPT)).toEqual({ isImageAccepted: true, isVideoAccepted: false })
	expect(toAcceptedMedia([".pdf"])).toEqual({ isImageAccepted: false, isVideoAccepted: false })
})

// a re-encoded image keeps its name with the new format's suffix
test("a re-encoded image is renamed to its new suffix", () => {
	expect(toRenamedFileName("IMG_0001.HEIC", "jpg")).toBe("IMG_0001.jpg")
	expect(toRenamedFileName("logo.webp", "png")).toBe("logo.png")
	expect(toRenamedFileName(".heic", "jpg")).toBe("photo.jpg")
})

test("files prepared after the account changed are deleted and none are taken", async () => {
	const deletedUris: string[] = []
	let isSignedIn = true
	const preparedFiles = await toPreparedPickedFiles({
		pickedFiles: [toPickedTestFile("a.jpg"), toPickedTestFile("b.jpg")],
		prepare: async (pickedFile) => {
			isSignedIn = false
			return { ...pickedFile, uri: `${pickedFile.uri}.resized` }
		},
		isSameAccount: () => isSignedIn,
		deleteFile: (pickedFile) => deletedUris.push(pickedFile.uri),
	})
	expect(preparedFiles).toEqual([])
	expect(deletedUris).toEqual(["file:///a.jpg.resized", "file:///b.jpg.resized"])
})

test("a file the preparer rejects is left out, and the rest are taken", async () => {
	const preparedFiles = await toPreparedPickedFiles({
		pickedFiles: [toPickedTestFile("broken.heic"), toPickedTestFile("photo.jpg")],
		prepare: async (pickedFile) => (pickedFile.name === "broken.heic" ? null : pickedFile),
		isSameAccount: () => true,
		deleteFile: () => {
			throw new Error("nothing should be deleted")
		},
	})
	expect(preparedFiles.map((pickedFile) => pickedFile.name)).toEqual(["photo.jpg"])
})

// a picked photo with only the fields the preparer reads
function toPickedTestFile(name: string): PickedFile {
	return { uri: `file:///${name}`, name, mimeType: "image/jpeg", byteSize: 1 }
}
