# blog Specification

## Purpose
TBD - created by archiving change close-seo-gaps. Update Purpose after archive.
## Requirements
### Requirement: Blog pages are server-rendered markdown

`GET /blog` SHALL list the blog's pages, and `GET /blog/:slug` SHALL render one, both as server-rendered HTML readable
without JS execution. Pages SHALL be markdown files under `content/blog/` with a frontmatter block naming title,
description, and date, the slug taken from the filename. Each page SHALL carry its own title, description, canonical
URL, and `BlogPosting` JSON-LD. A slug matching no file SHALL answer 404. The index SHALL order the posts newest first,
and two posts with one date SHALL order by slug, A to Z, so the order is the same on every filesystem.

This renderer SHALL serve the blog alone. Documentation is served by the docs site, as `docs-site` requires.

#### Scenario: A post renders without JS

- **WHEN** a crawler fetches `/blog/<slug>` with scripts off
- **THEN** the post's full HTML content, title, canonical url, and JSON-LD are in the response

#### Scenario: The index lists the posts

- **WHEN** a reader opens `/blog`
- **THEN** every post lists with its title, description, and date, newest first, and two posts with one date in slug
  order

#### Scenario: Two posts with one date keep one order

- **GIVEN** two posts dated the same day, `alpha` and `beta`
- **WHEN** `/blog` is read on any filesystem
- **THEN** `alpha` lists before `beta` every time

#### Scenario: An unknown slug is not found

- **WHEN** a request names a slug with no matching file
- **THEN** the route answers 404

#### Scenario: The renderer serves no docs

- **WHEN** the markdown renderer's routes are inspected
- **THEN** it answers only `/blog` paths, and `content/docs/` no longer exists

