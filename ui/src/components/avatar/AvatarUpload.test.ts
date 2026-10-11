// avatar upload tests over stubbed browser globals: a large photo comes out at the stored size as a jpeg, a png stays
// a png, a HEIC file the browser rejects goes through the HEIC decoder, and a file nothing can decode is reported and
// never sent
import { afterEach, expect, mock, spyOn, test } from "bun:test"
import { AVATAR_REJECTIONS, toUploadableAvatar } from "./AvatarUpload"

// the canvases the test's document created, each with the size it was drawn at and the type it was asked to encode
const createdCanvases: { width: number; height: number; encodedType?: string }[] = []

// a canvas whose context draws nothing and whose encode answers with a small blob of the asked type
function fakeCanvas(): HTMLCanvasElement {
	const createdCanvas = {
		width: 0,
		height: 0,
		encodedType: undefined as string | undefined,
		getContext: () => ({ drawImage: () => {} }),
		toBlob: (resolve: (blob: Blob | null) => void, type?: string) => {
			createdCanvas.encodedType = type
			resolve(new Blob(["encoded"], { type }))
		},
	}
	createdCanvases.push(createdCanvas)
	return createdCanvas as unknown as HTMLCanvasElement
}

// the sizes the canvases were drawn at
function readCanvasSizes(): { width: number; height: number }[] {
	return createdCanvases.map(({ width, height }) => ({ width, height }))
}

// the types the canvases were asked to encode
function readEncodedTypes(): (string | undefined)[] {
	return createdCanvases.map(({ encodedType }) => encodedType)
}

// a decoded bitmap of the given size
function toFakeBitmap({ width, height }: { width: number; height: number }): ImageBitmap {
	return { width, height, close: () => {} } as unknown as ImageBitmap
}

// a chosen file of the given name, content type, and byte size
function toChosenFile({ name, contentType, byteSize }: { name: string; contentType: string; byteSize: number }): File {
	return new File([new Uint8Array(byteSize)], name, { type: contentType })
}

// a document that creates fake canvases
const fakeDocument = { createElement: () => fakeCanvas() }

// remove the stubbed globals and mocks after each test
afterEach(() => {
	createdCanvases.length = 0
	// biome-ignore lint/suspicious/noExplicitAny: the test removes the globals it set
	delete (globalThis as any).document
	// biome-ignore lint/suspicious/noExplicitAny: the test removes the globals it set
	delete (globalThis as any).createImageBitmap
	mock.restore()
})

// a 48 megapixel jpeg decodes 512 pixels wide and comes out as a jpeg at the stored size
test("a large photo comes out at 512 pixels on its longest edge as a jpeg", async () => {
	// a browser that returns a 512 by 384 bitmap for a resized decode
	Object.assign(globalThis, { document: fakeDocument })
	const createImageBitmapSpy = mock((_file: File, options?: ImageBitmapOptions) =>
		Promise.resolve(
			options?.resizeWidth ? toFakeBitmap({ width: 512, height: 384 }) : toFakeBitmap({ width: 8000, height: 6000 }),
		),
	)
	Object.assign(globalThis, { createImageBitmap: createImageBitmapSpy })

	// the upload is a jpeg named after the file, drawn at 512 by 384
	const uploadableAvatar = await toUploadableAvatar(
		toChosenFile({ name: "photo.JPG", contentType: "image/jpeg", byteSize: 12 * 1024 * 1024 }),
	)
	expect(uploadableAvatar.status).toBe("ready")
	expect(uploadableAvatar.status === "ready" && uploadableAvatar.resizedAvatarFile.type).toBe("image/jpeg")
	expect(uploadableAvatar.status === "ready" && uploadableAvatar.resizedAvatarFile.name).toBe("photo.jpg")
	expect(createImageBitmapSpy.mock.calls[0]?.[1]).toEqual({
		imageOrientation: "from-image",
		resizeWidth: 512,
		resizeQuality: "high",
	})
	expect(readCanvasSizes()).toEqual([{ width: 512, height: 384 }])
	expect(readEncodedTypes()).toEqual(["image/jpeg"])
})

