# Design System of Worth the Walk?

> Format: the Stitch DESIGN.md structure with extended sections, as collected in [awesome-design-md](https://github.com/VoltAgent/awesome-design-md). The approved visual reference is [`docs/design/mockup.html`](docs/design/mockup.html) with screenshots in `docs/design/`. When this file and the mockup disagree, the mockup wins; update this file.

## 1. Visual Theme & Atmosphere

**Ticket and ink.** Your mailbox becomes a train ticket for today. Japanese mailbox flyers are loud four-colour newsprint; the app answers in the quiet vernacular of Japanese rail: pale ticket paper, dot-matrix print, a route line with stations, the display above the train door, and the ink stamps of a station stamp rally (駅スタンプ). The only loud element is the one that comes from the flyers themselves: the yellow price sticker with the sale price in red.

The screen is the shortest part of the experience. Every view leads to the next physical action: photograph, walk through the gate, say "I'm here", get a stamp.

**Key Characteristics:**
- Pale kippu ticket paper (`#f6f8f2`) with a faint diagonal guilloché; a ticket card with perforation notches and a dashed tear line
- Dot-matrix numerals (DotGothic16) for times, distances, dates and labels — like a ticket printer or a departure board
- Chunky poster display face (Dela Gothic One) for headings and big numbers
- One action per screen in ticket-gate blue (`#1846b8`), labelled with its Japanese gate word where it helps ("Start the walk → 改札")
- The best printed deal is a yellow price sticker (`#ffd400`) with the price in flyer red (`#d40b0b`) and the old price struck through
- Walk mode is the dark train-door display: "NEXT · 次は", amber dot-matrix text
- Station stamps in per-category ink (indigo, green, vermilion, teal): double ring, name on an arc, central kanji, boxed date, uneven ink
- The user's own flyer thumbnail appears wherever a flyer is mentioned; English first, Japanese as small reference

## 2. Color Palette & Roles

### Surfaces
- **Desk** (`#e4e9e1`; dark `#0b0f12`): Page background around the app column.
- **Ticket Paper** (`#f6f8f2`; dark `#151b1f`): App surface, ticket card, sheets.
- **Paper Shade** (`#edf2ea`; dark `#1b2328`): Notch fill, pressed states, secondary surfaces.

### Ink
- **Print Ink** (`#18222c`; dark `#e9eee7`): Primary text.
- **Faded Ink** (`#5b6a62`; dark `#9aa8a0`): Secondary text, dot-matrix meta.
- **Rule** (`#cdd7cb`; dark `#2a3631`): Borders, tear lines, empty stamp slots.

### Action
- **Ticket-gate Blue** (`#1846b8`; dark `#5e88ff`): The one primary action per screen, the route line, station dots, links, focus rings, progress. Text on it: white (dark theme: `#0b1020`).

### Flyer accents (printed money only)
- **Price Sticker** (`#ffd400`, both themes): Background of the best-deal sticker. Text on it is always `#1b1300`.
- **Sale Red** (`#d40b0b` on the sticker; standalone `#d40b0b` / dark `#ff5d4f`): The sale price, and "¥ saved (printed)" totals. Never for errors.

### Walk-mode display
- **Display Black** (`#0f1418`; dark `#05080a`): Train-door board background.
- **Display Amber** (`#f3c623`; dark `#f6cd2e`): Dot-matrix text on the board; the station name itself is `#f6f1e4`.
- **Display Dim** (`#6f7a74`): Secondary board text ("NEXT · 次は", "STOP 1 / 3").

### Stamp inks (one per kind of place)
- **Indigo** (`#3d3a92`; dark `#8f8cf0`): lessons, fitness, studios
- **Green** (`#17784c`; dark `#4fc28f`): cleaners, services, clinics
- **Vermilion** (`#c2411c`; dark `#ff7a52`): supermarkets, drugstores, food shops, restaurants
- **Teal** (`#0e6f82`; dark `#49b9cf`): events, dojos and everything else

### Gradient System
No decorative gradients. Texture only: the ticket's faint diagonal guilloché (`repeating-linear-gradient(135deg, transparent 0 7px, <green 7%> 7px 8px)`), the stamp card's dot grid, and the stamp ink filter.

## 3. Typography Rules

### Font Family
- **Display**: `Dela Gothic One` (Google Fonts), fallback `"Zen Kaku Gothic New", "Hiragino Sans", sans-serif`
- **Body**: `Zen Kaku Gothic New` 400/500/700 (Google Fonts or self-hosted), fallback `"Hiragino Sans", "Yu Gothic", system-ui, sans-serif`
- **Print (dot-matrix)**: `DotGothic16` (Google Fonts), fallback `"Zen Kaku Gothic New", monospace`

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|---|---|---|---|---|---|---|
| Ticket title | Dela Gothic One | 22px | 400 | 1.2 | 0 | "3 places worth the walk" |
| Board name | Dela Gothic One | 26px | 400 | 1.15 | 0 | Walk-mode stop name |
| Big number | Dela Gothic One | 20px | 400 | 1.1 | 0 | Tray counts, tallies |
| Sticker price | Dela Gothic One | 18px | 400 | 1 | 0.01em | Sale Red on Price Sticker |
| Wordmark | Dela Gothic One | 17px | 400 | 1.1 | 0 | "Worth the Walk?" |
| Stop name | Zen Kaku Gothic New | 15px | 700 | 1.25 | 0 | "Pilates studio" |
| Body | Zen Kaku Gothic New | 15px | 400 | 1.55 | 0 | Sheets, how-to text |
| Japanese reference | Zen Kaku Gothic New | 11.5px | 400 | 1.4 | 0.04em | Under the stop name, `lang="ja"` |
| Print meta | DotGothic16 | 12–13px | 400 | 1.4 | 0.04–0.08em | "6 MIN · UNTIL 30 OCT", "TODAY · 12 OCT", captions |
| Board print | DotGothic16 | 13–15px | 400 | 1.4 | 0.06–0.1em | Display Amber on Display Black |

### Principles
- **Print face for facts, display face for headlines, body face for sentences.** Times, distances, dates and labels are always dot-matrix uppercase Latin.
- **Proportional figures in body text.** Never `tabular-nums` with Zen Kaku/Schibsted (wide punctuation); DotGothic16 is already monospaced.
- **English first, Japanese proves it.** The stop name is English ("Pilates studio"); the printed Japanese name sits underneath, small.
- **Headings balance** (`text-wrap: balance`).

## 4. Component Stylings

### The ticket (answer card)
- Ticket Paper, 1px Rule border, radius 12px, guilloché texture, soft shadow (`0 1px 0 rgba(24,34,44,.06), 0 10px 24px -14px rgba(24,34,44,.35)`)
- Two perforation notches (16px circles in Paper Shade with a Rule border) on the left and right edges at the tear line
- Head: print kicker "TODAY · 12 OCT" with a ticket number on the right; ticket title; print meta "2.0 KM · 25 MIN · ~2,850 STEPS"; then a 1.5px dashed tear line
- Body: the **route strip**

### Route strip
- Vertical Ticket-gate Blue line (3px) with 22px station dots (Ticket Paper fill, 3px blue ring, stop number in print face)
- First and last rows are stations in print face: "FROM <STATION> <駅名>", "HOME · <STATION> <駅名>"
- Stop rows between them: thumbnail stack (46×60px) · text (stop name + Japanese reference, price sticker, print meta) · ✕ "Not for me"
- "Take the train to …" plans replace the FROM row with "TRAIN TO <STATION>, THEN WALK"

### Price sticker (the one loud element)
- Inline block, Price Sticker yellow, radius 3px, rotated −2°, tiny hard shadow
- "Trial" label (12px 700, `#1b1300`) · price in Dela Gothic One 18px Sale Red · old price struck through (`#4d3f00`)
- Free offers: "Trial **Free** ~~¥3,300~~"; no printed comparison: show the deal text without a sticker

### Flyer thumbnails
- The user's own photo, 480px source, `object-fit: cover`, 2px radius, light border, small shadow
- Stacks: up to 3 pages, rotated −5° / +3°, offset; tap opens the page sheet
- No thumbnail (old pages, personal mail): a paper-coloured tile with "No preview" in print face — never a hatched icon

### Buttons
- **Gate (primary)**: Ticket-gate Blue, white 16px 700 text, radius 12px, padding 16px, full width; optional print-face suffix ("→ 改札", "· stamp"). One per screen.
- **Ghost**: transparent, blue 14px 700 text, underlined, centred ("Skip this stop")
- **Icon button**: 36–44px, 1px Rule border, radius 10px (header: stamps ◎, settings ⚙, close ✕)
- Focus: 3px blue outline, 3px offset

### Mailbox tray
- Three equal slots under the gate: print label (HOME / RECYCLE / KEEP), big number, one-line description ("deals to order by phone", "flyers to put out", "letter, not an ad"); a slot with 0 is hidden; tapping opens its sheet

### Walk mode (train-door display)
- Display Black panel, radius 14px, 6px Ticket-gate Blue top edge
- "NEXT · 次は" (Display Dim) ← → "STOP 1 / 3"; stop name in Dela Gothic One (`#f6f1e4`); Japanese name and "6 MIN WALK · 450 M" in amber print face
- Below: large thumbnail + price sticker + "Open route in Google Maps"; a "HOW TO USE" box (print label + plain instructions); Gate "I'm here · stamp"; Ghost "Skip this stop"; the walk's stamp slots

### Station stamp (SVG seal)
- `viewBox 0 0 100 100`: outer ring r46 stroke 4.2; inner ring r39.5 stroke 1.1; place kind in print face on an arc (path M19 52 A31 31 0 0 1 81 52); central kanji in Dela Gothic One 27px (体 lessons/fitness · 洗 cleaners/services · 市 shops/food · 道 dojos/other); date "2026.10.12" in a 38×11 box
- Ink per category (section 2), rotated −9°…+9° (deterministic from the stamp id), ink filter: fractal-noise speckle (alpha matrix `-1.9 1.8`) + small displacement (scale 2.4)
- Self-reported: dashed outer ring (`7 4`), opacity .55
- Arrival animation: scale 1.35 → 1 with a slight overshoot (`cubic-bezier(.2,1.6,.4,1)`, 0.5s); none with reduced motion
- Empty slot: dashed Rule circle; the first says "Next stamp"

### Stamp rally card
- Card with 1.5px Rule border and a 10px dot grid; 3 columns of stamps; heading "6 places stamped" + print "EACH KIND OF PLACE HAS ITS OWN INK"
- Tallies: three columns with a 2px ink top rule: walks · km + steps · ¥ saved (Sale Red, "saved, printed on flyers"); hide zeros

### "Why open models?" stub
- Opens from the first screen and from the footer line; a ticket stub with a "✂ - - -" tear line on top
- Heading "Your mail is read by models anyone can run"; four numbered reasons (print-face numbers in circles), each a bold line plus one or two sentences with the real figures (see section 9)

### Sheets
- Bottom sheet on phones (top radius 18px), centred 560px dialog on desktop; Ticket Paper; backdrop `rgba(15,20,24,.45)`; focus returns to the opener

## 5. Layout Principles

### Spacing System
- Base unit 4px; scale 4 · 6 · 8 · 10 · 12 · 14 · 16 · 24 · 32
- Screen padding 16px × 14px; ticket padding 14px; gaps 10–14px

### Grid & Container
- Phone: one column. Tablet (720–959px): a 480px column centred on the Desk. Desktop (≥960px): a 1120px page with two columns: the ticket, gate and tray on the left; a 380px side column with "Add more flyers", the stamp card and the "Why open models?" stub. Walk mode puts the walk's stamp slots in the side column. Sheets are 560px dialogs

### Whitespace Philosophy
- **The ticket is the page.** The answer screen is one ticket, one gate, one tray. Nothing else competes.
- **Three lines per stop**: name (+ Japanese), sticker, print meta. Details live in the flyer sheet.

### Border Radius Scale
- 2–3px: thumbnails, stickers · 10px: icon buttons, tray slots, how-to box · 12px: ticket, gate, stamp card · 14px: walk display · 18px: sheets, phone screen · 50%: dots, stamps

## 6. Depth & Elevation

| Level | Treatment | Use |
|---|---|---|
| Desk (0) | Desk colour, no border | Page canvas |
| Paper (1) | Ticket Paper + 1px Rule | Tray slots, how-to box, stamp card |
| Ticket (2) | Ticket Paper + Rule + soft shadow + guilloché | The answer ticket |
| Object (3) | Hard 1–2px shadow | Price stickers, flyer thumbnails (things stuck or laid on paper) |
| Sheet (4) | Ticket Paper + backdrop | Flyer, page, settings, why-open sheets |

**Shadow Philosophy**: paper on a desk. Soft shadow for the ticket, tiny hard shadows for things stuck on it. Stamps are ink, never shadowed.

## 7. Do's and Don'ts

### Do
- Make the answer a ticket with a route strip; keep one gate button per screen
- Put the best printed deal on a yellow sticker; strike the old price
- Use the print face for every time, distance, date and label
- Show the user's own flyer thumbnail wherever a flyer appears
- Draw stamps as SVG seals with per-category ink
- Let the app decide; the user only removes stops (✕), which teaches ranking
- Say how to use each deal; hide rows and tallies that are zero
- Use example shops and stations in screenshots, fixtures and the mockup

### Don't
- Don't add tabs, rating buttons, or stop checkboxes
- Don't use the sticker yellow or sale red for anything except printed prices
- Don't use emoji as icons (use print-face labels and the stamp kanji)
- Don't use `tabular-nums` on Zen Kaku Gothic New
- Don't show the user's own station, area or addresses anywhere public
- Don't store photos anywhere but the phone; personal mail keeps no thumbnail

## 8. Responsive Behavior

### Breakpoints

| Name | Width | Key changes |
|---|---|---|
| Phone (primary) | < 720px | Single column, bottom sheets, gate full width, 16px gutters |
| Tablet | 720–959px | 480px app column centred on the Desk; sheets as centred 560px dialogs |
| Desktop | ≥ 960px | 1120px page, ticket column + 380px side column (add flyers, stamp card, why-open stub); walk stamps beside the board |

### Touch Targets
- 44px minimum hit area (✕ keeps 44px even if the glyph is small); gate buttons 52px+; "I'm here" 56px

### Collapsing Strategy
- Tray stays three slots (hides empty ones); stop names wrap to two lines, Japanese reference to one with ellipsis
- Stamp card stays 3 columns; stickers wrap below the name if needed

### Image Behavior
- Thumbnails 46×60 in the route, 66×86 in walk mode, up to 480px in the page sheet; never upscaled beyond source

## 9. Agent Prompt Guide

### Quick Color Reference
- Ticket paper "#f6f8f2" on desk "#e4e9e1"; ink "#18222c"; faded ink "#5b6a62"; rule "#cdd7cb"
- Gate blue "#1846b8" (one action per screen, route line)
- Price sticker "#ffd400" with sale red "#d40b0b" (printed prices only)
- Walk board black "#0f1418" with amber "#f3c623"
- Stamp inks: indigo "#3d3a92", green "#17784c", vermilion "#c2411c", teal "#0e6f82"

### Why open models (in-app copy, keep the figures true)
1. **You choose where your mail is read.** Here, photos go to Gemma 4 on DigitalOcean for a few seconds. With `LOCAL_LLM=1` the same open model family reads them on your own laptop, and they never leave it. A closed API has no run-it-at-home option.
2. **We could check it on real flyers.** With open weights we tested both sizes on the same flyers: the small model got 0/8 prices from a whole page, the large one 4/4 from a tile. That is why price lists are read tile by tile.
3. **It costs about half a yen a page.** Reading one page costs roughly ¥0.4 on serverless inference. A whole mailbox is a few yen, with no account and no subscription.
4. **Nothing closed is load-bearing.** Prior Labs runs the TabPFN ranking, SerpApi finds places with no printed address, and Sentry traces model calls. Take any key away and the app still works: simple ranking rules, Japan's free GSI geocoder, no tracing.
Footer note: Open at the core: Gemma 4 and Mastra, both Apache 2.0. Photos are read and deleted; nothing is stored on a server.

### Example Component Prompts
- "Create the answer ticket on Ticket Paper (#f6f8f2) with a 1px Rule (#cdd7cb) border, 12px radius, faint diagonal guilloché, perforation notches at the tear line, a DotGothic16 kicker 'TODAY · 12 OCT', a Dela Gothic One title '3 places worth the walk', print meta '2.0 KM · 25 MIN · ~2,850 STEPS', a dashed tear line, then a vertical gate-blue (#1846b8) route strip from 'FROM HIKIFUNE 曳舟' to 'HOME · HIGASHI-MUKOJIMA 東向島' with three stop rows."
- "Create a stop row: a stack of two flyer thumbnails (46×60, rotated −5°/+3°), 'Dry cleaner' in Zen Kaku Gothic New 700 15px with 'ほしクリーニング' below in 11.5px faded ink, a yellow (#ffd400) price sticker rotated −2° reading 'Shirts ¥98 ¥297' with ¥98 in Dela Gothic One sale red (#d40b0b) and ¥297 struck through, print meta '9 MIN · UNTIL 31 OCT', and a 44px ✕ 'Not for me'."
- "Create walk mode: a train-door display (#0f1418, 6px gate-blue top edge) with 'NEXT · 次は' and 'STOP 1 / 3' in dim DotGothic16, 'Pilates studio' in Dela Gothic One 26px, 'さくらピラティス' and '6 MIN WALK · 450 M' in amber (#f3c623) DotGothic16; below, the flyer thumbnail, its price sticker, a HOW TO USE box and a full-width gate button 'I'm here · stamp'."
- "Create a station stamp SVG (viewBox 0 0 100 100) in indigo (#3d3a92): outer ring r46 stroke 4.2, inner ring r39.5 stroke 1.1, 'PILATES STUDIO' on the top arc in DotGothic16 8.6px, '体' in Dela Gothic One 27px at the centre, '2026.10.12' in a boxed 7.4px date, the ink-speckle filter, rotated −7°."

### Iteration Guide
- Compare every screen with `docs/design/*.png` at 390px, light and dark
- One loud element per screen (the sticker); one gate button per screen
- Name colours by role ("gate blue", "price sticker"), never by hex alone
