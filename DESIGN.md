# Exposure — design notes

## Concept card

```
Idea:        A page, read from the outside, itemised like a receipt of what it gave away.
Metaphor:    Daylight and a burn mark: an ember field that cools into bone paper.
Signature:   The gauge fills while the ledger underneath explains every point it lost.
Emotion:     The mild flush of reading your own name in someone else's notes.
Motion verb: Settle — the page lowers into place; the burn line draws itself.
Screenshot:  Flame field, two lines of bone type, one white input bar, a bone receipt below.
```

Redact is night and press; Exposure is day and ledger. Same heat, opposite light, and a
different composition: Redact is a two-column editorial page, Exposure is a centred stack with a
wide instrument at the top.

## Palette

| Role | Value | Notes |
|---|---|---|
| ground | `#f5ead9` | bone, not cream-white; warm enough to sit beside flame |
| card | `#fbf2e3` | report surfaces |
| ink | `#170d06` | 16:1 on ground |
| muted | `#6f5647` | 5.3:1 on ground |
| line | `rgba(23,13,6,.16)` | hairlines and table rules |
| flame | `#e02a08` | index labels, `http` flags, missing headers |
| ember | `#ff8a1f` | ledger bars, the burn seam |
| blush | `#ffd9c4` | the limits band |
| night | `#170b05` | the ledger section |

The hero is a flame field (`#ff7a18 → #ef3205 → #b81500 → #6d0a00`) with two radial highlights
and an SVG grain overlay at 50% in `overlay` blend. The tone is a sunset, not a warning sign.

## Type

- **Syne** 700/800 for display: wide, slightly strange, unmistakably not Inter. Tracking
  `-0.055em` at the hero, `-0.045em` for section heads, line-height `0.92` down to `0.84`.
- **Instrument Sans** for copy and UI.
- **Space Mono** for evidence: URLs, header names, cookie flags, the ledger.

The hero is set at `clamp(54px, 8.6vw, 150px)` and deliberately two lines. The width is chosen so
"Every page" fits at 1440 without a wrap; the mobile override lets it break into three balanced
lines rather than shrinking to nothing.

## Composition

1. **Flame field** with the nav inside it, a kicker, the two-line headline, the lede, and a
   single wide input bar. The instrument is part of the poster.
2. **A five-column facts strip** of header names along the seam — the vocabulary of the product,
   set as a marquee that does not move.
3. **The report**: bone receipt with a gauge, six counts, six evidence blocks. Dense by design;
   this is the part someone screenshots.
4. **Five questions** in a five-column strip with vertical rules.
5. **The ledger**: the only dark section, entered through a 3 px ember seam. Bars, weights, caps.
6. **Limits** on blush, three cards, no icons.
7. **Footer**: a line of copy, one CTA, and the wordmark at a size that just fits.

## Motion

- **Hero**: masked lines rise (`translateY(110%)` → 0) with a 120 ms stagger; the lede, form and
  suggestions follow in a 100 ms cascade. No fade-ins on the type itself.
- **Burn seam**: the ledger is entered through a 3 px ember rule; the gauge then draws from 0 to
  the score over 1.1 s with a cubic ease-out, and the number counts with it.
- **Reveals**: 20 px rise + opacity, 80 ms stagger inside a group, once per element.
- **Hover**: buttons lift 1 px and invert (`ink → flame`, `ember → bone`); nav underlines draw
  from the left; recent rows take a 4% ink wash.
- **Never**: parallax on text, cursor followers, infinite decorative loops. Reduced motion
  removes every transform and the gauge animation, leaving the finished state.

## Details

- The report id is short, lowercase and visible — a receipt number, not a secret.
- Grade colour is ink / ember / flame; no green. A good grade is quiet.
- Missing headers are marked `✕` in flame, present ones `✓` in a desaturated green that is used
  exactly once on the page.
- The share row sits at the bottom of the report, on a 4% ink wash, so the URL never competes
  with the findings.
- Copy avoids "leak" as a metaphor for everything; the product reports what was *handed over*.
