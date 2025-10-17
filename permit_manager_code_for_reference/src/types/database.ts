import type {
  Permit,
  TeamMember,
  HdabAssignment,
  DataHolderAssignment,
  OutputRecord,
  PermitActivityLogRecord,
} from './models'

export type PermitWithRelations = Permit & {
  teamMembers: TeamMember[]
  hdabAssignments: HdabAssignment[]
  dataHolderAssignments: DataHolderAssignment[]
  outputs?: OutputRecord[]
}

export type ActivityLogEntry = PermitActivityLogRecord
