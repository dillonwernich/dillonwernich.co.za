# Admin go-live checklist

Status on 13 October 2026. Ticked items are already done.

## Firebase console

- [x] Project `dillon-wernich` on the Blaze plan.
- [x] Firestore in `africa-south1`, Storage bucket created.
- [x] Authentication: Email/Password enabled, owner account created
      (UID `U8SYctoCDlVkSrhNYO2c033lrcU2`, set in both rules files and `public/admin/js/firebase.js`).
- [x] Authentication → Settings → User actions: sign-up disabled, email enumeration protection on.
- [x] Authentication → Settings → Authorised domains: `dillonwernich.co.za` and `www` present.
- [x] Firestore and Storage rules deployed (owner-only, shape validation, sign-out-everywhere).
- [x] Hosting live on `dillonwernich.co.za` with SSL; `www` redirects to the apex.
- [ ] **Grant the Storage rules role** (uploads fail until this is done):
      Google Cloud console → IAM → tick "Include Google-provided role grants" → edit
      `service-915315770987@gcp-sa-firebasestorage.iam.gserviceaccount.com` → add role
      **Firebase Rules Firestore Service Agent** → Save.
- [ ] Set a budget alert: Google Cloud console → Billing → Budgets & alerts → e.g. R 100 a month.
- [ ] **Restrict the browser API key** (`AIzaSyDy…` in `public/admin/js/firebase.js`):
      Google Cloud console → APIs & Services → Credentials → *Browser key (auto created by
      Firebase)* → Application restrictions: Websites, add `https://dillonwernich.co.za/*`,
      `https://dillon-wernich.web.app/*`, `https://dillon-wernich.firebaseapp.com/*`,
      `http://localhost/*` and `http://127.0.0.1/*` → API restrictions: Identity Toolkit API,
      Token Service API, Cloud Firestore API, Cloud Storage for Firebase API → Save.
- [ ] Optional: Authentication → Settings → Password policy → require 12+ characters.

## GitHub

- [ ] Create the deploy secret: run `firebase init hosting:github` (see `DEPLOY.md`), or add
      `FIREBASE_SERVICE_ACCOUNT_DILLON_WERNICH` by hand. Until then, pushes to `main` fail the
      deploy job; deploy with `firebase deploy --only hosting` instead.
- [ ] Close the secret scanning alert for the Google API key (Security → Secret scanning):
      after restricting the key above, close it as **False positive**. It is the public
      Firebase web key, not a credential, so no rotation or history rewrite is needed.
- [ ] Repository → Settings → Pages → Source: None. The site no longer comes from GitHub Pages.

## Registrar (domains.co.za)

- [x] Apex A record `199.36.158.100`, TXT `hosting-site=dillon-wernich`,
      `www` CNAME `dillon-wernich.web.app`. No GitHub Pages records left.
- [ ] Optional: turn on domain lock (the domain shows as Unlocked).

## Search Console

- [x] Verified by HTML tag (survives `cleanUrls`). The old HTML file method still shows as
      verified but is no longer needed.

## In the admin, before the first real quote

- [ ] Sign in at https://dillonwernich.co.za/admin/ with the owner account. The first sign-in
      seeds pricing, libraries and settings.
- [ ] Settings → Business: banking details, VAT number if any, trading name, logo.
- [ ] Pricing: confirm or change every item marked Placeholder, then Save version.
      Seeded hourly rate is R 650,00 (mid-range for a South African freelance developer).
- [ ] Settings → Libraries: review terms clauses and scope templates.
- [ ] Settings → Quote defaults: numbering pattern, capacity, margin threshold.
