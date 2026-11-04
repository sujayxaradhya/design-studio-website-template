# AGENTS.md: design studio website template

One-page website for a design, brand or digital agency. An Astro site (`npm run dev`, `npm run build` to `dist/`), no JavaScript libraries in the page: the scroll motion is CSS scroll-driven animations plus a small motion kit (`src/scripts/motion-kit.js`).

## Files
- `src/components/<Section>.astro`: one per section, in page order in `src/pages/index.astro`. Repeated items (cases, partners, services, steps, shots, roles, stories, questions) are arrays in the component's frontmatter: edit the array, not the markup. Each holds its `section:<id>` styles (`<style is:global>`), its `scene:<id>` styles (`<style is:inline data-8b-part="scene:<id>">`, which the kit switches off if the scene script fails) and its scripts.
- `src/site.ts`: emails, offices, phones and nav links used by several sections.
- `src/layouts/Layout.astro`: `<head>`, meta tags and the `motion-gate` script; `src/styles/global.css`: fonts, `tokens`, `base`, `system` and `motion`.
Deploy `dist/` with LICENSE and CREDITS.md; GitHub Pages builds it with `.github/workflows/deploy.yml` (set `site` and `base` in `astro.config.mjs`).

## Keep
- Every `id`, `data-8b-section`, `data-8b-motion` and `data-8b-part` (`section:<id>` styles, `scene:<id>` animation).
- The motion parts `motion-gate` (head, `is:inline`: sets `data-8b-live` on `<html>` only with scroll-driven animation support and no reduced motion), `src/scripts/motion-kit.js` and `motion`, and every other `data-8b-*` attribute (`data-8b-items` groups, `data-8b-off`, `data-8b-enter`): the CSS and the kit read them. Items ordered by `--i` follow their group; counts the CSS fixes are listed under Known limits (`data-8b-fixed` marks such a group).
- Selectors the component scripts use:
  - `Navigation.astro`: `.nav__menu` `.menu` `.menu__close`
  - `Contact.astro`: `.contact__form` `.contact__status` `data-success` `data-error`
  - `Footer.astro`: `.footer__news` `.footer__note` `data-success` `data-error`
  - `Hero.astro`: `.hero__aperture` `data-8b-section` `.statement__dot`
  - `Work.astro`: `.work__stage` `.work__window` `.work__track` `.case`
  - `Again.astro`: `.again__stage` `.again__head` `.again__wheel` `.partner`
  - `Studio.astro`: `.studio__collage` `.shot`
  - `Footer.astro`: `.footer__aperture` `.footer__period`
- `style="--len:N"` = characters in that display line, spaces included: `Hello` is 5, `Let's talk` is 10, `Bye` is 3.
- Section headings (and Open roles) end in a violet dot (`<span class="m-dot">`), not a typed full stop: keep the span when you change one. Hello and Bye use a round photo instead; case, partner, service, step and story titles have no dot.
- "Hello" in the hero is sized by its `style="--len:N"` on phones only (wide screens use a fixed size), and "Let's talk" in contact by its own --len; "Bye" in the footer has a fixed size whatever its --len says. Keep Hello and Bye to one short word.
- Colours and fonts are variables in `:root` (`@layer tokens` in `src/styles/global.css`): `--color-1` #0d0c11 (near-black bands and text), `--color-2` #ffffff (white bands, text on black), `--color-3` #6c3cff (violet dots, buttons, process ring, contact section), `--color-4` #efeef4 (pale cards for services and the form), `--color-5` #aaa7b4 (muted text on black), `--color-6` #5d5a67 (secondary text on white), `--color-7` #1f1d26 (dark base under photos); body text needs 4.5:1 contrast.
- With reduced motion the page must read in full.
- Keep the header comment and `<meta name="generator">` in `Layout.astro`. Keep the "Design: 8B" footer link unless the site owner asks to remove it.

