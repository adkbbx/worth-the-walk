---
name: Station Points
description: A station information board for comparing nearby grocery stops and checked point conditions.
colors:
  bg: "#f4f6f9"
  surface: "#fff"
  ink: "#172536"
  muted: "#506175"
  brand: "#174cbc"
  brand-hover: "#0d3690"
  rail: "#b54508"
  line: "#d6dee9"
  soft: "#eaf0fc"
  control-border: "#91a3bc"
  owned-ink: "#123b87"
  owned-border: "#9bb7e8"
  footer-surface: "#fbfcfe"
  selection: "#c8dafd"
typography:
  display:
    fontFamily: "Schibsted, 'Zen Kaku Gothic New', 'Yu Gothic', Meiryo, sans-serif"
    fontSize: "clamp(28px, 3vw, 40px)"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.035em"
  headline:
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.3
  station-title:
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.02em"
  title:
    fontSize: "20px"
    fontWeight: 600
    lineHeight: 1.3
  body:
    fontFamily: "Schibsted, 'Zen Kaku Gothic New', 'Yu Gothic', Meiryo, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.55
  supporting:
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  field-label:
    fontSize: "14px"
    fontWeight: 600
    lineHeight: 1.55
  category-label:
    fontSize: "12px"
    lineHeight: 1.55
    letterSpacing: "0.05em"
rounded:
  radius: "6px"
  compact: "4px"
spacing:
  xs: "4px"
  sm: "8px"
  group: "12px"
  md: "16px"
  mobile-inset: "20px"
  lg: "24px"
  section: "32px"
  wide: "40px"
components:
  button-primary:
    backgroundColor: "{colors.brand}"
    textColor: "{colors.surface}"
    rounded: "{rounded.radius}"
    padding: "10px 16px"
  button-primary-hover:
    backgroundColor: "{colors.brand-hover}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.brand}"
    rounded: "{rounded.radius}"
    padding: "10px 14px"
  button-secondary-hover:
    backgroundColor: "{colors.soft}"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.radius}"
    height: "48px"
    padding: "0 12px"
  point-chip:
    textColor: "{colors.muted}"
    rounded: "{rounded.compact}"
    padding: "3px 8px"
  point-chip-owned:
    backgroundColor: "{colors.soft}"
    textColor: "{colors.owned-ink}"
    rounded: "{rounded.compact}"
    padding: "3px 8px"
  store:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.radius}"
  station-code:
    textColor: "{colors.ink}"
    rounded: "{rounded.compact}"
    padding: "8px 6px"
---

# Design System: Station Points

## Overview

**Creative North Star: "Station information board"**

The existing direction uses daylight surfaces, navy text, cobalt actions and orange station notation. Nearby shops are readable rows with separate earning, spending and discount information. English and Japanese names sit together so a resident can identify the branch on the street.

This document records the built system, including its desktop preference rail and compact mobile disclosure. It preserves the incumbent station-board direction. The code-led concept has no approved image comp or FORM record; the missing concept-roll process remains disclosed in `.impeccable/surface-briefs/station-finder.md`. Documentation does not constitute retrospective approval or a whole-skill pass.

**Key Characteristics:**

- Pale page background, white store rows and thin dividers.
- Bilingual branch names with visible payment exclusions and unknown facts.
- Native controls, explicit action labels and cobalt keyboard focus.
- Mobile preferences collapse before the first store.

## Colors

The palette keeps source facts legible while reserving stronger color for actions, station notation and selected memberships. Frontmatter values are normative and retain the shipped CSS notation. Sidecar tonal ramps are synthesized preview metadata, not shipped palette steps.

### Primary

- Cobalt `brand` marks links, primary actions, checkbox accents, carets and focus outlines. `brand-hover` darkens the primary action on hover.
- `soft`, `owned-ink` and `owned-border` identify a selected membership and support secondary button hover.
- `selection` themes selected text with ink-colored lettering.

### Secondary

- Rail orange `rail` outlines the station code and marks the explicit Discount value. Its use stays small enough that condition copy retains the navy hierarchy.

### Neutral

- `bg` is the pale page field; `surface` is the masthead, fields, buttons and store interior.
- `ink` is primary text; `muted` is supporting text, Japanese names, conditions and source copy.
- `line` separates sections and store areas. `control-border` is the stronger input, secondary button, empty-state and scrollbar stroke.
- `footer-surface` slightly distinguishes the store action footer.

**The Membership Rule.** A blue membership chip means the user selected that card. It never certifies payment eligibility.

## Typography

The finder self-hosts Schibsted at weights 400 and 600, and the Japanese subset face Zen Kaku Gothic New at weight 400. The declared stack includes Yu Gothic, Meiryo and sans-serif fallbacks. Numerals in station codes and walk times use tabular spacing.

The display role carries the two-line page heading with balanced wrapping. Section headings use the headline role. Station names have their own larger title role, with a lighter Japanese companion. Store headings use title; they reduce to 18px on mobile. Station titles reduce to 26px on mobile.

Body copy is 16px on desktop. Intro copy becomes supporting size on mobile. Branch names, addresses, conditions, source disclosure copy and store footer links remain 14px at both sizes. Category labels are uppercase with tracking; they sit beside offers on desktop and above them on mobile. Small metadata, compact chips and masthead details use the source's smaller sizes rather than extending that treatment to checkout conditions.

