import { Injectable, Scope } from "@nestjs/common";
import { Resource, ResourceTemplate } from "@rekog/mcp-nest";
import * as os from "os";

@Injectable({ scope: Scope.REQUEST })
export class SystemInfoResource {
  @Resource({
    name: "system-info",
    description: "Current system information and environment",
    mimeType: "application/json",
    uri: "system://info",
  })
  getSystemInfo({ uri }: { uri: string }) {
    const systemInfo = {
      platform: os.platform(),
      release: os.release(),
      type: os.type(),
      arch: os.arch(),
      cpus: os.cpus().length,
      totalMemory: `${Math.round(os.totalmem() / (1024 * 1024 * 1024))} GB`,
      freeMemory: `${Math.round(os.freemem() / (1024 * 1024 * 1024))} GB`,
      uptime: `${Math.round(os.uptime() / 3600)} hours`,
      hostname: os.hostname(),
      nodeVersion: process.version,
      env: {
        NODE_ENV: process.env.NODE_ENV || "development",
      },
    };

    return {
      contents: [
        {
          uri: uri,
          mimeType: "application/json",
          text: JSON.stringify(systemInfo, null, 2),
        },
      ],
    };
  }

  /**
   * Allowlist of safe environment variables that can be exposed.
   * Security: Never expose variables containing secrets, tokens, or keys.
   */
  private static readonly ALLOWED_ENV_VARS = new Set([
    "NODE_ENV",
    "LOG_LEVEL",
    "ANKI_CONNECT_URL",
    "ANKI_CONNECT_API_VERSION",
    "ANKI_CONNECT_TIMEOUT",
    "HOST",
    "PORT",
    "ALLOWED_ORIGINS",
  ]);

  /**
   * Patterns that indicate sensitive variables (case-insensitive).
   * Used as a safety net even if a variable somehow gets into the allowlist.
   */
  private static readonly SENSITIVE_PATTERNS = [
    /key/i,
    /secret/i,
    /token/i,
    /password/i,
    /credential/i,
    /auth/i,
    /private/i,
  ];

  @ResourceTemplate({
    name: "environment-variable",
    description:
      "Get a specific environment variable. Only safe configuration variables are accessible (NODE_ENV, LOG_LEVEL, ANKI_CONNECT_URL, etc.). Sensitive variables containing keys, secrets, or tokens are blocked.",
    mimeType: "text/plain",
    uriTemplate: "env://{name}",
  })
  getEnvironmentVariable({ uri, name }: { uri: string; name: string }) {
    const upperName = name.toUpperCase();

    // Check if variable is in allowlist
    if (!SystemInfoResource.ALLOWED_ENV_VARS.has(upperName)) {
      return {
        contents: [
          {
            uri: uri,
            mimeType: "text/plain",
            text: `Access denied: '${name}' is not in the allowed environment variables list. Allowed: ${Array.from(SystemInfoResource.ALLOWED_ENV_VARS).join(", ")}`,
          },
        ],
      };
    }

    // Safety net: block any variable that looks sensitive (even if allowlisted)
    if (
      SystemInfoResource.SENSITIVE_PATTERNS.some((pattern) =>
        pattern.test(upperName),
      )
    ) {
      return {
        contents: [
          {
            uri: uri,
            mimeType: "text/plain",
            text: `Access denied: '${name}' appears to contain sensitive data`,
          },
        ],
      };
    }

    const value = process.env[upperName];

    return {
      contents: [
        {
          uri: uri,
          mimeType: "text/plain",
          text: value !== undefined ? value : "(not set)",
        },
      ],
    };
  }
}
