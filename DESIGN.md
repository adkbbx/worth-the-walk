# Design System of Worth the Walk?

> Format: the Stitch DESIGN.md structure with extended sections, as collected in [awesome-design-md](https://github.com/VoltAgent/awesome-design-md). The approved visual reference is [`docs/design/mockup.html`](docs/design/mockup.html) with screenshots in `docs/design/`. The mockup governs the ticket and ink styling; this file describes the current onboarding and sample flow.

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
- **Appearance**: Light is the default, including on dark devices. Settings stores `light`, `dark`, or `auto` under `settings.theme`; missing or invalid legacy preferences become Light. A synchronous `/theme.js` applies it before styles paint. Light and Dark set `data-theme`; Match my device removes it. Both theme-color meta tags follow a fixed preference; device mode keeps one paper colour per scheme. `--paper-light` and `--paper-dark` provide those browser colours.
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
- **Sticker ink tokens**: `--sticker-ink` (`#1b1300`), `--sticker-sale` (`#c40000`), and `--sticker-old` (`#4d3f00`) stay fixed against yellow in both themes.
- **Sale Red** (standalone `#d40b0b` / dark `#ff5d4f`): Printed savings totals; also the Failed reading-chip status, as specified for the reading ticket.

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
- First and last rows are start points in print face: "FROM <STATION> <駅名>", "HOME · <STATION> <駅名>"
- Stop rows between them: thumbnail stack (46×60px) · text (stop name + Japanese reference, price sticker, print meta) · ✕ "Not for me"
- GPS routes begin “From where you are” and end “Back to where you started”. A route ending at another station still says “Train home from <Station>”.
- "Take the train to …" plans replace the FROM row with "TRAIN TO <STATION>, THEN WALK"

### Price sticker (the one loud element)
- Inline block, Price Sticker yellow, radius 3px, rotated −2°, tiny hard shadow
- "Trial" label (12px 700, `#1b1300`) · price in Dela Gothic One 18px Sale Red · old price struck through (`#4d3f00`)
- Free offers: "Trial **Free** ~~¥3,300~~"; no printed comparison: show the deal text without a sticker

### Flyer thumbnails
- The user's own photo, 480px source, `object-fit: cover`, 2px radius, light border, small shadow
- Stacks: up to 3 pages, rotated −5° / +3°, offset; tap opens the page sheet; fictional sample previews are non-interactive
- No thumbnail (old pages, personal mail): a paper-coloured tile with "No preview" in print face — never a hatched icon

### Buttons
- **Gate (primary)**: Ticket-gate Blue, white 16px 700 text, radius 12px, padding 16px, full width; optional print-face suffix ("→ 改札", "· stamp"). One per screen.
- **Ghost**: transparent, blue 14px 700 text, underlined, centred ("Skip this stop")
- **Icon button**: 44px, 1px Rule border, radius 10px (header: stamps ◎, settings ⚙, close ✕)
- All ✕ controls (stop removal, grocery removal, sheet close, photo removal) rest in Faded Ink and use Print Ink on hover or keyboard focus. The header's “Your stamps” button gains a 24px gate-blue round count badge at top-right for one or more stamps, capped at 99+. The badge is decorative; the accessible name remains exactly “Your stamps”.
- Focus: 3px blue outline, 3px offset

### Mailbox tray
- Three equal slots under the gate on phone/tablet: print label (HOME / RECYCLE / KEEP), big number, description; a slot with 0 is hidden; tapping opens its sheet. All slots share Ticket Paper, Rule border, 12px × 8px padding, aligned labels and number rows, with optional thumbnails after the description.
- At ≥960px the single tray moves into the side column below “Add more flyers” and above the stamp card. Slots become full-width rows: label and number on one baseline, description below, optional thumbnails last. There are no duplicate controls or IDs; crossing the breakpoint moves the same DOM section back under the ticket.

### Selected photo cards
- Above the horizontally scrollable strip: uppercase print “1 page ready” / “N pages ready”. Each 108px paper card has a Rule border, Photo Shadow, alternating −1.5° / +1.5° static tilt, and a print “Page N” caption beneath the preview.
- Round 44px paper buttons sit inside the top corners, 4px from the edges over the photo: rotate left, remove right. Paper background, Rule borders, soft Photo Shadow, Faded Ink glyphs, and the shared gate-blue focus ring. The strip keeps a 16px gap and vertical padding so tilted cards and focus rings do not clip or crowd their neighbours. Existing accessible names and photo actions stay intact.
- While the fixed Read dock shows, `cw-has-photos` reserves 112px plus the safe-area inset below main content so the final hint clears the dock, including on desktop.

### Reading ticket
- Ticket Paper, 1px Rule border, 12px radius, Ticket Shadow, 24px top padding and 16px other padding. A repeated half-circle cutout with a Rule rim perforates the top edge using CSS only.
- Print status (“Reading 2 of 5 · about 1 min left”) above a 4px gate-blue progress bar on a Rule track. The existing count, progress and message IDs remain.
- One wrapping chip per batch page, keyed by `data-reading-page`: 24×32px photo preview or numbered blank, plus Waiting / Reading / Reading prices / Read ✓ / Failed. Faded Ink for waiting, gate blue for active, Green ink for Read, Sale Red for Failed. Frequent updates change status attributes and text in place. Completed preview URLs retain the existing cleanup lifecycle.
- Stop, Retry page N, Resume and Discard preserve their existing behavior and accessible names.

### Printed flyer-sheet rows
- Bold English name first; small Japanese reference second with `lang="ja"`; a yellow sticker only when a printed saving exists.
- One muted uppercase DotGothic16 meta line joins the available printed saving (“¥3,300 off as printed”), offer deadline (“use by 30 Nov”), and conditions with “ · ”. A price without a printed comparison stays in that same line. Model text remains escaped. The separate red savings line is removed.
- Rows have 1px dashed Rule separators, 16px vertical padding, 4px internal gaps, and no enclosing box. Offer/item index attributes remain unchanged.

### Walk mode (train-door display)
- Display Black panel, radius 14px, 6px Ticket-gate Blue top edge
- "NEXT · 次は" (Display Dim) ← → "STOP 1 / 3"; stop name in Dela Gothic One (`#f6f1e4`); Japanese name and "6 MIN WALK · 450 M" in amber print face
- Below: large thumbnail + price sticker + "Open route in Google Maps"; a "HOW TO USE" box (print label + plain instructions); Gate "I'm here · stamp"; Ghost "Skip this stop"; the walk's stamp slots

### Walk refinements
- Under the distance line, `.cw-line-map` is decorative (`aria-hidden="true"`): start/end dots labelled 発 / 着, and one numbered dot per outing stop, including groceries. Stamped dots fill Display Amber; skipped dots dim with a small break in the line; upcoming dots are hollow Display Dim. The current dot is larger with a soft amber ring, 次 above, and an uppercase kind truncated to approximately 12 characters below. Equal flexible columns accommodate six stops plus endpoints at 320px. The existing heading and Stop N / N carry the accessible meaning.
- While checking the phone's location, the gate says "Checking location…", has `aria-busy="true"`, and a 16px CSS spinner. The spinner is still in reduced-motion mode; no stamp-location reading is sent anywhere.
- Too far away: Paper Shade card, Rule border, 16px padding, Dela distance digits, "You're 650 m away — keep walking", route link, outline "Stamp anyway" button, and muted "Stamp anyway gives a dashed stamp." The card retains `role="status"`.
- At ≥960px, one `.cw-walk-ticket` fills the side column: print "This walk", vertical Start/Finish route, kind plus ✓ stamped and miniature seal, → current in Gate Blue, skipped struck and muted, or upcoming; then the seals grid. Hide the mini route and header with `display:none` on phone/tablet, leaving the same seals grid below the content. No IDs or controls are duplicated.
- Both primary and secondary start gates separate small 改札 from the arrow by 10px (primary gap; secondary suffix margin).

### Stamp result and printed savings
- Above the arrival seal, a centred print label says "Stamp 1 of 3 · GPS checked" or "Stamp 1 of 3 · without GPS". The ordinal counts stamps collected, not skipped stops.
- New arrivals keep `press` and gain a pure CSS ring behind the seal in the category ink, scaling and fading over 400ms. Both run only with `prefers-reduced-motion: no-preference`; reduced motion shows the final state instantly. GPS stamps call guarded `navigator.vibrate?.(18)` once; self stamps do not vibrate.
- Announce "Stamped: <kind>" through `#notice`. Focus "Did you use it?" (programmatically focusable, with a unique ID surviving re-render), or Next stop when there are no chips; the button remains in the tab order.
- Chips start with the English offer/item text and show a mini yellow sticker with Sale Red digits when a printed saving exists. Pressed chips use an Ink Green border, decorative ✓ prefix and `aria-pressed="true"`; accessible names still start with the item text. Unpriced offers can be recorded as used without adding yen.
- Beneath chips, and when proceeding through later stops, show "¥3,300 saved on this walk · printed on the flyer" with Sale Red Dela digits and print suffix. Update instantly from `savings(usedEntries([o]))`; hide at zero. Never estimate yen.

### Finished ticket
- Done uses `.cw-ticket.cw-used-ticket`, print Today/date and No. 000N, "Walk done", and km · min · ~steps. A 20px punch near the top-right uses Desk fill with an inner Rule rim in both themes.
- The print-face `.cw-tally` shows collected stamps, km, ~steps and ~kcal; steps and kcal explicitly say estimate. Show Sale Red "¥3,300 saved · printed on the flyers" only above zero. Route estimates come from `estimates`; savings come only from printed values.
- A 120px vermilion seal overlaps the lower right at −9°, inset to avoid page overflow. Reuse `sealHTML`, one `#ink` filter, unique arc/textPath IDs, WORTH THE WALK arc, 済 centre and today's boxed Japan date. It is decorative (`aria-hidden="true"`) and never animates.
- Below: this walk's stamp cards, primary "See your stamp card", text "Back to my mailbox", and a muted remaining-candidate count when they were not on this walk and have never been stamped or skipped. At ≥960px, centre the done screen in a 640px column.

### Station stamp (SVG seal)
- `viewBox 0 0 100 100`: outer ring r46 stroke 4.2; inner ring r39.5 stroke 1.1; place kind in print face on an arc (path M19 52 A31 31 0 0 1 81 52); central kanji in Dela Gothic One 27px (体 lessons/fitness · 洗 cleaners/services · 市 shops/food · 道 dojos/other); date "2026.10.12" in a 38×11 box
- Ink per category (section 2), rotated −9°…+9° (deterministic from the stamp id), ink filter: fractal-noise speckle (alpha matrix `-1.9 1.8`) + small displacement (scale 2.4)
- Self-reported: dashed outer ring (`7 4`), opacity .55
- Arrival animation: scale 1.35 → 1 with a slight overshoot (`cubic-bezier(.2,1.6,.4,1)`, 0.5s); none with reduced motion
- Empty slot: dashed Rule circle; the first says "Next stamp"
- The "Next stamp" spot has a faint decorative 歩 inside the dashed circle, with the label readable below it.

### Stamp rally card
- Card with 1.5px Rule border and a 10px dot grid; 3 columns of stamps; heading "6 places stamped" + print "EACH KIND OF PLACE HAS ITS OWN INK"
- Tallies: three columns with a 2px ink top rule: walks · km + steps · ¥ saved (Sale Red, "saved, printed on flyers"); hide zeros
- In the stamp sheet, wrap the rally in the shared ticket texture, border and shadow; a print header reads "Stamp rally · October" (current Japan month) with the collected count. Keep stats beneath the ticket and retain past-walk and flyer history controls.

### First visit
- Before the first photo: a decorative 200px hero scene at the top of the welcome, before the kicker. Three small printed flyers point along a dashed gate-blue route to a miniature ticket with a yellow trial sticker and a Vermilion seal. The scene is `aria-hidden`; its unique `hero-arc` and `hero-arc-text` use the one shared `#ink` filter. The seal never animates. Fixed flyer-paper colours retain their paper appearance in both themes.
- The welcome has “Photograph my flyers” with a 20px currentColor camera SVG, “Choose from photos” and “Try a sample mailbox”, then "How it works" and the example ticket. At 390×844 the heading, lead, camera action and photo chooser fit without scrolling. Below 360px the decorative flyers and miniature ticket narrow to preserve the gutters and seal.
- Desktop: the welcome spans the main area and uses two equal columns separated by 32px: text and actions in a maximum 520px left column; the hero vertically centred on the right, scaled 1.35× (1.15× from 960–1100px to maintain clearance). Reserve room for the seal inside the scene. Steps and the example ticket remain side by side below. The scene exists only while the welcome is shown.
- Photo chooser text buttons use the same maximum 520px, left-aligned column as the camera action and centre their text within it in every photo section. The inline start chooser also caps its content at 520px on desktop.
- Ask for the walking start inline only before reading or loading the sample. Offer one location reading or line/station selects; default to 40 minutes. Settings opens only from its header button.
- Store the GPS start on the phone to four decimal places; round all start coordinates to two decimal places for merge and locate requests. Stations from older saved states remain valid.
- The sample mailbox has eight fictional flyers, seven drawn non-interactive previews and a slim clear-sample strip: print label, explanatory text and Clear sample share a row when space allows and wrap on phone. Left edges align; Paper Shade background, Rule border, 10px radius, 8px × 12px padding. It uses the real route and stamp flow, with no model calls.
- Sample contacts are inert in all views, including persisted samples with websites: How to use says "Made-up shop — nothing to call."; flyer sheets expose no phone/site links, and the Home bucket has no Call link. Sample walk stops also omit external route links, including the keep-walking card, so sample taps cannot open an external site or dial a made-up number. Real flyer contacts and routes retain their existing behaviour.
- No dependencies or network calls are added. Browser acceptance keeps walk, stamped-stop, done and stamps screenshots at 390/1280px, adds walk-far at both widths, and retains overflow/44px checks at 320/390/768/960/1280/1440px. The browser cannot be launched in this editing session; screenshot generation and live visual verification remain reviewer-run.
- Each stage has one muted sentence naming the next action: photo selection, reading, ticket, walk and printed savings.

### Sheets
- Bottom sheet on phones (top radius 18px), centred 560px dialog on desktop; Ticket Paper; backdrop `rgba(15,20,24,.45)`; focus returns to the opener
- Sheet titles use Dela Gothic One 22px / 1.2 with balanced wrapping. After Walk length, Appearance offers Light / Dark / Match my device in three equal chip columns. Radio and label stack vertically to keep labels readable at 320px; each chip exceeds the 44px target minimum. Changes apply and save immediately; Save also retains the selection.

## 5. Layout Principles

### Spacing System
- Base unit 4px; use 4 · 8 · 12 · 16 · 24 · 32 for changed gaps and padding. Existing ticket and route values outside this polish remain intact.
- Screen padding 16px × 14px; existing ticket padding 14px; new welcome gaps 12px, reading gaps 12px, chip gaps 8px, desktop welcome gap 32px.

### Grid & Container
- Phone: one column. Tablet (720–959px): a 480px column centred on the Desk. Desktop (≥960px): a 1120px page with the ticket and gate on the left; a 380px side column with "Add more flyers", the mailbox tray, and the stamp card. The welcome spans the page with its own text/scene columns. Walk mode puts the walk's stamp slots in the side column. Sheets are 560px dialogs. Body uses Desk in both themes at every width; the app remains Ticket Paper.

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
| Sheet (4) | Ticket Paper + backdrop | Flyer, page and settings sheets |

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
- Don't use sticker yellow except for printed prices; Sale Red also marks Failed reading chips, with the status word always visible
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
| Desktop | ≥ 960px | 1120px page; welcome text/scene columns, ticket + 380px side with tray and stamps; walk stamps beside the board |

### Touch Targets
- 44px minimum hit area (✕ keeps 44px even if the glyph is small); gate buttons 52px+; "I'm here" 56px

### Collapsing Strategy
- Tray stays three slots on phone/tablet (hides empty ones), three stacked rows on desktop; stop names wrap to two lines, Japanese reference to one with ellipsis
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

### Open model rationale
The reasons for open models live in the README and the DEV post. They do not appear in the app.

### Example Component Prompts
- "Create the answer ticket on Ticket Paper (#f6f8f2) with a 1px Rule (#cdd7cb) border, 12px radius, faint diagonal guilloché, perforation notches at the tear line, a DotGothic16 kicker 'TODAY · 12 OCT', a Dela Gothic One title '3 places worth the walk', print meta '2.0 KM · 25 MIN · ~2,850 STEPS', a dashed tear line, then a vertical gate-blue (#1846b8) route strip from 'FROM HIKIFUNE 曳舟' to 'HOME · HIGASHI-MUKOJIMA 東向島' with three stop rows."
- "Create a stop row: a stack of two flyer thumbnails (46×60, rotated −5°/+3°), 'Dry cleaner' in Zen Kaku Gothic New 700 15px with 'ほしクリーニング' below in 11.5px faded ink, a yellow (#ffd400) price sticker rotated −2° reading 'Shirts ¥98 ¥297' with ¥98 in Dela Gothic One sale red (#d40b0b) and ¥297 struck through, print meta '9 MIN · UNTIL 31 OCT', and a 44px ✕ 'Not for me'."
- "Create walk mode: a train-door display (#0f1418, 6px gate-blue top edge) with 'NEXT · 次は' and 'STOP 1 / 3' in dim DotGothic16, 'Pilates studio' in Dela Gothic One 26px, 'さくらピラティス' and '6 MIN WALK · 450 M' in amber (#f3c623) DotGothic16; below, the flyer thumbnail, its price sticker, a HOW TO USE box and a full-width gate button 'I'm here · stamp'."
- "Create a station stamp SVG (viewBox 0 0 100 100) in indigo (#3d3a92): outer ring r46 stroke 4.2, inner ring r39.5 stroke 1.1, 'PILATES STUDIO' on the top arc in DotGothic16 8.6px, '体' in Dela Gothic One 27px at the centre, '2026.10.12' in a boxed 7.4px date, the ink-speckle filter, rotated −7°."

### Iteration Guide
- Compare every screen with `docs/design/*.png` at 390px, light and dark
- One loud element per screen (the sticker); one gate button per screen
- Name colours by role ("gate blue", "price sticker"), never by hex alone
