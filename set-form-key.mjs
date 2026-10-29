// Sets the Web3Forms access key used by the contact form in public/index.html.
// Run: node set-form-key.mjs <access-key>   then: firebase deploy --only hosting --account dillon.wernich@gmail.com
// The key is public by design (the browser sends it); it can only deliver to the inbox it was created with.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const key = (process.argv[2] || "").trim();
if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key)) {
  console.error("Usage: node set-form-key.mjs <access-key>   (the key looks like 8e2164bb-3f94-4cbc-b94e-4c883569595e)");
  process.exit(1);
}
const file = join(dirname(fileURLToPath(import.meta.url)), "public", "index.html");
const src = readFileSync(file, "utf8");
const next = src.replace(/var WEB3FORMS_KEY = "[^"]*";/, `var WEB3FORMS_KEY = "${key}";`);
if (!next.includes(`"${key}"`)) { console.error("Could not find WEB3FORMS_KEY in public/index.html"); process.exit(1); }
writeFileSync(file, next);
console.log("Web3Forms key set in public/index.html. Deploy with: firebase deploy --only hosting --account dillon.wernich@gmail.com");
