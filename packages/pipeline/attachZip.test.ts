// zip directory tests: a document's entries read from its directory alone, a small file that declares a huge unpacked
// size in 32-bit and in zip64 fields, and a file that is not a zip
import { expect, test } from "bun:test"
import { AttachmentValidationError } from "./attachContentType"
import { toDocxFixtureBytes, toOversizedZipBytes } from "./attachTestFixtures"
import { MAX_ZIP_UNPACKED_BYTES, readZipEntries, toStoredZipRecord } from "./attachZip"

// the value that marks a size or an offset as held in the zip64 fields
const ZIP64_MARKER = 0xffffffff

// a zip of one stored entry to build: the entry's bytes, the unpacked size its directory declares, and whether the
// directory names its sizes and its own offset in the zip64 fields
type ToDeclaredZipOptions = { entryBytes: Uint8Array; unpackedByteSize: number; isZip64: boolean }

// a zip of one stored entry whose directory declares the given unpacked size, whatever the entry's bytes hold
function toDeclaredZipBytes({ entryBytes, unpackedByteSize, isZip64 }: ToDeclaredZipOptions): Uint8Array {
	// the entry's own record and bytes come first, so the directory starts after them
	const name = new TextEncoder().encode("word/document.xml")
	const entryRecord = Buffer.concat(toStoredZipRecord("word/document.xml", entryBytes))
	const zip64ExtraField = Buffer.alloc(isZip64 ? 20 : 0)
	const directoryEntry = Buffer.alloc(46)

	// the directory entry's signature, its sizes, its name and extra lengths, and the offset of the entry's record
	directoryEntry.writeUInt32LE(0x02014b50, 0)
	directoryEntry.writeUInt32LE(isZip64 ? ZIP64_MARKER : entryBytes.byteLength, 20)
	directoryEntry.writeUInt32LE(isZip64 ? ZIP64_MARKER : unpackedByteSize, 24)
	directoryEntry.writeUInt16LE(name.byteLength, 28)
	directoryEntry.writeUInt16LE(zip64ExtraField.byteLength, 30)

	// the zip64 field holds the marked sizes in eight bytes each, the unpacked size first
	if (isZip64) {
		zip64ExtraField.writeUInt16LE(0x0001, 0)
		zip64ExtraField.writeUInt16LE(16, 2)
		zip64ExtraField.writeBigUInt64LE(BigInt(unpackedByteSize), 4)
		zip64ExtraField.writeBigUInt64LE(BigInt(entryBytes.byteLength), 12)
	}

	// the records that end the zip, which name where the directory starts
	const directory = Buffer.concat([directoryEntry, name, zip64ExtraField])
	const endRecords = toEndRecords({
		directoryOffset: entryRecord.byteLength,
		directoryByteSize: directory.byteLength,
		isZip64,
	})
	return new Uint8Array(Buffer.concat([entryRecord, directory, endRecords]))
}

// where a zip's directory starts and how long it runs, and whether the zip64 records name the offset
type ToEndRecordsOptions = { directoryOffset: number; directoryByteSize: number; isZip64: boolean }

// the record that ends a zip, after the zip64 end record and its locator if the zip64 records name the directory
function toEndRecords({ directoryOffset, directoryByteSize, isZip64 }: ToEndRecordsOptions): Buffer {
	// the end record, with the directory's offset marked if the zip64 end record holds it
	const endRecord = Buffer.alloc(22)
	endRecord.writeUInt32LE(0x06054b50, 0)
	endRecord.writeUInt16LE(1, 8)
	endRecord.writeUInt16LE(1, 10)
	endRecord.writeUInt32LE(directoryByteSize, 12)
	endRecord.writeUInt32LE(isZip64 ? ZIP64_MARKER : directoryOffset, 16)

	// a zip within four gigabytes ends with the end record alone
	if (!isZip64) {
		return endRecord
	}

	// the zip64 end record names the entry count, the directory's size, and its offset in eight bytes each
	const zip64EndRecord = Buffer.alloc(56)
	zip64EndRecord.writeUInt32LE(0x06064b50, 0)
	zip64EndRecord.writeBigUInt64LE(1n, 32)
	zip64EndRecord.writeBigUInt64LE(BigInt(directoryByteSize), 40)
	zip64EndRecord.writeBigUInt64LE(BigInt(directoryOffset), 48)

	// the locator names where the zip64 end record starts, right after the directory
	const zip64Locator = Buffer.alloc(20)
	zip64Locator.writeUInt32LE(0x07064b50, 0)
	zip64Locator.writeBigUInt64LE(BigInt(directoryOffset + directoryByteSize), 8)
	return Buffer.concat([zip64EndRecord, zip64Locator, endRecord])
}

// a document's parts are named with their sizes, read from the directory with nothing unpacked
test("readZipEntries reads a document's entries from its directory", () => {
	const zipEntries = readZipEntries(toDocxFixtureBytes())
	const documentEntry = zipEntries.find((zipEntry) => zipEntry.name === "word/document.xml")
	expect(zipEntries.map((zipEntry) => zipEntry.name)).toContain("[Content_Types].xml")
	expect(documentEntry?.packedByteSize).toBe(197)
	expect(documentEntry?.unpackedByteSize).toBe(297)
})

// a small file that declares gigabytes is rejected from its directory, as a file itself at fault
test("readZipEntries rejects a small file that declares a huge unpacked size", () => {
	const oversizedZipBytes = toOversizedZipBytes(toDocxFixtureBytes())
	expect(oversizedZipBytes.byteLength).toBeLessThan(2_000)
	expect(() => readZipEntries(oversizedZipBytes)).toThrow(AttachmentValidationError)
	expect(() => readZipEntries(oversizedZipBytes)).toThrow(`more than ${MAX_ZIP_UNPACKED_BYTES} unpacked bytes`)
})

