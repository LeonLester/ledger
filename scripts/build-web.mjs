// Copies the built site (dist/) into www/ for the Android app.
import { execSync } from "node:child_process";
execSync("rm -rf www && mkdir -p www && cp -R dist/. www/", { stdio: "inherit" });
console.log("www ready");
