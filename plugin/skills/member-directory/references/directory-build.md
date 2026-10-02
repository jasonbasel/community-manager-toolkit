# Directory build rules

Detail for the member-directory skill: normalising, matching, precedence, provenance and
write formats. What each column means is in `data-sources.md`, "The member directory".

## Normalising

**Names.** Trim spaces. Fix ALL CAPS or all-lowercase names to normal capitals. Keep
accents, hyphens and particles (de, van, bin) as given. Never split, reorder or shorten a
name you're unsure of.

**Organisations.**
- Trim, then drop legal suffixes and their punctuation: Ltd, Limited, LLP, plc, Inc, LLC,
  Corp, GmbH, AG, SA, SAS, BV, Pty Ltd and similar. Drop a leading "The". Keep the
  brand's own capitals.
- Treat obvious variants as one organisation (Acme Ltd, Acme Limited, ACME).
- A work email domain may fill a blank organisation when the link is clear (another
  member at that domain names the organisation, or the domain is the organisation's
  name). Record it in `inferred_fields`.
- Never map public domains to an organisation: gmail.com, googlemail.com, outlook.com,
  hotmail.com, live.com, yahoo.com, icloud.com, me.com, proton.me, protonmail.com,
  aol.com, gmx and similar. Leave `email_domain` blank for them.
- "Self-employed", "Freelance" and "Independent" are not organisations: keep them as
  given in `role` or `organisation`, and never treat two such people as colleagues.

**Dates.** `YYYY-MM-DD`. Settle day and month order from the source (any value over 12
decides it; otherwise the source's locale). Convert Excel serial numbers. A date-time
becomes its date in the community's time zone. Say which conversions you made.

**Locations.** City and country, using the names the community uses. Map obvious
variants (NYC, New York City). Leave it blank rather than guess from a phone prefix or a
time zone.

**Roles.** As given. Don't infer seniority.

## Matching

| Tier | Signal | Action |
|---|---|---|
| 1 | same email (trimmed, any case) or same source ID | merge |
| 2 | same normalised full name and same normalised organisation | merge |
| 3 | similar names (Alex and Alexandra Reid), a nickname or initial, the same name at different organisations, similar names at the same work domain, a Slack display name or Discord username that resembles a member, a form entry with a first name only | list for the manager; don't merge |

Show each tier-3 case as record A (name, organisation, role, source), record B, and why
they might match. Default when the manager doesn't decide: keep them separate. Two
different people never share a row.

## Precedence

| Field | Owning source | Fallback |
|---|---|---|
| name, organisation, role, location | the CRM | member sheet or database, then forms, then a Slack or Discord profile, then the LinkedIn connections export (fill only, never add people) |
| joined | membership start in the CRM or member sheet | first event, or Slack or Discord join date (inferred) |
| asks, offers | application forms, notes, meeting summaries | Slack or Discord intro posts, bios (inferred) |
| last_active | the latest of Slack, Discord, events attended, ledger answers, form submissions | none: unknown |
| opted_in | any opt-out → `no`; the profile's rule or a recorded opt-in → `yes` | `unknown` |
| tags (sector, stage, side) | forms, CRM fields | role and organisation (inferred) |

- When two sources have dated values for a field, the most recent wins. With no dates,
  the owning source wins.
- When a source contradicts the CRM (a different job title in a recent form), list the
  conflict in the summary so the manager can fix the source system.
- Email opens and your team's logged calls or emails never set `last_active`
  (`platform-guide.md`).

## Provenance

- `last_active_source` and `opt_in_source` name the tool and date, for example
  `slack 2026-09-28` or `mailchimp: unsubscribed 2026-05-01`.
- `inferred_fields` lists every other field that didn't come straight from its owning
  source or the member's own words, as `field: source, date`, separated by semicolons:
  `organisation: email domain; asks: Slack #intros post, 2026-09-12`.
- An empty `inferred_fields` means every field came from its owning source.
- `source_ids` lists every record merged into the row: `hubspot:123; slack:U0ABC;
  tally:resp_88`.

## Status and opt-in

- `member`: matches the membership rule the manager gave (stage, list, role, plan).
- `lapsed`: membership ended in the CRM or member sheet. Leaving Slack or Discord on its
  own only flags the member for the manager.
- `prospect`: applied, or in a pipeline, but not a member.
- `guest`: registered for or came to an event, not a member.
- Default scope: members and lapsed members. Add prospects and guests only from the
  forms and event lists the manager points to. Never import a whole CRM or email list.
- A channel-specific opt-out (unsubscribed from the newsletter only) still sets `no`,
  with the source. Flag it: whether a personal message on another channel is welcome is
  the manager's call.

## profile_quality

- `full`: organisation, role, at least one ask and at least one offer.
- `thin`: no ask and no offer.
- `partial`: everything else.

## member_id

Assign once, never reuse: `m` plus four digits, continuing from the highest existing id.

## Write formats

Check the profile and look for an existing directory first; never create a second one.

- **Notion:** a database named "Member directory": `name` as the title; select for
  `status`, `opted_in` and `profile_quality`; multi-select for `tags`; date for `joined`,
  `last_active` and `updated`; text for the rest.
- **Google Sheets:** a sheet named "Member directory", column names in row 1 exactly as
  below, row 1 frozen, dates as `YYYY-MM-DD`.
- **Airtable:** a table named "Member directory": single line text for names, ids and
  sources; long text for `asks`, `offers`, `inferred_fields` and `notes`; single select
  for `status`, `opted_in` and `profile_quality`; multiple select for `tags`; date fields
  for dates.
- **CSV:** `member-directory.csv` with this header, quoting any value that contains a
  comma:

```text
member_id,name,organisation,role,location,email_domain,source_ids,status,joined,last_active,last_active_source,asks,offers,tags,opted_in,opt_in_source,profile_quality,inferred_fields,notes,updated
```

## Refresh

- Match rows by `source_ids`, then by the matching tiers.
- If a directory value matches no source, the manager may have edited it by hand: keep
  it and list it rather than overwrite it.
- Never delete rows. Members who left get `lapsed`.
- Big refreshes: counts per change type first, then the first 30 rows, with "show all"
  for the rest.
