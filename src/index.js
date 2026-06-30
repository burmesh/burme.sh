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

/** Treat empty or placeholder values ("TBD", "N/A", "—", …) as absent, so they
 *  are skipped instead of rendering as literal noise on a card. */
function isBlank(value) {
  if (value == null) return true;
  const s = String(value).trim();
  return s === "" || /^(tbd|n\/?a|none|null|unknown|[-–—])$/i.test(s);
}

/** meshcore:// deep link that adds a node/contact to the user's MeshCore app.
 *  `type` is the MeshCore contact type: 1 = companion/admin, 2 = repeater. */
function addContactHref(name, publicKey, type) {
  return (
    `meshcore://contact/add?name=${encodeURIComponent(name)}` +
    `&public_key=${publicKey}&type=${type}`
  );
}

/** Resolve a repeater's admin id and render it (linked to a MeshCore contact
 *  when the admin has a public key). Unknown ids fall back to the raw value;
 *  blank/placeholder admins are omitted entirely. */
function adminCell(adminId) {
  if (isBlank(adminId)) return "";
  const admin = admins[adminId] || { name: adminId };
  if (isBlank(admin.name)) return "";
  const inner = !isBlank(admin.publicKey)
    ? `<a href="${esc(addContactHref(admin.name, admin.publicKey, 1))}">${esc(
        admin.name,
      )}</a>`
    : esc(admin.name);
  return `<dt>Admin</dt><dd class="tech">${inner}</dd>`;
}

/** Render one repeater as a "node datasheet" card: a status header strip, the
 *  node name, a tidy detail grid (blank fields omitted), and a one-tap
 *  "Add to MeshCore" action for on-air nodes that already have a public key. */
function repeaterCard(r) {
  const s = STATUS[r.status] || STATUS.offline;
  const hasKey = !isBlank(r.publicKey);
  const onAir = r.status === "on-air";

  const rows = [];
  if (!isBlank(r.location))
    rows.push(`<dt>Location</dt><dd>${esc(r.location)}</dd>`);
  if (!isBlank(r.hardware))
    rows.push(`<dt>Hardware</dt><dd>${esc(r.hardware)}</dd>`);
  rows.push(adminCell(r.admin));
  rows.push(
    `<dt>Public key</dt>` +
      (hasKey
        ? `<dd class="key tech">${esc(r.publicKey)}</dd>`
        : `<dd class="key"><span class="key-pending">Assigned when the node goes on the air</span></dd>`),
  );

  // The add-contact deep link works with no client-side JS (just an href), so
  // it fits the page's strict script-src 'none' CSP. type=2 = repeater.
  const action =
    onAir && hasKey
      ? `<div class="repeater-action"><a class="btn btn-primary btn-add" href="${esc(
          addContactHref(r.name, r.publicKey, 2),
        )}">+ Add to MeshCore</a></div>`
      : "";

  return (
    `<article class="card repeater" data-status="${esc(r.status)}">` +
    `<div class="repeater-head">` +
    `<span class="${s.cls} repeater-flag"><span class="dot" aria-hidden="true"></span> ${esc(s.label)}</span>` +
    `<span class="role-tag">${esc(r.role || "Repeater")}</span>` +
    `</div>` +
    `<h3 class="repeater-name">${esc(r.name)}</h3>` +
    `<dl class="repeater-dl">${rows.join("")}</dl>` +
    action +
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
