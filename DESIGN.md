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

### Brand assets
The share card (`dist/icons/og-image.png`, 1200×630) carries the mailbox-to-ticket walk story and an ink stamp. The app icon is the vermilion 歩 seal on pale ticket paper, supplied at 192 and 512 pixels, with a maskable 512 variant whose content stays inside the central 80% safe zone. The 180-pixel Apple touch icon and 32/48-pixel PNG favicons use the same identity. These existing assets serve link previews and installation; the legacy train favicon remains for other pages.

### Surfaces
- **Appearance**: Light is the default, including on dark devices. Settings stores `light`, `dark`, or `auto` under `settings.theme`; missing or invalid legacy preferences become Light. A synchronous `/theme.js` applies it before styles paint. Light and Dark set `data-theme`; Match my device removes it. Both theme-color meta tags follow a fixed preference; device mode keeps one paper colour per scheme. `--paper-light` and `--paper-dark` provide those browser colours.
- **Desk** (`#e4e9e1`; dark `#0b0f12`): Page background around the app column.
- **Ticket Paper** (`#f6f8f2`; dark `#151b1f`): App surface, ticket card, sheets.
- **Paper Shade** (`#edf2ea`; dark `#1b2328`): Notch fill, pressed states, secondary surfaces.

### Ink
- **Print Ink** (`#18222c`; dark `#e9eee7`): Primary text.
- **Faded Ink** (`#5b6a62`; dark `#9aa8a0`): Secondary text, dot-matrix meta.
- **Rule** (`#cdd7cb`; dark `#2a3631`): Borders, tear lines, empty stamp slots.
- **Control rule** (`#758477`; dark `#64756b`): Input, chip, radio-label, thumbnail and button boundaries. Keep the lighter Rule for paper decoration. Control rule contrasts at least 3:1 against Paper and Paper Shade in both themes.

### Action
- **Ticket-gate Blue** (`#1846b8`; dark `#5e88ff`): The one primary action per screen, the route line, station dots, links, focus rings, progress. Text on it: white (dark theme: `#0b1020`).

### Flyer accents (printed money only)
- **Price Sticker** (`#ffd400`, both themes): Background of the best-deal sticker. Text on it is always `#1b1300`.
- **Sticker ink tokens**: `--sticker-ink` (`#1b1300`), `--sticker-sale` (`#c00000`), and `--sticker-old` (`#4d3f00`) stay fixed against yellow in both themes.
- **Sale Red** (standalone `#d40b0b` / dark `#ff5d4f`): Printed savings totals; also the Failed reading-chip status, as specified for the reading ticket.

### Walk-mode display
- **Display Black** (`#0f1418`; dark `#05080a`): Train-door board background.
- **Display Amber** (`#f3c623`; dark `#f6cd2e`): Dot-matrix text on the board; the station name itself is `#f6f1e4`.
- **Display Dim** (`#78847d`): Secondary board text ("NEXT · 次は", "STOP 1 / 3").

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
- Two perforation notches (16px circles in Paper Shade with a Rule border) at the tear line, clipped horizontally into half-circles at the ticket edges (`overflow-x: clip; overflow-y: visible`) while the done seal can overlap the lower edge
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
- Focus: 2px gate-blue outline, 3px offset on every interactive element, including radios, text buttons, thumbnails and links

### Mailbox tray
- Three equal slots under the gate on phone/tablet: print label (HOME / RECYCLE / KEEP), big number, description; a slot with 0 is hidden; tapping opens its sheet. All slots share Ticket Paper, Rule border, 12px × 8px padding, aligned labels and number rows, with optional thumbnails after the description.
- At ≥960px the single tray moves into the side column below “Add more flyers” and above the stamp card. Slots become full-width rows: label and number on one baseline, description below, optional thumbnails last. There are no duplicate controls or IDs; crossing the breakpoint moves the same DOM section back under the ticket.

