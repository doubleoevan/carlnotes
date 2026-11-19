## ADDED Requirements

### Requirement: A film section sits right before the podcast section it pairs with

A film section SHALL sit right before its podcast section: Featured films before Featured podcasts on the home page,
Featured Films before Featured Podcasts on the Café and on a team page, Coffee Break Cinema before Coffee Break podcast
on the topic page, and Coffee Break Film before Coffee Break podcast on the podcast episode page. Web and mobile SHALL
match. The home's New podcasts this week SHALL sit directly below Featured podcasts.

#### Scenario: The mobile Café keeps the order

- **WHEN** a user opens a Café with films and podcasts in the mobile app
- **THEN** Featured Films sits directly above Featured Podcasts, as on the web

#### Scenario: The home's podcast sections follow its film sections

- **WHEN** a visitor opens a home page with films and podcasts new this week
- **THEN** the sections read Featured films, New films this week, Featured podcasts, New podcasts this week, in that
  order, on the web and in the mobile app

#### Scenario: The podcast episode page leads with the film

- **WHEN** a user opens the page of a Podcast Episode that has a film, on the web or in the mobile app
- **THEN** Coffee Break Film sits above Coffee Break podcast

## MODIFIED Requirements

### Requirement: Film headings never say video

The film sections' headings SHALL read "Featured films" and "New films this week" on the home page, "Featured Films" on
the Café and on a team page, "Coffee Break Cinema" on the topic page, and "Coffee Break Film" on the podcast episode
page, each cased as the neighbouring sections on the same page. No heading SHALL contain the word video. No film section
SHALL show a notice, a warning, or explanatory text.

#### Scenario: Headings use film

- **WHEN** a home page with films renders
- **THEN** neither film section's heading contains "video"

## REMOVED Requirements

### Requirement: Film sections always sit right before the podcast sections they pair with

**Reason**: The podcast episode page now leads with its film, so no page is an exception, and the topic page's film
section is Coffee Break Cinema.

**Migration**: "A film section sits right before the podcast section it pairs with" covers every page.
