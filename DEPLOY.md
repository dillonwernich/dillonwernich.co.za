# Deploying dillonwernich.co.za

The site is served by Firebase Hosting from the `dillon-wernich` project. Everything under
`public/` is published; nothing outside it is served. There is no build step and no backend.

| Path | What it is |
|---|---|
| `public/` | The portfolio, privacy policy, 404 page and the static proposal page |
| `firebase.json` | Hosting config: headers, redirects (including `/services/` → synthik.co.za) |
| `email-signature.html` | Email signature, not deployed |

## Run locally

```sh
firebase emulators:start --only hosting   # http://127.0.0.1:5000
```

The Hosting emulator does not apply the `headers` from `firebase.json`; check those on a preview channel.

## Deploy

Deploys are manual; pushing to GitHub deploys nothing.

```sh
firebase hosting:channel:deploy preview --expires 1d --account dillon.wernich@gmail.com   # temporary URL to check first
firebase deploy --only hosting --account dillon.wernich@gmail.com                         # live
```

The contact form posts to Web3Forms with the key in `public/index.html`; it delivers to dillon.wernich@gmail.com.

## Custom domain

`dillonwernich.co.za` (and `www`, redirecting to it) are attached to the `dillon-wernich`
Hosting site. DNS lives at domains.co.za and should hold exactly these records:

| Host | Type | Value |
|---|---|---|
| `dillonwernich.co.za` | A | `199.36.158.100` |
| `dillonwernich.co.za` | TXT | `hosting-site=dillon-wernich` |
| `www.dillonwernich.co.za` | CNAME | `dillon-wernich.web.app` |

No GitHub Pages records (`185.199.108-111.153`, `dillonwernich.github.io`) and no AAAA records
on the apex. If Firebase ever shows "Needs setup", open the domain in Hosting and click Verify.

## Search Console

Ownership of `https://dillonwernich.co.za/` is verified by the `google-site-verification` meta tag
in `public/index.html`. Do not remove it. The old `google869b33eceadb5785.html` file is kept,
but `cleanUrls` redirects it, so it is no longer the method that counts.

## Storage rules and the upload limit

`storage.rules` reads the upload limit from `settings/quoteDefaults` in Firestore. That
cross-service read needs a one-time IAM grant:

1. Google Cloud console → IAM → tick "Include Google-provided role grants".
2. Find `service-915315770987@gcp-sa-firebasestorage.iam.gserviceaccount.com`, edit it.
3. Add the role **Firebase Rules Firestore Service Agent** and save.

Until that grant exists every upload is refused, including logo uploads and "Save to files".

## Changing the owner

The admin accepts exactly one account. To change it, update the UID in three places and
redeploy rules and hosting: `ownerUid()` in `firestore.rules`, `ownerUid()` in `storage.rules`,
and `OWNER_UID` in `public/admin/js/firebase.js`.
