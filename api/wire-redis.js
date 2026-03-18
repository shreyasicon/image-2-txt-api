/**
 * Wire your existing ElastiCache Redis (ocr-cache-redis) to the SQS consumer Lambda.
 * Use this when the cluster already exists (e.g. created in the AWS Console).
 *
 * Run from api folder: node wire-redis.js
 *
 * Prereqs: OCRJobQueue and consumer Lambda (ocr-sqs-consumer) exist — run node deploy.js first.
 * Your Redis: cluster name ocr-cache-redis, subnet group ocr-cache-subnets, SG ocr-redis-sg.
 */

const AWS = require("aws-sdk");
AWS.config.update({ region: process.env.AWS_REGION || "us-east-1" });

const elasticache = new AWS.ElastiCache();
const ec2 = new AWS.EC2();
const lambda = new AWS.Lambda();

const REDIS_GROUP_ID = "ocr-cache-redis";
const REDIS_SUBNET_GROUP = "ocr-cache-subnets";
const REDIS_SG_NAME = "ocr-redis-sg";
const CONSUMER_FUNCTION_NAME = "ocr-sqs-consumer";

async function getRedisUrl() {
  const desc = await elasticache.describeReplicationGroups({
    ReplicationGroupId: REDIS_GROUP_ID,
  }).promise();
  const group = (desc.ReplicationGroups || [])[0];
  if (!group || group.Status !== "available") {
    throw new Error(`Replication group ${REDIS_GROUP_ID} not found or not available (status: ${group?.Status || "?"}). Create it in ElastiCache or run create-elasticache.js.`);
  }
  const primary = (group.NodeGroups || [])[0];
  const endpoint = primary?.PrimaryEndpoint;
  const host = endpoint?.Address;
  const port = endpoint?.Port || 6379;
  if (!host) throw new Error("Could not get primary endpoint for " + REDIS_GROUP_ID);
  return `redis://${host}:${port}`;
}

async function getSubnetIdsFromSubnetGroup() {
  const desc = await elasticache.describeCacheSubnetGroups({
    CacheSubnetGroupName: REDIS_SUBNET_GROUP,
  }).promise();
  const group = (desc.CacheSubnetGroups || [])[0];
  if (!group || !group.Subnets || group.Subnets.length === 0) {
    throw new Error(`Subnet group ${REDIS_SUBNET_GROUP} not found or has no subnets.`);
  }
  return group.Subnets.map((s) => s.SubnetIdentifier).filter(Boolean);
}

async function getSecurityGroupId(vpcId) {
  const result = await ec2.describeSecurityGroups({
    Filters: [
      { Name: "vpc-id", Values: [vpcId] },
      { Name: "group-name", Values: [REDIS_SG_NAME] },
    ],
  }).promise();
  const sg = (result.SecurityGroups || [])[0];
  if (!sg) throw new Error(`Security group ${REDIS_SG_NAME} not found in VPC ${vpcId}.`);
  return sg.GroupId;
}

async function getVpcIdFromSubnetGroup() {
  const desc = await elasticache.describeCacheSubnetGroups({
    CacheSubnetGroupName: REDIS_SUBNET_GROUP,
  }).promise();
  const group = (desc.CacheSubnetGroups || [])[0];
  if (!group?.Subnets?.[0]?.SubnetIdentifier) throw new Error("Subnet group has no subnets.");
  const sub = await ec2.describeSubnets({
    SubnetIds: [group.Subnets[0].SubnetIdentifier],
  }).promise();
  const vpcId = (sub.Subnets || [])[0]?.VpcId;
  if (!vpcId) throw new Error("Could not get VPC from subnet group.");
  return vpcId;
}

async function updateConsumerLambdaWithRedis(redisUrl, subnetIds, securityGroupId) {
  let fn;
  try {
    fn = await lambda.getFunctionConfiguration({
      FunctionName: CONSUMER_FUNCTION_NAME,
    }).promise();
  } catch (e) {
    if (e.code === "ResourceNotFoundException" || (e.message && e.message.includes("Function not found"))) {
      throw new Error(
        `Consumer Lambda "${CONSUMER_FUNCTION_NAME}" does not exist yet. Run "node deploy.js" from the api folder first to create the API, SQS queue, and consumer, then run "node wire-redis.js" again.`
      );
    }
    throw e;
  }
  const currentEnv = (fn.Environment && fn.Environment.Variables) || {};
  const newEnv = { ...currentEnv, REDIS_URL: redisUrl };
  await lambda.updateFunctionConfiguration({
    FunctionName: CONSUMER_FUNCTION_NAME,
    Environment: { Variables: newEnv },
    VpcConfig: {
      SubnetIds: subnetIds,
      SecurityGroupIds: [securityGroupId],
    },
  }).promise();
  console.log("Consumer Lambda updated with REDIS_URL and VpcConfig.");
}

(async () => {
  try {
    console.log("Using existing ElastiCache Redis:", REDIS_GROUP_ID);
    const redisUrl = await getRedisUrl();
    console.log("Redis URL:", redisUrl);

    const subnetIds = await getSubnetIdsFromSubnetGroup();
    console.log("Subnet IDs (from", REDIS_SUBNET_GROUP + "):", subnetIds.join(", "));

    const vpcId = await getVpcIdFromSubnetGroup();
    const sgId = await getSecurityGroupId(vpcId);
    console.log("Security group:", REDIS_SG_NAME, sgId);

    await updateConsumerLambdaWithRedis(redisUrl, subnetIds, sgId);
    console.log("\n✅ ocr-cache-redis is now wired to the SQS consumer (ocr-sqs-consumer).");
    console.log("   OCR results will be cached in Redis by content hash; cache hits avoid re-running Textract/Tesseract.");
  } catch (err) {
    console.error("Error:", err.message || err);
    process.exit(1);
  }
})();
