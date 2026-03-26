/**
 * Deploy webapp to AWS Amplify Hosting only.
 * Builds Next.js static export, zips it, and deploys to Amplify (manual deploy).
 * Uses the same Cognito User Pool as the rest of the project (login/vault).
 *
 * Run: node deploy-webapp-amplify.js
 * Prereqs: AWS credentials (e.g. aws configure), npm install in this folder.
 */
const AWS = require("aws-sdk");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const archiver = require("archiver");
const https = require("https");
const http = require("http");
const { URL } = require("url");

AWS.config.update({ region: process.env.AWS_REGION || "us-east-1" });

const cognito = new AWS.CognitoIdentityServiceProvider();
const amplify = new AWS.Amplify();
const sts = new AWS.STS();

const OUT_DIR = path.join(__dirname, "out");
const COGNITO_POOL_NAME = "image2text-user-pool";
const COGNITO_CLIENT_NAME = "image2text-webapp-client";
const AMPLIFY_APP_NAME = "image2text-webapp";
const AMPLIFY_BRANCH = "main";

async function getAccountId() {
  const data = await sts.getCallerIdentity().promise();
  return data.Account;
}

async function ensureCognitoUserPool() {
  const list = await cognito.listUserPools({ MaxResults: 60 }).promise();
  const pool = (list.UserPools || []).find((p) => p.Name === COGNITO_POOL_NAME);
  let userPoolId;
  if (pool) {
    userPoolId = pool.Id;
    console.log("Cognito User Pool exists:", userPoolId);
  } else {
    const create = await cognito.createUserPool({
      PoolName: COGNITO_POOL_NAME,
      Policies: {
        PasswordPolicy: {
          MinimumLength: 8,
          RequireUppercase: false,
          RequireLowercase: false,
          RequireNumbers: false,
          RequireSymbols: false
        }
      },
      AutoVerifiedAttributes: ["email"],
      Schema: [
        { Name: "email", AttributeDataType: "String", Required: true, Mutable: true },
        { Name: "name", AttributeDataType: "String", Required: false, Mutable: true }
      ],
      UsernameAttributes: ["email"],
      MfaConfiguration: "OFF"
    }).promise();
    userPoolId = create.UserPool.Id;
    console.log("Cognito User Pool created:", userPoolId);
  }
  const clients = await cognito.listUserPoolClients({ UserPoolId: userPoolId }).promise();
  let clientId;
  const appClient = (clients.UserPoolClients || []).find((c) => c.ClientName === COGNITO_CLIENT_NAME);
  if (appClient) {
    clientId = appClient.ClientId;
    console.log("Cognito App Client exists:", clientId);
  } else {
    const createClient = await cognito.createUserPoolClient({
      UserPoolId: userPoolId,
      ClientName: COGNITO_CLIENT_NAME,
      GenerateSecret: false,
      ExplicitAuthFlows: ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_SRP_AUTH"]
    }).promise();
    clientId = createClient.UserPoolClient.ClientId;
    console.log("Cognito App Client created:", clientId);
  }
  return { userPoolId, clientId };
}

function zipOutDir() {
  if (!fs.existsSync(OUT_DIR)) throw new Error("Build output not found at " + OUT_DIR);
  const zipPath = path.join(__dirname, "amplify-deploy.zip");
  const out = fs.createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });
  return new Promise((resolve, reject) => {
    out.on("close", () => resolve(zipPath));
    archive.on("error", reject);
    archive.pipe(out);
    archive.directory(OUT_DIR, false);
    archive.finalize();
  });
}

