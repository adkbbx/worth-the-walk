# Design System of Worth the Walk?

> Format: the Stitch DESIGN.md structure with extended sections, as collected in [awesome-design-md](https://github.com/VoltAgent/awesome-design-md). Tokens below are the values the app ships in `dist/styles.css` and `dist/chirashi.css`; anything marked *(target)* is the agreed direction for the snap → answer → walk redesign.

## 1. Visual Theme & Atmosphere

Worth the Walk? is **the calm after the pile**. Japanese mailbox flyers are loud: neon reds, starbursts, dense prices, three typefaces per square inch. The app is the opposite: a quiet station-signage page that has already read everything and tells you one thing — which flyers are worth leaving the house for, and how to get there. It should feel like a well-run railway notice board crossed with a stamp card: clear, calm, a little bit of ink.

The screen is the shortest part of the experience. Every view exists to get the user to the next physical action: photograph, start walking, say "I'm here".

**Key Characteristics:**
- Cool, quiet canvas (`#f4f6f9`) with white cards — the flyers provide the colour, the app provides the order
- One primary action per screen, always in Signal Blue (`#174cbc`)
- Stamp Vermilion (`#b54508`) is reserved for two things only: stamps, and money that is printed on a flyer
- The user's own flyer thumbnail appears wherever a flyer is mentioned — recognition by sight, not by reading
- English first; Japanese as small, `lang="ja"` reference text
- Three short lines per flyer; details live in a sheet
- Station-stamp motifs (circular vermilion seals, slight rotation, ink texture) for progress and reward

## 2. Color Palette & Roles

### Primary
- **Ink Navy** (`#172536`): Primary text, headings, stop titles, icons.
- **Signal Blue** (`#174cbc`): The single primary action per screen ("Read 7 flyers", "Start the walk", "I'm here"), links, focus rings, progress fill.
- **Signal Blue Deep** (`#0d3690`): Hover and pressed state of Signal Blue.

### Accent
- **Stamp Vermilion** (`#b54508`): Stamp seals, the walk-done stamp animation, and printed money ("Trial ¥1,000 · was ¥3,300", "¥2,300 saved"). Never for errors or warnings.

### Surface & Background
- **Mist** (`#f4f6f9`): Page background.
- **Paper White** (`#ffffff`): Cards, sheets, sticky action bar, setup.
- **Sky Tint** (`#eaf0fc`): Selected options, the current stop in walk mode, info chips, "walk" bucket pill.

### Neutrals & Text
- **Slate** (`#506175`): Secondary text — distances, dates, "6 min away · until 30 Sep", Japanese reference lines.
- **Rule** (`#d6dee9`): Dividers, card borders, thumbnail borders, progress track.
- **Control Border** (`#91a3bc`): Inputs, selects, secondary buttons.

### Bucket tints *(target)*
- **Home Green** (`#2f6b4a` on `#e8f3ec`): "📞 Deals to order at home" row and pill.
- **Recycle Gray** (`#5f6b7a` on `#eef1f4`): "♻ Safe to recycle" row and pill.
- **Keep Neutral** (`#3d4752` on `#edeff2`): "🔒 Letters to keep" row.

### Gradient System
No decorative gradients. The only gradient is the stamp's ink texture: a subtle radial gradient (`radial-gradient(circle at 30% 30%, rgba(181,69,8,.08), transparent 60%)`) inside the seal.

## 3. Typography Rules

### Font Family
- **Latin**: `Schibsted Grotesk` (400, 600; self-hosted woff2), fallback `system-ui, sans-serif`
- **Japanese**: `Zen Kaku Gothic New` (400; self-hosted subsets), fallback `"Yu Gothic", Meiryo, sans-serif`
- Stack: `Schibsted, 'Zen Kaku Gothic New', 'Yu Gothic', Meiryo, sans-serif`

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|---|---|---|---|---|---|---|
| Answer title | Schibsted | clamp(28px, 4vw, 40px) | 600 | 1.15 | -0.035em | "3 places worth the walk" |
| Screen title | Schibsted | 22px | 600 | 1.3 | -0.01em | Walk mode stop name, sheet titles |
| Stop title | Schibsted | 18px | 600 | 1.3 | 0 | "Pilates studio · zen place" |
| Deal line | Schibsted | 16px | 600 | 1.4 | 0 | Amounts in Stamp Vermilion |
| Body | Schibsted | 16px | 400 | 1.55 | 0 | Sheets, "How to use" |
| Meta | Schibsted | 14px | 400 | 1.5 | 0 | Slate; distance · date |
| Japanese reference | Zen Kaku Gothic New | 13px | 400 | 1.5 | 0.02em | Slate; `lang="ja"` |
| Label | Schibsted | 12px | 600 | 1.4 | 0.05em | Uppercase section labels only |
| Stat number | Schibsted | 40px | 600 | 1.2 | -0.035em | Proportional figures |

### Principles
- **Proportional figures only.** `font-variant-numeric: tabular-nums` makes Schibsted's comma and period as wide as a digit ("¥3 , 300", "1 . 4 km"). Never use it.
- **English carries the meaning, Japanese proves it.** Show the English translation first; the printed Japanese sits underneath in Japanese reference style so the user can match it to the paper.
- **Two weights.** 400 and 600; no light or black weights.
- **Short lines.** Verdicts truncate at ~90 characters; stop titles at one line with ellipsis.

## 4. Component Stylings

### Buttons
**Primary (Signal Blue)**
- Background: Signal Blue (`#174cbc`); text white, 16px, 600
- Min height 48px (56px for "I'm here"), padding 12px 20px, radius 6px
- Hover/pressed: Signal Blue Deep (`#0d3690`); focus: 3px Signal Blue outline, 4px offset
- One per screen. If you need a second, it is secondary.

**Secondary (Paper)**
- Background: Paper White; text Signal Blue; border 1px Control Border (`#91a3bc`); radius 6px; min height 44px
- Hover: Sky Tint background

**Icon button (✕, ↻, ⚙, stamps)**
- 44×44px hit area, 20px glyph, transparent background, accessible name required ("Not for me", "Rotate page 2")

**Text link**
- Signal Blue, underline offset 4px; used for "Open route in Google Maps", "Show all", "Call"

### Cards & Containers
**Stop row** (the core component)
- Paper White, 1px Rule border, radius 6px, padding 12px, gap 12px
- Left: thumbnail stack (56×56px tiles, radius 4px, 1px Rule border, up to 3 tiles offset 6px)
- Middle: Stop title (one line) · Deal line (amounts in Vermilion, "was ¥X" in Slate) · Meta line
- Right: ✕ icon button "Not for me"
- Whole row opens the flyer sheet; the thumbnail opens the page sheet

**Collapsed bucket row**
- Height 56px, Paper White, 1px Rule border, icon (📞 ♻ 🔒) + label + count + chevron; opens a sheet

**Walk summary**
- Directly under the stops: "2.1 km · ~35 min · ~3,000 steps" in Meta, then the primary "Start the walk →"

### Sheets (dialog)
- Mobile: bottom sheet, full width, top radius 12px, max height 90vh, scrolls inside
- Desktop ≥ 720px: centered dialog, 560px wide, radius 12px
- Backdrop `rgba(23,37,54,.4)`; Esc and a 44px close button; focus returns to the opener
- **Flyer sheet**: thumbnails row → title → How to use (Call / Website / Show this flyer at the counter / Use by) → offers (top 5) → prices (top 5, "Show all") → "Not for me"
- **Page sheet**: 480px preview of the page → its one-line reading → "This page belongs to:" radio cards (this flyer · other flyers by thumbnail · a flyer of its own) → Apply

### Inputs & Forms
- Height 48px, 1px Control Border, radius 6px, 12px horizontal padding, white background
- Focus: 3px Signal Blue outline; labels 14px 600 above the field
- Used only in settings (line, station, walk length) and "Add address"

### Navigation
- No tab bar. Header 64px: brand (left), "Your stamps" icon and ⚙ (right)
- Sticky bottom action bar (Paper White, top Rule border, safe-area padding) holds the screen's primary button when it would otherwise scroll away ("Read 7 flyers", "Start the walk")

### Image Treatment
- Thumbnails are the user's own photos, cropped to the flyer, 480px long side, stored only on the phone
- Tiles use `object-fit: cover`; previews use `contain` on Mist
- Personal mail never has a thumbnail — show a neutral 🔒 tile

### Distinctive Components
**Stamp seal**
- 104px circle, 3px Stamp Vermilion border, category icon (24px, Vermilion) centred, business name inside along the bottom (12px, ellipsis)
- Rotation: deterministic −8° to +8° from the stamp id; ink texture radial gradient
- GPS-verified: solid border, 100% opacity. Self-reported: dashed border, 60% opacity, "self-reported" under the date
- Stamping animation: scale 1.15 → 1 with a 120ms ink "press" (instant with reduced motion)

**Reading progress**
- 6px bar, Rule track, Signal Blue fill; text "Reading 3 of 7 · about 1 min left"; a Stop link; never hidden off-screen

**Walk mode**
- Full-screen: "Stop 1 of 3 · 6 min walk" (Meta), large thumbnail, Screen title, Deal line, "Open route in Google Maps" link, "I'm here" (56px primary), "Skip this stop" (text link)
- After a stamp: "Did you use it?" chips (Sky Tint when selected) for offers/items with a printed value, then "Next stop →"

## 5. Layout Principles

### Spacing System
- Base unit 8px; scale 4 · 8 · 12 · 16 · 24 · 32 · 48
- Card padding 12px; section gap 24px; screen side gutter 20px (16px minimum)

### Grid & Container
- Single column. Content max width 640px, centred on larger screens
- Sheets 560px on desktop

### Whitespace Philosophy
- **One decision per view.** The answer screen is a short list, a summary and one button; everything else collapses into rows.
- **Three lines per flyer.** If a fourth line seems necessary, it belongs in the sheet.
- **Counts before lists.** "♻ 9 flyers safe to recycle" is enough; the list is one tap away.

### Border Radius Scale
- 4px: thumbnails, pills
- 6px: buttons, inputs, cards (`--radius`)
- 12px: sheets
- 50%: stamp seals; 999px: chips

## 6. Depth & Elevation

| Level | Treatment | Use |
|---|---|---|
| Flat (0) | Mist background, no border | Page canvas |
| Card (1) | Paper White + 1px Rule border, no shadow | Stop rows, bucket rows, settings |
| Sticky (2) | Paper White + top Rule border + `0 -2px 8px rgba(23,37,54,.06)` | Bottom action bar |
| Sheet (3) | Paper White + `0 -8px 24px rgba(23,37,54,.12)` + backdrop `rgba(23,37,54,.4)` | Flyer sheet, page sheet, settings sheet |

**Shadow Philosophy**: borders, not shadows, separate content. Shadows only signal "this is on top of the page" (sticky bar, sheets). Stamps have ink texture, never a drop shadow.

## 7. Do's and Don'ts

### Do
- Show the flyer's own thumbnail wherever the flyer is mentioned
- Keep exactly one Signal Blue primary button per screen
- Let the app decide: pre-select stops; the user only removes (✕)
- Learn implicitly: ✕ / "Not for me" = 👎, a stamp = 👍
- Show money only when the flyer prints it, in Stamp Vermilion, with the original price in Slate ("¥1,000 · was ¥3,300")
- Say how to use a deal ("Call", "Show this flyer at the counter", "Use by 30 Dec")
- Keep reading progress visible at all times and show flyers as they finish
- Use plain verbs: "Photograph your flyers", "Start the walk", "I'm here", "Not for me"

### Don't
- Don't use tabs, bucket headers, rating buttons or checkboxes to choose stops
- Don't print every extracted item, coupon or Japanese line by default
- Don't use Stamp Vermilion for errors, warnings or decoration
- Don't use `tabular-nums`
- Don't show zero stats ("0 walks · 0.0 km") — hide them until they are non-zero
- Don't show station names or addresses from the user's own mail in screenshots, copy or test fixtures
- Don't store photos anywhere but the phone; personal mail keeps no thumbnail
- Don't add emoji beyond the fixed set: 📷 📞 ♻ 🔒 📍 and the stamp category icons

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Key changes |
|---|---|---|
| Phone (primary) | < 720px | Single column, bottom sheets, sticky bottom action bar, 20px gutters |
| Tablet / desktop | ≥ 720px | 640px centred column, centred dialog sheets (560px), sticky bar stays within the column |

### Touch Targets
- Minimum 44×44px; primary buttons 48px; "I'm here" 56px
- ✕ and ↻ icon buttons keep 44px hit areas even when the glyph is 20px

### Collapsing Strategy
- Bucket lists collapse to one row each; sheets hold the detail
- Thumbnail stacks show at most 3 tiles (+N)
- Long titles truncate to one line; verdicts to ~90 characters

### Image Behavior
- Thumbnails 56px in rows, 96px in the snap strip, up to 480px in the page sheet (never upscaled beyond source)
- Respect `env(safe-area-inset-bottom)` for the sticky bar and sheets

## 9. Agent Prompt Guide

### Quick Color Reference
- Text: "Ink Navy (#172536)"
- Primary action: "Signal Blue (#174cbc)", hover "Signal Blue Deep (#0d3690)"
- Stamps and printed money: "Stamp Vermilion (#b54508)"
- Background: "Mist (#f4f6f9)"; cards and sheets: "Paper White (#ffffff)"
- Secondary text: "Slate (#506175)"; borders: "Rule (#d6dee9)"; inputs: "Control Border (#91a3bc)"
- Selected / current: "Sky Tint (#eaf0fc)"

### Example Component Prompts
- "Create a stop row on Paper White (#ffffff) with a 1px Rule (#d6dee9) border and 6px radius: a stack of two 56px flyer thumbnails on the left (4px radius, offset 6px), then 'Pilates studio · zen place' in 18px Schibsted 600 Ink Navy, a deal line '¥1,000' in Stamp Vermilion (#b54508) 600 followed by '· was ¥3,300' in Slate, and '6 min away · until 30 Sep' in 14px Slate. A 44px ✕ icon button labelled 'Not for me' sits on the right."
- "Create the walk-mode screen on Mist (#f4f6f9): 'Stop 1 of 3 · 6 min walk' in 14px Slate, a 240px flyer thumbnail, the stop title in 22px Schibsted 600, a vermilion deal line, an 'Open route in Google Maps' Signal Blue link, a full-width 56px Signal Blue (#174cbc) 'I'm here' button and a 'Skip this stop' text link."
- "Create a stamp seal: a 104px circle with a 3px Stamp Vermilion (#b54508) border, rotated −5°, a vermilion walking-figure icon in the centre, the business name in 12px along the bottom inside the circle, a faint radial ink texture, and the date in 14px Slate below. A dashed, 60%-opacity variant means self-reported."
- "Create the answer screen header: '3 places worth the walk' in clamp(28px,4vw,40px) Schibsted 600 with −0.035em tracking on Mist, then three stop rows, a Meta line '2.1 km · ~35 min · ~3,000 steps' and one Signal Blue 'Start the walk →' button; below it three 56px collapsed rows: '📞 2 deals to order at home', '♻ 9 flyers safe to recycle', '🔒 1 letter to keep'."

### Iteration Guide
- Work on one screen at a time: snap → answer → walk → stamps
- Name colours by role ("Stamp Vermilion", "Signal Blue"), never by hex alone
- Before adding anything to a card, ask whether it changes the user's next physical action; if not, it goes in the sheet
- Check every screen at 390×844 and 1280 wide for horizontal overflow, 44px targets and a single primary button
