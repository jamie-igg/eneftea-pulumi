import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import { buckets } from "../cloudfront";
import { cluster } from "../cluster";
import { defaultSecurityGroup } from "../defaultSecurityGroup";
import { apiTargetGroup } from "../loadBalancer";
import { subnetA, subnetB, subnetC } from "../network";
import { provider } from "../provider";

const config = new pulumi.Config();

// Eneftea api security group
const enefteaApiSecurityGroup = new aws.ec2.SecurityGroup(
  "eneftea-api-security-group",
  {
    ingress: [
      {
        protocol: "tcp",
        fromPort: 3000,
        toPort: 3000,
        cidrBlocks: [
          "82.41.129.141/32", // JB home IP
          "154.47.114.21/32", // SG home IP
        ],
      },
    ],
  },
  { provider }
);

//* Eneftea Api
export const enefteaApiFargateService = new awsx.ecs.FargateService(
  "eneftea-svc",
  {
    name: "eneftea-svc",
    cluster: cluster.id,
    networkConfiguration: {
      assignPublicIp: true,
      subnets: [subnetA.id, subnetB.id, subnetC.id],
      securityGroups: [defaultSecurityGroup.id, enefteaApiSecurityGroup.id],
    },
    desiredCount: 1,
    loadBalancers: [
      {
        targetGroupArn: apiTargetGroup.arn,
        containerName: "api",
        containerPort: 3000,
      },
    ],
    taskDefinitionArgs: {
      // executionRole: { roleArn: ecsTaskExecutionRole.arn },
      containers: {
        api: {
          name: "api",
          image: config.require("API_IMAGE"),
          memory: config.requireNumber("API_MEMORY"),
          cpu: config.requireNumber("API_CPU"),
          portMappings: [{ containerPort: 3000 }],
          environment: [
            {
              name: "MOLECULER_NAMESPACE",
              value: config.require("MOLECULER_NAMESPACE"),
            },
            {
              name: "CACHER",
              value: config.require("REDIS_URL"),
            },
            {
              name: "TRANSPORTER",
              value: config.require("REDIS_URL"),
            },
            {
              name: "KAFKA_URL",
              value: config.require("KAFKA_URL"),
            },
            {
              name: "REDIS_URL",
              value: config.require("REDIS_URL"),
            },
            {
              name: "DATABASE_URL",
              value: config.require("DATABASE_URL"),
            },
            {
              name: "PORT",
              value: "3000",
            },
            {
              name: "IPFS_GATEWAY",
              value: config.require("IPFS_GATEWAY"),
            },
            {
              name: "CDN_HOST",
              value: "https://" + config.require("CDN_DOMAIN"),
            },
            {
              name: "NFT_STORAGE_BUCKET",
              value: buckets
                .find((b) => b.bname === "nft-media")
                ?.bucket.bucketRegionalDomainName.apply(
                  (val) => val.split(".")[0] || ""
                ),
            },
            {
              name: "NFT_STORAGE_REGION",
              value: "eu-west-2",
            },
            {
              name: "S3_KEY_ID",
              value: config.require("S3_KEY_ID"),
            },
            {
              name: "S3_SECRET_ACCESS_KEY",
              value: config.require("S3_SECRET_ACCESS_KEY"),
            },
          ],
        },
      },
    },
  },
  {
    provider,
    dependsOn: [enefteaApiSecurityGroup, cluster, apiTargetGroup],
  }
);