### Selected photo cards
- Above the horizontally scrollable strip: uppercase print “1 page ready” / “N pages ready”. Each 148px paper card has a Rule border, Photo Shadow, alternating −1.5° / +1.5° static tilt, and the preview uncovered at full card width.
- The card's footer row holds round 44px paper buttons either side of the print “Page N” caption: rotate left, remove right, so nothing covers the photo you are checking. Paper background, Rule borders, soft Photo Shadow, Faded Ink glyphs, and the shared gate-blue focus ring. The strip keeps a 16px gap and vertical padding so tilted cards and focus rings do not clip or crowd their neighbours. Existing accessible names and photo actions stay intact.
- While the fixed Read dock shows, `cw-has-photos` reserves 112px plus the safe-area inset below main content so the final hint clears the dock, including on desktop.

### Reading ticket
- Ticket Paper, 1px Rule border, 12px radius, Ticket Shadow, 24px top padding and 16px other padding. A repeated half-circle cutout with a Rule rim perforates the top edge using CSS only.
- Print status (“Reading 2 of 5 · about 1 min left”) above a 4px gate-blue progress bar on a Rule track. The existing count, progress and message IDs remain.
- One wrapping chip per batch page, keyed by `data-reading-page`: 24×32px photo preview or numbered blank, plus Waiting / Reading / Reading prices / Read ✓ / Failed. Faded Ink for waiting, gate blue for active, Green ink for Read, Sale Red for Failed. Frequent updates change status attributes and text in place. Completed preview URLs retain the existing cleanup lifecycle.
- Stop, Retry page N, Resume and Discard preserve their existing behavior and accessible names.
- Failed rows show the page number, a plain reason and “Retry page N”. Network failures say “No connection”; 429 says “Reading limit reached — try again in N min” using the service delay; timeout/abort says “Took too long”; 413 or excess detail says “Photo too large — try a closer, smaller photo”; other failures say “Couldn't read this page”. A user stopping a read keeps its unread pages waiting for Resume.
- With two or more failures, offer “Retry all failed”. When the entire batch fails, say “None of these pages could be read.” and offer primary “Retry all” plus “Remove these photos”, retaining individual retry controls. Retrying one page preserves the other failed rows and their original numbers; failures can rejoin an active reading queue. Only failed/unread photos remain in recovery storage; successful readings and preliminary detail results retain their existing lifecycle.

### Printed flyer-sheet rows
- Items without a printed saving show both printed prices when available, such as "¥108 before tax · ¥117 with tax", with tabular digits; a lone price stays "¥108".
- Ticket stop rows and walk cards without a sticker show a muted print-face line for two or more priced items, such as "53 printed prices · from ¥88"; the flyer-sheet tap target stays unchanged.
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
- Below: this walk's stamp cards, primary "See your stamp card", secondary "Share this walk" (only where `navigator.share` exists; shares text only — "I walked 1.6 km to 4 places from the flyers in my mailbox, and saved ¥2,300 printed on them." — plus the app URL, never shop names, places or photos), text "Back to my mailbox", and a muted remaining-candidate count when they were not on this walk and have never been stamped or skipped. At ≥960px, centre the done screen in a 640px column.
- The savings amount and “saved” stay on one line; “printed on the flyers” uses the print face on its own line beneath, with no leading separator. Zero savings remain hidden.

### Station stamp (SVG seal)
- `viewBox 0 0 100 100`: outer ring r46 stroke 4.2; inner ring r39.5 stroke 1.1; place kind in print face on an arc (path M19 52 A31 31 0 0 1 81 52); central kanji in Dela Gothic One 27px (体 lessons/fitness · 洗 cleaners/services · 市 shops/food · 道 dojos/other); date "2026.10.12" in a 38×11 box
- Ink per category (section 2), rotated −9°…+9° (deterministic from the stamp id), ink filter: fractal-noise speckle (alpha matrix `-1.9 1.8`) + small displacement (scale 2.4)
- Self-reported: dashed outer ring (`7 4`), full ink opacity so the stamp keeps its contrast. The dashed ring and accessible label distinguish stamps without GPS.
- Arrival animation: scale 1.35 → 1 with a slight overshoot (`cubic-bezier(.2,1.6,.4,1)`, 0.5s); none with reduced motion
- Empty slot: dashed Rule circle; the first says "Next stamp"
- The "Next stamp" spot has a faint decorative 歩 inside the dashed circle, with the label readable below it.

