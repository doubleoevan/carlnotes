## ADDED Requirements

### Requirement: A large workbook is read as a stream that holds only the rows the table text keeps

A workbook that declares more than 4 MB unpacked SHALL be read through a streaming reader that holds no more rows
than the table text keeps, in a Topic attachment and in a chat attachment alike, so its memory does not grow with its
rows of numbers. The text its cells share stays in memory, within the extraction's memory limit. A smaller workbook
SHALL be read whole, so its table text SHALL be what it was: the same rows, the same header line, and the same line
naming the rows omitted.

#### Scenario: A workbook of 100,000 rows reads in flat memory

- **WHEN** a 9.5 MB workbook of 100,000 rows by 20 columns is processed
- **THEN** the process's memory stays under 200 MB, and the table text holds `MAX_TABLE_ROWS` rows and the line naming
  the rows omitted

#### Scenario: A workbook of text is bound by the memory limit

- **WHEN** a workbook of many rows of distinct text is read as a stream, which reads every row to count the rows it
  leaves out, and the text its cells share passes the extraction's memory limit
- **THEN** its child process is ended, the attachment fails as too large to read, and no other file is affected

#### Scenario: A small workbook's table text is unchanged

- **WHEN** a workbook with two non-empty sheets, fewer rows than `MAX_TABLE_ROWS`, and under 4 MB unpacked is
  processed
- **THEN** it is read whole, and its table text is the text the whole-file reader wrote for it

#### Scenario: A streamed workbook keeps the table's shape

- **WHEN** a workbook that declares more than 4 MB unpacked is processed
- **THEN** its table text holds the header line, the first `MAX_TABLE_ROWS` rows in the workbook's sheet order, and
  the line naming the rows omitted
