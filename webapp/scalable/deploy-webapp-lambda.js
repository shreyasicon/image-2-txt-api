/**
 * Deploy webapp to Lambda + API Gateway only (no CloudFront).
 * Builds Next.js static export, uploads to S3, serves via Lambda + HTTP API.
 * Uses the same Cognito User Pool as the rest of the project (login/vault).
 *
 * Run: node deploy-webapp-lambda.js
 * Prereqs: AWS credentials (e.g. aws configure), npm install in this folder.
 */
const AWS = require("aws-sdk");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const archiver = require("archiver");

AWS.config.update({ region: process.env.AWS_REGION || "us-east-1" });

const s3 = new AWS.S3();
const cognito = new AWS.CognitoIdentityServiceProvider();
const lambda = new AWS.Lambda();
const apigw = new AWS.ApiGatewayV2();
const iam = new AWS.IAM();
const sts = new AWS.STS();

const WEBAPP_BUCKET_PREFIX = "image2text-webapp";
const OUT_DIR = path.join(__dirname, "out");
const LAMBDA_DIR = path.join(__dirname, "lambda-webapp-serve");
const COGNITO_POOL_NAME = "image2text-user-pool";
const COGNITO_CLIENT_NAME = "image2text-webapp-client";
const LAMBDA_FUNCTION_NAME = "webapp-serve";
const API_NAME = "webapp-api";
const LAMBDA_ROLE_NAME = "webapp-serve-lambda-role";

function getContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    ".html": "text/html", ".htm": "text/html", ".css": "text/css", ".js": "application/javascript",
    ".json": "application/json", ".ico": "image/x-icon", ".svg": "image/svg+xml",
    ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".gif": "image/gif",
    ".webp": "image/webp", ".woff": "font/woff", ".woff2": "font/woff2", ".txt": "text/plain"
  };
  return map[ext] || "application/octet-stream";
}

function getAllFiles(dir, base = "") {
  const results = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const full = path.join(dir, file);
    const rel = path.join(base, file);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) results.push(...getAllFiles(full, rel));
    else results.push(rel);
  }
  return results;
}

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

async function ensureBucket(bucketName) {
  try {
    await s3.headBucket({ Bucket: bucketName }).promise();
    console.log("S3 bucket exists:", bucketName);
  } catch (e) {
    if (e.code === "NotFound" || e.statusCode === 404 || e.code === "NoSuchBucket") {
      await s3.createBucket({ Bucket: bucketName }).promise();
      console.log("S3 bucket created:", bucketName);
    } else throw e;
  }
}

async function uploadDirToS3(bucketName, localDir) {
  const files = getAllFiles(localDir);
  let uploaded = 0;
  for (const rel of files) {
    const fullPath = path.join(localDir, rel);
    const body = fs.readFileSync(fullPath);
    const contentType = getContentType(fullPath);
    const key = rel.split(path.sep).join("/");
    const isHtml = /\.(html?|htm)$/i.test(rel);
    const isStaticAsset = /\/_next\/static\//.test(rel) || /\.(js|css|woff2?|ico|svg)$/i.test(rel);
    const params = {
      Bucket: bucketName,
      Key: key,
      Body: body,
      ContentType: contentType
    };
    if (isHtml) params.CacheControl = "max-age=0, no-cache, no-store, must-revalidate";
    else if (isStaticAsset) params.CacheControl = "public, max-age=31536000, immutable";
    await s3.putObject(params).promise();
    uploaded++;
    if (uploaded % 20 === 0) console.log("Uploaded", uploaded, "files...");
  }
  console.log("Uploaded", uploaded, "files to S3");
}

function zipLambdaDir() {
  execSync("npm install --omit=dev", { cwd: LAMBDA_DIR, stdio: "inherit" });
  const zipPath = path.join(__dirname, "lambda-webapp-serve.zip");
  const out = fs.createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });
  return new Promise((resolve, reject) => {
    out.on("close", () => resolve(zipPath));
    archive.on("error", reject);
    archive.pipe(out);
    archive.directory(LAMBDA_DIR, false);
    archive.finalize();
  });
}