### Stamp rally card
- Card with 1.5px Rule border and a 10px dot grid; 3 columns of stamps; heading "6 places stamped" + print "EACH KIND OF PLACE HAS ITS OWN INK"
- Tallies: three columns with a 2px ink top rule: walks · km + steps · ¥ saved (Sale Red, "saved, printed on flyers"); hide zeros
- In the stamp sheet, wrap the rally in the shared ticket texture, border and shadow; a print header reads "Stamp rally · October" (current Japan month) with the collected count. Keep stats beneath the ticket and retain past-walk and flyer history controls.
- Always add at least one “Next stamp” spot, then decorative hidden spots only until the three-column last row is full (four stamps produce six cells). With no stamps, say “Your first stamp is one walk away.” and offer primary “Plan a walk”; it closes the sheet and focuses the answer or welcome heading.

### First visit
- Before the first photo: a decorative 200px hero scene at the top of the welcome, before the kicker. Three small printed flyers point along a dashed gate-blue route to a miniature ticket with a yellow trial sticker and a Vermilion seal. The scene is `aria-hidden`; its unique `hero-arc` and `hero-arc-text` use the one shared `#ink` filter. With motion allowed it plays a one-time ~1.6 s entrance (flyers drop, the route draws, the ticket slides in, the seal stamps) using `translate`/`scale`/`clip-path` so resting rotations stay intact; `render()` keeps the existing hero node across re-renders so the entrance never restarts. Under reduced motion it is static. Fixed flyer-paper colours retain their paper appearance in both themes.
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
- Flyer sheets for OSM locations show a muted "Place from OpenStreetMap · © OpenStreetMap contributors" line; the copyright text links to https://www.openstreetmap.org/copyright in a new tab.
- Bottom sheet on phones (top radius 18px), centred 560px dialog on desktop; Ticket Paper; backdrop `rgba(15,20,24,.45)`; focus returns to the opener
- Sheet titles use Dela Gothic One 22px / 1.2 with balanced wrapping. After Walk length, Appearance offers Light / Dark / Match my device in three equal chip columns. Radio and label stack vertically to keep labels readable at 320px; each chip exceeds the 44px target minimum. Changes apply and save immediately; Save also retains the selection.

