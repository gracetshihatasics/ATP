/**
 * Shared Anthropic client.
 * Exported as `anthropic` so all modules use the same instance.
 */
import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config/index.js";

export const anthropic = new Anthropic({ apiKey: config.apiKey });
