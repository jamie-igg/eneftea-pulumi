import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

const config = new pulumi.Config();

export const provider = new aws.Provider("aws_eu-west-2", {
  region: "eu-west-2",
  profile: config.require("AWS_PROFILE"),
});

export const providerUSEast1 = new aws.Provider("aws_us-east-1", {
  region: "us-east-1",
  profile: config.require("AWS_PROFILE"),
});
