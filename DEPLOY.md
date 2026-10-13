# Deploying dillonwernich.co.za

The site is served by Firebase Hosting from the `dillon-wernich` project. Everything under
`public/` is published. Nothing outside it (this file, `firebase.json`, the admin spec) is.

## Run locally

```sh
npm install -g firebase-tools        # once
firebase emulators:start --only hosting
```

The site is then at http://127.0.0.1:5000. The emulator applies `cleanUrls`, `trailingSlash`
and redirects from `firebase.json`, but not custom `headers`. Check those against a preview
channel instead (below).

## Deploy

Pushing to `main` deploys automatically through `.github/workflows/deploy.yml`.

To deploy by hand, or to try a change on a temporary URL first:

```sh
firebase login:use dillon.wernich@gmail.com   # the personal account, not the Argent one
firebase hosting:channel:deploy preview        # temporary URL, expires after 7 days
firebase deploy --only hosting                 # live
```

## GitHub Actions secret

The workflow needs a repository secret named `FIREBASE_SERVICE_ACCOUNT_DILLON_WERNICH` holding
the JSON key of a service account with the Firebase Hosting Admin role on `dillon-wernich`.

The quickest way to create both the service account and the secret:

```sh
firebase init hosting:github
```

Answer the prompts with this repository (`dillonwernich/dillonwernich.github.io`), "No" to
running a build script, and "No" to overwriting `firebase.json`. It writes its own workflow
files; delete them and keep `deploy.yml`, which already uses the same secret name.

## Custom domain

`dillonwernich.co.za` (and `www`, redirecting to it) are attached to the `dillon-wernich`
Hosting site. DNS lives at domains.co.za and should hold exactly these records:

| Host | Type | Value |
|---|---|---|
| `dillonwernich.co.za` | A | `199.36.158.100` |
| `dillonwernich.co.za` | TXT | `hosting-site=dillon-wernich` |
| `www.dillonwernich.co.za` | CNAME | `dillon-wernich.web.app` |

No GitHub Pages records (`185.199.108-111.153`, `dillonwernich.github.io`) and no AAAA records
on the apex. If Firebase shows "Needs setup", open the domain in Hosting and click Verify; the
SSL certificate is issued automatically once verification passes.

GitHub Pages can be switched off in the repository's Settings → Pages once the domain shows
Connected in Firebase.

## Search Console

Ownership of `https://dillonwernich.co.za/` is verified by the `google-site-verification` meta tag
in `public/index.html`. Do not remove it. The old `google869b33eceadb5785.html` file is kept
but `cleanUrls` redirects it, so it is no longer the method that counts.
