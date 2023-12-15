import * as aws from "@pulumi/aws";
import { vpc } from "./network";
import { provider } from "./provider";

// Get existing security group
export const defaultSecurityGroup = await aws.ec2.getSecurityGroup(
  {
    name: "default",
    vpcId: vpc.id,
  },
  { provider }
);
