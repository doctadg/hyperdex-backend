/**
 * Logger Middleware
 * - Logs incoming HTTP requests
 */

import { Request, Response, NextFunction } from "express";
import { logInfo } from "../utils/logger";

export const loggerMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  logInfo(`${req.method} ${req.path}`);
  next();
};
