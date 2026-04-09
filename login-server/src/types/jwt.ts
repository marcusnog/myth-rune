export interface GameJwtPayload {
  /** User id */
  sub: string;
  /** Character id */
  cid: string;
  iat?: number;
  exp?: number;
}
