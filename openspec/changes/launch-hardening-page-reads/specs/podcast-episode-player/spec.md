## MODIFIED Requirements

### Requirement: A Podcast Episode opened by its id shows its state until it can play

The topic page SHALL open one Podcast Episode by its id from a link, such as the digest's, for a user who may listen to
it. If that Podcast Episode is still rendering, the player SHALL show its title, SHALL say that Carl and Vienna are
recording, SHALL check the Podcast Episode every few seconds, and SHALL show it ready to play once it publishes. The
checks SHALL pause while the tab is hidden, the app is in the background, or the device is offline, SHALL resume with
one check at once on return, and SHALL stop once the Podcast Episode has failed or a time limit has passed. The player
SHALL never start a Podcast Episode that no press started. If the render failed, the player SHALL say "Coffee Break
podcast failed to record." An id that the user may not listen to, or one that does not exist, SHALL open the topic page
as usual with no Podcast Episode selected. While a Scan runs on a Topic whose Scans render a Podcast Episode, the topic
page SHALL show the same recording state before the Podcast Episode exists, with "Coffee Break podcast" in place of the
title and a cover that says the hosts are recording. With no Podcast Episode in the url, a user who may listen to the
Topic's rendering Podcast Episode SHALL see it in the same recording state, with its cover, in place of the latest
Podcast Episode unless the player has one of the Topic's Podcast Episodes loaded. The page SHALL keep checking while
that Podcast Episode renders, and for a short time after a Scan finishes, and once the Podcast Episode publishes the
player SHALL show it ready to play without starting it. If the Topic's newest Podcast Episode failed to render, the
topic page SHALL show that to a user who may start a Scan of the Topic, as "Coffee Break podcast failed to record. Brew
to try again...", where "Brew" is the page's own scan button, until a later Podcast Episode of the Topic is rendering or
published. A user who may not start a Scan SHALL see the latest Podcast Episode instead.

#### Scenario: The recording state shows while a Scan runs

- **GIVEN** a Topic whose podcast is on and whose owner's plan renders another Podcast Episode
- **WHEN** a Scan of the Topic is running
- **THEN** the player says "Carl and Vienna are recording..." under the heading "Coffee Break podcast", beside a cover
  that reads "Coffee Break podcast" and "Recording in progress..."

#### Scenario: A rendering Podcast Episode shows without a link

- **GIVEN** a Topic whose newest Scan started a Podcast Episode that is still rendering
- **WHEN** a user who may listen to it opens the topic page with no Podcast Episode in the url
- **THEN** the player shows the Podcast Episode's cover and title and says Carl and Vienna are recording, and once the
  Podcast Episode publishes the player shows it ready to play without starting it

#### Scenario: A rendering Podcast Episode says so and then is ready

- **GIVEN** a reader who follows the digest's link while the Podcast Episode is rendering
- **WHEN** the topic page opens
- **THEN** the player shows the Podcast Episode's title and says Carl and Vienna are recording, and once the Podcast
  Episode publishes the player shows it ready to play and does not start it

#### Scenario: A failed render says so

- **WHEN** a reader follows a link to a Podcast Episode whose render failed
- **THEN** the player says "Coffee Break podcast failed to record.", and offers no play control for it

#### Scenario: A failed render offers the owner a Scan

- **GIVEN** a Topic whose newest Podcast Episode failed to render
- **WHEN** the Topic's owner opens the topic page with no Podcast Episode in the url
- **THEN** the player says "Coffee Break podcast failed to record. Brew to try again...", and pressing "Brew" starts a
  Scan

#### Scenario: A failed render stays out of a subscriber's page

- **GIVEN** a Topic whose newest Podcast Episode failed to render
- **WHEN** a subscriber who may not start a Scan opens the topic page with no Podcast Episode in the url
- **THEN** the player shows the latest published Podcast Episode, or nothing if the Topic has none

#### Scenario: A published Podcast Episode opens ready

- **WHEN** a reader follows a link to a published Podcast Episode
- **THEN** the player shows that Podcast Episode, ready to play, instead of the latest one

#### Scenario: An unknown id opens the page as usual

- **WHEN** a reader follows a link with a Podcast Episode id that they may not listen to
- **THEN** the topic page opens with its latest Podcast Episode, if any, and no error

#### Scenario: A hidden tab stops checking

- **WHEN** a reader who followed a link to a rendering Podcast Episode hides the tab for ten minutes
- **THEN** no check is sent until the tab shows again, and one is sent at once then

#### Scenario: A closed-out Podcast Episode stops the checks

- **WHEN** the sweep fails a Podcast Episode that was stuck recording, and the next check reads it as failed
- **THEN** the player says "Coffee Break podcast failed to record.", and no further check is sent
