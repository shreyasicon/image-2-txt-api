const AWS = require("aws-sdk");
const fs = require("fs");
const archiver = require("archiver");
const path = require("path");
const crypto = require("crypto");

AWS.config.update({ region: "us-east-1" });

const lambda = new AWS.Lambda();
const iam = new AWS.IAM();
const apigatewayv2 = new AWS.ApiGatewayV2();
const dynamodb = new AWS.DynamoDB();

const FUNCTION_NAME = "ocr-api";
const ROLE_NAME = "LambdaOCRExecutionRole";
const API_NAME = "OCR-API";
const S3_BUCKET = "ocr-upload-images-icon-203";
const DYNAMODB_TABLE = "OCRJobs";

const LAMBDA_FOLDER = path.join(__dirname, "lambda-code");
const ZIP_FILE = path.join(__dirname, "ocr-api.zip");

const SERVER_FILE = path.join(LAMBDA_FOLDER, "server.js");
const HASH_FILE = path.join(__dirname, ".last_deploy_hash");

if (!fs.existsSync(SERVER_FILE)) {
    console.error("deploy.js must be run from the project root (where the lambda-code folder is).");
    console.error("Current directory:", __dirname);
    console.error("Run: cd .. && node deploy.js");
    process.exit(1);
}

/* ---------- Hash helpers ---------- */
function fileHash(filePath) {
    const data = fs.readFileSync(filePath);
    return crypto.createHash("sha256").update(data).digest("hex");
}

function serverChanged() {
    const currentHash = fileHash(SERVER_FILE);

    if (fs.existsSync(HASH_FILE)) {
        const lastHash = fs.readFileSync(HASH_FILE, "utf8");
        if (currentHash === lastHash) {
            console.log("🟡 server.js unchanged — skipping Lambda update");
            return false;
        }
    }

    fs.writeFileSync(HASH_FILE, currentHash);
    return true;
}

/* ---------- IAM Role ---------- */
async function ensureTextractDynamoDBPolicy() {
    const inlinePolicy = {
        Version: "2012-10-17",
        Statement: [
            {
                Effect: "Allow",
                Action: ["textract:DetectDocumentText", "textract:DetectDocumentTextAnalysis"],
                Resource: "*"
            },
            {
                Effect: "Allow",
                Action: [
                    "dynamodb:PutItem",
                    "dynamodb:GetItem",
                    "dynamodb:DeleteItem",
                    "dynamodb:UpdateItem",
                    "dynamodb:Query",
                    "dynamodb:Scan",
                    "dynamodb:BatchGetItem"
                ],
                Resource: [
                    `arn:aws:dynamodb:${AWS.config.region || "us-east-1"}:*:table/${DYNAMODB_TABLE}`,
                    `arn:aws:dynamodb:${AWS.config.region || "us-east-1"}:*:table/${DYNAMODB_TABLE}/index/*`
                ]
            }
        ]
    };

    await iam.putRolePolicy({
        RoleName: ROLE_NAME,
        PolicyName: "OCRTextractDynamoDBPolicy",
        PolicyDocument: JSON.stringify(inlinePolicy)
    }).promise();
    console.log("IAM inline policy OCRTextractDynamoDBPolicy (Textract + DynamoDB) attached");
}

async function createIAMRole() {
    try {
        const role = await iam.getRole({ RoleName: ROLE_NAME }).promise();
        console.log(`IAM Role exists: ${ROLE_NAME}`);
        await ensureTextractDynamoDBPolicy();
        return role.Role.Arn;
    } catch {
        console.log(`Creating IAM Role: ${ROLE_NAME}...`);

        const assumeRolePolicy = JSON.stringify({
            Version: "2012-10-17",
            Statement: [{
                Effect: "Allow",
                Principal: { Service: "lambda.amazonaws.com" },
                Action: "sts:AssumeRole"
            }]
        });

        const role = await iam.createRole({
            RoleName: ROLE_NAME,
            AssumeRolePolicyDocument: assumeRolePolicy
        }).promise();

        await iam.attachRolePolicy({
            RoleName: ROLE_NAME,
            PolicyArn: "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
        }).promise();

        await iam.attachRolePolicy({
            RoleName: ROLE_NAME,
            PolicyArn: "arn:aws:iam::aws:policy/AmazonS3FullAccess"
        }).promise();

        await ensureTextractDynamoDBPolicy();

        console.log("Waiting for IAM role propagation...");
        await new Promise(r => setTimeout(r, 10000));

        return role.Role.Arn;
    }
}

