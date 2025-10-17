import {
  HDAB_DATA_PREPARATOR_ROLE,
  HDAB_DATA_REVIEWER_ROLE,
  HDAB_EGRESS_REVIEWER_ROLE,
  HDAB_PERMIT_MANAGER_ROLE,
  HDAB_SETUP_ENGINEER_ROLE,
  HDAB_SETUP_REVIEWER_ROLE,
  HDAB_STAFF_ROLE,
  DATA_HOLDER_ROLE,
  DATA_HOLDER_GLOBAL_ROLE,
  PROJECT_INVESTIGATOR_ROLE,
  PROJECT_MEMBER_ROLE,
  PROJECT_ANONYMOUS_REVIEWER_ROLE,
} from '../utils/roles.js'

export const mockUsers = [
  {
    id: 'user-hdab-manager',
    email: 'manager@spe.test',
    password: 'Password123!',
    roles: [HDAB_PERMIT_MANAGER_ROLE],
    fullName: 'Morgan Manager',
    organization: 'Health Data Agency',
  },
  {
    id: 'user-hdab-prep',
    email: 'preparator@spe.test',
    password: 'Password123!',
    roles: [HDAB_STAFF_ROLE],
    fullName: 'Harriet Data',
    organization: 'Health Data Agency',
  },
  {
    id: 'user-hdab-review',
    email: 'reviewer@spe.test',
    password: 'Password123!',
    roles: [HDAB_STAFF_ROLE],
    fullName: 'Rina Reviewer',
    organization: 'Health Data Agency',
  },
  {
    id: 'user-hdab-setup',
    email: 'setup@spe.test',
    password: 'Password123!',
    roles: [HDAB_STAFF_ROLE],
    fullName: 'Sam Setup',
    organization: 'Health Data Agency',
  },
  {
    id: 'user-hdab-egress',
    email: 'egress@spe.test',
    password: 'Password123!',
    roles: [HDAB_STAFF_ROLE],
    fullName: 'Evan Egress',
    organization: 'Health Data Agency',
  },
  {
    id: 'user-dataholder',
    email: 'holder@source.test',
    password: 'Password123!',
    roles: [DATA_HOLDER_GLOBAL_ROLE],
    fullName: 'Dana Holder',
    organization: 'Data Source Inc.',
  },
  {
    id: 'user-researcher',
    email: 'researcher@spe.test',
    password: 'Password123!',
    roles: ['HEALTH_DATA_USER'],
    fullName: 'Ravi Researcher',
    organization: 'University of Nimbus',
  },
  {
    id: 'user-anon-reviewer',
    email: 'taylor.grey@spe.test',
    password: 'Password123!',
    roles: ['HEALTH_DATA_USER'],
    fullName: 'Taylor Grey',
    organization: 'Independent Peer Network',
  },
  {
    id: 'user-superadmin',
    email: 'superadmin@spe.test',
    password: 'Password123!',
    roles: ['SPE_SUPERADMIN'],
    fullName: 'Quentin Admin',
    organization: 'Health Data Agency - IT',
  },
]

