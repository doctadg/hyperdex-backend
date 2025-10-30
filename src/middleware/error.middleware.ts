/**
 * Error Handling Middleware
 * - Global error handler
 * - 404 handler for unknown routes
 */

import { Request, Response, NextFunction } from "express";
import { logError } from "../utils/logger";

export const errorHandler = (
  err: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  logError("Unhandled error:", err);
  res.status(500).json({
    success: false,
    error: "Internal server error",
    message: err.message,
  });
};

export const notFoundHandler = (req: Request, res: Response): void => {
  res.status(404).json({
    success: false,
    error: "Not found",
    message: `Route ${req.method} ${req.path} not found`,
  });
};
