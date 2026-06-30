/**
 * Burlington Mesh — burme.sh
 *
 * The website is integrated from the Worker side, and the repeater list is
 * data-driven. The Worker imports ../data/repeaters.json (bundled at build
 * time), serves the static page through the ASSETS binding, and uses
 * HTMLRewriter to render the repeater cards + counts into the HTML on the way
 * out. There is no client-side JavaScript, so the page keeps its strict
 * `script-src 'none'` CSP.
 *
 * Add a repeater: edit data/repeaters.json and redeploy — it shows up
 * automatically. See data/README.md.
 *
 * `assets.run_worker_first` (wrangler.jsonc) routes every request through this
 * Worker so the HTML transform always runs; non-HTML assets are returned
 * untouched.
 *
 * @typedef {{ ASSETS: { fetch: (req: Request) => Promise<Response> } }} Env
 */
import data from "../data/repeaters.json";

const STATUS = {
  "on-air": { label: "On air", cls: "status", rank: 0 },
  "coming-soon": { label: "Coming soon", cls: "status pending", rank: 1 },
  "offline": { label: "Offline", cls: "status off", rank: 2 },
};

/** Repeaters ordered for display: on-air first, then newest-first within a status. */
const repeaters = (Array.isArray(data?.repeaters) ? data.repeaters : [])
  .slice()
  .sort((a, b) => {
    const ra = (STATUS[a.status] || STATUS.offline).rank;
    const rb = (STATUS[b.status] || STATUS.offline).rank;
    if (ra !== rb) return ra - rb;
    return String(b.added ?? "").localeCompare(String(a.added ?? ""));
  });

const total = repeaters.length;
const onAir = repeaters.filter((r) => r.status === "on-air").length;

/** Shared admin directory: a repeater's `admin` is an id into this map, so the
 *  same operator can be reused across many repeaters. */
const admins = data?.admins && typeof data.admins === "object" ? data.admins : {};

/** Escape a value for safe interpolation into HTML. */
function esc(value) {
  return String(value ?? "").replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]),
  );
}

/** Resolve a repeater's admin id and render it (linked to a MeshCore contact
 *  when the admin has a public key). Unknown ids fall back to the raw value. */
function adminCell(adminId) {
  if (!adminId) return "";
  const admin = admins[adminId] || { name: adminId };
  const inner = admin.publicKey
    ? `<a href="${esc(
        `meshcore://contact/add?name=${encodeURIComponent(admin.name)}` +
          `&public_key=${admin.publicKey}&type=1`,
      )}">${esc(admin.name)}</a>`
    : esc(admin.name);
  return `<dt>Admin</dt><dd class="tech">${inner}</dd>`;
}

/** Render one repeater as a console card matching the page's design system. */
function repeaterCard(r) {
  const s = STATUS[r.status] || STATUS.offline;
  const rows = [];
  if (r.location) rows.push(`<dt>Location</dt><dd>${esc(r.location)}</dd>`);
  if (r.hardware) rows.push(`<dt>Hardware</dt><dd>${esc(r.hardware)}</dd>`);
  if (r.admin) rows.push(adminCell(r.admin));
  rows.push(
    `<dt>Public key</dt>` +
      (r.publicKey
        ? `<dd class="key tech">${esc(r.publicKey)}</dd>`
        : `<dd class="key"><span class="key-pending">Assigned when the node goes on the air</span></dd>`),
  );
  return (
    `<article class="card repeater" data-status="${esc(r.status)}">` +
    `<span class="role-tag">${esc(r.role || "Repeater")}</span>` +
    `<h3>${esc(r.name)}</h3>` +
    `<p class="repeater-status"><span class="${s.cls}"><span class="dot" aria-hidden="true"></span> ${esc(s.label)}</span></p>` +
    `<dl class="repeater-dl">${rows.join("")}</dl>` +
    `</article>`
  );
}

const cardsHtml =
  repeaters.map(repeaterCard).join("") ||
  `<p class="sub">No repeaters listed yet.</p>`;

/** Replaces an element's inner content with a pre-built HTML fragment. */
class HtmlInjector {
  constructor(html) {
    this.html = html;
  }
  element(el) {
    el.setInnerContent(this.html, { html: true });
  }
}

/**
 * Replaces an element's inner content with plain text.
 *
 * NB: the field MUST NOT be named `text` — HTMLRewriter reads a `text` property
 * on the handler as a text-node callback and rejects a non-function value.
 */
class TextSetter {
  constructor(value) {
    this.value = String(value);
  }
  element(el) {
    el.setInnerContent(this.value);
  }
}

export default {
  /**
   * @param {Request} request
   * @param {Env} env
   * @returns {Promise<Response>}
   */
  async fetch(request, env) {
    const response = await env.ASSETS.fetch(request);
    const type = response.headers.get("content-type") || "";
    if (!type.includes("text/html")) return response;

    return new HTMLRewriter()
      .on("[data-repeaters]", new HtmlInjector(cardsHtml))
      .on("[data-repeater-count]", new TextSetter(total))
      .on("[data-repeater-oncount]", new TextSetter(onAir))
      .transform(response);
  },
};
