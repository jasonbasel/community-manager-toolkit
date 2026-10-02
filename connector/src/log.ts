/**
 * Structured logs for Cloud Logging. Only: event type, route or tool name, latency, record
 * counts and status. Never inputs, outputs, IP addresses or error messages that could quote data.
 */
import { CONFIG } from "./config.js";

type Fields = Record<string, string | number | boolean | null | undefined>;

export function log(fields: Fields, severity: "INFO" | "WARNING" | "ERROR" = "INFO"): void {
  if (!CONFIG.logging) return;
  const line = JSON.stringify({ severity, time: new Date().toISOString(), ...fields });
  if (severity === "ERROR") console.error(line); else console.log(line);
}

export const logTool = (tool: string, ms: number, status: "ok" | "input_error" | "error", records_in: number, records_out: number) =>
  log({ event: "tool", tool, ms: Math.round(ms * 10) / 10, status, records_in, records_out }, status === "error" ? "ERROR" : "INFO");