export const mockPermits = [
  {
    id: 'permit-000',
    reference: 'SPE-2025-000',
    projectTitle: 'New Cardiology Study',
    principalInvestigator: 'Dr. Jamie Xu',
    dataset: 'Cardiology Outcomes Pilot Dataset',
    status: 'AWAITING_INGRESS',
    createdAt: '2025-01-18T10:00:00.000Z',
    updatedAt: '2025-01-19T14:45:00.000Z',
    description:
      'Initial coordination to receive source system extracts for the secure preparation environment.',
    assignedHdabTeam: [
      {
        userId: 'user-hdab-prep',
        permitRoles: [HDAB_DATA_PREPARATOR_ROLE],
      },
    ],
    team: [
      {
        id: 'team-00',
        name: 'Dr. Jamie Xu',
        role: PROJECT_INVESTIGATOR_ROLE,
        organization: 'Health Research Council',
        email: 'jamie.xu@spe.test',
      },
    ],
    dataHolders: [
      {
        id: 'dh-01',
        userId: 'user-dataholder',
        role: DATA_HOLDER_ROLE,
        name: 'Dana Holder',
        organization: 'Data Source Inc.',
        email: 'holder@source.test',
      },
    ],
  },
  {
    id: 'permit-001',
    reference: 'SPE-2024-001',
    projectTitle: 'Diabetes Outcomes in Urban Populations',
    principalInvestigator: 'Dr. Maya Chen',
    dataset: 'National Diabetes Registry',
    status: 'DATA_PREPARATION_PENDING',
    createdAt: '2024-09-12T08:00:00.000Z',
    updatedAt: '2024-10-12T09:30:00.000Z',
    description:
      'A mixed methods study analysing clinical outcomes from the national diabetes registry to identify inequities in care.',
    assignedHdabTeam: [
      {
        userId: 'user-hdab-prep',
        permitRoles: [HDAB_DATA_PREPARATOR_ROLE],
      },
      {
        userId: 'user-hdab-review',
        permitRoles: [HDAB_DATA_REVIEWER_ROLE],
      },
    ],
    team: [
      {
        id: 'team-01',
        name: 'Dr. Maya Chen',
        role: PROJECT_INVESTIGATOR_ROLE,
        organization: 'Health Research Council',
        email: 'maya.chen@spe.test',
      },
      {
        id: 'team-02',
        name: 'Alex Noble',
        role: PROJECT_MEMBER_ROLE,
        organization: 'Health Research Council',
        email: 'alex.noble@spe.test',
      },
    ],
    dataHolders: [],
  },
  {
    id: 'permit-002',
    reference: 'SPE-2024-002',
    projectTitle: 'Cardiovascular Risk in Rural Regions',
    principalInvestigator: 'Prof. Elise Dubois',
    dataset: 'Cardiac Outcomes Dataset',
    status: 'ANALYSIS_ACTIVE',
    createdAt: '2024-08-20T08:00:00.000Z',
    updatedAt: '2024-10-01T11:00:00.000Z',
    description:
      'Longitudinal analysis of cardiovascular risk factors in rural regions compared with metropolitan populations.',
    assignedHdabTeam: [
      {
        userId: 'user-hdab-setup',
        permitRoles: [HDAB_SETUP_ENGINEER_ROLE],
      },
      {
        userId: 'user-hdab-review',
        permitRoles: [HDAB_SETUP_REVIEWER_ROLE],
      },
      {
        userId: 'user-hdab-egress',
        permitRoles: [HDAB_EGRESS_REVIEWER_ROLE, HDAB_DATA_REVIEWER_ROLE],
      },
    ],
    team: [
      {
        id: 'team-03',
        name: 'Prof. Elise Dubois',
        role: PROJECT_INVESTIGATOR_ROLE,
        organization: 'Université de la Santé',
        email: 'elise.dubois@spe.test',
      },
      {
        id: 'team-04',
        name: 'Ravi Researcher',
        role: PROJECT_MEMBER_ROLE,
        organization: 'University of Nimbus',
        email: 'researcher@spe.test',
        userId: 'user-researcher',
      },
      {
        id: 'team-05',
        name: 'Sana Patel',
        role: PROJECT_MEMBER_ROLE,
        organization: 'University of Nimbus',
        email: 'sana.patel@spe.test',
      },
      {
        id: 'team-06',
        name: 'Taylor Grey',
        role: PROJECT_ANONYMOUS_REVIEWER_ROLE,
        organization: 'Independent Peer Network',
        email: 'taylor.grey@spe.test',
        userId: 'user-anon-reviewer',
      },
    ],
    dataHolders: [],
  },
]

export const workspaceState = {
  'permit-000': {
    status: 'STOPPED',
    connection: null,
  },
  'permit-001': {
    status: 'STOPPED',
    connection: null,
  },
  'permit-002': {
    status: 'RUNNING',
    connection: {
      protocol: 'ssh',
      host: 'workspace.spe.test',
      port: 4822,
      tunnelId: 'tun-002',
    },
  },
}

export const mockOutputs = [
  {
    id: 'output-001',
    permitId: 'permit-002',
    folderPath: '/analysis/outputs/summary-report',
    description: 'Summary report exported for steering group.',
    status: 'EGRESS_APPROVED',
    submittedAt: '2024-10-05T10:15:00.000Z',
    reviewedAt: '2024-10-06T09:00:00.000Z',
  },
  {
    id: 'output-002',
    permitId: 'permit-002',
    folderPath: '/analysis/outputs/draft-tables',
    description: 'Draft tables prepared for quality assurance review.',
    status: 'EGRESS_REVIEW_PENDING',
    submittedAt: '2024-10-10T13:45:00.000Z',
    reviewedAt: null,
  },
]

export const permitActivityLogs = mockPermits.reduce((accumulator, permit) => {
  return { ...accumulator, [permit.id]: [] }
}, {})
