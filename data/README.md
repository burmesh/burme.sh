# Repeater data

[`repeaters.json`](repeaters.json) is the **single source of truth** for the
repeaters shown on [burme.sh](https://burme.sh). The Cloudflare Worker
([../src/index.js](../src/index.js)) imports this file and renders the cards in
the **Repeaters** section at request time — there is no client-side JavaScript
(the page keeps a strict `script-src 'none'` CSP).

## Add or update a repeater

1. Edit [`repeaters.json`](repeaters.json) — add an object to the `repeaters`
   array (or change an existing one). See
   [`repeaters.schema.json`](repeaters.schema.json) for the full field list and
   [`repeaters.example.json`](repeaters.example.json) for a filled-in template.
2. Deploy: `task deploy` (or `npx wrangler deploy`). The new repeater appears on
   the site automatically — no HTML changes needed.

### Fields

| Field        | Required | Notes                                                      |
| ------------ | -------- | ---------------------------------------------------------- |
| `id`         | yes      | Stable slug, e.g. `bur-chestnut`.                          |
| `name`       | yes      | Display name, e.g. `BUR - Chestnut`.                       |
| `status`     | yes      | `on-air`, `coming-soon`, or `offline` (sets the badge).    |
| `role`       | no       | Blurb; defaults to `Repeater`.                             |
| `location`   | no       | Street / landmark, town.                                   |
| `hardware`   | no       | Board / node model.                                        |
| `admin`      | no       | Id of an entry in the `admins` map, e.g. `a2x`.                               |
| `publicKey`  | no       | Node's MeshCore public key (hex), or `null` until live.    |
| `added`      | no       | e.g. `2026-06`; used to order within a status group.       |

### Admins (reusable)

`admins` is a directory of operators keyed by id, so one operator can be shared
across many repeaters. A repeater's `admin` field is an id into this map:

```json
{
  "admins": {
    "a2x": { "name": "A2X - 532A", "publicKey": "532afc4e…" }
  },
  "repeaters": [
    { "id": "bur-chestnut", "admin": "a2x", "...": "..." }
  ]
}
```

An admin needs a `name`; an optional `publicKey` (hex) turns the card's **Admin**
field into a `meshcore://` contact-add link. An `admin` id with no matching
entry renders as plain text.

Cards are ordered by **status** (`on-air` first, then `coming-soon`, then
`offline`), and newest-first by `added` within each group. So live repeaters
lead and the latest arrival — currently **BUR - Chestnut** (`coming-soon`) —
trails the list.
