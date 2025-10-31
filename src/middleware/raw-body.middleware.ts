import { Request, Response, NextFunction } from "express";
import { json } from "express";


declare global {
  namespace Express {
    interface Request {
      rawBody?: string;
    }
  }
}

export function rawBodyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
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


export const jsonWithRawBody = json({
  verify: (req: any, res, buf, encoding) => {
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
