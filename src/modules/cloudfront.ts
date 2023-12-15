import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { provider, providerUSEast1 } from "./provider";

const config = new pulumi.Config();

export const certificate = new aws.acm.Certificate(
  "cdn-certificate",
  {
    domainName: config.require("CDN_DOMAIN"),
    validationMethod: "DNS",
  },
  { provider: providerUSEast1 }
);

export const hostedZoneId = await aws.route53
  .getZone({ name: config.require("DOMAIN") }, { provider })
  .then((zone) => zone.zoneId);

export const certificateValidationDomain = new aws.route53.Record(
  "cdn-certificateValidationDomain",
  {
    name: certificate.domainValidationOptions[0].resourceRecordName,
    zoneId: hostedZoneId,
    type: certificate.domainValidationOptions[0].resourceRecordType,
    records: [certificate.domainValidationOptions[0].resourceRecordValue],
    ttl: 60 * 5,
  },
  { provider, dependsOn: [certificate] }
);

export const originAccessIdentity = new aws.cloudfront.OriginAccessIdentity(
  "cdn-oai",
  {
    comment: "OAI for eneftea CDN",
  },
  { provider }
);

export const buckets = ["nft-media"].map((bname) => {
  const bucket = new aws.s3.BucketV2(
    `${bname}-cdn-s3`,
    {
      tags: { Name: `${bname}-cdn-s3` },
    },
    { provider }
  );

  const corsConfiguration = new aws.s3.BucketCorsConfigurationV2(
    `${bname}-cdn-s3-cors`,
    {
      bucket: bucket.id,
      corsRules: [
        {
          allowedHeaders: ["*"],
          allowedMethods: ["GET"],
          allowedOrigins: ["*"],
          exposeHeaders: ["ETag"],
          maxAgeSeconds: 3000,
        },
      ],
    },
    { provider, dependsOn: [bucket] }
  );

  const policy = new aws.s3.BucketPolicy(
    `${bname}-cdn-s3`,
    {
      bucket: bucket.id,
      policy: pulumi.interpolate`{
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Principal": {
                    "AWS": "${originAccessIdentity.iamArn}"
                },
                "Action": "s3:GetObject",
                "Resource": "${bucket.arn}/*"
            }]
        }`,
    },
    { provider, dependsOn: [bucket, originAccessIdentity] }
  );

  const cdnFn = new aws.cloudfront.Function(
    `cdn-cffn-${bname}`,
    {
      name: `cdn-cffn-${bname}`,
      runtime: "cloudfront-js-1.0",
      code: `
      function handler(event) {
        var request = event.request;
        var uri = request.uri;
    
        // Perform dynamic path rewriting based on your logic
        var modifiedUri = uri.replace(new RegExp('^\\/${bname}\\/'), '/');
    
        request.uri = modifiedUri;
    
        return request;
      }
      
      // Export the handler function
      handler;
      `,
    },
    { provider }
  );

  return {
    bucket,
    originId: `${bname}-cdn-s3`,
    policy,
    bname,
    corsConfiguration,
    cdnFn,
  };
});

// Create a cloudfront function to log the request

// Create a CloudFront distribution
export const cloudfront = new aws.cloudfront.Distribution(
  "cdn-cf",
  {
    origins: buckets.map((bucket) => ({
      originId: bucket.originId,
      // originPath: pulumi.interpolate`/${bucket.bname}`,
      domainName: bucket.bucket.bucketRegionalDomainName,
      s3OriginConfig: {
        originAccessIdentity: originAccessIdentity.cloudfrontAccessIdentityPath,
      },
    })),
    enabled: true,
    isIpv6Enabled: true,
    comment: "Eneftea CDN CloudFront distribution",
    aliases: [config.require("CDN_DOMAIN")],

    defaultCacheBehavior: {
      allowedMethods: [
        "DELETE",
        "GET",
        "HEAD",
        "OPTIONS",
        "PATCH",
        "POST",
        "PUT",
      ],
      cachedMethods: ["GET", "HEAD"],
      targetOriginId: buckets[0].originId, // TODO: Default should be an error page
      forwardedValues: {
        queryString: false,
        cookies: {
          forward: "none",
        },
        headers: ["Origin"],
      },
      viewerProtocolPolicy: "allow-all",
      minTtl: 0,
      defaultTtl: 3600,
      maxTtl: 86400,
    },
    orderedCacheBehaviors: buckets.map((bucket) => ({
      pathPattern: `/${bucket.bname}/*`,
      allowedMethods: ["GET", "HEAD", "OPTIONS"],
      cachedMethods: ["GET", "HEAD", "OPTIONS"],
      functionAssociations: [
        {
          eventType: "viewer-request",
          functionArn: bucket.cdnFn.arn,
        },
      ],
      targetOriginId: bucket.originId,
      forwardedValues: {
        queryString: false,
        headers: ["Origin"],
        cookies: {
          forward: "none",
        },
      },
      minTtl: 0,
      defaultTtl: 86400,
      maxTtl: 31536000,
      compress: true,
      viewerProtocolPolicy: "redirect-to-https",
    })),
    priceClass: "PriceClass_200",
    restrictions: {
      geoRestriction: {
        restrictionType: "none",
      },
    },
    viewerCertificate: {
      cloudfrontDefaultCertificate: false,
      acmCertificateArn: certificate.arn,
      sslSupportMethod: "sni-only",
    },
  },
  {
    provider,
    dependsOn: [...buckets.map((bucket) => bucket.bucket), certificate],
  }
);

// Create a DNS record for cloudfront
export const albDomain = new aws.route53.Record(
  config.require("CDN_DOMAIN"),
  {
    name: config.require("CDN_DOMAIN"),
    zoneId: hostedZoneId,
    type: "A",
    aliases: [
      {
        name: cloudfront.domainName,
        zoneId: cloudfront.hostedZoneId,
        evaluateTargetHealth: true,
      },
    ],
  },
  { provider, dependsOn: [cloudfront] }
);
