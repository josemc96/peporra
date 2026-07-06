import { UserRole } from '../../types/enums';

export interface AccessTokenPayload {
  sub: string;
  role: UserRole;
}

export interface RefreshTokenPayload {
  sub: string;
  tokenVersion: number;
}
