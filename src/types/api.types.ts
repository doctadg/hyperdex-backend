export interface ApiSuccessResponse<T = any> {
  success: true;
  data?: T;
  message?: string;
}

export interface ApiErrorResponse {
  success: false;
  error: string;
  message: string;
}

export type ApiResponse<T = any> = ApiSuccessResponse<T> | ApiErrorResponse;

export interface DynamicUserData {
  id: string;
  verifiedCredentials?: any[];
  wallets?: any[];
  embeddedWallets?: any[];
  createdAt?: string;
  email?: string;
  username?: string;
  [key: string]: any;
}
