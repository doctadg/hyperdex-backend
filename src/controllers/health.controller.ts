import { Request, Response } from 'express';
import { config } from '../config/env.config';

export const getHealth = (req: Request, res: Response): void => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.dynamicEnvId
  });
};