### Non-happy states and recovery (Round 4)
- **Toast:** `#notice` remains one live region, fixed at the viewport bottom, above the safe-area inset and the measured Read dock height. Its paper card uses Rule, Ticket Shadow and a 4px left ink bar: Gate Blue for info, Vermilion for warn, Sale Red for error. Width follows the content column (448px phone/tablet maximum; 640px desktop maximum), with 16px viewport gutters. Text wraps; action and muted “Dismiss” ✕ controls have at least 44px targets. Info uses `role="status"` and expires after six seconds; warnings use status and persist; errors use alert and persist. Replacing or clearing the toast cancels its timer. Optional action buttons stay within the card; an info toast with an action stays ten seconds. Tapping ✕ (Not for me) on a ticket stop shows “Removed <place> from today's walk.” with **Undo**, which restores the stop and its previous label.
- **Availability strips:** below the header, Paper Shade, Rule, the same tone bar, compact 13px body text and wrapping 44px actions. Offline says “You're offline. Reading flyers needs a connection; your mailbox, walk and stamps still work.” Read/Resume/retry and Find address are disabled while offline, with visible connection reasons beside them. Returning online removes the strip and announces “Back online.” Network failures during a read keep failed pages available for retry.
- **Saving:** unavailable/full localStorage shows persistent error strip “This browser isn't saving. Your mailbox and stamps will be lost when you close this page.” Dismiss applies for the session, including subsequent failed saves. In-memory mailbox and stamps remain usable.
- **Reading service:** failed config or reading/sorting service outages show “Reading is unavailable right now. You can still try the sample mailbox.” with a working sample action. Existing read/retry actions remain available online. The sample uses local fictional content and existing start selection, with no reading API calls.
- **Start chooser and Settings:** permission denied, unavailable location or timeout says inline “Location is off for this site, so pick a station instead.” Reveal the station picker and focus its train-line select, including when a previously saved start exists. Keep “Pick a station”. Failed station-coordinate loading has an inline reason and “Reload”, which retries the existing coordinate resource. Station validation also stays inline.
- **Empty ticket:** retain the date/number header, perforations and tray, title “No walk today”. For home/recycle/keep-only mailboxes, use actual flyer bucket counts: “We read 6 flyers: 2 deals to use at home, 4 safe to recycle. None is a place to walk to.” Omit zero parts and use singular nouns where appropriate. Omit the duplicate “Add more flyers” button. The Add more flyers section makes “Photograph my flyers” primary, with “Choose from photos” below. Show text “Try a sample mailbox” under the empty ticket when no sample is loaded.
- When all walk flyers are expired, closed or rejected, the empty line is “The places on these flyers have ended their offers or you said Not for me.” Text “Show places I said Not for me” clears only rejected walk-flyer labels and replans, without asking anything. Other labels and expiry/closure rules remain intact.
- **Missing location:** the flyer row says “No address on the flyer” when no address is printed, or “Couldn't place this address near your start” when a printed address could not be placed nearby. Both show “Add address”. Failed lookup stays under the form: “Couldn't find that. Try the address printed on the flyer (住所) or the full business name.” Preserve the entered address across render and connection changes.
- **Skipped files:** keep accepted images; summarize non-images and images the browser cannot decode in one persistent warn toast, e.g. “2 files skipped: not photos.” Other preparation failures use an error toast with a next action.
- **Focus and layout corrections:** restore used-chip focus using `data-action`, `data-id`, `data-kind` and `data-index`, including browsers that do not focus tapped buttons automatically. The focused Skip link stays fixed at the viewport top-left. Centre the current line-map label on its dot at every width; cap it at three station columns so it clears the board edges. Reserve the measured Read dock height beneath main content when its connection reason expands it.
- All new surfaces use existing light/dark tokens. Printed savings and the existing two-decimal request start remain unchanged. No dependencies or API endpoints are added. Focused mock acceptance checks cover offline transitions and reads, 429/413/timeout/generic failures, config failure with a working sample, blocked storage, bucket counts, rejected-place restoration, denied location (chooser and Settings), coordinate reload, inline address failure, skipped files, toast lifecycle/viewport, used-chip focus and stamp-row padding. Reviewer-run screenshots add `empty-walk`, `offline`, `read-failed` and `toast` at 390/1280px; overflow/target checks retain 320/390/768/960/1280/1440px. Browser launch and screenshot capture are unavailable in this editing session.

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

### Accessibility and delivery (Round 5)

