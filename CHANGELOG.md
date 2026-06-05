# Changelog

## label-printer/v14

- **Fixed: Width/Height are the true printed/cut size again.** v12 had added the 10mm slot
  tabs *on top of* the width, so a "90 mm" label was actually cutting at 110 mm. Now what you
  enter is exactly what prints; the full-bleed colour bars (each with a ~10 mm slot tab) sit
  *inside* that width. Side effect: back to 12 labels per A4 sheet at 90 × 34 mm.

## label-printer/v13

- **Calibration ruler.** A new **Ruler** button swaps the preview for a printable 100 × 40 mm
  box with millimetre graduations on all four edges (drawn as SVG, so it prints without
  "Background graphics"). Print one page, measure with a ruler, and adjust your printer's
  scale until it reads true-size — before committing the whole batch. Shows your current
  label dimensions too.

## label-printer/v12

- **Slot tabs + full-bleed colour bars.** Each label gains a 10mm tab on each side (the card
  is `width + 20mm`) that seats into the bin-slot holder, and the family bar / jacket stripe
  now run **full-bleed to the edges** — no white gap — with ~10mm seating in the slot and
  ~4mm visible. Note: at 90mm content the card becomes 110mm, so labels print one per A4 row.

## label-printer/v11

- **Colour bars now print** even when the print dialog's "Background graphics" box is off.
  The family bar and jacket stripe are CSS background colours, which browsers strip from
  printouts by default; `print-color-adjust: exact` on the sheet forces them to print. (The
  QR and cut lines already printed, being foreground paths/borders.)

## label-printer/v10

- **Descriptor moves to a top eyebrow.** A descriptor like `keystone` / `coupler` now renders
  as a small uppercase line *above* the headline (KEYSTONE → CAT6A) instead of bottom-left, so
  it reads top-to-bottom. Only affects labels that have a descriptor; plain `CAT6A` patch
  cables are unchanged. The family word stays bottom-left.

## label-printer/v9

Type/size rebalance (informed by two design reviews) and a couple of layout asks.

- **Size is now a co-equal anchor.** The headline auto-fit is **capped** (≈0.26 × label
  height) so short codes like `CAT6A` stop ballooning, and the size/spec jumped from ~3.9mm
  to **6mm**, moved onto the headline's eye-line pinned right. So `CAT6A` + `2 m` read as two
  strong anchors rather than a giant title and fine print. Unified across QR and non-QR labels.
- **Descriptor words demote.** Form-factor words (`keystone`, `coupler`, `adapter`, …) are
  pulled out of the headline and shown small bottom-left: `Keystone CAT6A` → type **CAT6A**,
  descriptor *Keystone*. The family word sits beneath it as the quietest element.
- **3mm bottom safe-margin.** The colour bar/stripe and the bottom text now clear the bottom
  3mm too (not just the sides), matching a slot that covers the bottom edge.

## label-printer/v8

- **Tidier QR layout.** On labels with a QR, the big type is now vertically centred so it
  lines up with the QR's middle, the family word sits bottom-left, and the size/spec tucks
  directly under the QR in the bottom-right — so type, QR and caption all align on a clean
  grid. Labels without a QR keep the bottom caption strip (family left · size right).
- **Cross-browser fix:** the QR is now sized explicitly (≈0.6 × label height, via a `--qr`
  CSS var) instead of `aspect-ratio: 1 / 1` + `height: 60%`. That circular size made Safari
  blow the QR column up to full width, hiding the type and the jacket stripe (Chrome resolved
  it leniently). Explicit dimensions render identically everywhere.

## label-printer/v7

- **QR codes.** Put a `http(s)://…` URL anywhere on a label's line (e.g. the FS.com product
  page) and it's stripped from the text and rendered as a crisp SVG QR on the right, before
  the jacket stripe — scan it to jump to the datasheet / reorder page. Uses a vendored,
  dependency-free QR library (`js/qrcode.js`, MIT) so it works offline and on Pages with no
  third-party calls.
- **Type is centred.** Short codes (`CAT6A`, `GLC-T`) that don't fill the width now sit
  centred over the bottom caption strip, instead of left-aligned.

## label-printer/v6