## Replace
- `data-8b-placeholder` (og-image, favicon, email, phone, form, social): real value in, attribute out; no value, remove the row (no image: drop `og:image`, set `twitter:card` to `summary`).
- Instagram, LinkedIn and Vimeo links in the footer: now the networks' home pages; owner's target: your studio's profiles, or remove them.
- Case cards in work and stories in journal: now nothing (they are not links); owner's target: your case-study and article pages, by wrapping each card or story in a link.
- The form in `#contact` (fields `name`, `email`, `company`, `topic`, `message`) sends nothing; `Contact.astro` handles its submit in its `<script>` (read it before you connect a service). Formspree: `action="https://formspree.io/f/<id>"` and `fetch` POST `new FormData(form)` first. Netlify: `data-netlify="true"` and a hidden `form-name`. Or delete it and the script.
- The form in `#footer` (fields `email`) sends nothing; `Footer.astro` handles its submit in its `<script>` (read it before you connect a service). Formspree: `action="https://formspree.io/f/<id>"` and `fetch` POST `new FormData(form)` first. Netlify: `data-netlify="true"` and a hidden `form-name`. Or delete it and the script.
- The name Onda (any letter case); the favicon letter and colours in `<link rel="icon">`.
- Photos (26, Unsplash: hero 1, footer 1, work 5, again 6, capabilities 5, studio 5, journal 4): `src`, no `srcset`/`sizes`, `width`/`height` to the ratio, `alt`, CREDITS.md.
- `<title>`, meta description, og tags.

## Ask the owner for
All demo text, never to be invented:
- Offices and cities: "Lisbon and Brooklyn" (meta description, phone menu, studio, FAQ "Where are you based?", contact, footer "Made in Lisbon and Brooklyn"); the two addresses (replaced with example streets) and the two phone numbers and two emails (replaced) in contact and footer.
- Clients and results in work: Northwind Bikes ("launched in eleven cities in a single spring"), Halden Bank ("a 120-year-old bank"), Copper & Oat bakery, Atlas Museum, Sola Sound ("sold out its first run in nine days"), and the lead "Five launches from the last two years. Every one of them is still growing."
- Long-term clients in again: Vela Air (Year 9), Kiln Coffee (Year 4), Larch Outdoor (Year 6), Tessera Games (Year 7), Civic Lab (Year 8), Marrow Health (Year 5, "across three hospital systems"), and "Most of our partners have been with us for more than five years".
- Team: "Ninety people", "keep Friday afternoons for our own experiments" (studio); open roles Senior product designer (Lisbon), Creative technologist (Brooklyn), Strategy director (Remote, Europe) and the careers email (studio, footer).
- Process and terms: a two-week listening sprint (method "Listen", FAQ "How does a project usually start?"), clients of "between fifty and five thousand people, plus a few public bodies", fixed fees per phase then a monthly team, "open about our rates on the first call", remote people "across Europe and the US east coast" (FAQ).
- Journal: four dated stories (1 October, 18 September, 30 August, 4 August 2026, with read times of 2, 6, 8 and 5 minutes), the event "Open Studio Night returns to Lisbon on 14 November" in "the old print hall", "three hundred nurses" and "six weeks of field research", a "forty-metre billboard" (journal).
- Service promises: "A real person reads every message and replies within two working days" (contact text and the form's success text); newsletter "once a month", "No spam, one email a month" (footer).
- "© 2026 Onda Studio" (footer).

## Known limits
- The contact form and the newsletter field send nothing; they check the fields in the browser and show a status text.
- Without JavaScript the phone menu button cannot open the overlay; the footer still links Work, Services, Approach, Studio and Journal.
- In a browser without CSS scroll-driven animations (Firefox today) and with reduced motion, the page shows its finished layout: case cards and long-term clients in grids, services as a plain list, the journal frame showing only the first story's photo. Hello still rises on load and the round photos turn, except with reduced motion.
- Some scroll rules count items with CSS `:nth-of-type`: the two statement lines, the five service cards (each of the first four shrinks under the next) and the four journal stories with their four frame photos (one `stories` array feeds both). When you add or remove one of these, extend or trim the matching rules in `scene:capabilities` or `scene:journal`.
- During the hero to statement handoff the travelling round photo briefly crosses the statement lines before it lands; on phones, during the work to again handoff, the rising wheel briefly overlaps the right side of the again lead. Both clear before the transition ends.

## Check
`npm run build` passes; 375 and 1440 px, reduced motion on, a browser without scroll-driven animations (Firefox: the finished static layout), console clean; `data-8b-placeholder` and Onda left only in class names.
