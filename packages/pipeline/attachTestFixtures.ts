// attachment test fixtures: a Word file, a PDF of one line a page, a workbook of two sheets, a workbook of any number
// of rows, a zip whose directory declares more unpacked bytes than a real document holds, a zip whose entries are
// named with a leading slash, and a workbook whose first worksheet part has a name of its own. only tests import it
import { PassThrough } from "node:stream"
import {
	readZipEntries,
	toStoredZipRecord,
	toZipEntryRecord,
	ZIP_DIRECTORY_ENTRY,
	ZIP_END_RECORD_BYTES,
	ZIP_END_RECORD_SIGNATURE,
	type ZipEntry,
} from "./attachZip"

// a Word document built as the minimal OOXML zip: two paragraphs of plain text
const DOCX_FIXTURE_BASE64 =
	"UEsDBBQAAAAIACl6Il3JTxqw6wAAAK4BAAATAAAAW0NvbnRlbnRfVHlwZXNdLnhtbH1QvU7DMBDeeQrLK4odGBBCSTrwMwJDeYCTfUks7LPlc0v79jht6YAK4933q69b7YIXW8zsIvXyRrVSIJloHU29/Fi/NPdScAGy4CNhL/fIcjVcdet9QhZVTNzLuZT0oDWbGQOwigmpImPMAUo986QTmE+YUN+27Z02kQpSacriIYfuCUfY+CKed/V9LJLRsxSPR+KS1UtIyTsDpeJ6S/ZXSnNKUFV54PDsEl9XgtQXExbk74CT7q0uk51F8Q65vEKoLP0Vs9U2mk2oSvW/zYWecRydwbN+cUs5GmSukwevzkgARz/99WHu4RtQSwMECgAAAAAAKXoiXQAAAAAAAAAAAAAAAAYAAABfcmVscy9QSwMEFAAAAAgAKXoiXbmBRHGwAAAAKgEAAAsAAABfcmVscy8ucmVsc43POw7CMAwG4J1TRN5pWgaEUJMuCKkrKgeIEjeNaB5KwqO3JwMDIAZG278/y233sDO5YUzGOwZNVQNBJ70yTjM4D8f1DkjKwikxe4cMFkzQ8VV7wlnkspMmExIpiEsMppzDntIkJ7QiVT6gK5PRRytyKaOmQciL0Eg3db2l8d0A/mGSXjGIvWqADEvAf2w/jkbiwcurRZd/nPhKFFlEjZnB3UdF1atdFRYob+nHi/wJUEsDBAoAAAAAACl6Il0AAAAAAAAAAAAAAAAFAAAAd29yZC9QSwMEFAAAAAgAKXoiXRumyOvFAAAAKQEAABEAAAB3b3JkL2RvY3VtZW50LnhtbG2PwWrDMAyG73sK4XvjbIdRQpIeCnuBbQ+g2moSiCUju0379rMLZTB2+YWQ9P2/+sMtrHAlTYvwYF6b1gCxE7/wNJjvr4/d3kDKyB5XYRrMnZI5jC/91nlxl0CcoRA4ddtg5pxjZ21yMwVMjUTiMjuLBsyl1cluoj6qOEqpGITVvrXtuw24sBkL8iT+XmusolXyeERdQQl9gjwTVAI8rZve1pWq+tD49/qTnLCHiIqTYpyhpHlwzsstX5T+I9hnEPv75PgDUEsBAh4DFAAAAAgAKXoiXclPGrDrAAAArgEAABMAAAAAAAAAAQAAAKSBAAAAAFtDb250ZW50X1R5cGVzXS54bWxQSwECHgMKAAAAAAApeiJdAAAAAAAAAAAAAAAABgAAAAAAAAAAABAA7UEcAQAAX3JlbHMvUEsBAh4DFAAAAAgAKXoiXbmBRHGwAAAAKgEAAAsAAAAAAAAAAQAAAKSBQAEAAF9yZWxzLy5yZWxzUEsBAh4DCgAAAAAAKXoiXQAAAAAAAAAAAAAAAAUAAAAAAAAAAAAQAO1BGQIAAHdvcmQvUEsBAh4DFAAAAAgAKXoiXRumyOvFAAAAKQEAABEAAAAAAAAAAQAAAKSBPAIAAHdvcmQvZG9jdW1lbnQueG1sUEsFBgAAAAAFAAUAIAEAADADAAAAAA=="

// the line a PDF starts with
const PDF_HEADER = "%PDF-1.1\n"

/**
 * Returns the bytes of a Word file whose two paragraphs read "Carl reads the word document." and "Second paragraph
 * for the fixture."
 */
export function toDocxFixtureBytes(): Uint8Array {
	return new Uint8Array(Buffer.from(DOCX_FIXTURE_BASE64, "base64"))
}

/**
 * Returns the bytes of a PDF of one line per page, built as the minimal objects pdf.js reads, with the table that
 * names where each object starts. A PDF of thousands of pages takes seconds to read to its last page.
 */