async function ensureLambdaRole(accountId, bucketName) {
  const roleName = LAMBDA_ROLE_NAME;
  const assumePolicy = JSON.stringify({
    Version: "2012-10-17",
    Statement: [{ Effect: "Allow", Principal: { Service: "lambda.amazonaws.com" }, Action: "sts:AssumeRole" }]
  });
  let roleArn;
  try {
    const existing = await iam.getRole({ RoleName: roleName }).promise();
    roleArn = existing.Role.Arn;
    console.log("Lambda execution role exists:", roleArn);
  } catch (e) {
    if (e.code !== "NoSuchEntity") throw e;
    const create = await iam.createRole({
      RoleName: roleName,
      AssumeRolePolicyDocument: assumePolicy,
      Description: "Execution role for webapp-serve Lambda"
    }).promise();
    roleArn = create.Role.Arn;
    console.log("Lambda execution role created:", roleArn);
    await iam.attachRolePolicy({
      RoleName: roleName,
      PolicyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
    }).promise();
  }
  const s3PolicyName = "webapp-serve-s3-read";
  const s3PolicyDoc = JSON.stringify({
    Version: "2012-10-17",
    Statement: [{ Effect: "Allow", Action: ["s3:GetObject"], Resource: [`arn:aws:s3:::${bucketName}/*`] }]
  });
  await iam.putRolePolicy({ RoleName: roleName, PolicyName: s3PolicyName, PolicyDocument: s3PolicyDoc }).promise();
  return roleArn;
}

async function ensureLambdaWebappServe(bucketName, region, roleArn) {
  const zipPath = await zipLambdaDir();
  const zipBuffer = fs.readFileSync(zipPath);
  try {
    const existing = await lambda.getFunction({ FunctionName: LAMBDA_FUNCTION_NAME }).promise();
    await lambda.updateFunctionCode({ FunctionName: LAMBDA_FUNCTION_NAME, ZipFile: zipBuffer }).promise();
    await lambda.updateFunctionConfiguration({
      FunctionName: LAMBDA_FUNCTION_NAME,
      Environment: { Variables: { BUCKET: bucketName } },
      Timeout: 30,
      MemorySize: 256
    }).promise();
    console.log("Lambda function updated:", LAMBDA_FUNCTION_NAME);
    return existing.Configuration.FunctionArn;
  } catch (e) {
    if (e.code !== "ResourceNotFoundException") throw e;
    const create = await lambda.createFunction({
      FunctionName: LAMBDA_FUNCTION_NAME,
      Runtime: "nodejs20.x",
      Handler: "index.handler",
      Role: roleArn,
      Code: { ZipFile: zipBuffer },
      Timeout: 30,
      MemorySize: 256,
      Environment: { Variables: { BUCKET: bucketName } }
    }).promise();
    console.log("Lambda function created:", LAMBDA_FUNCTION_NAME);
    return create.FunctionArn;
  } finally {
    try { fs.unlinkSync(zipPath); } catch (_) {}
  }
}

