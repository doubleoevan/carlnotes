# licensing Specification

## Purpose
TBD - created by archiving change relicense-agpl. Update Purpose after archive.
## Requirements
### Requirement: The declared license is AGPL-3.0-only everywhere it's declared
The project's license SHALL be AGPL-3.0-only, and every file that declares it — `LICENSE`, `package.json`'s `license` field, and `README.md`'s License section — SHALL agree with each other. `LICENSE` SHALL hold the complete, unmodified AGPL-3.0 text.

#### Scenario: A reader checks any one declaration
- **WHEN** a reader opens `LICENSE`, `package.json`, or `README.md`
- **THEN** each names AGPL-3.0-only, and none names MIT or any other license

### Requirement: The hosted app gives network users a path to the source
Every page SHALL show, in the footer, the current license name and a link to the project's source repository, satisfying AGPL-3.0's network-use source-availability clause.

#### Scenario: A visitor reads the footer on any page
- **WHEN** a visitor views the footer of any page of the hosted app
- **THEN** it names the AGPL-3.0 license and links to the source repository

### Requirement: The Privacy and Terms pages accurately state the current license
The Privacy page and Terms page SHALL name whichever license the project is actually released under. Neither SHALL name a license the project has since moved away from.

#### Scenario: A user reads the Privacy or Terms page after a relicense
- **WHEN** a user views the Privacy page or the Terms page
- **THEN** every license mention on that page names the project's current license, not a prior one

### Requirement: The Privacy page states that an administrator can read a private topic

An administrator bypasses the Topic visibility rules and can open any Topic, including a private one, with its context document, attachments, and findings. The Privacy page SHALL say so plainly, in the section about public and shared topics, rather than leaving it to be inferred from a general line about production access.

It SHALL name why the access exists — answering a support question about a Scan, and investigating a Topic reported for abuse — SHALL say that private Topics are not read as a matter of course, and SHALL note that a manual Scan an administrator runs is recorded against them rather than against the owner.

A reader deciding whether to attach a manuscript or describe a job search is deciding on the strength of what this page tells them. A capability the product has and the page omits is the page being wrong.

#### Scenario: The page says an administrator can open a private topic

- **WHEN** a user reads the Privacy page
- **THEN** it states that a CarlNotes administrator can open any topic including a private one, why, and that it is not routine

