import { api } from './client'

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  access_token: string
  token_type: string
  user: {
    id: string
    name: string
    role: string
    hospital: string
    email: string
    phone?: string
    specialty?: string
    licenseNumber?: string
    department?: string
  }
}

export interface UpdateProfileRequest {
  name?: string
  phone?: string
  specialty?: string
  department?: string
}

export interface ChangePasswordRequest {
  current_password: string
  new_password: string
}

export const authService = {
  login: (data: LoginRequest) =>
    api.post<LoginResponse>('/auth/login', data),

  getMe: (token: string) =>
    api.get<LoginResponse['user']>('/auth/me', token),

  updateProfile: (data: UpdateProfileRequest, token: string) =>
    api.patch<LoginResponse['user']>('/auth/me', data, token),

  changePassword: (data: ChangePasswordRequest, token: string) =>
    api.post<void>('/auth/change-password', data, token),
}