async function ensureApiGatewayHttpApi(lambdaArn, accountId, region) {
  const list = await apigw.getApis({}).promise();
  const existing = (list.Items || []).find((a) => a.Name === API_NAME);
  let apiId;
  if (existing) {
    apiId = existing.ApiId;
    console.log("API Gateway HTTP API exists:", apiId);
  } else {
    const create = await apigw.createApi({
      Name: API_NAME,
      ProtocolType: "HTTP",
      Description: "Webapp static site (Lambda)"
    }).promise();
    apiId = create.ApiId;
    console.log("API Gateway HTTP API created:", apiId);
  }
  const integrations = await apigw.getIntegrations({ ApiId: apiId }).promise();
  const defaultIntegration = (integrations.Items || []).find((i) => i.IntegrationUri === lambdaArn);
  let integrationId;
  if (defaultIntegration) {
    integrationId = defaultIntegration.IntegrationId;
  } else {
    const createInt = await apigw.createIntegration({
      ApiId: apiId,
      IntegrationType: "AWS_PROXY",
      IntegrationUri: lambdaArn,
      PayloadFormatVersion: "2.0"
    }).promise();
    integrationId = createInt.IntegrationId;
  }
  const routes = await apigw.getRoutes({ ApiId: apiId }).promise();
  const defaultRoute = (routes.Items || []).find((r) => r.RouteKey === "$default");
  if (!defaultRoute) {
    await apigw.createRoute({
      ApiId: apiId,
      RouteKey: "$default",
      Target: "integrations/" + integrationId
    }).promise();
    console.log("Created $default route -> Lambda");
  }
  let stage = (await apigw.getStages({ ApiId: apiId }).promise()).Items?.find((s) => s.StageName === "$default");
  if (!stage) {
    await apigw.createStage({
      ApiId: apiId,
      StageName: "$default",
      AutoDeploy: true
    }).promise();
    stage = { StageName: "$default" };
  }
  const invokeArn = `arn:aws:execute-api:${region}:${accountId}:${apiId}/*`;
  try {
    await lambda.addPermission({
      FunctionName: LAMBDA_FUNCTION_NAME,
      StatementId: "apigw-invoke-" + apiId,
      Action: "lambda:InvokeFunction",
      Principal: "apigateway.amazonaws.com",
      SourceArn: invokeArn
    }).promise();
  } catch (e) {
    if (e.code !== "ResourceConflictException") throw e;
  }
  const baseUrl = `https://${apiId}.execute-api.${region}.amazonaws.com/${stage.StageName}`;
  return { apiId, baseUrl };
}

(async () => {
  try {
    const region = AWS.config.region || "us-east-1";
    const accountId = await getAccountId();
    const bucketName = `${WEBAPP_BUCKET_PREFIX}-${accountId}`;

    console.log("1/6 Ensuring Cognito User Pool (same as backend; for login/vault)...");
    const { userPoolId, clientId } = await ensureCognitoUserPool();

    console.log("2/6 Building webapp (npm run build) with Cognito env...");
    const buildEnv = {
      ...process.env,
      NEXT_PUBLIC_COGNITO_USER_POOL_ID: userPoolId,
      NEXT_PUBLIC_COGNITO_CLIENT_ID: clientId,
      NEXT_PUBLIC_AWS_REGION: region
    };
    execSync("npm run build", { cwd: __dirname, stdio: "inherit", env: buildEnv });
    if (!fs.existsSync(OUT_DIR)) {
      console.error("Build output not found at", OUT_DIR);
      process.exit(1);
    }

    console.log("3/6 Ensuring S3 bucket and uploading build...");
    await ensureBucket(bucketName);
    await uploadDirToS3(bucketName, OUT_DIR);

    console.log("4/6 Ensuring Lambda role and S3 read policy...");
    const roleArn = await ensureLambdaRole(accountId, bucketName);

    console.log("5/6 Ensuring Lambda function (webapp-serve)...");
    const lambdaArn = await ensureLambdaWebappServe(bucketName, region, roleArn);

    console.log("6/6 Ensuring API Gateway HTTP API...");
    const { baseUrl } = await ensureApiGatewayHttpApi(lambdaArn, accountId, region);

    console.log("\n✅ Webapp deployed (Lambda + API Gateway)");
    console.log("   App URL:  ", baseUrl);
    console.log("   S3 bucket:", bucketName);
    console.log("   Lambda:   ", LAMBDA_FUNCTION_NAME);
    console.log("   Cognito User Pool:", userPoolId);
    console.log("   Cognito Client ID:", clientId);
    console.log("\n🌐 Use this URL as your frontend. Same Cognito links to your backend (Dynamo, S3 images).");
  } catch (err) {
    console.error("Deploy error:", err);
    process.exit(1);
  }
})();
