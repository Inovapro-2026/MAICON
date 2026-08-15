export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: 'ADMIN';
  must_change_password: boolean;
}

export interface AuthSession {
  token: string;
  user: AuthUser;
  expires_at: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  success: boolean;
  token: string;
  user: AuthUser;
  must_change_password: boolean;
}

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}
