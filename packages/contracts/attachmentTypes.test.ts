// the native picker's mime types: each mime entry kept, and the suffixes no mime entry covers mapped to their types,
// which also type a file name the picker gave no type

import { expect, test } from "bun:test"
import {
	CHAT_ATTACHMENT_ACCEPT,
	DOCUMENT_FILE_TYPES,
	DOCX_TYPE,
	TOPIC_ATTACHMENT_ACCEPT,
	toPickerMimeTypes,
	toSuffixMimeType,
	VIDEO_FILE_TYPES,
} from "./attachmentTypes"

// the topic list keeps its wildcards and adds json, pdf, and the document types its suffixes name
test("the topic accept list becomes the native picker's mime types", () => {
	expect(toPickerMimeTypes(TOPIC_ATTACHMENT_ACCEPT)).toEqual([
		"image/*",
		"application/pdf",
		"text/*",
		"application/json",
		...DOCUMENT_FILE_TYPES,
	])
})

// the chat list adds its video types, and the topic list offers no video
test("only the chat accept list offers video", () => {
	expect(toPickerMimeTypes(CHAT_ATTACHMENT_ACCEPT)).toEqual(expect.arrayContaining(VIDEO_FILE_TYPES))
	expect(toPickerMimeTypes(TOPIC_ATTACHMENT_ACCEPT).some((mimeType) => mimeType.startsWith("video/"))).toBe(false)
})

// a pdf, json, word, or workbook name maps to its type, in any case, and any other name to none
test("a file name's suffix gives its type", () => {
	expect(toSuffixMimeType("Report.PDF")).toBe("application/pdf")
	expect(toSuffixMimeType("notes.docx")).toBe(DOCX_TYPE)
	expect(toSuffixMimeType("photo.heic")).toBeNull()
	expect(toSuffixMimeType("README")).toBeNull()
})