// a small png decodes whole, keeps its size, and re-encodes as a png so a transparent logo keeps its background
test("a small png decodes whole, keeps its size, and stays a png", async () => {
	// a browser that returns a 300 by 200 bitmap
	Object.assign(globalThis, { document: fakeDocument })
	const createImageBitmapSpy = mock((_file: File, _options?: ImageBitmapOptions) =>
		Promise.resolve(toFakeBitmap({ width: 300, height: 200 })),
	)
	Object.assign(globalThis, { createImageBitmap: createImageBitmapSpy })

	// the decode asks for no resize, the canvas keeps the size, and the encode is a png named after the file
	const uploadableAvatar = await toUploadableAvatar(
		toChosenFile({ name: "small.png", contentType: "image/png", byteSize: 20 * 1024 }),
	)
	expect(uploadableAvatar.status).toBe("ready")
	expect(uploadableAvatar.status === "ready" && uploadableAvatar.resizedAvatarFile.type).toBe("image/png")
	expect(uploadableAvatar.status === "ready" && uploadableAvatar.resizedAvatarFile.name).toBe("small.png")
	expect(createImageBitmapSpy.mock.calls[0]?.[1]).toEqual({ imageOrientation: "from-image" })
	expect(readCanvasSizes()).toEqual([{ width: 300, height: 200 }])
	expect(readEncodedTypes()).toEqual(["image/png"])
})

// a HEIC file the browser rejects is decoded by the HEIC decoder and comes out as a resized jpeg
test("a HEIC file the browser rejects goes through the HEIC decoder", async () => {
	// a browser that rejects the file, and a HEIC decoder that returns a bitmap
	Object.assign(globalThis, { document: fakeDocument })
	Object.assign(globalThis, {
		createImageBitmap: () => Promise.reject(new Error("The source image could not be decoded.")),
	})
	const heicToSpy = mock((_options: unknown) => Promise.resolve(toFakeBitmap({ width: 4032, height: 3024 })))
	mock.module("heic-to", () => ({ heicTo: heicToSpy }))

	// the decoder is asked for a bitmap of the file, and the upload is the resized jpeg
	const avatarFile = toChosenFile({ name: "IMG_0001.HEIC", contentType: "image/heic", byteSize: 3 * 1024 * 1024 })
	const uploadableAvatar = await toUploadableAvatar(avatarFile)
	expect(uploadableAvatar.status).toBe("ready")
	expect(uploadableAvatar.status === "ready" && uploadableAvatar.resizedAvatarFile.type).toBe("image/jpeg")
	expect(heicToSpy.mock.calls[0]?.[0]).toMatchObject({ blob: avatarFile, type: "bitmap" })
	expect(readCanvasSizes()).toEqual([{ width: 512, height: 384 }])
})

// a file nothing can decode shows the message, sends no upload, and is reported by its content type and byte size
test("an undecodable file is reported and never sent", async () => {
	// a browser that rejects a png, with the report request and the console watched
	Object.assign(globalThis, { document: fakeDocument })
	Object.assign(globalThis, { createImageBitmap: () => Promise.reject(new Error("could not be decoded")) })
	spyOn(console, "error").mockImplementation(() => {})
	const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response(null, { status: 204 }))

	// nothing comes back to send, and the report names the content type and the byte size
	const uploadableAvatar = await toUploadableAvatar(
		toChosenFile({ name: "broken.png", contentType: "image/png", byteSize: 2048 }),
	)
	expect(uploadableAvatar).toEqual({ status: "undecodable" })
	expect(readCanvasSizes()).toEqual([])
	expect(fetchSpy.mock.calls[0]?.[0]).toBe("/api/avatars/decode-failures")
	expect(JSON.parse(String(fetchSpy.mock.calls[0]?.[1]?.body))).toEqual({ contentType: "image/png", byteSize: 2048 })
	expect(AVATAR_REJECTIONS.undecodable).toBe("That image couldn't be read. Try a JPEG or PNG.")
})