/* ---------- DynamoDB Table ---------- */
async function createDynamoDBTable() {
    try {
        await dynamodb.describeTable({ TableName: DYNAMODB_TABLE }).promise();
        console.log(`DynamoDB table exists: ${DYNAMODB_TABLE}`);
    } catch (err) {
        if (err.code === "ResourceNotFoundException") {
            console.log(`Creating DynamoDB table: ${DYNAMODB_TABLE}...`);
            await dynamodb.createTable({
                TableName: DYNAMODB_TABLE,
                AttributeDefinitions: [
                    { AttributeName: "jobId", AttributeType: "S" }
                ],
                KeySchema: [
                    { AttributeName: "jobId", KeyType: "HASH" }
                ],
                BillingMode: "PAY_PER_REQUEST"
            }).promise();
            console.log(`DynamoDB table created: ${DYNAMODB_TABLE}`);
            console.log("Waiting for table to be active...");
            await dynamodb.waitFor("tableExists", { TableName: DYNAMODB_TABLE }).promise();
        } else {
            throw err;
        }
    }
}

/* ---------- Zip Lambda ---------- */
function zipLambda() {
    return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(ZIP_FILE);
        const archive = archiver("zip", { zlib: { level: 9 } });

        output.on("close", () => {
            console.log(`Zip created: ${ZIP_FILE} (${archive.pointer()} bytes)`);
            resolve();
        });

        archive.on("error", reject);
        archive.pipe(output);

        archive.glob("**/*", {
            cwd: LAMBDA_FOLDER,
            ignore: ["uploads/**", ".git/**", ".gitignore"]
        });

        archive.finalize();
    });
}

/* ---------- Deploy Lambda ---------- */
async function deployLambda(roleArn) {
    const zipBuffer = fs.readFileSync(ZIP_FILE);

    try {
        await lambda.updateFunctionCode({
            FunctionName: FUNCTION_NAME,
            ZipFile: zipBuffer
        }).promise();

        console.log("Lambda code updated");

        await new Promise(r => setTimeout(r, 60000));

        await lambda.updateFunctionConfiguration({
            FunctionName: FUNCTION_NAME,
            Role: roleArn,
            Handler: "server.handler",
            Runtime: "nodejs20.x",
            Timeout: 30,
            MemorySize: 1024,
            Environment: {
                Variables: {
                    S3_BUCKET
                }
            }
        }).promise();

        console.log("Lambda configuration updated");
    } catch (err) {
        if (err.code === "ResourceNotFoundException") {
            await lambda.createFunction({
                FunctionName: FUNCTION_NAME,
                Runtime: "nodejs20.x",
                Role: roleArn,
                Handler: "server.handler",
                Code: { ZipFile: zipBuffer },
                Timeout: 30,
                MemorySize: 1024,
                Publish: true,
                Environment: {
                    Variables: {
                        S3_BUCKET
                    }
                }
            }).promise();

            console.log("Lambda function created");
        } else {
            throw err;
        }
    }
}

