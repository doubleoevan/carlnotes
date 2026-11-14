# Design

## One Team query

`apps/api/team/memberTeamTopics.ts` holds the query of a person's active Team ids and the filter of the Topics those
Teams hold. The Café's tiles pass the led Teams, the person's table and the news pass every Team. A read for anyone but
the person and an admin keeps public Teams that show the person's membership, the rule the profile's Teams list already
follows. The same module returns the filter of the Topics a Team holds at the reader's visibility: public alone for a
visitor, and otherwise every Topic except a private one whose Personal sources text is not converted. A Topic the person
owns is never filtered that way.

## The Owner column

`ownerTopic` and the profile's `topic` gain `owner` and a nullable `team`, read in `topic/topicOwners.ts` with one join.
A private Team is named only to its active members, by the rule a subscription row already follows, so `toTeamIdentity`
moves beside `toProfileIdentity` and every read shares it. The column shows only on a profile's tables, the person's own
and the one a visitor reads, where rows can belong to someone else. The Activity page's own table and the admin console
keep their columns.

## The default team

`toTeamChoices` labels the default team "Name (default)". The save path already knows which Teams it adds, so
`useTopicTeamChoice` shows a message through `showClientMessage` when the default team is among them.

## Admin view

`apps/api/profileReader.ts` decides who reads a profile: the person, an admin, or anyone else as a visitor. The
profile's tiles and the news read the person's own Topics through its filter, so an admin reads them all but a private
Topic whose Personal sources text is not converted, as the Personal sources rule closes it to admins. The check sits in
`readNews`, so the route and the `read_profile` tool share it. An admin's news shows the admin's own listening progress.
The page shows the audience select to an admin, by the session's role, on someone else's profile, and holds the
audience, which starts again at the user audience on another profile. The code says audience, because a View is a
counted visit. The profile route and the profile news route take an optional `audience`. The visitor audience reads with
no reader, so it shares the visitor's cached first page and needs no admin check, because it shows no more than a
visitor sees. The select is highlighted with the dashboard's `HIGHLIGHTED_SELECT_CLASS`, now in `styleClasses.ts`, and
the app's `ChoiceSelect` with `isHighlighted`. The opener's cache key moves into one helper. A new route,
`GET /api/profiles/:userId/opener`, is admin only and reads that key for today with no fallback, so no model call runs
and no budget is spent. It returns null while the person owns a private Topic whose Personal sources text is not
converted, because the opener may be written from that Topic's Findings. The visitor cache key stays as it is, because
an admin's read is signed in and never cached.