export function toPagedPdfBytes(pageLines: string[]): Uint8Array {
	// a catalog, the page tree, then a page, its content stream, and the font per line
	const pageIds = pageLines.map((_, index) => 3 + index * 2)
	const fontId = 3 + pageLines.length * 2
	const objects = [
		"<</Type/Catalog/Pages 2 0 R>>",
		`<</Type/Pages/Kids[${pageIds.map((pageId) => `${pageId} 0 R`).join(" ")}]/Count ${pageLines.length}>>`,
		...pageLines.flatMap((line, index) => {
			const stream = `BT /F1 24 Tf 72 72 Td (${line}) Tj ET`
			return [
				`<</Type/Page/Parent 2 0 R/MediaBox[0 0 300 144]/Contents ${4 + index * 2} 0 R/Resources<</Font<</F1 ${fontId} 0 R>>>>>>`,
				`<</Length ${stream.length}>>stream\n${stream}\nendstream`,
			]
		}),
		"<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>",
	]

	// the objects in order, with where each one starts
	const numberedObjects = objects.map((object, index) => `${index + 1} 0 obj${object}endobj\n`)
	let nextObjectOffset = PDF_HEADER.length
	const objectOffsets = numberedObjects.map((numberedObject) => {
		const objectOffset = nextObjectOffset
		nextObjectOffset += numberedObject.length
		return objectOffset
	})

	// the table of where each object starts, then the trailer that names the catalog and where the table starts
	const tableRows = objectOffsets.map((objectOffset) => `${String(objectOffset).padStart(10, "0")} 00000 n \n`)
	const table = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${tableRows.join("")}`
	const trailer = `trailer<</Size ${objects.length + 1}/Root 1 0 R>>\nstartxref\n${nextObjectOffset}\n%%EOF`
	return new TextEncoder().encode(`${PDF_HEADER}${numberedObjects.join("")}${table}${trailer}`)
}

/**
 * Returns the bytes of a workbook written by exceljs: a sheet of submissions with a date cell, a sheet of notes, and
 * an empty sheet.
 */
export async function toWorkbookFixtureBytes(): Promise<Uint8Array> {
	const { default: ExcelJS } = await import("exceljs")
	const workbook = new ExcelJS.Workbook()

	// a sheet of three columns, whose last cell is a date
	const submissions = workbook.addWorksheet("Submissions")
	submissions.addRow(["Agency", "Agent", "Sent"])
	submissions.addRow(["Writers House", "Amy Berkower", new Date(Date.UTC(2026, 7, 4))])

	// a sheet of one column, and one chart-like empty sheet
	const notes = workbook.addWorksheet("Notes")
	notes.addRow(["Note"])
	notes.addRow(["Follow up in september"])
	workbook.addWorksheet("Empty")
	return new Uint8Array(await workbook.xlsx.writeBuffer())
}

/**
 * Returns the bytes of a workbook of one sheet of 20 columns: a header row, then rows of numbers, the row count in
 * all. It is written as a stream, so a workbook of any size takes little memory to build.
 */
export async function toRowsWorkbookBytes(rowCount: number): Promise<Uint8Array> {
	// collect what the writer streams out
	const { default: ExcelJS } = await import("exceljs")
	const writtenChunks: Buffer[] = []
	const output = new PassThrough()
	output.on("data", (chunk: Buffer) => writtenChunks.push(chunk))

	// the header row, then a number of its own in every other cell
	const workbookWriter = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: output, useSharedStrings: true })
	const worksheet = workbookWriter.addWorksheet("Queries")
	worksheet.addRow(Array.from({ length: 20 }, (_, column) => `column ${column}`)).commit()
	for (let rowNumber = 1; rowNumber < rowCount; rowNumber++) {
		worksheet.addRow(Array.from({ length: 20 }, (_, column) => rowNumber * 20 + column)).commit()
	}

	// the workbook's bytes, once the writer has streamed the last of them
	await workbookWriter.commit()
	return new Uint8Array(Buffer.concat(writtenChunks))
}

/**
 * Returns a copy of a zip whose first entry declares that it unpacks to nearly four gigabytes, as a zip bomb's
 * directory does. No entry's data changes, so the copy is as small as the zip.
 */
export function toOversizedZipBytes(zipBytes: Uint8Array): Uint8Array {
	const oversizedZipBytes = zipBytes.slice()
	const view = new DataView(oversizedZipBytes.buffer)

	// the end record names where the directory starts, and an entry's unpacked size is 24 bytes into the entry
	const directoryOffset = view.getUint32(oversizedZipBytes.byteLength - ZIP_END_RECORD_BYTES + 16, true)
	view.setUint32(directoryOffset + 24, 0xfffffff0, true)
	return oversizedZipBytes
}

/**
 * Returns a copy of a zip whose every entry is named with a leading slash, as some writers name a workbook's parts.
 * Each entry keeps its packed data.
 */
export function toLeadingSlashZipBytes(zipBytes: Uint8Array): Uint8Array {
	return toCopiedZipBytes(zipBytes, (zipEntry) => {
		const renamedZipEntry = { ...zipEntry, name: `/${zipEntry.name}` }
		return { zipEntry: renamedZipEntry, entryRecord: toZipEntryRecord(zipBytes, renamedZipEntry) }
	})
}

/**
 * Returns a copy of a workbook whose first worksheet part is named xl/worksheets/data.xml, as a writer may name a
 * part, with the workbook's relationships naming it. Each other entry keeps its packed data.
 */
export function toRenamedWorksheetZipBytes(zipBytes: Uint8Array): Uint8Array {
	return toCopiedZipBytes(zipBytes, (zipEntry) => {
		// the worksheet part keeps its packed data under its new name
		if (zipEntry.name === "xl/worksheets/sheet1.xml") {
			const renamedZipEntry = { ...zipEntry, name: "xl/worksheets/data.xml" }
			return { zipEntry: renamedZipEntry, entryRecord: toZipEntryRecord(zipBytes, renamedZipEntry) }
		}
		if (zipEntry.name !== "xl/_rels/workbook.xml.rels") {
			return { zipEntry, entryRecord: toZipEntryRecord(zipBytes, zipEntry) }
		}

		// the relationships are unpacked, and written with the new name as they are, with no packing
		const [, ...packedPieces] = toZipEntryRecord(zipBytes, zipEntry)
		const relationshipsXml = new TextDecoder().decode(Bun.inflateSync(Buffer.concat(packedPieces)))
		const renamedXml = relationshipsXml.replace("worksheets/sheet1.xml", "worksheets/data.xml")
		const storedBytes = new TextEncoder().encode(renamedXml)

		// the entry as its directory entry declares it
		const storedZipEntry = {
			...zipEntry,
			compressionMethod: 0,
			checksum: Bun.hash.crc32(storedBytes),
			packedByteSize: storedBytes.byteLength,
			unpackedByteSize: storedBytes.byteLength,
		}
		return { zipEntry: storedZipEntry, entryRecord: toStoredZipRecord(zipEntry.name, storedBytes) }
	})
}

// an entry of a zip's copy: the entry as the copy's directory declares it, and its record
type CopiedZipEntry = { zipEntry: ZipEntry; entryRecord: Uint8Array[] }

// a copy of a zip with each entry as toCopiedZipEntry returns it
function toCopiedZipBytes(zipBytes: Uint8Array, toCopiedZipEntry: (zipEntry: ZipEntry) => CopiedZipEntry): Uint8Array {
	// each entry's record, and each entry of the copy's directory
	const entryRecords: Buffer[] = []
	const directoryEntries: Buffer[] = []
	let nextRecordOffset = 0
	for (const sourceZipEntry of readZipEntries(zipBytes)) {
		const copiedZipEntry = toCopiedZipEntry(sourceZipEntry)
		const entryRecord = Buffer.concat(copiedZipEntry.entryRecord)
		entryRecords.push(entryRecord)

		// its directory entry names where that record starts in the copy
		directoryEntries.push(toZipDirectoryEntry({ ...copiedZipEntry.zipEntry, recordOffset: nextRecordOffset }))
		nextRecordOffset += entryRecord.byteLength
	}

	// the directory, and the record that ends the zip, which names how many entries the directory holds, how long it
	// runs, and where it starts
	const directory = Buffer.concat(directoryEntries)
	const endRecord = Buffer.alloc(ZIP_END_RECORD_BYTES)
	endRecord.set(ZIP_END_RECORD_SIGNATURE)
	endRecord.writeUInt16LE(directoryEntries.length, 8)
	endRecord.writeUInt16LE(directoryEntries.length, 10)
	endRecord.writeUInt32LE(directory.byteLength, 12)
	endRecord.writeUInt32LE(nextRecordOffset, 16)

	// the records, then the directory, then the record that ends the zip
	return new Uint8Array(Buffer.concat([...entryRecords, directory, endRecord]))
}

// one entry of a zip's directory: its fixed bytes, then the entry's name
function toZipDirectoryEntry(zipEntry: ZipEntry): Buffer {
	// the name's bytes, and the fixed bytes with every field at zero
	const nameBytes = Buffer.from(zipEntry.name)
	const directoryEntry = Buffer.alloc(ZIP_DIRECTORY_ENTRY.byteSize)

	// the signature, how the data is packed, its checksum, and its packed and unpacked sizes
	directoryEntry.writeUInt32LE(ZIP_DIRECTORY_ENTRY.signature, 0)
	directoryEntry.writeUInt16LE(zipEntry.compressionMethod, 10)
	directoryEntry.writeUInt32LE(zipEntry.checksum, 16)
	directoryEntry.writeUInt32LE(zipEntry.packedByteSize, 20)
	directoryEntry.writeUInt32LE(zipEntry.unpackedByteSize, 24)

	// the name's length, and where the entry's record starts
	directoryEntry.writeUInt16LE(nameBytes.byteLength, 28)
	directoryEntry.writeUInt32LE(zipEntry.recordOffset, 42)
	return Buffer.concat([directoryEntry, nameBytes])
}
