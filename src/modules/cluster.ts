import * as aws from "@pulumi/aws";
import { provider } from "./provider";

// Create an ECS cluster
export const cluster = new aws.ecs.Cluster("eneftea-cluster", {}, { provider });
