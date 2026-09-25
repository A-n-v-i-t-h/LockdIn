# Design

**Stencil is the look; Iron is the backup** (decided 2026-09-17). Every other style from the
two design rounds (Logbook, Varsity, Route, Arcade, Poster, Console, Chalk, Blackout) is
scrapped. The app's tokens and component classes are in `src/app/globals.css`.

| Page | What it is | Published (private) |
|---|---|---|
| `stencil-reference.html` (here) | Round 2 (first named `iron-variants.html`), cut down to Stencil and Iron: eight screens, one sample day | <https://claude.ai/artifact/LWxZF5vbn1ZBZXF3DpnzTC> |
| Round 1 (`stylesuits.html`, no local copy) | Five scrapped suites (Iron, Logbook, Varsity, Route, Arcade), kept as a record | <https://claude.ai/artifact/T3TnJkX1HWrpjSC9bC2JdH> |

To republish a page from a new session, pass its link as `url`; otherwise a separate page is
created. The rounds and the feedback on them: `D:\Dev\Gym\docs\06-dashboard.md` → Decided
2026-09-17.

## Stencil (ST)

- Background #131313, surfaces #1A1A1A / #232323, borders #333 at 2px, **zero radius**.
- Plate red #E2463F for marks and lines, #C63D36 for fills under white text (contrast);
  hazard yellow #E8B923 for stripes and highlights; work-order paper #E7E3D8; good #3DBA78.
- Type: **Saira Stencil** for display, **Saira Condensed** 700–800 uppercase with wide
  tracking for labels and numbers, **Saira** for body.
- Signatures: diamond-plate header, hazard-stripe dividers, equipment-tag labels ("Station 01"),
  indicator lamps for the best-set check, segmented meters, square tab cells with the active one
  filled red, the coach note as a work-order slip.

## Iron (IR), the backup

Speckled rubber texture on #17181A, 12px radius cards, Teko + Barlow, tabs colour-coded by
competition plate colour. `D:\Dev\Gym\training01.html` and `equipment.html` use it.

## In both

- The barbell drawing shows the plates per side and **marks the ones that are new tonight**.
- Calendar categories use a validated palette, each with its own shape: task #4A86F0,
  goal #B38B1C, commitment #C0508F.

## Where this came from

The rounds were made in a separate folder, `D:\Dev\LockdIn-AI`, before the app existed, and the
app was then built here. On 2026-09-25 that folder was merged into this one and removed:
`iron-variants.html` was already here as `stencil-reference.html` (same content), this spec
moved in, and round 1 is kept only at its published link, which matched the local copy byte for
byte.
