# burme.sh — Burlington Mesh

The public landing page for the **Burlington Mesh** at [burme.sh](https://burme.sh) —
a community off-grid [MeshCore](https://meshcore.io) LoRa mesh for Burlington, MA. It
explains what MeshCore is, lists the network's repeaters, and shows how to join
the mesh.

The page itself is a single, self-contained static HTML file (inline CSS, no
client-side JavaScript). It's served from a **Cloudflare Worker** that renders
the repeater list from [data/repeaters.json](data/repeaters.json) at request
time, so adding a repeater needs no HTML edits.

## Project layout

```text
public/
├── index.html                # the page (self-contained: inline CSS, no JS)
├── burlington-mesh-logo.svg  # brand logo (favicon + hero)
├── _headers                  # security headers (CSP, HSTS, etc.)
└── robots.txt                # blocks search engines and AI/LLM crawlers
src/
└── index.js                  # Worker: serves ./public/ + renders repeaters via HTMLRewriter
data/
├── repeaters.json            # source of truth for the repeater list
├── repeaters.schema.json     # JSON Schema for the above
├── repeaters.example.json    # filled-in template
└── README.md                 # how to add a repeater
flake.nix                     # Nix dev shell: Node.js + go-task
package.json                  # Wrangler dev-dependency (installed from npm)
wrangler.jsonc                # Cloudflare Workers (Worker + static assets) config
Taskfile.yaml                 # task run / task deploy shortcuts
```

## Adding / editing repeaters

The **Repeaters** section is data-driven. Edit
[data/repeaters.json](data/repeaters.json) and redeploy — the new node appears
automatically. See [data/README.md](data/README.md) for the field reference and
[data/repeaters.example.json](data/repeaters.example.json) for a template.

> Network-wide details (radio preset, RF parameters, admin contact) live in
> [public/index.html](public/index.html), in the **Repeaters** section.

## How it's served (Worker + static assets)

The site is **integrated from the Worker side**: [wrangler.jsonc](wrangler.jsonc)
sets `main` to [src/index.js](src/index.js) and enables `run_worker_first`, so
every request flows through the Worker.

- The Worker fetches the static file via the `ASSETS` binding
  (`env.ASSETS.fetch(request)`).
- For HTML responses it runs an `HTMLRewriter` pass that imports
  [data/repeaters.json](data/repeaters.json) (bundled at build time) and injects
  the repeater cards + counts into placeholders (`[data-repeaters]`,
  `[data-repeater-count]`). Non-HTML assets pass through untouched.

Because rendering happens in the Worker, the page ships **no client-side
JavaScript** and keeps a strict `script-src 'none'` CSP. Security headers (CSP,
HSTS, `X-Robots-Tag`, …) come from [public/_headers](public/_headers); the page
is intentionally **not indexed** (`noindex` meta + `X-Robots-Tag` header +
`robots.txt` blocking crawlers).

## Getting started

### With Nix (recommended)

`flake.nix` provides Node.js 24 and go-task on Linux (x86_64, aarch64) and macOS
(Intel, Apple Silicon). Wrangler is installed from npm — the dev shell runs
`npm install` on first entry. (Wrangler is deliberately not pulled from nixpkgs,
which has no prebuilt binary for Apple Silicon and would otherwise compile it
from source on every `nix develop`.)

```sh
# Enter the dev shell (or use direnv with the included .envrc)
nix develop
```

### Local preview

```sh
task run        # or: npx wrangler dev  — serves the Worker + ./public/ locally
```

## Deployment

The site deploys to Cloudflare Workers (a Worker with static assets) on the
custom domain `burme.sh`. Configuration lives in [wrangler.jsonc](wrangler.jsonc).

```sh
task deploy     # or: npx wrangler deploy
```

Wrangler authenticates with your Cloudflare credentials. For non-interactive
deploys (e.g. CI), set `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` in the
environment.
