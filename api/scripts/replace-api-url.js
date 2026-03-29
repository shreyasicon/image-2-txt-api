/**
 * Replaces __API_BASE_URL__ in index.html with process.env.API_BASE_URL.
 * Run from repo root during Amplify build: node scripts/replace-api-url.js
 */
const fs = require("fs");
const path = require("path");

const apiBase = (process.env.API_BASE_URL || "https://xkdvpogqt0.execute-api.us-east-1.amazonaws.com/prod").replace(
  /\/$/,
  ""
);
const indexPath = process.env.INDEX_HTML_PATH || path.join(__dirname, "..", "index.html");

if (!fs.existsSync(indexPath)) {
    console.warn("index.html not found at", indexPath);
    process.exit(0);
}

let html = fs.readFileSync(indexPath, "utf8");
html = html.replace(/__API_BASE_URL__/g, apiBase.replace(/\/$/, ""));
fs.writeFileSync(indexPath, html);
console.log("Injected API_BASE_URL into index.html");