- **Size/spec moved to a bottom caption strip.** The bordered length/spec pill is gone; the
  size now sits bottom-right on the same baseline as the family word (bottom-left), so the
  big type is the clear focal point and the metadata reads as a quiet caption. Family stays
  the lightest element (the colour bar already encodes it); the size gets a touch more weight.

## label-printer/v5

- **Jacket colour is now a right-edge stripe** instead of a small dot. A trailing colour word
  (`CAT6A 2m blue`) paints a full-height stripe on the right edge, mirroring the family bar on
  the left: left bar = category, right stripe = the item's own colour. Much stronger
  "grab the blue one" cue for patch leads; the length chip sits between the type and the stripe.

## label-printer/v4

- **3mm slot safe-margin.** Content (colour bar, type, chip) now keeps a 3mm clear zone at
  the left and right ends of each label — the part hidden by the bin-slot lip — so nothing
  important disappears into the slot. Set by `SAFE` in `app.js` / `--safe` in CSS.
- **Fixed: labels with no chip no longer run to the right edge.** The right padding used to
  come from the chip's margin, so a chip-less label (e.g. `Keystone OM4`) butted against the
  edge. The type column now carries its own padding on both sides.

## label-printer/v3

**SFP + DAC families, item-colour swatches, and fastener sizes.**

- Two new families: **SFP** (violet — SFP/SFP+/QSFP/XFP/GBIC/GLC/`n`GBASE transceivers)
  and **DAC** (magenta — twinax / direct-attach / `CUn` copper cables). Detection order is
  DAC → SFP → fibre → copper → power, so an SFP module that mentions LC/RJ45 still lands in
  SFP, and a QSFP twinax cable lands in DAC. A fibre LC keystone correctly reads as FIBRE.
- **Item-colour swatch:** a trailing colour word (`Keystone CAT6A black`) renders a dot
  next to the chip — distinguishing physical variants (black vs green keystone, blue vs
  black IEC) independently of the family bar.
- **Fastener sizes:** `M6` / `M6×20mm` auto-extract to the chip (cage nuts, screws); `OM4`
  and `MMF` are safely ignored.
- **Length fix:** a number glued to letters (`CU1M`) is no longer mistaken for a length, and
  a transceiver's reach (`300m`) isn't pulled to the chip for SFPs.

## label-printer/v2

**Shelf-scan label layout with auto-detected category colours.** Each label is now a
colour bar + big left-aligned type + category word + a length chip pinned right, designed
to be scanned fast across a wall of bins.

- Lines auto-classify into a **family** that sets the colour: POWER (amber, IEC/`Cxx`/plug),
  COPPER (blue, CAT/RJ45/keystone), FIBRE (aqua, LC/SC/`OMx`), HARDWARE (slate, everything
  else). Keywords live in `classify()`.
- A metre length (`1.8m`, `2 m`, `3m`) is auto-pulled into the chip; `20mm`/`OM4`/`MTP`
  are correctly *not* treated as lengths. Force a chip with `primary | chip` (e.g. `M6`).
- Main text stays black for contrast; colour is spent on the bar, category word and chip
  (so it still reads in B&W / for colour-blind eyes). Type auto-fits on one line.
- Examples now cover all four families.

## label-printer/v1

Initial release — a standalone, client-side label printer for cut-out A4 labels.

**Features**

- Type one label per line (e.g. `C14 to C15 1.8m`); optional `text | caption` per label.
- Live, true-millimetre A4 preview laying labels out multi-up, paginated across sheets.
- Text auto-fits each label (wraps and scales to fill the trim box on both axes).
- Configurable trim size (default 90 × 34 mm), bleed gutter, and per-label copies; Swap W/H.
- Solid cut outline (border-based, so it prints without "Background graphics") plus corner
  ticks and a bleed gutter for clean cutting; optional label border; mono / bold / UPPERCASE.
- Browser print with `@page A4 / margin 0` so labels come out true size (panel hidden in print).
- Settings and label text persist in `localStorage`.

**Tech / deployment**

- Plain HTML/CSS/JS, no build step — `frontend/index.html` + `css/main.css` + `js/app.js`.
- `docker-compose.yml` serves the static app via nginx on port 8084.
