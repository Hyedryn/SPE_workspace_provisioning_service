export type UserRole =
  | 'SPE_SUPERADMIN'
  | 'HDAB_STAFF'
  | 'HDAB_PERMIT_MANAGER'
  | 'HDAB_DATA_PREPARATOR'
  | 'HDAB_DATA_REVIEWER'
  | 'HDAB_SETUP_ENGINEER'
  | 'HDAB_SETUP_REVIEWER'
  | 'HDAB_EGRESS_REVIEWER'
  | 'DATA_HOLDER'
  | 'DATA_HOLDER_USER'
  | 'PROJECT_INVESTIGATOR'
  | 'PROJECT_MEMBER'
  | 'PROJECT_ANONYMOUS_REVIEWER'
  | string

export interface AuthenticatedUser {
  id: string
  email: string
  fullName?: string
  organization?: string
  roles: UserRole[]
}

export interface ViewerContext {
  viewerRole: string | null
  viewerId: string | null
  viewerHasHdabVisibility: boolean
  viewerIsAnonymousReviewer: boolean
  viewerIsProjectTeam: boolean
}
