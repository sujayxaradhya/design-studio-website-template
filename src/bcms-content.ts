// @bettercms-ai/convert helper v36
// Values come from bcms-content/*.json, written into the tree before the build. The committed
// stubs are {} — a build with them renders every fallback below and still succeeds.
// Next.js (App Router): a server page reads its snapshot live with bcmsPage(slug, snapshot) from
// @bettercms-ai/next, and a client component reads it with useBcmsPage() from
// @bettercms-ai/next/page; neither imports the json. Other frameworks import it as written.
import layoutSnapshot from "../bcms-content/layout.json";

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** A list field as delivered, `{ repeatable: [...] }`, is the array it holds. */
const unzoned = (v: unknown): unknown => (isRecord(v) && Array.isArray(v.repeatable) ? v.repeatable : v);

/** Dotted keys and `[n]` indices, positionally — the editor's own path grammar. */
function readPath(root: unknown, path: string): unknown {
  let cursor: unknown = root;
  for (const segment of path.split(".")) {
    if (!segment) return undefined;
    const key = segment.replace(/\[\d+\]/g, "");
    if (key) {
      if (!isRecord(cursor)) return undefined;
      cursor = unzoned(cursor[key]);
    }
    for (const index of segment.matchAll(/\[(\d+)\]/g)) {
      if (!Array.isArray(cursor)) return undefined;
      cursor = cursor[Number(index[1])];
    }
  }
  return cursor;
}

/**
 * A repository image path — `@/images/x.avif`, `~/assets/x.png`, `../assets/x.jpg`, `/src/x.png`.
 * The bundler resolves one at build and nothing else can, so as a value it is never rendered: the
 * template's own fallback (the picture the build already imported) shows instead of a broken image.
 */