function uploadZipToUrl(zipPath, uploadUrl) {
  const body = fs.readFileSync(zipPath);
  const u = new URL(uploadUrl);
  const isHttps = u.protocol === "https:";
  const lib = isHttps ? https : http;
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

async function ensureAmplifyApp() {
  const list = await amplify.listApps({ maxResults: 50 }).promise();
  const existing = (list.apps || []).find((a) => a.name === AMPLIFY_APP_NAME);
  if (existing) {
    console.log("Amplify app exists:", existing.appId);
    return existing.appId;
  }
  const create = await amplify.createApp({
    name: AMPLIFY_APP_NAME,
    platform: "WEB",
    description: "Image2Text webapp (static)"
  }).promise();
  console.log("Amplify app created:", create.app.appId);
  return create.app.appId;
}

async function ensureAmplifyBranch(appId) {
  const list = await amplify.listBranches({ appId }).promise();
  const existing = (list.branches || []).find((b) => b.branchName === AMPLIFY_BRANCH);
  if (existing) {
    console.log("Amplify branch exists:", AMPLIFY_BRANCH);
    return;
  }
  await amplify.createBranch({
    appId,
    branchName: AMPLIFY_BRANCH,
    stage: "PRODUCTION",
    enableAutoBuild: false
  }).promise();
  console.log("Amplify branch created:", AMPLIFY_BRANCH);
}

async function deployToAmplify(appId) {
  const createRes = await amplify.createDeployment({
    appId,
    branchName: AMPLIFY_BRANCH
  }).promise();

  const jobId = createRes.jobId;
  const zipUploadUrl = createRes.zipUploadUrl;
  if (!jobId || !zipUploadUrl) {
    throw new Error("CreateDeployment did not return jobId or zipUploadUrl");
  }

  console.log("Uploading zip to Amplify...");
  const zipPath = await zipOutDir();
  try {
    await uploadZipToUrl(zipPath, zipUploadUrl);
  } finally {
    try { fs.unlinkSync(zipPath); } catch (_) {}
  }

  await amplify.startDeployment({
    appId,
    branchName: AMPLIFY_BRANCH,
    jobId
  }).promise();
  console.log("Deployment started (jobId:", jobId + "). Waiting for job to complete...");

  const region = AWS.config.region || "us-east-1";
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
    console.log("1/5 Ensuring Cognito User Pool (same as backend; for login/vault)...");
    const { userPoolId, clientId } = await ensureCognitoUserPool();

    console.log("2/5 Building webapp (npm run build) with Cognito env...");
    const region = AWS.config.region || "us-east-1";
    const buildEnv = {
      ...process.env,
      NEXT_PUBLIC_COGNITO_USER_POOL_ID: userPoolId,
      NEXT_PUBLIC_COGNITO_CLIENT_ID: clientId,
      NEXT_PUBLIC_AWS_REGION: region,
      // Optional overrides from your shell before deploy (OCR, translate, Unsplash):
      ...(process.env.NEXT_PUBLIC_OCR_API_BASE && { NEXT_PUBLIC_OCR_API_BASE: process.env.NEXT_PUBLIC_OCR_API_BASE }),
      ...(process.env.NEXT_PUBLIC_TRANSLATE_API_BASE && {
        NEXT_PUBLIC_TRANSLATE_API_BASE: process.env.NEXT_PUBLIC_TRANSLATE_API_BASE
      }),
      ...(process.env.NEXT_PUBLIC_UNSPLASH_ACCESS_KEY && {
        NEXT_PUBLIC_UNSPLASH_ACCESS_KEY: process.env.NEXT_PUBLIC_UNSPLASH_ACCESS_KEY
      })
    };
    execSync("npm run build", { cwd: __dirname, stdio: "inherit", env: buildEnv });
    if (!fs.existsSync(OUT_DIR)) {
      console.error("Build output not found at", OUT_DIR);
      process.exit(1);
    }

    console.log("3/5 Ensuring Amplify app and branch...");
    const appId = await ensureAmplifyApp();
    await ensureAmplifyBranch(appId);

    console.log("4/5 Zipping build and deploying to Amplify...");
    await deployToAmplify(appId);

    const appUrl = getAmplifyAppUrl(appId);

    console.log("\n✅ Webapp deployed (Amplify Hosting)");
    console.log("   App URL:  ", appUrl);
    console.log("   Amplify app ID:", appId);
    console.log("   Branch:   ", AMPLIFY_BRANCH);
    console.log("   Cognito User Pool:", userPoolId);
    console.log("   Cognito Client ID:", clientId);
    console.log("\n🌐 Use this URL as your frontend. Same Cognito links to your backend (Dynamo, S3 images).");
  } catch (err) {
    console.error("Deploy error:", err);
    process.exit(1);
  }
})();