// the unpacked size a zip64 field declares counts as a 32-bit one does, at either side of the limit
test("readZipEntries reads the unpacked size a zip64 entry declares", () => {
	const entryBytes = new TextEncoder().encode("<w:document/>")
	const eightGigabytes = 8 * 1024 * 1024 * 1024
	expect(() =>
		readZipEntries(toDeclaredZipBytes({ entryBytes, unpackedByteSize: eightGigabytes, isZip64: true })),
	).toThrow(AttachmentValidationError)

	// a zip64 entry within the limit is read, with its sizes and where its record starts
	const zipEntries = readZipEntries(toDeclaredZipBytes({ entryBytes, unpackedByteSize: 4096, isZip64: true }))
	expect(zipEntries).toEqual([
		{
			name: "word/document.xml",
			compressionMethod: 0,
			checksum: 0,
			packedByteSize: entryBytes.byteLength,
			unpackedByteSize: 4096,
			recordOffset: 0,
		},
	])
})

// the limit is the most a file may declare, so a file that declares exactly the limit is read
test("readZipEntries reads a file that declares the most unpacked bytes a document may", () => {
	const entryBytes = new TextEncoder().encode("<w:document/>")
	const zipEntries = readZipEntries(
		toDeclaredZipBytes({ entryBytes, unpackedByteSize: MAX_ZIP_UNPACKED_BYTES, isZip64: false }),
	)
	expect(zipEntries[0]?.unpackedByteSize).toBe(MAX_ZIP_UNPACKED_BYTES)
	expect(() =>
		readZipEntries(toDeclaredZipBytes({ entryBytes, unpackedByteSize: MAX_ZIP_UNPACKED_BYTES + 1, isZip64: false })),
	).toThrow(AttachmentValidationError)
})

// a zip is read from the last end record in the file, whatever follows it, as the parsers that open it read it
test("readZipEntries reads a zip that other bytes follow", () => {
	const followedZipBytes = new Uint8Array(Buffer.concat([toDocxFixtureBytes(), Buffer.alloc(70_000, 0x20)]))
	expect(readZipEntries(followedZipBytes)).toEqual(readZipEntries(toDocxFixtureBytes()))
})

// a zip's comment follows its end record and may hold the end record's signature, which is no end record itself
test("readZipEntries reads a zip whose comment holds the end record's signature", () => {
	// the Word file with a comment of the signature's four bytes, whose length the end record names
	const zipBytes = toDocxFixtureBytes()
	const commentedZipBytes = new Uint8Array(Buffer.concat([zipBytes, Buffer.from([0x50, 0x4b, 0x05, 0x06])]))
	new DataView(commentedZipBytes.buffer).setUint16(zipBytes.byteLength - 2, 4, true)
	expect(readZipEntries(commentedZipBytes)).toEqual(readZipEntries(zipBytes))

	// a longer comment holds the signature with room after it for an end record's fixed bytes
	const longComment = Buffer.concat([Buffer.from([0x50, 0x4b, 0x05, 0x06]), Buffer.alloc(40, 0x20)])
	const longCommentedZipBytes = new Uint8Array(Buffer.concat([zipBytes, longComment]))
	new DataView(longCommentedZipBytes.buffer).setUint16(zipBytes.byteLength - 2, longComment.byteLength, true)
	expect(readZipEntries(longCommentedZipBytes)).toEqual(readZipEntries(zipBytes))
})

// bytes with no end record are no zip, and so are bytes too short to hold one
test("readZipEntries rejects a file that is not a zip", () => {
	expect(() => readZipEntries(new TextEncoder().encode("Carl reads plain text, which is no zip at all."))).toThrow(
		"the file is not a zip",
	)
	expect(() => readZipEntries(new Uint8Array(4))).toThrow(AttachmentValidationError)
})

// a reader of Word files and workbooks opens a zip that has other bytes before it, so its directory is read too
test("readZipEntries reads the directory of a zip with other bytes before it", () => {
	const prefix = new Uint8Array(100)
	const prefixedDocx = new Uint8Array([...prefix, ...toDocxFixtureBytes()])
	const entryNames = readZipEntries(prefixedDocx).map((zipEntry) => zipEntry.name)
	expect(entryNames).toEqual(readZipEntries(toDocxFixtureBytes()).map((zipEntry) => zipEntry.name))

	// each entry's record is found from the start of the file, and its declared size still counts
	const [firstEntry] = readZipEntries(prefixedDocx)
	expect(firstEntry?.recordOffset).toBe(
		(readZipEntries(toDocxFixtureBytes())[0]?.recordOffset ?? 0) + prefix.byteLength,
	)
	const prefixedOversizedDocx = new Uint8Array([...prefix, ...toOversizedZipBytes(toDocxFixtureBytes())])
	expect(() => readZipEntries(prefixedOversizedDocx)).toThrow(`more than ${MAX_ZIP_UNPACKED_BYTES} unpacked bytes`)
})

// a directory that holds fewer entries than the zip declares is no zip's, so no declared size goes unread
test("readZipEntries rejects a zip whose directory does not hold every entry it declares", () => {
	const entryBytes = new TextEncoder().encode("<w:document/>")
	const zipBytes = toDeclaredZipBytes({ entryBytes, unpackedByteSize: 4096, isZip64: false })

	// the end record declares two entries where the directory holds one
	const endRecordOffset = zipBytes.byteLength - 22
	new DataView(zipBytes.buffer, zipBytes.byteOffset).setUint16(endRecordOffset + 10, 2, true)
	expect(() => readZipEntries(zipBytes)).toThrow("the file is not a zip")
})