const REPO_IMAGE_PATH = /^(?:@[\w-]*|~|\.{1,2}|\/?src)\/[^\s?#"'<>]*\.(?:avif|png|jpe?g|webp|gif|svg|bmp|ico|tiff?|jxl|heic)(?:[?#]\S*)?$/i;

/** The marks `@bettercms-ai/richtext` draws as one bare tag. Underline it draws with a style: not here. */
const PT_MARKS: Record<string, [string, string]> = {
  strong: ["<strong>", "</strong>"],
  em: ["<em>", "</em>"],
  code: ["<code>", "</code>"],
  "strike-through": ["<s>", "</s>"],
  highlight: ["<mark>", "</mark>"],
};
/** richtext's STYLED_TAGS: the site's own inline markup a `styled` mark carries. */
const PT_TAGS = /^(?:span|small|sup|sub|kbd|abbr|time|strong|b|em|i|u|s|mark|code|q|cite|dfn|var|samp|ins|del)$/;
const PT_BLOCK_KEYS = new Set(["_key", "_type", "style", "children", "markDefs", "listItem", "level"]);
const ptEscape = (text: string): string => text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#x27;" })[c]!);
const onlyKeys = (value: Record<string, unknown>, keys: string[]): boolean => Object.keys(value).every((k) => keys.includes(k));

/** richtext's `safeHref`: a fragment, a site path (never `//`), or http(s)/mailto/tel. Null otherwise. */
function ptHref(raw: string): string | null {
  const href = raw.trim();
  if (href.startsWith("#")) return /^#[^\s<>"'`]*$/.test(href) ? href : null;
  if (href.startsWith("/") && !href.startsWith("//")) return href;
  try {
    return ["http:", "https:", "mailto:", "tel:"].includes(new URL(href).protocol) ? href : null;
  } catch {
    return null;
  }
}

/**
 * A link's destination: richtext's `safeHref`, or a RELATIVE reference — no scheme before the first
 * `/`, `?` or `#` (`pricing`, `./x`, `about.html`), as `safeMediaSrc` allows one. Never `javascript:`,
 * never a protocol-relative `//host`.
 */
function linkHref(raw: string): string | null {
  const href = raw.trim();
  return ptHref(href) ?? (href !== "" && !href.startsWith("//") && !/\s/.test(href) && !/^[^/?#]*:/.test(href) ? href : null);
}

/** One span, its marks drawn as richtext draws them; null for a mark this cannot draw the same. */
function ptSpan(span: unknown, defs: Map<unknown, Record<string, unknown>>): string | null {
  if (!isRecord(span) || span._type !== "span" || typeof span.text !== "string") return null;
  let out = ptEscape(span.text).replace(/\n/g, "<br/>");
  const marks = Array.isArray(span.marks) ? span.marks : [];
  // Two marks on one span nest in the order richtext's toolkit sorts them by: not reproduced here.
  if (marks.length > 1) return null;
  for (const mark of marks) {
    const def = defs.get(mark);
    if (def?._type === "link") {
      if (!onlyKeys(def, ["_key", "_type", "href"]) || typeof def.href !== "string") return null;
      const href = ptHref(def.href);
      // An unsafe href renders its words, as richtext does.
      if (href) out = '<a href="' + ptEscape(href) + '">' + out + "</a>";
    } else if (def) {
      if (def._type !== "styled" || !onlyKeys(def, ["_key", "_type", "tag"]) || typeof def.tag !== "string") return null;
      if (PT_TAGS.test(def.tag)) out = "<" + def.tag + ">" + out + "</" + def.tag + ">";
    } else if (mark === "underline") return null;
    else if (styleOwn(PT_MARKS, mark)) out = styleOwn(PT_MARKS, mark)![0] + out + styleOwn(PT_MARKS, mark)![1];
  }
  return out;
}

/**
 * A Body stored as a bare Portable Text array, as html — the LAST RESORT. A snapshot BetterCMS writes
 * carries the platform's own html for it; this draws an older one's paragraphs, headings, quotes, flat
 * lists and plain marks exactly as richtext does (headings without their anchor ids), and answers
 * undefined for anything else (an image, code, a table, a nested list…), so the template's fallback
 * shows rather than a Body with a block missing.
 */
function portableText(blocks: unknown[]): string | undefined {
  let html = "";
  let list = "";
  for (const block of blocks) {
    if (!isRecord(block) || block._type !== "block" || !Array.isArray(block.children) || !Object.keys(block).every((k) => PT_BLOCK_KEYS.has(k))) return undefined;
    if (block.listItem !== undefined && ((block.listItem !== "bullet" && block.listItem !== "number") || (block.level ?? 1) !== 1)) return undefined;
    const style = block.style ?? "normal";
    if (typeof style !== "string" || !/^(?:normal|h[1-6]|blockquote)$/.test(style) || (block.listItem && style !== "normal")) return undefined;
    const defs = new Map((Array.isArray(block.markDefs) ? block.markDefs : []).filter(isRecord).map((d) => [d._key, d] as const));
    const spans = block.children.map((span) => ptSpan(span, defs));
    if (spans.some((span) => span === null)) return undefined;
    const tag = block.listItem === "number" ? "ol" : block.listItem ? "ul" : "";
    if (list !== tag) html += (list ? "</" + list + ">" : "") + (tag ? "<" + tag + ">" : "");
    list = tag;
    const el = tag ? "li" : style === "normal" ? "p" : style;
    html += "<" + el + ">" + spans.join("") + "</" + el + ">";
  }
  return html ? html + (list ? "</" + list + ">" : "") : undefined;
}

/**
 * `<p>one</p>` → `one`, for a value read into an element that cannot hold a paragraph (a heading,
 * a `<p>`, a span…): the writer's own rule (`unwrapInlineParagraph`), which a publish applies to
 * the same element. Only when the codemod says the element is such a host.
 */
function inlineParagraph(html: string): string {
  const m = /^<p(?:\s[^>]*)?>([\s\S]*)<\/p>$/.exec(html.trim());
  return m && !m[1]!.includes("</p>") ? m[1]! : html;
}

/**
 * HOW a read renders: the codemod's word for the element it writes the read into.
 * - none: as text, which the framework escapes;
 * - `"html"`: into an html sink (`{@html}`, `v-html`, `set:html`, `dangerouslySetInnerHTML`): the html
 *   BetterCMS sanitized and wrote beside the values (`$html`), else the blocks drawn as richtext draws
 *   them, else a plain string ESCAPED, as the SDK's `rich()` escapes one — a stored value is never markup;
 * - `"html:<tag>"`: the same, into a `<tag>`, as the publish writer writes it there (@see htmlInto), `"html:"`
 *   where no element is known; `"line:<tag>"` for a one-line (`inline`) field, which the writer writes as
 *   a phrase whatever the tag;
 * - `"href"`: a link's destination, through richtext's `safeHref`: an unsafe one renders the fallback.
 */
type BcmsAs = string | null | undefined;

/** A field's value, rendered as `as` says; `html` is its server-sanitized html (`$html`). Undefined: nothing to show. */
function renderAs(value: unknown, as?: BcmsAs, html?: string): string | undefined {
  if (as === "href") {
    const href = render(value);
    return href === undefined ? undefined : linkHref(href) ?? undefined;
  }
  const [sink, tag] = as?.split(":") ?? [];
  const host = (tag ?? "").toLowerCase();
  return sink === "html" || sink === "line" ? htmlInto(html ?? renderHtml(value), host, sink === "line" || INLINE_HOST.test(host)) : render(value);
}

/** A stored value as a template renders it: richtext is its html, an image is its url. */
function render(value: unknown): string | undefined {
  if (typeof value === "string") return REPO_IMAGE_PATH.test(value.trim()) ? undefined : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (isRecord(value)) {
    if (typeof value.html === "string") return value.html;
    if (typeof value.url === "string") return value.url;
    // A V2 link value ({ type, href, ... }): its href is what the template renders.
    if (typeof value.href === "string") return value.href;
  }
  return undefined;
}

/**
 * A stored value as HTML, where the server wrote none for it: its blocks drawn as richtext draws them (a
 * Body, a richtext envelope's `value`), a plain string escaped. A stored `html` is never read: nothing
 * cleaned it, and only the server's sanitizer may say what markup is safe. @see htmlAt
 */
function renderHtml(value: unknown): string | undefined {
  if (typeof value === "string") return ptEscape(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return portableText(value);
  return isRecord(value) && Array.isArray(value.value) ? portableText(value.value) : undefined;
}

/** The server-sanitized html BetterCMS wrote beside `root`'s values for one address (`$html`), or undefined. */
function htmlAt(root: unknown, path: string): string | undefined {
  const html = isRecord(root) && isRecord(root.$html) ? root.$html[path] : undefined;
  return typeof html === "string" ? html : undefined;
}

/** The elements a paragraph cannot sit in (publish-static INLINE_HOSTS). */
const INLINE_HOST = /^(?:h[1-6]|p|span|a|li|td|th|button|label|figcaption|strong|em|small|kbd|code|b|i|u|s|mark|abbr|cite|q|sub|sup|var|samp|time|dfn|dt|summary)$/;
/** The elements that may hold blocks (publish-static BLOCK_HOSTS). */
const BLOCK_HOST = /^(?:div|article|section|main|blockquote|li|td)$/;
/** Markup a phrase can never hold. */
const BLOCK_MARKUP = /<(?:ul|ol|div|blockquote|table|pre|figure|hr|section|article)\b/i;

/** `html` as a run of top-level paragraphs and headings, or null when it holds anything else. */
function topBlocks(html: string): { tag: string; inner: string }[] | null {
  const out: { tag: string; inner: string }[] = [];
  const re = /\s*<(p|h[1-6])(?:\s[^>]*)?>([\s\S]*?)<\/\1>\s*/giy;
  let m: RegExpExecArray | null;
  let end = 0;
  while ((m = re.exec(html))) {
    out.push({ tag: m[1]!.toLowerCase(), inner: m[2]! });
    end = re.lastIndex;
  }
  return out.length > 0 && html.slice(end).trim() === "" ? out : null;
}

/**
 * Html written into a `<tag>` the way the publish writer writes it there (publish-static): into a phrase
 * (`inline`: a paragraph cannot sit in it, or the field is one line), several paragraphs as its lines
 * (`inlineLines`) and a lone `<p>` unwrapped (`unwrapInlineParagraph`); into any element, a value
 * whose one root IS that element unwrapped (`unwrapSameHost`, a code block into its `<pre>`). A value the
 * element cannot hold — several blocks in a phrase, a heading of another level — the writer refuses, and
 * so does this: undefined, and the template's copy shows.
 */
function htmlInto(html: string | undefined, tag: string, inline: boolean): string | undefined {
  if (html === undefined || !tag) return html;
  let out = html.trim();
  const same = (value: string): string => {
    const m = new RegExp("^<" + tag + "(?:\\s[^>]*)?>([\\s\\S]*)<\\/" + tag + ">$", "i").exec(value);
    return m && !m[1]!.includes("</" + tag) ? m[1]! : value;
  };
  if (!inline) return same(out);
  const blocks = topBlocks(out);
  if (blocks && blocks.length > 1 && blocks.every((b) => b.tag === "p" || b.tag === tag)) {
    const lines = blocks.map((b) => b.inner.trim()).filter((line) => line.replace(/<br\s*\/?>/gi, "").trim() !== "");
    if (lines.length === 0) return undefined;
    out = "<p>" + lines.join("<br>") + "</p>";
  }
  const after = topBlocks(out);
  if (!BLOCK_HOST.test(tag) && ((after && after.length > 1) || BLOCK_MARKUP.test(out))) return undefined;
  out = inlineParagraph(out);
  const heading = /^<(h[1-6])(?:\s[^>]*)?>([\s\S]*)<\/\1>$/i.exec(out);
  if (heading && heading[1]!.toLowerCase() !== tag && (/^h[1-6]$/.test(tag) || !BLOCK_HOST.test(tag))) return undefined;
  return same(out);
}

/** Tags and entities (skipped), and a number as a site writes one: `4.8`, `12,000`, `4 900`. */
const NUMBER_TOKEN = /<[^>]*>|&#?\w+;|\d+(?:[.,'\u2019 \u00a0\u202f]\d+)*/g;

/**
 * A NUMBER over the copy the template shipped with. When that copy shows exactly one number, only
 * that number is replaced, so `7k+` with 9 is `9k+` and `<span>4.8</span> / 5` with 4.9 keeps its
 * span. A rating's scale (the `5` after a `/`) is not the number. Anything else: `String(value)`.
 */
function numberOver(value: number, fallback: string): string {
  let token: { at: number; text: string } | undefined;
  let count = 0;
  let end = 0;
  let previous = "";
  for (const match of fallback.matchAll(NUMBER_TOKEN)) {
    const at = match.index ?? 0;
    const between = fallback.slice(end, at).trim();
    if (between) previous = between.slice(-1);
    end = at + match[0].length;
    if (match[0].startsWith("<") || match[0].startsWith("&")) continue;
    const scale = previous === "/";
    previous = match[0].slice(-1);
    if (scale) continue;
    count++;
    token = { at, text: match[0] };
  }
  const shown = count === 1 && token ? formatLike(value, token.text) : undefined;
  return shown === undefined || !token ? String(value) : fallback.slice(0, token.at) + shown + fallback.slice(token.at + token.text.length);
}

/**
 * `value` written the way `token` writes its number: its decimal mark, at least its decimals, its
 * thousands mark — read as `parseNumberText` reads a text with no language (`1,234` groups, `4.8`
 * and `1,5` are decimals, a number under four digits groups with `,`). Undefined when unreadable.
 */
function formatLike(value: number, token: string): string | undefined {
  const marks = token.replace(/\d/g, "");
  let decimal = "";
  let group = "";
  if (new Set(marks).size > 1) {
    decimal = marks.slice(-1);
    group = marks.slice(0, 1);
    if ((decimal !== "." && decimal !== ",") || marks.indexOf(decimal) !== marks.length - 1) return undefined;
  } else if (marks) {
    const tail = token.length - token.lastIndexOf(marks.slice(0, 1)) - 1;
    const lone = marks === "." || (marks === "," && (tail !== 3 || token.indexOf(",") > 3 || token.startsWith("0")));
    if (lone) decimal = marks;
    else group = marks.slice(0, 1);
  }
  const intDigits = (decimal ? token.slice(0, token.lastIndexOf(decimal)) : token).replace(/\D/g, "").length;
  if (!group && intDigits < 4 && decimal !== ",") group = ",";
  const decimals = decimal ? token.length - token.lastIndexOf(decimal) - 1 : 0;
  const own = value.toFixed(6).replace(/0+$/, "").split(".")[1] ?? "";
  const [int = "", frac = ""] = Math.abs(value).toFixed(Math.max(decimals, Math.min(6, own.length))).split(".");
  const grouped = group ? int.replace(/\B(?=(\d{3})+(?!\d))/g, group) : int;
  return (value < 0 ? "-" : "") + grouped + (frac ? (decimal || ".") + frac : "");
}

/** The template's own value as copy: a missing one (`excerpt?: string`) is none, a `Date` its text. */
const copyOf = (fallback: unknown): string => (fallback === null || fallback === undefined ? "" : String(fallback));

/** A field's value over its fallback: a finite number keeps the fallback's copy around it. */
function shown(value: unknown, fallback: unknown, as?: BcmsAs, html?: string): string {
  return over(value, fallback, as, html) ?? copyOf(fallback);
}

/** The value as `shown` renders it over `fallback` (a row's own `"$16"` keeps its `$`), or undefined. */
function over(value: unknown, fallback: unknown, as?: BcmsAs, html?: string): string | undefined {
  return typeof value === "number" && Number.isFinite(value) && as !== "href" ? numberOver(value, copyOf(fallback)) : renderAs(value, as, html);
}

/**
 * The PUBLISHED copy, on a server BetterCMS hosts — read at request time, not at build time.
 *
 * BetterCMS keeps one file current for a running server app (`BCMS_CONTENT_FILE`, the same
 * bcms-content.json the build was given) and rewrites it on every publish, so a server-rendered
 * page shows a publish within seconds instead of after a rebuild. Each snapshot this module reads
 * resolves to its live counterpart: the shared layout by identity, a page by its `slug`.
 *
 * In a BROWSER (v30) the same copy arrives as `globalThis.__BCMS_CONTENT__`, set by
 * /__bcms/content.js, which BetterCMS also rewrites on every publish and loads before the app's
 * modules. So the client bundle draws the published copy too, and a publish needs no rebuild.
 *
 * Nowhere else does anything change: with neither (a build, `astro dev`, an edge runtime, a site
 * BetterCMS does not serve) every snapshot is the one the bundle imported, exactly as before. A file
 * that cannot be read keeps the last good copy. Its modification time is asked on EVERY read (a stat,
 * microseconds; the file is parsed again only when it changed), so a publish shows on the very next request.
 */
type BcmsLiveContent = {
  helper: string;
  /** What the copy was read from: the file's mtime on a server, the global's object in a browser. */
  source: unknown;
  bySlug: Map<string, unknown>;
  entries: Record<string, unknown>;
  layout: unknown;
  /** Each published page's `fieldStyles`, by its slug; null for a page that styles no field. */
  fieldStyles: Map<string, unknown>;
};
let bcmsLive: BcmsLiveContent | null = null;

function liveContent(): BcmsLiveContent | null {
  const shipped = (globalThis as { __BCMS_CONTENT__?: unknown }).__BCMS_CONTENT__;
  if (isRecord(shipped)) {
    if (!bcmsLive || bcmsLive.source !== shipped) bcmsLive = indexed(shipped, shipped);
    return bcmsLive;
  }
  const proc = (globalThis as {
    process?: { env?: Record<string, string | undefined>; getBuiltinModule?: (id: string) => unknown };
  }).process;
  const file = proc?.env?.BCMS_CONTENT_FILE;
  if (!file || typeof proc?.getBuiltinModule !== "function") return null;
  try {
    const fs = proc.getBuiltinModule("node:fs") as {
      statSync(path: string): { mtimeMs: number };
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const stamp = fs.statSync(file).mtimeMs;
    if (bcmsLive && bcmsLive.source === stamp) return bcmsLive;
    bcmsLive = indexed(JSON.parse(fs.readFileSync(file, "utf8")), stamp);
  } catch {
    // Unreadable, or caught mid-write: keep serving the last good copy.
  }
  return bcmsLive;
}

/** A published snapshot (bcms-content.json's shape) as the lookups `live` answers from. */
function indexed(snapshot: unknown, source: unknown): BcmsLiveContent {
  const bySlug = new Map<string, unknown>();
  // A dynamic route reads `page.entries[slug]`: every published COLLECTION row, by its slug — never a
  // page's own row (`_meta.page`, the delivery list's mark), as page-snapshots.mjs writes them.
  const entries: Record<string, unknown> = {};
  const collections = isRecord(snapshot) && isRecord(snapshot.collections) ? snapshot.collections : {};
  for (const rows of Object.values(collections)) {
    if (!Array.isArray(rows)) continue;
    for (const row of rows) {
      // A published row carries its values under `data` (the delivery API's shape); the snapshot a
      // template reads is the values themselves. Read flat, as before, where a row has none.
      if (!isRecord(row) || typeof row.slug !== "string") continue;
      // The server-sanitized html rides beside the data (`$html`): it is read with the values. @see htmlAt
      // Only the row's own `$html` is html, never one an author wrote into `data`.
      const data = isRecord(row.data) ? Object.fromEntries(Object.entries(row.data).filter(([key]) => key !== "$html")) : null;
      const values = data ? { ...data, slug: row.slug, ...(isRecord(row.$html) ? { $html: row.$html } : {}) } : row;
      if (!bySlug.has(row.slug)) bySlug.set(row.slug, values);
      // Its own map, so a page and an entry that share a slug are each found.
      if (!(isRecord(row._meta) && row._meta.page === true) && !(row.slug in entries)) entries[row.slug] = values;
    }
  }
  for (const row of bySlug.values()) if (isRecord(row) && !("entries" in row)) row.entries = entries;
  const pages = isRecord(snapshot) && Array.isArray(snapshot.pages) ? snapshot.pages : [];
  const withLayout = pages.find((page: unknown) => isRecord(page) && isRecord(page.layout));
  // The site's Layout first; a page's own (its overrides resolved in) only where there is no other.
  const delivered = isRecord(snapshot) && isRecord(snapshot.layout) ? snapshot.layout : isRecord(withLayout) ? withLayout.layout : undefined;
  // A template addresses a Layout value as `<section id>:<field id>`; the published Layout holds
  // each Section's values under `sections.<slug>.fields`. Both spellings are answered.
  const layout: Record<string, unknown> | undefined = isRecord(delivered) ? { ...delivered } : undefined;
  for (const section of layout && isRecord(delivered) && isRecord(delivered.sections) ? Object.values(delivered.sections) : []) {
    if (!isRecord(section) || typeof section.id !== "string" || !isRecord(section.fields)) continue;
    for (const [field, value] of Object.entries(section.fields)) layout![section.id + ":" + field] = value;
  }
  // A page's field styles live on its `pages[]` row, not on the values a template reads. A row
  // without the key styles no field: that is an answer too, never a reason to read the build's.
  const fieldStyles = new Map<string, unknown>();
  for (const page of pages) {
    if (isRecord(page) && typeof page.slug === "string" && !fieldStyles.has(page.slug)) {
      fieldStyles.set(page.slug, isRecord(page.fieldStyles) ? page.fieldStyles : null);
    }
  }
  // `helper` names this reader in the built bundle: the platform reads it to know the app shows a
  // publish on its next request, and an image BetterCMS copied beside it (@see bcmsImage).
  return { helper: "bcms-helper@36", source, bySlug, entries, layout, fieldStyles };
}

/** The published counterpart of a snapshot this module was handed, or the snapshot itself. */
function live(page: unknown): unknown {
  const content = liveContent();
  if (!content) return page;
  if (page === layoutSnapshot) return isRecord(content.layout) ? content.layout : page;
  if (isRecord(page) && typeof page.slug === "string") {
    // A collection's page has no row of its own: its entries are the published ones all the same.
    return content.bySlug.get(page.slug) ?? ("entries" in page ? page : { ...page, entries: content.entries });
  }
  return page;
}

/**
 * Where the site's code binds each field, by `<scope>::<address>` (indices as `[*]`), from the file
 * `BCMS_SOURCE_MAP` names: set by a preview or dev build only, so a production build reads nothing.
 * Asked by its modification time, as `BCMS_CONTENT_FILE` is; unreadable is no map.
 */
let bcmsSources: { stamp: number; fields: Record<string, unknown> } | null = null;

function sourceMap(): Record<string, unknown> | null {
  const proc = (globalThis as {
    process?: { env?: Record<string, string | undefined>; getBuiltinModule?: (id: string) => unknown };
  }).process;
  const file = proc?.env?.BCMS_SOURCE_MAP;
  if (!file || typeof proc?.getBuiltinModule !== "function") return null;
  try {
    const fs = proc.getBuiltinModule("node:fs") as {
      statSync(path: string): { mtimeMs: number };
      readFileSync(path: string, encoding: "utf8"): string;
    };
    const stamp = fs.statSync(file).mtimeMs;
    if (bcmsSources?.stamp !== stamp) {
      const read = JSON.parse(fs.readFileSync(file, "utf8")) as { fields?: unknown };
      bcmsSources = { stamp, fields: isRecord(read.fields) ? read.fields : {} };
    }
    return bcmsSources.fields;
  } catch {
    return null;
  }
}

/** The platform's stega scheme (@bettercms-ai/sdk stega.ts): a payload's UTF-8 bytes as zero-width bits, framed. */
const STEGA_ZERO = "\u200b";
const STEGA_ONE = "\u200c";
const STEGA_START = "\u2060";
const STEGA_END = "\u2061";
const STEGA_FRAMES = /\u2060[\u200b\u200c]*\u2061/g;
/** Values that are an address or a date, never prose: a mark in one breaks the link or the parse. */
const NOT_PROSE = /^(?:https?:|mailto:|tel:|[#/.]|\s*$)|^\d{4}-\d{2}-\d{2}(?:T|$)/i;

/** A stega build (`BCMS_STEGA`, set by BetterCMS for a project located by stega): never a browser, never a production build. */
function stegaBuild(): boolean {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return Boolean(env?.BCMS_STEGA);
}

/**
 * The v2 field ref a string renders: the Layout Section its address names, or the page or entry the
 * snapshot it was read from names (`$stega`). Null where nothing names one.
 */
function refOf(scope: "page" | "layout", path: string, root: unknown): { t: string; id: string; f: string } | null {
  if (scope === "layout") {
    const at = path.indexOf(":");
    return at > 0 && at < path.length - 1 ? { t: "l", id: path.slice(0, at), f: path.slice(at + 1) } : null;
  }
  const own = isRecord(root) && isRecord(root.$stega) ? root.$stega : null;
  return own && (own.t === "p" || own.t === "e") && typeof own.id === "string" && own.id ? { t: own.t, id: own.id, f: path } : null;
}

/** A v2 payload over this many bytes is not marked, as the platform's own encoder. */
const STEGA_MAX_PAYLOAD = 512;

/**
 * `text`, marked with the field ref it renders in a stega build, and with the code that binds `path`
 * when a preview source map names it; else `text` itself.
 */
function sourced(text: string, scope: "page" | "layout", path: string, as?: BcmsAs, root?: unknown): string {
  if (as === "href" || NOT_PROSE.test(text)) return text;
  const map = sourceMap();
  const mapped = map?.[scope + "::" + path.replace(/\[\d+\]/g, "[*]")];
  const source = Array.isArray(mapped) && mapped.length > 0 ? mapped : null;
  // Rich text is no prose value: its markup is the explicit lane's (a frame would also change the hash a
  // framework keeps of the html it rendered, Svelte's {@html} marker, so hydration redraws it).
  const ref = stegaBuild() && !/^(?:html|line)(?::|$)/.test(as ?? "") ? refOf(scope, path, root) : null;
  if (!ref && !source) return text;
  const bytes = new TextEncoder().encode(JSON.stringify(ref ? { ...ref, ...(source ? { source } : {}) } : { field: path, scope, source }));
  if (ref && bytes.length > STEGA_MAX_PAYLOAD) return text;
  let bits = "";
  for (const byte of bytes) {
    for (let i = 7; i >= 0; i--) bits += (byte >> i) & 1 ? STEGA_ONE : STEGA_ZERO;
  }
  return STEGA_START + STEGA_END + text + STEGA_START + bits + STEGA_END;
}

/** A string with every preview mark taken out: for a template that compares or parses a value. */
export function bcmsClean(value: string): string {
  return value.replace(STEGA_FRAMES, "");
}

/** One field of one page. `slug` selects the entry on a dynamic route. */
export function bcms(page: unknown, path: string, fallback: unknown, slug?: string | null, as?: BcmsAs): string {
  return sourced(pageValue(page, path, fallback, slug, as), "page", path, as, rootOf(page, slug));
}

function pageValue(page: unknown, path: string, fallback: unknown, slug?: string | null, as?: BcmsAs): string {
  const root = rootOf(page, slug);
  return shown(readPath(root, path), fallback, as, htmlAt(root, path));
}

/** One heading of a document, as `bcmsDocument` lists it: the shape of Astro's `MarkdownHeading`. */
export type BcmsHeading = { depth: number; slug: string; text: string };

const DOCUMENT_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', "#39": "'", "#x27": "'", nbsp: "\u00a0" };

/** A heading's id as github-slugger writes it: lowercase, [a-z0-9 -] only, each space a `-`, then `-1`, `-2` on a repeat. */
function documentSlug(text: string, used: Map<string, number>): string {
  const base = text.toLowerCase().replace(/[^a-z0-9 -]/g, "").replace(/ /g, "-");
  let slug = base;
  while (used.has(slug)) {
    const count = (used.get(base) ?? 0) + 1;
    used.set(base, count);
    slug = base + "-" + count;
  }
  used.set(slug, 0);
  return slug;
}

/**
 * A whole DOCUMENT (a Markdown body: a legal page, an article) as html, with its contents.
 *
 * The CMS copy of `path`, read exactly as `bcms(…, "html:div")` reads it, or `fallbackHtml` where the
 * CMS holds none (an empty value included): the html the site rendered from its own Markdown. Every
 * h2 and h3 carries an id the contents can link to (its own, else a github-slugger slug of its words),
 * and a line break after each block that runs straight into the next keeps the words of two blocks
 * apart in the page's text. `headings` lists the h2s and h3s in document order.
 */
export function bcmsDocument(page: unknown, path: string, fallbackHtml: string, slug?: string | null): { html: string; headings: BcmsHeading[] } {
  const read = pageValue(page, path, fallbackHtml, slug, "html:div");
  const source = read.trim() !== "" ? read : copyOf(fallbackHtml);
  const headings: BcmsHeading[] = [];
  const used = new Map<string, number>();
  for (const own of source.matchAll(/<h[23](?:\s[^>]*)?\sid\s*=\s*["']([^"']+)["']/gi)) used.set(own[1]!, 0);
  const html = source
    .replace(/<(h[23])(\s[^>]*)?>([\s\S]*?)<\/\1>/gi, (whole: string, tag: string, attrs: string | undefined, inner: string) => {
      const text = inner
        .replace(/<[^>]+>/g, "")
        .replace(/&(amp|lt|gt|quot|#39|#x27|nbsp);/g, (_: string, entity: string) => DOCUMENT_ENTITIES[entity]!)
        .trim();
      const own = /\sid\s*=\s*["']([^"']+)["']/i.exec(attrs ?? "")?.[1];
      const id = own ?? documentSlug(text, used);
      headings.push({ depth: Number(tag.slice(1)), slug: id, text });
      return own ? whole : "<" + tag + (attrs ?? "").replace(/\sid\s*=\s*["']["']/i, "") + ' id="' + id + '">' + inner + "</" + tag + ">";
    })
    .replace(/<\/(p|h[1-6]|ul|ol|li|blockquote)>(?=<)/gi, "</$1>\n");
  return { html, headings };
}

/** The page, or on a dynamic route the entry `slug` names, from the published copy where there is one. */
function rootOf(page: unknown, slug?: string | null): unknown {
  page = live(page);
  const entries = isRecord(page) ? page.entries : undefined;
  return slug != null && isRecord(entries) ? entries[slug] : page;
}

/** One field of the shared layout — the header and footer every route renders. */
export function bcmsLayout(path: string, fallback: unknown, as?: BcmsAs): string {
  return sourced(layoutValue(path, fallback, as), "layout", path.replace(/^layout:/, ""), as);
}

function layoutValue(path: string, fallback: unknown, as?: BcmsAs): string {
  const layout = live(layoutSnapshot);
  const html = htmlAt(layout, path);
  // The whole address first: a field id may carry a dot of its own (`derived.nav-cta`).
  const whole = isRecord(layout) ? layout[path] : undefined;
  if (whole !== undefined || html !== undefined) return shown(whole, fallback, as, html);
  // A row's leaf (`navigation:derived.nav-group-index[1].a-index`): the field is the longest stored
  // address the path starts with, and the rest is read inside its value.
  if (isRecord(layout)) {
    for (let at = path.length - 1; at > 0; at--) {
      if (path[at] !== "[" && path[at] !== ".") continue;
      const field = layout[path.slice(0, at)];
      if (field !== undefined) return shown(readPath(field, path.slice(path[at] === "." ? at + 1 : at)), fallback, as);
    }
  }
  return shown(readPath(layout, path), fallback, as);
}

/**
 * The ROWS of a repeater. `fallback` is every row the template shipped with, so a build against
 * an empty snapshot still renders the same number of cards it always did.
 */
export function bcmsRows<T>(page: unknown, path: string, fallback: T[], slug?: string | null): (T & { _key?: string })[] {
  const rows = rowsOf(page, path, fallback, slug);
  // A stega build marks each row's own prose with its row's address. @see sourced
  return stegaBuild() ? (rows.map((row, index) => framedRow(row, `${path}[${index}]`, rootOf(page, slug))) as (T & { _key?: string })[]) : rows;
}

/** The rows `bcmsRows` returns, never marked: what `bcmsRowsAs` reads and marks itself. */
function rowsOf<T>(page: unknown, path: string, fallback: T[], slug?: string | null): (T & { _key?: string })[] {
  page = live(page);
  const entries = isRecord(page) ? page.entries : undefined;
  const root = slug != null && isRecord(entries) ? entries[slug] : page;
  const value = readPath(root, path);
  return Array.isArray(value) ? (value.map(keyHidden) as (T & { _key?: string })[]) : (fallback as (T & { _key?: string })[]);
}

/** A row with each of its own strings marked at `<row>.<key>`, its hidden `_key` kept hidden. */
function framedRow(row: unknown, at: string, root: unknown): unknown {
  if (typeof row === "string") return sourced(row, "page", at, undefined, root);
  if (!isRecord(row)) return row;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) out[key] = typeof value === "string" ? sourced(value, "page", at + "." + key, undefined, root) : value;
  if (typeof row._key === "string") Object.defineProperty(out, "_key", { value: row._key, enumerable: false });
  return out;
}

/**
 * A row with its `_key` kept but NOT enumerable, here and in every nested list. The template reads
 * `row._key` for its `data-bcms-key`; a spread, `Object.entries` or `JSON.stringify` of the row
 * never sees it, so a row handed whole to a component never renders a `_key` attribute.
 */
function keyHidden(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(keyHidden);
  if (!isRecord(value)) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) if (k !== "_key") out[k] = Array.isArray(unzoned(v)) ? (unzoned(v) as unknown[]).map(keyHidden) : v;
  if (typeof value._key === "string") Object.defineProperty(out, "_key", { value: value._key, enumerable: false });
  return out;
}

/**
 * The rows of a repeater whose template renders its OWN property names.
 *
 * 🔴 A ROW IS MORE THAN ITS COPY. The template's array carries `tone`, `link`, an icon — styling
 * the brief never heard of, because the CMS holds the four sentences and not the class names. So a
 * CMS row is merged OVER the row the template shipped with rather than replacing it, and `keys`
 * says which template property each CMS leaf lands on. A row an editor ADDS has no counterpart, so
 * it inherits row 0's styling — the only answer that renders at all.
 */
export function bcmsRowsAs<T>(
  page: unknown,
  path: string,
  fallback: T[],
  keys: Record<string, string>,
  slug?: string | null,
  as?: Record<string, BcmsAs>,
): (T & { _key?: string })[] {
  const rows = rowsOf<unknown>(page, path, [], slug);
  const root = rootOf(page, slug);
  if (rows.length === 0) {
    if (!stegaBuild()) return fallback as (T & { _key?: string })[];
    // Nothing published: the template's own rows, each marked at the address its row would have.
    return fallback.map((row, index) => {
      if (!isRecord(row)) return row;
      const marked: Record<string, unknown> = { ...row };
      for (const property of Object.keys(keys)) {
        const value = marked[property];
        if (typeof value === "string" && !as?.[property]) marked[property] = sourced(value, "page", `${path}[${index}].${keys[property]}`, undefined, root);
      }
      return marked;
    }) as (T & { _key?: string })[];
  }
  return rows.map((row, index) => {
    const base = { ...(fallback[index] ?? fallback[0] ?? {}) } as Record<string, unknown>;
    for (const property of Object.keys(keys)) {
      // A property the template renders in an html sink (or a link) says so in `as`. @see BcmsAs
      const read = readPath(row, keys[property] as string);
      // A list in an html sink is a Body (its blocks), not a list of words.
      const at = `${path}[${index}].${keys[property]}`;
      const value = Array.isArray(read) && !as?.[property] ? listOver(read, base[property]) : over(read, base[property], as?.[property], htmlAt(root, at));
      // Prose a stega build marks with its row's address; never an html sink's markup or a link.
      if (value !== undefined) base[property] = typeof value === "string" && !as?.[property] && stegaBuild() ? sourced(value, "page", at, undefined, root) : value;
    }
    // The CMS row's identity rides along, out of sight of a spread. @see keyHidden
    if (isRecord(row) && typeof row._key === "string") Object.defineProperty(base, "_key", { value: row._key, enumerable: false });
    return base as T & { _key?: string };
  });
}

/** A row's own list of words (a tier's perks), each item over the template's; undefined unless every item renders. */
function listOver(items: unknown[], fallback: unknown): string[] | undefined {
  const copy = Array.isArray(fallback) ? fallback : [];
  const out = items.map((item, index) => over(item, copy[index] ?? copy[0]));
  return out.every((item) => item !== undefined) ? (out as string[]) : undefined;
}

/**
 * How `bcmsLayoutRows` reads a row: template property → the CMS leaf it takes, `[leaf, as]` for a leaf
 * read as a link (`"href"`), `[leaf, keys]` for a nested list read the same way one level down.
 */
type BcmsRowKeys = Record<string, string | [string, BcmsAs | BcmsRowKeys]>;

/**
 * The rows of a LAYOUT list (`<section id>:<field id>`): a header's menu, a footer's link groups.
 *
 * Each CMS row lands over the template row it came from, found by its link's href, else its label, so
 * what the CMS does not hold (an icon the code imports) moves with its link when rows are reordered. A
 * row no template row matches (one an editor adds) carries nothing of the code's. No list yet: the
 * template's rows. A list an editor emptied renders nothing.
 *
 * A Layout list stores each row under its CHILD field ids, which carry the list's own as a prefix
 * (`items.label`, `items.links.label`: an id is unique per Section). A leaf is read by its kit key
 * under that prefix, or bare.
 */
export function bcmsLayoutRows<T>(path: string, fallback: T[], keys?: BcmsRowKeys): (T & { _key?: string })[] {
  const layout = live(layoutSnapshot);
  const value = isRecord(layout) ? unzoned(layout[path]) : undefined;
  const prefix = path.slice(path.indexOf(":") + 1) + ".";
  return (Array.isArray(value) ? rowsOver(value, fallback, keys, prefix) : fallback) as (T & { _key?: string })[];
}

/** `pool`: every template row at this depth, a nested list's across all its parents, so a link moved between groups keeps its icon. */
function rowsOver(rows: unknown[], pool: unknown[], keys: BcmsRowKeys | undefined, prefix: string): Record<string, unknown>[] {
  return rows.map((row) => {
    if (!isRecord(row)) return {};
    const bare = (k: string): string => (k.startsWith(prefix) ? k.slice(prefix.length) : k);
    const entries = Object.entries(keys ?? Object.fromEntries(Object.keys(row).filter((k) => k !== "_key").map((k) => [bare(k), bare(k)])))
      .map(([property, key]) => {
        const [leaf, how] = typeof key === "string" ? [key, undefined] : key;
        return { property, leaf, how, read: unzoned(prefix + leaf in row ? row[prefix + leaf] : row[leaf]) };
      });
    // The template row this one came from: the same href, else the same label.
    const ids = [...entries.filter((e) => e.how === "href"), ...entries.filter((e) => e.leaf === "label" || e.leaf === "title")];
    let from: unknown;
    for (const e of ids) {
      const value = over(e.read, undefined, e.how as BcmsAs | undefined);
      from = value === undefined ? undefined : pool.find((f) => isRecord(f) && f[e.property] === value);
      if (from) break;
    }
    const base: Record<string, unknown> = { ...(isRecord(from) ? from : {}) };
    for (const { property, leaf, how, read } of entries) {
      if (isRecord(how)) {
        const nested = pool.flatMap((f) => (isRecord(f) && Array.isArray(f[property]) ? (f[property] as unknown[]) : []));
        if (Array.isArray(read)) base[property] = rowsOver(read, nested, how, prefix + leaf + ".");
        else if (!Array.isArray(base[property])) base[property] = [];
        continue;
      }
      const value = over(read, base[property], how);
      if (value !== undefined) base[property] = value;
    }
    if (typeof row._key === "string") Object.defineProperty(base, "_key", { value: row._key, enumerable: false });
    return base;
  });
}

/**
 * A list of PRIMITIVES — `const tags = ["…", "…"]` — with one CMS field per ELEMENT.
 *
 * 🔴 THE LENGTH IS `paths`, NOT THE CMS. Unlike `bcmsRows`, which reads the array itself and
 * renders as many rows as the CMS holds, this maps over the path list the codemod wrote — so a row
 * an editor ADDS has no path here and never renders, and a row an editor DELETES leaves its path
 * resolving to nothing, which falls back to the copy the template shipped with. Every row's TEXT is
 * editable; the number of rows is the template's. @see the PRIMITIVE_LIST receipt note, which says
 * this out loud rather than leaving an editor to discover it.
 */
export function bcmsList(page: unknown, paths: string[], fallback: string[], slug?: string | null, as?: BcmsAs | BcmsAs[]): string[] {
  page = live(page);
  const entries = isRecord(page) ? page.entries : undefined;
  const root = slug != null && isRecord(entries) ? entries[slug] : page;
  return paths.map((path, index) => over(readPath(root, path), fallback[index], Array.isArray(as) ? as[index] : as, htmlAt(root, path)) ?? fallback[index] ?? "");
}

/**
 * The same for a list of TUPLES — `[["q", "a"], …]` — with one field per tuple POSITION, and the
 * same ceiling: `paths` decides how many rows render, and an added or deleted CMS row does not.
 */
export function bcmsTuples(page: unknown, paths: string[][], fallback: string[][], slug?: string | null, as?: BcmsAs[]): string[][] {
  return paths.map((row, index) => bcmsList(page, row, fallback[index] ?? [], slug, as));
}

/**
 * An image field's url, or the asset the template already imports. @see IMAGE_ASSET_UNRESOLVED
 *
 * 🔴 AN IMPORTED ASSET IS KEPT AT BUILD. `<Image src={…}>` from `astro:assets` refuses a remote
 * url string without width, height and an allowed domain, so returning the CMS url here broke the
 * build the moment an editor replaced the image. The build renders the optimised import; the
 * release write (`writeImage`) puts the editor's image on the `data-bcms-field` element, which
 * is where every published value lands. A plain string fallback (`<img src="/hero.png">`) has
 * no such rule and takes the CMS url directly.
 *
 * 🔴 ON A HOSTED SERVER THE EDITOR'S IMAGE IS A LOCAL FILE. A page the app renders per request has no
 * release write: what this returns is the page. BetterCMS copies a replaced image beside the app and
 * names the copy on the published value (`local`, with its size), and it is returned in the shape
 * of an import (`{ src, width, height, format }`), so `<Image>` optimises it like the site's own.
 * Absent (a build, or the site's own picture) the import stands.
 */
export function bcmsImage<T>(page: unknown, path: string, fallback: T, slug?: string | null): T | string {
  page = live(page);
  const entries = isRecord(page) ? page.entries : undefined;
  const root = slug != null && isRecord(entries) ? entries[slug] : page;
  const value = readPath(root, path);
  if (fallback !== null && typeof fallback === "object") {
    if (!isRecord(value) || typeof value.local !== "string" || typeof value.width !== "number" || typeof value.height !== "number") return fallback;
    const format = /\.([a-z0-9]+)$/i.exec(value.local)?.[1]?.toLowerCase() ?? "";
    return { src: value.local, width: value.width, height: value.height, format: format === "jpg" ? "jpeg" : format } as unknown as T;
  }
  return render(value) ?? fallback;
}

/**
 * An image field's description: the value's own `altText` (or `alt`), else the template's. One
 * field holds the picture and its words, so an `<img alt>` needs no alt field of its own.
 */
export function bcmsImageAlt(page: unknown, path: string, fallback: string, slug?: string | null): string {
  page = live(page);
  const entries = isRecord(page) ? page.entries : undefined;
  const value = readPath(slug != null && isRecord(entries) ? entries[slug] : page, path);
  const alt = isRecord(value) ? value.altText ?? value.alt : undefined;
  return typeof alt === "string" ? alt : fallback;
}

/** A short digest of a url: what `bcmsIcon` compares the stored value with. FNV-1a, base 36. */
export function bcmsIconMark(url: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < url.length; i++) h = Math.imul(h ^ url.charCodeAt(i), 0x01000193) >>> 0;
  return h.toString(36);
}

/**
 * An ICON field: the site's own drawing (`<Zap size={22} />`, an inline `<svg>`) while the stored
 * value is still the one the import captured from it (`original`, its `bcmsIconMark`), else
 * `draw` of the CMS url (an `<img>`). An untouched site renders exactly what it rendered before;
 * a replaced icon renders on every build and every client render. A null `page` reads the Layout.
 */
export function bcmsIcon<T, U>(page: unknown, path: string, fallback: T, draw: (src: string) => U, original: string, slug?: string | null): T | U {
  const src = page === null ? layoutValue(path, "") : bcmsImage(page, path, "", slug);
  return src && bcmsIconMark(src) !== original ? draw(src) : fallback;
}

/**
 * ONE SECTION's copy, for a component extracted by `--componentize`.
 *
 * OVERRIDES FIRST, PER KEY: `overrides[key] ?? group[key]`. An instance that owns its copy
 * (Phase B) carries an override for every prop it declares, so the group underneath it is never
 * read; a placement still bound to a page field group (Phase A) carries none, so the group is all
 * there is. The interesting case is the one in between — a section half moved — where a key the
 * instance does not hold has to keep rendering the page's value rather than nothing.
 *
 * 🔴 `??`, NOT `||`. An empty string is a value an editor typed, and treating it as absent put
 * the page's old copy back into a heading somebody had deliberately cleared.
 *
 * With neither an override nor a group, the answer is `{}` and every `bcms(...)` below renders
 * the fallback the template shipped with — which is why a section renders correctly against the
 * committed `{}` stub.
 */
export function bcmsSection(
  page: unknown,
  bind?: string,
  overrides?: unknown,
  bindPaths?: Record<string, string>,
): Record<string, unknown> {
  page = live(page);
  const group = bind ? readPath(page, bind) : undefined;
  const base: Record<string, unknown> = isRecord(group) ? { ...group } : {};
  // A locale copy on its twin's component spells its fields its own way: each prop's copy is
  // read from the path the placement names for it.
  if (bind && isRecord(bindPaths)) {
    for (const [key, path] of Object.entries(bindPaths)) base[key] = readPath(page, path);
  }
  if (!isRecord(overrides)) return base;
  for (const key of Object.keys(overrides)) {
    const value = overrides[key];
    if (value === undefined || value === null) continue;
    /**
     * 🔴 A TABLE PROP IS STORED AS `{ rows: [...] }` AND READ AS A LIST. That is the shape the
     * dashboard edits a repeater in; handing it to `bcmsRows` unchanged is not an array, so the
     * helper fell back to the rows the template shipped with and the editor's work never showed.
     */
    base[key] = isRecord(value) && Array.isArray(value.rows) ? value.rows : value;
  }
  return base;
}

/**
 * WHICH ADDRESS one bound element declares — decided at RENDER time, from the placement.
 *
 * An element carries exactly ONE `data-bcms-field`, and which lane it names depends on where its
 * copy lives. A placement that owns its copy declares the BLOCK lane —
 * `<blockId>__overrides.<propKey>` — because that is the address the editor commits an instance's
 * own value to. A placement bound to a page field group declares the PAGE path, which is what the
 * page form and the coverage meter already know.
 *
 * 🔴 THE BOUND ADDRESS IS RE-BASED ONTO **THIS** PLACEMENT'S GROUP. The markup was cut from ONE
 * page and carries that page's paths (`hero.title`); the whole point of `shapeHash` is that a
 * second page renders the same component bound to a group of its own (`bind="landingHero"`).
 * Handing the embedded path through unchanged declared `hero.title` on a page whose field is
 * `landingHero.title` — an address that page does not have, so the editor wrote into nothing and
 * the meter counted a binding that was never there. The prefix the markup was cut with comes out,
 * the placement's own group goes in.
 *
 * 🔴 THE SAME EXTRACTED FILE SERVES BOTH LANES. The choice is a function of the props, never of
 * how the codemod ran: one component renders a Phase A placement on one page and a Phase B
 * instance on the next, and a repository does not have to be re-cut when its copy moves.
 */
/** How a flat field family maps page paths to an instance's override keys. @see bcmsSectionPaths */
export type BcmsPathMap = {
  scalars?: Record<string, string>;
  tables?: Record<string, { key: string; columns: Record<string, string> }>;
};

/**
 * The snapshot for a section whose page fields are a FLAT family (`wrap-h2-latest`, not `wrap.h2_latest`).
 *
 * `bcmsSection` returns a group object read through a dotted path, which a flat family does not have: its
 * copy lives in top-level keys of the page snapshot. So this answers in the page's own spelling — the
 * markup reads `bcms(snapshot, "wrap-h2-latest", …)` verbatim — with every mapped path set explicitly:
 *
 * - the instance's override for that key when it holds one (a table's rows re-spelled with the page's
 *   column names, `{ rows }` unwrapped as in `bcmsSection`);
 * - else, for a placement bound to a group, the page value at the path re-based onto that group;
 * - else NOTHING — a placement that owns its copy never falls back to the page's stale copy, exactly as
 *   `bcmsSection` synthesizes no group for it.
 *
 * Every other page key passes through, so reads outside the family (a shared link) keep working.
 */
export function bcmsSectionPaths(
  page: unknown,
  bind: string | undefined,
  overrides: unknown,
  prefix: string,
  map: BcmsPathMap,
  bindPaths?: Record<string, string>,
): Record<string, unknown> {
  page = live(page);
  const out: Record<string, unknown> = isRecord(page) ? { ...page } : {};
  const own = isRecord(overrides) ? overrides : {};
  const separator = prefix.slice(-1);
  // A re-keyed locale copy names each prop's path on its own page; any other placement re-bases.
  const fromPage = (path: string, key: string): unknown =>
    !bind ? undefined
    : isRecord(bindPaths) && typeof bindPaths[key] === "string" ? readPath(page, bindPaths[key])
    : readPath(page, bind + separator + path.slice(prefix.length));
  for (const [path, key] of Object.entries(map.scalars ?? {})) {
    const value = own[key];
    out[path] = value !== undefined && value !== null ? value : fromPage(path, key);
  }
  for (const [path, table] of Object.entries(map.tables ?? {})) {
    const held = own[table.key];
    const rows = isRecord(held) && Array.isArray(held.rows) ? held.rows : held;
    if (!Array.isArray(rows)) {
      out[path] = fromPage(path, table.key);
      continue;
    }
    const pageColumn = new Map(Object.entries(table.columns).map(([column, key]) => [key, column]));
    out[path] = rows.map((row) => {
      if (!isRecord(row)) return row;
      const spelled: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(row)) spelled[pageColumn.get(key) ?? key] = value;
      return spelled;
    });
  }
  return out;
}

export function bcmsFields(
  placement: { blockId?: string; bind?: string; overrides?: unknown; bindPaths?: Record<string, string> },
  pathPrefix: string,
  map?: BcmsPathMap,
): (path: string) => string {
  const id = placement.blockId;
  const own = typeof id === "string" && id !== "" && !placement.bind && isRecord(placement.overrides);
  /** A re-keyed locale copy's own path for a prop, with whatever follows the prop kept. */
  const moved = (key: string | undefined, rest: string): string | undefined => {
    const paths = placement.bind && isRecord(placement.bindPaths) ? placement.bindPaths : undefined;
    return key !== undefined && paths && typeof paths[key] === "string" ? paths[key] + rest : undefined;
  };
  /**
   * What replaces the prefix the markup was cut with, or null for "leave every path alone".
   *
   * Null covers a placement with neither a bind nor an instance — a shipped fallback, or a page
   * nobody has componentized yet — and a bound placement in a component whose prefix is EMPTY,
   * where the plan said the prop key IS the whole page path: there is no group segment to swap,
   * so prepending one would invent an address rather than correct it.
   */
  const lane = own ? `${id}__overrides.` : placement.bind && pathPrefix ? `${placement.bind}.` : null;
  if (map) {
    /**
     * A FLAT family: the address is not "prefix swapped". The instance lane names the override key the
     * plan allocated (`h2_latest`, `group_webgl[0].a_webgl`); the bind lane keeps the page's own
     * separator (`landing-h2-latest`, never `landing.h2-latest`).
     */
    const separator = pathPrefix.slice(-1);
    return (path: string): string => {
      if (!path.startsWith(pathPrefix) || !(own || placement.bind)) return path;
      const scalar = map.scalars?.[path];
      const row = /^([^[]+)\[(\d+)\]\.(.+)$/.exec(path);
      const table = row ? map.tables?.[row[1]] : undefined;
      if (!own) {
        return moved(scalar, "") ?? moved(table?.key, row ? "[" + row[2] + "]." + row[3] : "")
          ?? placement.bind + separator + path.slice(pathPrefix.length);
      }
      if (scalar !== undefined) return id + "__overrides." + scalar;
      const column = row && table ? table.columns[row[3]] : undefined;
      return table && column !== undefined ? id + "__overrides." + table.key + "[" + row![2] + "]." + column : path;
    };
  }
  return (path: string): string => {
    // A path outside the group this section was cut from is not one this placement re-addresses:
    // it names a key the instance does not hold and a group this placement is not bound to.
    // (An EMPTY prefix is a plan saying the prop key IS the page path, and matches everything.)
    if (lane === null || !path.startsWith(pathPrefix)) return path;
    const rest = path.slice(pathPrefix.length);
    const key = /^[^.[]+/.exec(rest)?.[0];
    return (own ? undefined : moved(key, rest.slice(key?.length ?? 0))) ?? lane + rest;
  };
}

/**
 * C3/C4 — a section's `block.style` as the inline CSS the BetterCMS SDK draws for it.
 *
 * A converted section root carries `data-bcms-style` beside `data-bcms-block`, which is the
 * site's promise to the editor that "this root's inline style is `blockStyleToCss(block.style)`"
 * — and the editor only offers a section's spacing handles where every stamped root makes it.
 * This is `blockStyleToCss` from `@bettercms-ai/types`, INLINED for the same reason `readPath`
 * is (zero dependencies); `helper.test.ts` runs it against the original over a token table.
 */
const STYLE_SPACE_PX: Record<string, string> = { none: "0", xs: "4px", sm: "8px", md: "16px", lg: "32px", xl: "64px" };
const STYLE_FONT_SIZE_REM: Record<string, string> = {
  xs: "0.75rem",
  sm: "0.875rem",
  base: "1rem",
  md: "1.125rem",
  lg: "1.25rem",
  xl: "1.5rem",
  "2xl": "2rem",
  "3xl": "2.25rem",
  "3.5xl": "2.5rem",
  "4xl": "3rem",
  "5xl": "4rem",
};
const STYLE_WEIGHT: Record<string, number> = { normal: 400, medium: 500, semibold: 600, bold: 700 };
const STYLE_RADIUS_PX: Record<string, string> = { none: "0", sm: "4px", md: "8px", lg: "16px", full: "9999px" };
const STYLE_COLOR_HEX: Record<string, string> = { white: "#ffffff", black: "#111111", muted: "#6b7280", mutedBg: "#f3f4f6", primary: "#111111", accent: "#4f46e5" };
const STYLE_SPACE_TOKEN_PX: Record<string, string> = {
  "section-space-none": "0px",
  "section-space-xsmall": "16px",
  "section-space-small": "32px",
  "section-space-medium": "56px",
  "section-space-large": "88px",
  "section-space-xlarge": "128px",
  "section-space-nav-overlap": "-72px",
  "space-none": "0px",
  "space-s": "8px",
  "space-m": "16px",
  "space-l": "32px",
  "space-xl": "64px",
};

const STYLE_THEME: Record<string, { colorScheme: string; background: string; color: string }> = {
  light: { colorScheme: "light", background: "#ffffff", color: "#111111" },
  dark: { colorScheme: "dark", background: "#0b0b0d", color: "#f7f8f8" },
};
const STYLE_BG: Record<string, string> = {
  surface: "var(--bcms-bg-surface,#ffffff)",
  muted: "var(--bcms-bg-muted,#f3f4f6)",
  accent: "var(--bcms-bg-accent,#4f46e5)",
  dark: "var(--bcms-bg-dark,#0b0b0d)",
};
const STYLE_DARK_BG: Record<string, string> = { surface: "#0b0b0d", muted: "#1c1c1e" };
const STYLE_FILL_SCHEME: Record<string, { colorScheme: string; color: string }> = {
  dark: { colorScheme: "dark", color: "#f7f8f8" },
  accent: { colorScheme: "var(--bcms-accent-scheme,dark)", color: "var(--bcms-on-accent,#ffffff)" },
};
const STYLE_CORNER_PX: Record<string, string> = { "0": "0", s: "4px", m: "8px", l: "16px", xl: "24px", "2xl": "32px" };
const STYLE_SHADOW: Record<string, string> = {
  "0": "none",
  s: "0 1px 2px rgba(0,0,0,.06)",
  m: "0 4px 12px rgba(0,0,0,.08)",
  l: "0 10px 24px rgba(0,0,0,.10)",
  xl: "0 24px 48px rgba(0,0,0,.14)",
};
const STYLE_HAIRLINE = "1px solid rgba(0,0,0,.10)";

/** A map entry by OWN key only, so a token like `constructor` never reaches CSS. */
function styleOwn<T>(map: Record<string, T>, key: unknown): T | undefined {
  return typeof key === "string" && Object.prototype.hasOwnProperty.call(map, key) ? map[key] : undefined;
}

/** An http(s) or root-relative url with nothing that could end `url(…)`; "" for anything else. */
function styleSafeUrl(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const url = raw.trim();
  if (!url || url.length > 2000) return "";
  if (/["'()\;]|\s/.test(url)) return "";
  if (url.startsWith("//")) return "";
  if (url.startsWith("/")) return url;
  return /^https?:\/\//i.test(url) ? url : "";
}

function styleClamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

function styleSpaceToken(token: unknown): string {
  const px = typeof token === "string" ? STYLE_SPACE_TOKEN_PX[token] : undefined;
  return px ? "var(--bcms-" + token + "," + px + ")" : "";
}

/** The declarations as a React-style object (camelCase), or undefined when there are none. */
export function bcmsSectionStyle(style: unknown): Record<string, string | number> | undefined {
  if (!style || typeof style !== "object") return undefined;
  const s = style as Record<string, string>;
  const css: Record<string, string | number> = {};
  if (s.paddingY && STYLE_SPACE_PX[s.paddingY] != null) { css.paddingTop = STYLE_SPACE_PX[s.paddingY]!; css.paddingBottom = STYLE_SPACE_PX[s.paddingY]!; }
  if (s.paddingX && STYLE_SPACE_PX[s.paddingX] != null) { css.paddingLeft = STYLE_SPACE_PX[s.paddingX]!; css.paddingRight = STYLE_SPACE_PX[s.paddingX]!; }
  const top = styleSpaceToken(s.spaceTop);
  // A negative band that pulls content under the nav makes sense at the TOP only (SPACE_BOTTOM_TOKENS).
  const bottom = /^section-space-(none|xsmall|small|medium|large|xlarge)$/.test(String(s.spaceBottom)) ? styleSpaceToken(s.spaceBottom) : "";
  const sidesVar = styleSpaceToken(s.spaceSides);
  // A section step on the sides never renders under 16px (V2); an old space-* step is unchanged.
  const sides = sidesVar && /^section-space-(none|xsmall|small|medium|large|xlarge)$/.test(String(s.spaceSides)) ? `max(16px,${sidesVar})` : sidesVar;
  const navOverlap = s.spaceTop === "section-space-nav-overlap";
  if (top && !navOverlap) css.paddingTop = top;
  if (bottom) css.paddingBottom = bottom;
  if (sides) { css.paddingLeft = sides; css.paddingRight = sides; }
  if (s.marginTop && STYLE_SPACE_PX[s.marginTop] != null) css.marginTop = STYLE_SPACE_PX[s.marginTop]!;
  if (top && navOverlap) { css.marginTop = top; css.paddingTop = "calc(-1 * " + top + ")"; }
  if (s.marginBottom && STYLE_SPACE_PX[s.marginBottom] != null) css.marginBottom = STYLE_SPACE_PX[s.marginBottom]!;
  if (s.background && STYLE_COLOR_HEX[s.background]) css.background = STYLE_COLOR_HEX[s.background]!;
  if (s.textColor && STYLE_COLOR_HEX[s.textColor]) css.color = STYLE_COLOR_HEX[s.textColor]!;
  if (s.align === "left" || s.align === "center" || s.align === "right") css.textAlign = s.align;
  if (s.fontSize && STYLE_FONT_SIZE_REM[s.fontSize]) css.fontSize = STYLE_FONT_SIZE_REM[s.fontSize]!;
  if (s.weight && STYLE_WEIGHT[s.weight] != null) css.fontWeight = STYLE_WEIGHT[s.weight]!;
  if (s.radius && STYLE_RADIUS_PX[s.radius] != null) css.borderRadius = STYLE_RADIUS_PX[s.radius]!;
  const radiusPx = (style as Record<string, unknown>).radiusPx;
  if (typeof radiusPx === "number" && Number.isFinite(radiusPx)) css.borderRadius = `${Math.min(96, Math.max(0, Math.round(radiusPx)))}px`;
  const theme = styleOwn(STYLE_THEME, s.theme);
  if (theme) { css.colorScheme = theme.colorScheme; css.background = theme.background; css.color = theme.color; }
  if (s.bg === "custom") { if (/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s.bgCustom ?? "")) css.background = s.bgCustom!; }
  else if (styleOwn(STYLE_BG, s.bg)) {
    css.background = (s.theme === "dark" && styleOwn(STYLE_DARK_BG, s.bg)) || styleOwn(STYLE_BG, s.bg)!;
    const fill = styleOwn(STYLE_FILL_SCHEME, s.bg);
    if (fill) { css.colorScheme = fill.colorScheme; css.color = fill.color; }
  }
  const bgImage = styleSafeUrl(s.bgImage);
  if (bgImage) { css.backgroundImage = "url(" + bgImage + ")"; css.backgroundSize = "cover"; css.backgroundPosition = "center"; }
  const n = style as Record<string, unknown>;
  if (!top && typeof n.paddingTop === "number") css.paddingTop = styleClamp(n.paddingTop, 0, 240) + "px";
  if (!bottom && typeof n.paddingBottom === "number") css.paddingBottom = styleClamp(n.paddingBottom, 0, 240) + "px";
  if (!sides && typeof n.paddingSides === "number") {
    const px = styleClamp(n.paddingSides, 0, 240) + "px";
    css.paddingLeft = px; css.paddingRight = px;
  }
  if (n.fullHeight === true) { css.minHeight = "100vh"; css.display = "flex"; css.flexDirection = "column"; css.justifyContent = "center"; }
  if (typeof n.opacity === "number") css.opacity = styleClamp(n.opacity, 0, 100) / 100;
  if (styleOwn(STYLE_CORNER_PX, s.corner) != null) { css.borderRadius = styleOwn(STYLE_CORNER_PX, s.corner)!; css.overflow = "hidden"; }
  if (styleOwn(STYLE_SHADOW, s.shadow)) css.boxShadow = styleOwn(STYLE_SHADOW, s.shadow)!;
  if (n.borderTop === true) css.borderTop = STYLE_HAIRLINE;
  if (n.borderBottom === true) css.borderBottom = STYLE_HAIRLINE;
  if ((style as { border?: unknown }).border === true) css.border = "1px solid currentColor";
  return Object.keys(css).length ? css : undefined;
}

/** The same declarations as an Astro `style` string (kebab-case, `;`-joined), or undefined. */
export function bcmsSectionStyleText(style: unknown): string | undefined {
  const css = bcmsSectionStyle(style);
  if (!css) return undefined;
  return Object.entries(css)
    .map(([k, v]) => k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase()) + ":" + v)
    .join(";");
}

/**
 * C3/C9 — ONE PAGE FIELD's stored style, as the inline CSS the BetterCMS SDK's `fieldAttrs` draws.
 *
 * An element stamped `data-bcms-field` that also carries `data-bcms-style` is the site's promise
 * to the editor that "this element's inline style is `fieldStyleToCss(page.fieldStyles[path])`" —
 * and the editor offers a field's width, spacing, Align, Size and Weight handles only where an
 * element makes it — its element Size (`size`, painted as `zoom`) only where the marker is "2".
 * This is `fieldStyleToCss` from `@bettercms-ai/types`, INLINED like `bcmsSectionStyle` (zero
 * dependencies); `helper.test.ts` runs it against the original.
 *
 * The styles are the PAGE's (`pages[].fieldStyles`, keyed by the `data-bcms-field` address), so a
 * server BetterCMS hosts reads them from `BCMS_CONTENT_FILE` at request time like every other
 * value, and a build reads the ones its snapshot carries. None: no declarations, no `style`.
 */
const STYLE_FIELD_KEYS = ["contentWidth", "contentAlign", "marginTop", "marginBottom", "align", "fontSize", "weight", "size", "textColor"];
/** `full` is absent on purpose: a full-width field has no max-width. */
const STYLE_CONTENT_WIDTH_PX: Record<string, string> = { narrow: "640px", default: "1024px", wide: "1280px" };
/** A whole element's Small / Large (a button's), as `zoom`. Medium is unset: no entry, no declaration. */
const STYLE_SIZE_ZOOM: Record<string, string> = { sm: "0.875", lg: "1.125" };

/** The stored style for `path` (by OWN key), from the published page when there is one. */
function fieldStyleAt(page: unknown, path: string, slug?: string | null): unknown {
  const content = liveContent();
  const key = slug ?? (isRecord(page) && typeof page.slug === "string" ? page.slug : undefined);
  let styles: unknown;
  if (content && key !== undefined && content.fieldStyles.has(key)) styles = content.fieldStyles.get(key);
  else {
    const entries = isRecord(page) ? page.entries : undefined;
    const root = slug != null && isRecord(entries) ? entries[slug] : page;
    styles = isRecord(root) ? root.fieldStyles : undefined;
  }
  return isRecord(styles) && Object.prototype.hasOwnProperty.call(styles, path) ? styles[path] : undefined;
}

/** A field's declarations as a React-style object (camelCase), or undefined when there are none. */
export function bcmsStyle(page: unknown, path: string, slug?: string | null): Record<string, string | number> | undefined {
  const style = fieldStyleAt(page, path, slug);
  if (!style || typeof style !== "object") return undefined;
  // Only a field's keys, so a stored section key can never paint a field.
  const s: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(style)) if (STYLE_FIELD_KEYS.includes(k) && v != null) s[k] = v;
  const css: Record<string, string | number> = { ...bcmsSectionStyle(s) };
  // The width is the field's own box: a max-width, placed by left/right margins only (never the
  // `margin` shorthand, which would take the vertical margins the spacing just set).
  const max = styleOwn(STYLE_CONTENT_WIDTH_PX, s.contentWidth);
  if (max) {
    const placement = s.contentAlign ?? s.align;
    css.maxWidth = max;
    css.marginLeft = placement === "left" ? "0" : "auto";
    css.marginRight = placement === "right" ? "0" : "auto";
  }
  // Last, so a style without a size keeps the declarations, in the order, it always had.
  const zoom = styleOwn(STYLE_SIZE_ZOOM, s.size);
  if (zoom) css.zoom = zoom;
  return Object.keys(css).length ? css : undefined;
}

/** The same declarations as an Astro `style` string (kebab-case, `;`-joined), or undefined. */
export function bcmsStyleText(page: unknown, path: string, slug?: string | null): string | undefined {
  const css = bcmsStyle(page, path, slug);
  if (!css) return undefined;
  return Object.entries(css)
    .map(([k, v]) => k.replace(/[A-Z]/g, (m) => "-" + m.toLowerCase()) + ":" + v)
    .join(";");
}
