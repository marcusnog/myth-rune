export interface GameJwtPayload {
  sub: string;
  cid: string;
  iat?: number;
  exp?: number;
}