The desktop intro has a maximum measure of 58ch. Evaluation paragraphs use 70ch. The evaluation page shares the stylesheet, though its HTML currently omits the separate Japanese font stylesheet. This omission is not a reusable typography rule.

**The Conditions Rule.** Keep exclusions and unverified facts at the readable supporting size beside the offer they qualify.

## Layout

The main and footer containers have a 1240px maximum width and 24px side padding. The 90px masthead aligns its content with that container. The finder pairs its introduction with a 330px station chooser, separated by 36px. Beneath it, a 260px preference rail and flexible results column have a 40px gap.

At 900px and below, the finder control column becomes 280px, the preference rail 220px, and the major gaps 24px. Store horizontal padding reduces from 24px to 18px.

At 680px and below, the masthead becomes 76px, page side padding becomes 20px, and the finder stacks. Preferences use a closed native disclosure by default. Its summary includes selected-card count and visit date; opening it exposes a two-column membership list and full-width secondary settings. The apply action closes the disclosure, focuses results and scrolls to them. Desktop opens the disclosure and hides its summary and apply action.

Store rows stay single column. Desktop offer rows have an 82px category column and 12px gap. Mobile moves each category above its value and condition. Known walking estimates stay aligned to the right; unknown walks move beneath the store name on mobile. Store footers wrap their links as space tightens. The about section moves from three columns to stacked paragraphs. The evaluation page has an 850px maximum width and a plain full-width metrics table.

## Elevation & Depth

The system has no box shadows. White interiors, pale footers and thin borders separate content. Focus adds an offset cobalt outline rather than a shadow. Selection, caret and scrollbar colors carry the same palette through browser-controlled details.

**The Flat Row Rule.** Separate a shop's content with borders and spacing; keep the interior free of nested decorative cards.

## Shapes

Store rows, buttons, inputs and mobile preference summaries use the radius token. Membership chips and station-code outlines use the smaller compact radius. Borders are 1px except the station code's 2px orange outline. The authored train mark and disclosure chevron are inline SVG with consistent strokes. Native checkbox and disclosure indicators remain native controls.

## Components

### Buttons

Primary actions use cobalt, white text and a minimum 44px height. Secondary actions use white, cobalt text and the stronger control border. Hover changes the background in 150ms. Disabled model actions lower opacity to 0.65 and use a waiting cursor. Every keyboard-focusable control receives a 3px outline with a 4px offset. Reduced-motion preferences remove transitions and smooth document scrolling.

### Inputs and selections

The station select has a visible label, 48px height and 19px semibold text. Date and semantic query inputs use the same field silhouette and 12px horizontal inset. Membership checkboxes are 19px within label rows at least 44px high. A fieldset legend labels the membership group. The visit-date control supplies its valid range through native attributes and keeps Japan-date context visible.

### Navigation

The masthead home link combines the SVG train with English and Japanese brand text. About the pilot is a text link with a 44px minimum height. The skip link appears on keyboard focus and targets store results. Ordinary links retain underlines with a 4px offset; hover thickens the underline. Evaluation navigation returns directly to the finder.

### Membership chips

Neutral chips have a thin border and supporting text. Selected chips gain the soft cobalt fill, stronger border and the text suffix "yours". Chips represent information, not independent clickable filters.

### Store rows and source disclosures

Each row starts with its English title, Japanese branch name, walk estimate, hours and address. It then lists supported cards and separately labelled earning, spending, bonus or sale facts. Conditions and unknown support stay in the row. Sources & checkout details is a native disclosure with an authored 18px chevron, which rotates when open. The footer offers Store information, Flyer / notices and Directions. Each source and direction link names its destination or purpose; directions include the Japanese store name in the accessible label.

### Preferences and result states

Station changes update the URL and clear old semantic results. Membership changes save locally and reorder shops; the separate matching-only checkbox filters them. Counts and sorting text explain the current list. An empty result includes a reason and Show all shops recovery. Dates show both visit time and checked snapshot; projected recurring rules remain explicit. Next bonus day has a labelled action that updates the visit date and returns mobile users to stores.

### Semantic search

The optional disclosure starts with an Enable semantic search action and download-size notice. During loading, the button disables and the status reports progress. Success reveals a labelled query field, focuses it and states that search cannot confirm eligibility. Download failure restores an enabled Retry semantic search action and explains recovery. Submitting disables the query action temporarily. Results list source-linked notices and a numeric match explicitly labelled as not a probability. Status and result changes use live regions. Search failure offers a shorter query or reload.

## Do's and Don'ts

### Do:

- Do keep English and Japanese branch names together.
- Do keep checkout exclusions and unknown support visible with the offer.
- Do preserve closed mobile preferences and the return-to-results action.
- Do use the authored SVG chevron and visible native control labels.
- Do retain source dates, source links and explicit pilot coverage.

### Don't:

- Don't treat a selected membership chip as payment eligibility.
- Don't invent walk estimates, item prices or verified point support.
- Don't introduce nested decorative cards or shadows into store rows.
- Don't shrink branch names, checkout conditions or source copy below the implemented supporting size.
- Don't claim that this documentation resolves the missing concept-roll process record.
