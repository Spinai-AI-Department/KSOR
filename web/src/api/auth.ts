import { api } from './client'

export interface LoginRequest {
  login_id: string
  password: string
}

export interface BackendUserInfo {
  user_id: string
  name: string
  hospital_code: string | null
  role: string
}

export interface BackendLoginResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  require_password_change: boolean
  session_id: string
  user_info: BackendUserInfo
}

export interface BackendMyProfile {
  user_id: string
  login_id: string
  name: string
  hospital_code: string | null
  role: string
  email: string | null
  phone: string | null
  department: string | null
  specialty: string | null
  license_number: string | null
  is_first_login: boolean
  last_login_at: string | null
}

export interface User {
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

export interface LoginResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  user: User
}

function mapUserInfo(info: BackendUserInfo): User {
  return {
    id: info.user_id,
    name: info.name,
    role: info.role,
    hospital: info.hospital_code ?? '',
    email: '',
  }
}

function mapProfile(profile: BackendMyProfile): User {
  return {
    id: profile.user_id,
    name: profile.name,
    role: profile.role,
    hospital: profile.hospital_code ?? '',
    email: profile.email ?? profile.login_id,
    phone: profile.phone ?? undefined,
    department: profile.department ?? undefined,
    specialty: profile.specialty ?? undefined,
    licenseNumber: profile.license_number ?? undefined,
  }
}

export interface UpdateProfileRequest {
  email?: string
  phone?: string
}

export interface ChangePasswordRequest {
  current_password: string
  new_password: string
  new_password_confirm: string
}

export const authService = {
  login: async (data: LoginRequest): Promise<LoginResponse> => {
    const res = await api.post<BackendLoginResponse>('/auth/login', data)
    return {
      access_token: res.access_token,
      refresh_token: res.refresh_token,
      expires_in: res.expires_in,
      user: mapUserInfo(res.user_info),
    }
  },

  getMe: async (token: string): Promise<User> => {
    const profile = await api.get<BackendMyProfile>('/auth/me', token)
    return mapProfile(profile)
  },

  updateProfile: (data: UpdateProfileRequest, token: string) =>
    api.put<void>('/auth/me/info', data, token),

  changePassword: (data: ChangePasswordRequest, token: string) =>
    api.put<void>('/auth/password', data, token),

  refresh: (refreshToken: string) =>
    api.post<{ access_token: string; refresh_token: string; expires_in: number }>('/auth/refresh', { refresh_token: refreshToken }),

  logout: (token: string) =>
    api.post<void>('/auth/logout', {}, token),
}
