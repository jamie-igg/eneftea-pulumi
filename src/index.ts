import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { cloudfront } from "./modules/cloudfront";
import { enefteaApiFargateService } from "./modules/fargate/api";
import { vpc } from "./modules/network";
import { provider } from "./modules/provider";

(async () => {
  const config = new pulumi.Config();

  // Create an AWS SSM IAM Role
  const ssmRole = new aws.iam.Role(
    "ssmRole",
    {
      assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Action: "sts:AssumeRole",
            Effect: "Allow",
            Sid: "",
            Principal: {
              Service: "ec2.amazonaws.com",
            },
          },
        ],
      }),
    },
    { provider }
  );

  // Attach SSM Managed Policy to the IAM Role
  new aws.iam.RolePolicyAttachment(
    "ssmPolicyAttachment",
    {
      role: ssmRole.name,
      policyArn: "arn:aws:iam::aws:policy/service-role/AmazonEC2RoleforSSM", // This is the Amazon managed policy for SSM
    },
    { provider }
  );

  // Create an IAM instance profile using the SSM role
  const instanceProfile = new aws.iam.InstanceProfile(
    "instanceProfile",
    {
      role: ssmRole.name,
    },
    { provider }
  );

  // Enable service discovery in your VPC
  const serviceDiscoveryNamespace =
    new aws.servicediscovery.PrivateDnsNamespace(
      "eneftea-dns",
      {
        description: "service discovery namespace for eneftea",
        vpc: vpc.id,
      },
      { provider }
    );

  //* ECS
  // Create a CloudWatch Logs Group
  let logGroup = new aws.cloudwatch.LogGroup("loggroup", {}, { provider });

  // Create ECS api security group
  const apiSecurityGroup = new aws.ec2.SecurityGroup(
    "apiSecurityGroup",
    {
      ingress: [
        {
          protocol: "tcp",
          fromPort: 80,
          toPort: 80,
          cidrBlocks: [
            "82.41.129.141/32", // JB Home allow direct pod access
          ],
        },
        {
          protocol: "tcp",
          fromPort: 3000,
          toPort: 3000,
          cidrBlocks: ["0.0.0.0/0"],
        },
      ],
    },
    { provider }
  );

  return {
    ssmRole,
    instanceProfile,
    serviceDiscoveryNamespace,
    logGroup,
    apiSecurityGroup,
    fargate: {
      app: enefteaApiFargateService,
    },
    cloudfront,
  };
})();