- Each main view has exactly one h1. Start selection takes heading priority; otherwise the answer ticket, reading card, photo view or welcome owns it. Sheets begin at h2 and progress to h3, with an existing heading matching the dialog's `aria-labelledby` in every state.
- Every control has an accessible name. Remove controls include the place kind or grocery name. Close and rotate icons share an 18px inline SVG box, 1.8px currentColor stroke and `aria-hidden="true"`; keep their action attributes and accessible labels. Decorative flyer art stays hidden. Ticket stops retain the ordered list; station numbers are decorative. Price stickers include the spoken word “was” before the struck price.
- Model strings remain escaped. Wrap detected Japanese runs in `lang="ja"`, retaining English as English, including in notices, board names, stamp captions and SVG stamp text. Use `tspan` within SVG.
- Focus uses a 2px Gate outline with a 3px offset; headings focused programmatically with `tabindex="-1"` have no outline or box shadow, while interactive controls retain their focus rings. Focused thumbnails rise above the stack. Reserve measured Read dock and toast heights in scroll padding/margins; move keyboard focus into view if either fixed card covers it. The Skip link uses a clipped 1px visually hidden box until focused, then appears fixed at top-left.
- Labels contain their form controls. Required fields retain native required semantics. Invalid address and station inputs expose `aria-invalid` and link to their inline error with `aria-describedby`. Placeholder text uses Faded Ink at full opacity.
- Reading announces completed pages and pause/start changes, not seconds, ETA or tile ticks. The top progress live region is visually hidden while the reading card is shown; the card's estimate includes five seconds per flyer still to sort. Stamping uses one atomic announcement in the visually hidden polite `#announce` status region, including the no-GPS explanation, without showing a toast. Unchanged availability strips and identical notices keep their DOM. Errors appear in the reading card and at most one toast per batch, never as an error in the top progress region.
- All-failed reading cards show the heading “None of these pages could be read.”, the reason, Retry all and Remove these photos. Consolidate an identical reason into one card line; retain individual retry buttons. Hide the waiting hint, paused count and empty progress bar. Mixed failures retain per-page reasons.
- Typography uses rem values equivalent to the original sizes at a 16px root. At 320px and 200% text size, tray rows stack, station radios stack vertically, input heights grow and ticket/sticker/board text wraps. Every animation and transition, including stamp splats and the location spinner, is disabled under reduced motion.
- Static text (`html`, `mjs`, `js`, `css`, `json`, `svg`, `webmanifest`) negotiates Brotli quality 9 before gzip. Cache representations by path, size/mtime validator and encoding, replacing stale versions. Send Vary and no-cache; weak size/mtime ETags support 304 and bodyless HEAD. Font subsets under `/fonts/` stay uncompressed with a one-year immutable cache. Exactly the Latin 400 Dela Gothic One and Zen Kaku Gothic New subsets are preloaded.
- Acceptance checks cover names, main headings, dialog titles/heading levels, visible Japanese text nodes, forms, Tab focus, both-theme contrast, reduced motion, and 320px at 200% text size on every captured main/sheet state. They must be run by a reviewer: this audit session did not launch a browser.

Contrast ratios calculated from the shipped token values below. The browser acceptance test also calculates these from computed styles. Normal text requires 4.5:1, seal ink and control boundaries 3:1; disabled text is exempt and visibly dimmed to 0.55 opacity.

| Pair | Light | Dark |
| --- | ---: | ---: |
| Ink / Paper | 15.05 | 14.77 |
| Ink / Desk | 13.07 | 16.36 |
| Muted / Paper (including print labels) | 5.33 | 7.02 |
| Muted / Desk | 4.63 | 7.77 |
| Muted / Paper Shade | 5.02 | 6.44 |
| Gate / Paper | 7.53 | 5.33 |
| Gate Ink / Gate | 8.06 | 5.81 |
| Sticker Ink / Sticker | 12.87 | 12.87 |
| Sticker Sale / Sticker | 4.53 | 4.53 |
| Sticker Old / Sticker | 7.24 | 7.24 |
| Display Amber / Display | 11.39 | 13.09 |
| Display Dim / Display | 4.76 | 5.16 |
| Sale / Paper | 5.10 | 5.74 |
| Indigo / Paper | 8.85 | 5.94 |
| Green / Paper | 5.13 | 7.82 |
| Vermilion / Paper | 4.83 | 6.75 |
| Teal / Paper | 5.43 | 7.55 |
| Control Rule / Paper | 3.69 | 3.56 |
| Control Rule / Paper Shade | 3.47 | 3.26 |
| Focus Gate / Desk | 6.54 | 5.90 |
| Focus Gate / Paper Shade | 7.09 | 4.89 |

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
