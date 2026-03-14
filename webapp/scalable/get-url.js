/**
 * Print the live CloudFront URL for the webapp (no deploy).
 * Run from this folder: node get-url.js
 * Requires AWS credentials and an existing deployment.
 */
const AWS = require("aws-sdk");
const sts = new AWS.STS({ region: "us-east-1" });
const cloudfront = new AWS.CloudFront({ region: "us-east-1" });

const WEBAPP_BUCKET_PREFIX = "image2text-webapp";

(async () => {
  try {
    const accountId = (await sts.getCallerIdentity().promise()).Account;
    const bucketName = `${WEBAPP_BUCKET_PREFIX}-${accountId}`;

    const list = await cloudfront.listDistributions({ MaxItems: "100" }).promise();
    const items = list.DistributionList?.Items || [];
    const dist = items.find(
      (d) => d.Comment === "Image to Text webapp" || (d.Origins?.Items || []).some(
        (o) => o.DomainName && o.DomainName.startsWith(bucketName)
      )
    );

    if (!dist || !dist.DomainName) {
      console.error("No CloudFront distribution found for this webapp. Run: node deploy.js");
      process.exit(1);
    }

    const url = `https://${dist.DomainName}`;
    console.log("\n🌐 AWS webapp live link (CloudFront):");
    console.log("   ", url);
    console.log("");
  } catch (err) {
    console.error("Error:", err.message);
    process.exit(1);
  }
})();
