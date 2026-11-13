/** Serialized by Rust models::foundation. Keep protocol changes explicit. */
export interface FoundationInfo {
  protocolVersion: number;
  appName: string;
  version: string;
  platform: string;
  windowMode: 'transparent-host';
}

export interface NativeError {
  code: string;
  message: string;
  httpStatus?: number;
  providerReason?: string;
}