/* ---------- API Gateway ---------- */
async function createApiGateway() {
    console.log("🔎 Checking API Gateway...");

    const region = AWS.config.region || "us-east-1";
    const apis = await apigatewayv2.getApis().promise();
    let api = apis.Items.find(a => a.Name === API_NAME);

    if (!api) {
        api = await apigatewayv2.createApi({
            Name: API_NAME,
            ProtocolType: "HTTP",
            CorsConfiguration: {
                AllowOrigins: ["*"],
                AllowMethods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
                AllowHeaders: ["Content-Type", "Authorization"]
            }
        }).promise();
        console.log("API created");
    }

    const lambdaData = await lambda.getFunction({ FunctionName: FUNCTION_NAME }).promise();
    const lambdaArn = lambdaData.Configuration.FunctionArn;
    const accountId = lambdaArn.split(":")[4];

    // Required: allow API Gateway to invoke Lambda (otherwise you get 403/502)
    const apiSourceArn = `arn:aws:execute-api:${region}:${accountId}:${api.ApiId}/*`;
    try {
        await lambda.addPermission({
            FunctionName: FUNCTION_NAME,
            StatementId: "apigateway-invoke-" + api.ApiId,
            Action: "lambda:InvokeFunction",
            Principal: "apigateway.amazonaws.com",
            SourceArn: apiSourceArn
        }).promise();
        console.log("✅ Lambda invoke permission granted for API Gateway");
    } catch (e) {
        if (e.code !== "ResourceConflictException") throw e;
    }

    const integrations = await apigatewayv2.getIntegrations({ ApiId: api.ApiId }).promise();
    let integration = integrations.Items.find(i => i.IntegrationType === "AWS_PROXY");

    if (!integration) {
        integration = await apigatewayv2.createIntegration({
            ApiId: api.ApiId,
            IntegrationType: "AWS_PROXY",
            IntegrationUri: lambdaArn,
            PayloadFormatVersion: "2.0"
        }).promise();
    }

    const routes = [
        "GET /health",
        "ANY /ocr",
        "ANY /ocr/base64",
        "ANY /ocr/{jobId}"
    ];

    const existingRoutes = await apigatewayv2.getRoutes({ ApiId: api.ApiId }).promise();
    const routeKeys = existingRoutes.Items.map(r => r.RouteKey);

    for (const routeKey of routes) {
        if (!routeKeys.includes(routeKey)) {
            await apigatewayv2.createRoute({
                ApiId: api.ApiId,
                RouteKey: routeKey,
                Target: `integrations/${integration.IntegrationId}`
            }).promise();
            console.log(`✅ Route created: ${routeKey}`);
        }
    }

    // Create a new deployment so route/API changes go live on prod
    const deployment = await apigatewayv2.createDeployment({ ApiId: api.ApiId }).promise();
    const stages = await apigatewayv2.getStages({ ApiId: api.ApiId }).promise();
    const prodStage = stages.Items.find(s => s.StageName === "prod");

    if (!prodStage) {
        await apigatewayv2.createStage({
            ApiId: api.ApiId,
            DeploymentId: deployment.DeploymentId,
            StageName: "prod",
            AutoDeploy: true
        }).promise();
        console.log("✅ Stage prod created");
    } else if (prodStage.AutoDeploy) {
        // When AutoDeploy is enabled, you cannot set DeploymentId on the stage; deployment is applied automatically
        console.log("✅ Deployment created (prod has AutoDeploy; changes apply automatically)");
    } else {
        await apigatewayv2.updateStage({
            ApiId: api.ApiId,
            StageName: "prod",
            DeploymentId: deployment.DeploymentId
        }).promise();
        console.log("✅ Stage prod updated with new deployment");
    }

    console.log("🌍 API URL:", `${api.ApiEndpoint}/prod`);
}

/* ---------- Main ---------- */
(async () => {
    try {
        console.log("📦 Ensuring DynamoDB table and IAM (Textract + DynamoDB)...");
        await createDynamoDBTable();
        const roleArn = await createIAMRole();

        if (serverChanged()) {
            await zipLambda();
            await deployLambda(roleArn);
            console.log("✅ Lambda updated");
        } else {
            console.log("✅ Lambda already up to date");
        }

        await createApiGateway();
        console.log("🚀 Deployment finished (DynamoDB + Textract permissions + Lambda + API Gateway)");
    } catch (err) {
        console.error("Deployment error:", err);
    }
})();