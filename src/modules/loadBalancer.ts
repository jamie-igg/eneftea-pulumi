import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { defaultSecurityGroup } from "./defaultSecurityGroup";
import { subnetA, subnetB, subnetC, vpc } from "./network";
import { provider } from "./provider";

const config = new pulumi.Config();

export const albSecurityGroup = new aws.ec2.SecurityGroup(
  "albSecurityGroup",
  {
    ingress: [
      {
        protocol: "tcp",
        fromPort: 80,
        toPort: 80,
        cidrBlocks: ["0.0.0.0/0"],
      },
      {
        protocol: "tcp",
        fromPort: 443,
        toPort: 443,
        cidrBlocks: ["0.0.0.0/0"],
      },
    ],
  },
  { provider }
);

// SSL Certificate
export const certificate = new aws.acm.Certificate(
  "certificate",
  {
    domainName: config.require("DOMAIN"),
    validationMethod: "DNS",
  },
  { provider }
);

export const hostedZoneId = await aws.route53
  .getZone({ name: config.require("DOMAIN") }, { provider })
  .then((zone) => zone.zoneId);

export const certificateValidationDomain = new aws.route53.Record(
  "certificateValidationDomain",
  {
    name: certificate.domainValidationOptions[0].resourceRecordName,
    zoneId: hostedZoneId,
    type: certificate.domainValidationOptions[0].resourceRecordType,
    records: [certificate.domainValidationOptions[0].resourceRecordValue],
    ttl: 60 * 5,
  },
  { provider, dependsOn: [certificate] }
);

export const alb = new aws.alb.LoadBalancer(
  "eneftea-lb",
  {
    internal: false,
    loadBalancerType: "application",
    securityGroups: [defaultSecurityGroup.id, albSecurityGroup.id],
    subnets: [subnetA.id, subnetB.id, subnetC.id],
  },
  { provider, dependsOn: [albSecurityGroup] }
);

export const apiTargetGroup = new aws.alb.TargetGroup(
  "api-tg",
  {
    port: 3000,
    protocol: "HTTP",
    vpcId: vpc.id,
    targetType: "ip",
    healthCheck: {
      enabled: true,
      interval: 30,
      path: "/api/health",
      timeout: 4,
      healthyThreshold: 3,
      unhealthyThreshold: 4,
    },
  },
  { dependsOn: [alb], provider }
);

export const albHTTPListener = new aws.alb.Listener(
  "http-listener",
  {
    loadBalancerArn: alb.arn,
    port: 80,
    protocol: "HTTP",
    defaultActions: [
      {
        type: "redirect",
        redirect: {
          port: "443",
          protocol: "HTTPS",
          statusCode: "HTTP_301",
        },
      },
    ],
  },
  { provider }
);

export const albHTTPSListener = new aws.alb.Listener(
  "https-listener",
  {
    loadBalancerArn: alb.arn,
    port: 443,
    protocol: "HTTPS",
    certificateArn: certificate.arn,
    defaultActions: [
      {
        type: "fixed-response",
        fixedResponse: {
          contentType: "text/plain",
          messageBody: "404 - Not Found",
          statusCode: "404",
        },
      },
    ],
  },
  { provider }
);

export const albApiListenerRule = new aws.alb.ListenerRule(
  "albApiListenerRule",
  {
    listenerArn: albHTTPSListener.arn,
    tags: {
      Name: "albApiListenerRule",
    },
    priority: 10,
    actions: [
      {
        type: "forward",
        targetGroupArn: apiTargetGroup.arn,
      },
    ],
    conditions: [
      {
        pathPattern: { values: ["/api/*"] },
      },
    ],
  },
  { provider, dependsOn: [albHTTPSListener, apiTargetGroup] }
);

// Create a DNS record for the load balancer
export const albDomain = new aws.route53.Record(
  config.require("DOMAIN"),
  {
    name: config.require("DOMAIN"),
    zoneId: hostedZoneId,
    type: "A",
    aliases: [
      {
        name: alb.dnsName,
        zoneId: alb.zoneId,
        evaluateTargetHealth: true,
      },
    ],
  },
  { provider }
);
