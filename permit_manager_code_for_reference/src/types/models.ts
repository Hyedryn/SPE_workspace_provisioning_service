export interface Permit {
  id: string
  reference: string
  projectTitle: string
  principalInvestigator?: string | null
  dataset?: string | null
  status: string
  description?: string | null
  createdAt: Date
  updatedAt: Date
}

export interface TeamMember {
  id: string
  permitId: string
  userId: string | null
  name: string | null
  email: string | null
  organization: string | null
  role: string
}

export interface HdabAssignment {
  id: number
  permitId: string
  userId: string
  permitRole: string
}

export interface DataHolderAssignment {
  id: string
  permitId: string
  userId: string
  name: string | null
  email: string | null
  organization: string | null
}

export interface OutputRecord {
  id: string
  permitId: string
  folderPath: string
  description: string | null
  status: string
  submittedAt: Date
  reviewedAt: Date | null
  reviewerComments: string | null
  reviewedByUserId: string | null
}

export interface PermitActivityLogRecord {
  id: string
  permitId: string
  type: string
  description: string | null
  actorUserId: string | null
  actorName: string | null
  actorEmail: string | null
  targetUser: unknown
  metadata: unknown
  createdAt: Date
}
