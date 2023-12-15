import * as aws from "@pulumi/aws";
import { provider } from "./provider";

// Get existing VPC
export const vpc = await aws.ec2.getVpc({ default: true }, { provider });

export const subnetA = await aws.ec2.getSubnet(
  {
    vpcId: vpc.id,
    availabilityZone: "eu-west-2a",
  },
  { provider }
);

export const subnetB = await aws.ec2.getSubnet(
  {
    vpcId: vpc.id,
    availabilityZone: "eu-west-2b",
  },
  { provider }
);

export const subnetC = await aws.ec2.getSubnet(
  {
    vpcId: vpc.id,
    availabilityZone: "eu-west-2c",
  },
  { provider }
);
