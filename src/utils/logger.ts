export const logInfo = (message: string, ...args: any[]): void => {
  console.log(`[${new Date().toISOString()}]`, message, ...args);
};

export const logError = (message: string, ...args: any[]): void => {
  console.error(`[${new Date().toISOString()}] ❌`, message, ...args);
};

export const logSuccess = (message: string, ...args: any[]): void => {
  console.log(`[${new Date().toISOString()}] ✅`, message, ...args);
};
