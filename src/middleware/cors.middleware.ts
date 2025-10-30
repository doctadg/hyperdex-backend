/**
 * CORS Middleware
 * - Configures Cross-Origin Resource Sharing
 */

import cors from "cors";
import { config } from "../config/env.config";

export const corsMiddleware = cors({
  origin: config.frontendUrl,
  credentials: true,
});
