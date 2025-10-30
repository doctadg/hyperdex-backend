import { Request, Response, NextFunction } from "express";
import { json } from "express";

/**
 * Raw Body Middleware
 *
 * Captures the raw request body before JSON parsing for webhook signature verification.
 * This is necessary because Dynamic webhooks sign the raw body, but Express parses it.
 */

declare global {
  namespace Express {
    interface Request {
      rawBody?: string;
    }
  }
}

/**
 * Middleware to capture raw body for specific routes
 * Used for webhook signature verification
 */
export function rawBodyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Only capture raw body for webhook routes
  if (req.url.includes("/webhooks")) {
    let data = "";

    req.on("data", (chunk) => {
      data += chunk.toString();
    });

    req.on("end", () => {
      req.rawBody = data;

      console.log("[RawBody] Captured raw body for webhook:", {
        url: req.url,
        length: data.length,
        preview: data.substring(0, 100),
      });

      // Parse JSON manually since we captured the raw body
      try {
        req.body = JSON.parse(data);
      } catch (error) {
        console.error("[RawBody] Failed to parse JSON:", error);
      }

      next();
    });
  } else {
    next();
  }
}

/**
 * Alternative: Use express.json() with verify option
 * This is more elegant but requires replacing the standard json middleware
 */
export const jsonWithRawBody = json({
  verify: (req: any, res, buf, encoding) => {
    // Store raw body for webhook routes
    // Use originalUrl or url instead of path (path is not available here)
    const url = req.originalUrl || req.url || "";

    if (url.includes("/webhooks")) {
      req.rawBody = buf.toString((encoding as BufferEncoding) || "utf8");
      console.log("[RawBody] Captured raw body for webhook:", {
        url: url,
        length: req.rawBody.length,
        preview: req.rawBody.substring(0, 100),
      });
    }
  },
});
