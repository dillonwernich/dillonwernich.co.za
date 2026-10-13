# Deploying dillonwernich.co.za

The site is served by Firebase Hosting from the `dillon-wernich` project. Everything under
`public/` is published: the portfolio at `/` and the private admin at `/admin/`. Nothing outside
`public/` (this file, rules, tests, the admin spec) is served.

| Path | What it is |
|---|---|
| `public/` | Portfolio pages and the admin (`public/admin/`), no build step |
| `firebase.json` | Hosting config, headers, admin rewrite, emulator ports |
| `firestore.rules`, `storage.rules` | Security rules; owner UID is set once at the top of each |
| `tests/rules.test.js` | Rules tests, run against the emulators |
| `.github/workflows/deploy.yml` | Deploys Hosting on push to `main` |

## Run locally

Needs Node 20+, the Firebase CLI (`npm install -g firebase-tools`) and Java 21 for the
emulators.

```sh
npm install                      # rules-test tooling only
firebase emulators:start         # Hosting, Auth, Firestore and Storage
node tests/emulator-user.js      # creates the owner account in the Auth emulator
```

Open http://127.0.0.1:5000/admin/ and sign in with the emulator account in
`tests/fixtures/emulator-owner.json`. On `localhost`/`127.0.0.1` the admin talks to the
emulators only; it never touches production data. The first sign-in seeds pricing, libraries
and settings.

The Hosting emulator does not apply the `headers` from `firebase.json` (cache, CSP). Check those
on a preview channel instead.

## Test the security rules

```sh
npm run test:rules
```

Starts the Firestore and Storage emulators, runs `tests/rules.test.js` and stops them.

## Deploy

Pushing to `main` deploys Hosting through `.github/workflows/deploy.yml`. Rules are deployed by
hand, because a rules mistake should never ship by accident:

```sh
firebase login:use dillon.wernich@gmail.com            # the personal account, not the Argent one
firebase deploy --only firestore,storage               # rules and indexes
firebase hosting:channel:deploy preview --expires 1d   # temporary URL to check first
firebase deploy --only hosting                         # live
```

## GitHub Actions secret

The workflow needs a repository secret named `FIREBASE_SERVICE_ACCOUNT_DILLON_WERNICH` holding
the JSON key of a service account with the Firebase Hosting Admin role on `dillon-wernich`.
The quickest way to create both:

```sh
firebase init hosting:github
```

Choose this repository, answer "No" to a build script and "No" to overwriting `firebase.json`.
It writes its own workflow files; delete them and keep `deploy.yml`, which uses the same secret.

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
