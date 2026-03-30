export const ROLES = {
  ADMIN: 'ADMIN',
  STEERING: 'STEERING',
  PI: 'PI',
  CRC: 'CRC',
  AUDITOR: 'AUDITOR',
} as const

export type Role = (typeof ROLES)[keyof typeof ROLES]

export const CASE_STATUS = {
  DRAFT: 'DRAFT',
  ACTIVE: 'ACTIVE',
  LOCKED: 'LOCKED',
  CLOSED: 'CLOSED',
  ARCHIVED: 'ARCHIVED',
} as const

export const PROM_STATUS = {
  READY: 'READY',
  SENT: 'SENT',
  OPENED: 'OPENED',
  VERIFIED: 'VERIFIED',
  SUBMITTED: 'SUBMITTED',
  EXPIRED: 'EXPIRED',
} as const
