/**
 * Deploy the API demo static site (index.html) to AWS Amplify Hosting via manual zip upload.
 * Pushes whatever is on disk in this folder after injecting API_BASE_URL — no Git required.
 *
 * Prereqs: npm install in this folder (aws-sdk, archiver). AWS credentials with Amplify access.
 *
 * Usage (from api/):
 *   node deploy-api-amplify.js
 *
 * Env:
 *   API_BASE_URL   — API Gateway stage base, no trailing slash (default: prod URL in replace-api-url.js)
 *   AMPLIFY_APP_ID — Amplify app ID (default: d106ktv35b9lnn)
 *   AMPLIFY_BRANCH — Branch name (default: main)
 *   AWS_REGION     — (default: us-east-1)
 */
const AWS = require("aws-sdk");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const archiver = require("archiver");
const https = require("https");
const http = require("http");
const { URL } = require("url");

const AMPLIFY_APP_ID = process.env.AMPLIFY_APP_ID || "d106ktv35b9lnn";
const AMPLIFY_BRANCH = process.env.AMPLIFY_BRANCH || "main";

AWS.config.update({ region: process.env.AWS_REGION || "us-east-1" });
const amplify = new AWS.Amplify();

function zipIndexHtml(indexPath) {
  const zipPath = path.join(os.tmpdir(), `amplify-api-demo-${Date.now()}.zip`);
  const out = fs.createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });
  return new Promise((resolve, reject) => {
    out.on("close", () => resolve(zipPath));
    archive.on("error", reject);
    archive.pipe(out);
    archive.file(indexPath, { name: "index.html" });
    archive.finalize();
  });
}

function uploadZipToUrl(zipPath, uploadUrl) {
  const body = fs.readFileSync(zipPath);
  const u = new URL(uploadUrl);
  const lib = u.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      uploadUrl,
      {
        method: "PUT",
        headers: { "Content-Type": "application/zip", "Content-Length": body.length }
      },
      (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) resolve();
        else reject(new Error(`Upload failed: ${res.statusCode} ${res.statusMessage}`));
      }
    );
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function deployToAmplify(appId) {
  let createRes;
  try {
    createRes = await amplify
      .createDeployment({
        appId,
        branchName: AMPLIFY_BRANCH
      })
      .promise();
  } catch (e) {
    const msg = (e && e.message) || String(e);
    if (msg.includes("repository") || msg.includes("Operation not supported")) {
      console.error(`
Manual zip upload is not available: this Amplify app is connected to Git.
To publish your local api/index.html:

  1. Commit and push your changes (e.g. api/index.html, amplify.yml).
  2. Run:  npm run amplify:release
     (or:  node scripts/trigger-amplify-release.js)

That starts a RELEASE job, which builds from the latest commit on branch "${AMPLIFY_BRANCH}".
`);
    }
    throw e;
  }

  const jobId = createRes.jobId;
  const zipUploadUrl = createRes.zipUploadUrl;
  if (!jobId || !zipUploadUrl) {
    throw new Error("CreateDeployment did not return jobId or zipUploadUrl");
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "amplify-api-html-"));
  const stagedIndex = path.join(tmpDir, "index.html");
  fs.copyFileSync(path.join(__dirname, "index.html"), stagedIndex);

  const env = {
    ...process.env,
    INDEX_HTML_PATH: stagedIndex,
    API_BASE_URL: process.env.API_BASE_URL || "https://xkdvpogqt0.execute-api.us-east-1.amazonaws.com/prod"
  };
  execFileSync(process.execPath, [path.join(__dirname, "scripts", "replace-api-url.js")], {
    cwd: __dirname,
    env,
    stdio: "inherit"
  });

  console.log("Uploading zip to Amplify...");
  const zipPath = await zipIndexHtml(stagedIndex);
  try {
    await uploadZipToUrl(zipPath, zipUploadUrl);
  } finally {
    try {
      fs.unlinkSync(zipPath);
    } catch (_) {}
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch (_) {}
  }

  await amplify
    .startDeployment({
      appId,
      branchName: AMPLIFY_BRANCH,
      jobId
    })
    .promise();
  console.log("Deployment started (jobId:", jobId + "). Waiting for job to complete...");

  const maxWait = 300000;
  const start = Date.now();
  while (Date.now() - start < maxWait) {
    const job = await amplify.getJob({ appId, branchName: AMPLIFY_BRANCH, jobId }).promise();
    const status = job.job.summary?.status;
    if (status === "SUCCEED") {
      console.log("   Deployment succeeded.");
      return;
    }
    if (status === "FAILED" || status === "CANCELLED") {
      throw new Error("Amplify deployment failed: " + status);
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  throw new Error("Timed out waiting for Amplify deployment");
}

function getAmplifyAppUrl(appId) {
  return `https://${AMPLIFY_BRANCH}.${appId}.amplifyapp.com`;
}

(async () => {
  try {
    console.log("Staging index.html (API_BASE_URL inject) and deploying to Amplify...");
    console.log("   App ID:", AMPLIFY_APP_ID, " Branch:", AMPLIFY_BRANCH);
    await deployToAmplify(AMPLIFY_APP_ID);
    const url = getAmplifyAppUrl(AMPLIFY_APP_ID);
    console.log("\nAPI demo deployed.");
    console.log("   URL:", url);
  } catch (err) {
    console.error("Deploy error:", err.message || err);
    process.exit(1);
  }
})();
