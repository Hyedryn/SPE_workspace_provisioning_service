import { http, HttpResponse, delay } from 'msw'
import {
  mockUsers,
  mockPermits,
  workspaceState,
  mockOutputs,
  permitActivityLogs,
} from './data.js'
import {
  HDAB_EGRESS_REVIEWER_ROLE,
  HDAB_PERMIT_MANAGER_ROLE,
  HDAB_PERMIT_ROLES,
  HDAB_SETUP_ENGINEER_ROLE,
  HDAB_STAFF_ROLE,
  PROJECT_CONTRIBUTOR_ROLES,
  PROJECT_INVESTIGATOR_ROLE,
  PROJECT_MEMBER_ROLE,
  PROJECT_ANONYMOUS_REVIEWER_ROLE,
  SUPERADMIN_ROLE,
  getHdabPermitRoleLabel,
  DATA_HOLDER_ROLE,
  DATA_HOLDER_GLOBAL_ROLE,
} from '../utils/roles.js'

const tokenStore = new Map()
let activeToken = null
const SESSION_COOKIE_NAME = 'spe_session'

const normalizeEmail = (value) => value?.trim().toLowerCase()

const userHasRole = (user, role) => user?.roles?.includes(role)

const isSuperAdmin = (user) => userHasRole(user, SUPERADMIN_ROLE)

const isHdabPermitManager = (user) =>
  isSuperAdmin(user) || userHasRole(user, HDAB_PERMIT_MANAGER_ROLE)

const isGlobalHdabStaff = (user) =>
  isHdabPermitManager(user) || userHasRole(user, HDAB_STAFF_ROLE)

const getPermitTeamMember = (permit, user) => {
  if (!permit || !user) {
    return null
  }

  const userEmail = normalizeEmail(user.email)
  return (
    permit.team?.find((member) => {
      if (!member) {
        return false
      }

      if (member.userId && member.userId === user.id) {
        return true
      }

      const memberEmail = normalizeEmail(member.email)
      return Boolean(memberEmail) && memberEmail === userEmail
    }) ?? null
  )
}

const getTeamMemberIdentifier = (member) => {
  if (!member) {
    return null
  }

  return (
    member.userId ??
    member.id ??
    (typeof member.email === 'string' ? normalizeEmail(member.email) : null)
  )
}

const getPermitTeamHistory = (permit) => {
  if (!permit) {
    return []
  }

  if (!Array.isArray(permit.teamHistory)) {
    permit.teamHistory = []
  }

  permit.teamHistory = permit.teamHistory.filter(Boolean)
  return permit.teamHistory
}

const recordTeamHistoryEntry = (permit, member) => {
  if (!permit || !member) {
    return
  }

  const history = getPermitTeamHistory(permit)
  const identifier = getTeamMemberIdentifier(member)

  if (!identifier) {
    return
  }

  const existingIndex = history.findIndex((entry) => {
    const entryIdentifier = getTeamMemberIdentifier(entry)
    return entryIdentifier && entryIdentifier === identifier
  })

  if (existingIndex === -1) {
    history.push({ ...member })
    return
  }

  history[existingIndex] = { ...history[existingIndex], ...member }
}

const getPermitRole = (permit, user) => getPermitTeamMember(permit, user)?.role ?? null

const isTeamMember = (permit, user) => Boolean(getPermitRole(permit, user))

const isPermitContributor = (permit, user) =>
  PROJECT_CONTRIBUTOR_ROLES.includes(getPermitRole(permit, user))

const isPermitInvestigator = (permit, user) =>
  getPermitRole(permit, user) === PROJECT_INVESTIGATOR_ROLE

const generateTeamMemberId = () =>
  `team-${Math.random().toString(36).slice(2, 10)}`

const generateDataHolderId = () =>
  `holder-${Math.random().toString(36).slice(2, 10)}`

const sanitizeUser = (user) => {
  const { password: _password, ...safeUser } = user
  return safeUser
}

const hasGlobalDataHolderRole = (user) =>
  userHasRole(user, DATA_HOLDER_GLOBAL_ROLE)

const createLogId = () => `log-${Math.random().toString(36).slice(2, 10)}`

const getPermitActivityLog = (permitId) => {
  if (!permitId) {
    return null
  }

  if (!Array.isArray(permitActivityLogs[permitId])) {
    permitActivityLogs[permitId] = []
  }

  return permitActivityLogs[permitId]
}

const recordAction = ({
  actor,
  type,
  description,
  permit,
  targetUser,
  metadata,
}) => {
  const permitId = permit?.id
  const permitLog = getPermitActivityLog(permitId)

  if (!permitId || !permitLog) {
    return null
  }

  const entry = {
    id: createLogId(),
    timestamp: new Date().toISOString(),
    type,
    description,
    actor: actor
      ? {
          id: actor.id,
          name: actor.fullName,
          email: actor.email,
          roles: [...actor.roles],
        }
      : null,
    permit: {
      id: permit.id,
      reference: permit.reference,
      projectTitle: permit.projectTitle,
    },
    targetUser: targetUser
      ? {
          id: targetUser.id ?? targetUser.email ?? targetUser.name,
          name: targetUser.fullName ?? targetUser.name ?? targetUser.email ?? 'User',
          email: targetUser.email ?? null,
        }
      : null,
    metadata: metadata ?? {},
  }

  permitLog.unshift(entry)
  if (permitLog.length > 200) {
    permitLog.length = 200
  }

  return entry
}

const normalizePermitRoles = (assignment) => {
  if (!assignment) {
    return []
  }

  if (Array.isArray(assignment.permitRoles)) {
    return [...new Set(assignment.permitRoles.filter(Boolean))]
  }

  if (assignment.permitRole) {
    return [assignment.permitRole]
  }

  return []
}

const getHdabAssignments = (permit) => {
  if (!permit) {
    return []
  }

  if (!Array.isArray(permit.assignedHdabTeam)) {
    permit.assignedHdabTeam = []
    return permit.assignedHdabTeam
  }

  permit.assignedHdabTeam = permit.assignedHdabTeam
    .map((assignment) => {
      if (!assignment?.userId) {
        return null
      }

      const permitRoles = normalizePermitRoles(assignment)

      if (permitRoles.length === 0) {
        return null
      }

      return {
        userId: assignment.userId,
        permitRoles,
      }
    })
    .filter(Boolean)

  return permit.assignedHdabTeam
}

const getHdabRolesForUser = (permit, user) =>
  getHdabAssignments(permit)
    .filter((assignment) => assignment?.userId === user?.id)
    .flatMap((assignment) => assignment?.permitRoles ?? [])
    .filter(Boolean)

const getDataHolderAssignments = (permit) =>
  Array.isArray(permit?.dataHolders) ? permit.dataHolders : []

const getDataHolderForUser = (permit, user) => {
  if (!permit || !user) {
    return null
  }

  const userEmail = normalizeEmail(user.email)

  return (
    getDataHolderAssignments(permit).find((holder) => {
      if (!holder) {
        return false
      }

      if (holder.userId && holder.userId === user.id) {
        return true
      }

      if (!userEmail) {
        return false
      }

      const holderEmail = normalizeEmail(holder.email)
      return Boolean(holderEmail) && holderEmail === userEmail
    }) ?? null
  )
}

const isDataHolderForPermit = (permit, user) => {
  if (!user) {
    return false
  }

  if (!hasGlobalDataHolderRole(user) && !isSuperAdmin(user)) {
    return false
  }

  return Boolean(getDataHolderForUser(permit, user))
}

const hdabHasPermitAccess = (permit, user) => {
  if (!permit || !user) {
    return false
  }

  if (isSuperAdmin(user) || isHdabPermitManager(user)) {
    return true
  }

  if (!isGlobalHdabStaff(user)) {
    return false
  }

  return getHdabRolesForUser(permit, user).length > 0
}

const userHasPermitAccess = (permit, user) => {
  if (!permit || !user) {
    return false
  }
  if (isSuperAdmin(user)) {
    return true
  }
  if (hdabHasPermitAccess(permit, user)) {
    return true
  }
  if (isTeamMember(permit, user)) {
    return true
  }
  return isDataHolderForPermit(permit, user)
}

const getTokenFromCookies = (request) => {
  const requestCookies = request.cookies ?? {}
  if (requestCookies[SESSION_COOKIE_NAME]) {
    return requestCookies[SESSION_COOKIE_NAME]
  }

  const cookieHeader = request.headers.get('cookie') ?? ''
  if (!cookieHeader) {
    return null
  }

  const cookies = cookieHeader.split(';')
  for (const rawCookie of cookies) {
    const [name, ...valueParts] = rawCookie.trim().split('=')
    if (!name) {
      continue
    }
    if (name === SESSION_COOKIE_NAME) {
      return valueParts.join('=') || null
    }
  }

  return null
}

const getTokenFromRequest = (request) => {
  const header = request.headers.get('Authorization') ?? ''
  const [, bearerToken] = header.split(' ')

  return bearerToken || getTokenFromCookies(request)
}

const authenticate = (request) => {
  let token = getTokenFromRequest(request)

  if (!token) {
    token = activeToken
  }

  if (!token || !tokenStore.has(token)) {
    return null
  }

  return tokenStore.get(token)
}

const summarizeOutputs = (permitId) => {
  const outputs = mockOutputs
    .filter((output) => output.permitId === permitId)
    .sort(
      (a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime(),
    )

  const summary = outputs.reduce(
    (accumulator, output) => {
      if (output.status === 'EGRESS_REVIEW_PENDING') {
        accumulator.pending += 1
      } else if (output.status === 'EGRESS_REWORK') {
        accumulator.changesRequested += 1
      } else if (output.status === 'EGRESS_APPROVED') {
        accumulator.approved += 1
      }
      return accumulator
    },
    { total: outputs.length, pending: 0, changesRequested: 0, approved: 0 },
  )

  if (outputs.length > 0) {
    summary.latestSubmittedAt = outputs[0].submittedAt
    summary.latestStatus = outputs[0].status
    summary.latestFolderPath = outputs[0].folderPath
  }

  summary.needsAttention = summary.pending + summary.changesRequested

  return { outputs, summary }
}

const buildHdabTeamResponse = (permit) =>
  getHdabAssignments(permit)
    .map((assignment) => {
      if (!assignment?.userId) {
        return null
      }

      const permitRoles = normalizePermitRoles(assignment)

      if (permitRoles.length === 0) {
        return null
      }

      const staff = mockUsers.find((candidate) => candidate.id === assignment.userId)
      const safeUser = staff ? sanitizeUser(staff) : null

      return {
        userId: assignment.userId,
        permitRoles,
        user: safeUser,
      }
    })
    .filter(Boolean)

const buildDataHolderResponse = (permit) =>
  getDataHolderAssignments(permit)
    .map((holder) => {
      if (!holder) {
        return null
      }

      const user = holder.userId
        ? mockUsers.find((candidate) => candidate.id === holder.userId)
        : null

      return {
        ...holder,
        user: user ? sanitizeUser(user) : null,
      }
    })
    .filter(Boolean)

const withEgressSummary = (permit) => {
  const { summary } = summarizeOutputs(permit.id)
  return {
    ...permit,
    assignedHdabTeam: buildHdabTeamResponse(permit),
    dataHolders: buildDataHolderResponse(permit),
    egressSummary: summary,
  }
}

const isAnonymousReviewerRole = (role) => role === PROJECT_ANONYMOUS_REVIEWER_ROLE

const createViewerContext = (permit, user) => {
  const viewerRole = getPermitRole(permit, user)
  return {
    viewerRole,
    viewerId: user?.id ?? null,
    viewerHasHdabVisibility: hdabHasPermitAccess(permit, user),
    viewerIsAnonymousReviewer: isAnonymousReviewerRole(viewerRole),
    viewerIsProjectTeam: Boolean(viewerRole),
  }
}

const sanitizeTeamMemberForViewer = (member, context) => {
  if (!member) {
    return member
  }

  const sanitizedMember = { ...member }
  const {
    viewerId,
    viewerHasHdabVisibility,
    viewerIsAnonymousReviewer,
    viewerIsProjectTeam,
  } = context

  if (viewerHasHdabVisibility) {
    return sanitizedMember
  }

  const isViewer = sanitizedMember.userId && sanitizedMember.userId === viewerId
  const isPrincipalInvestigator =
    sanitizedMember.role === PROJECT_INVESTIGATOR_ROLE
  const isProjectMember = sanitizedMember.role === PROJECT_MEMBER_ROLE
  const isAnonymousReviewerMember = isAnonymousReviewerRole(sanitizedMember.role)

  if (viewerIsAnonymousReviewer) {
    const shouldRedactContributor =
      (isPrincipalInvestigator || isProjectMember) && !isViewer

    if (shouldRedactContributor) {
      sanitizedMember.name = isPrincipalInvestigator
        ? 'Redacted Principal Investigator'
        : 'Redacted Project Member'
      sanitizedMember.organization = null
      sanitizedMember.email = null
      return sanitizedMember
    }

    if (isAnonymousReviewerMember && !isViewer) {
      sanitizedMember.name = 'Anonymous Reviewer'
      sanitizedMember.organization = null
      sanitizedMember.email = null
      return sanitizedMember
    }
  }

  if (viewerIsProjectTeam && !viewerIsAnonymousReviewer) {
    if (isAnonymousReviewerMember && !isViewer) {
      sanitizedMember.name = 'Anonymous Reviewer'
      sanitizedMember.organization = null
      sanitizedMember.email = null
    }
  }

  return sanitizedMember
}

const findPermitTeamMemberMatch = (permit, candidate) => {
  if (!permit || !candidate) {
    return null
  }

  const candidateId = candidate.id ?? candidate.userId ?? null
  const candidateEmail = normalizeEmail(candidate.email)

  if (Array.isArray(permit.team)) {
    permit.team.forEach((member) => recordTeamHistoryEntry(permit, member))
  }

  const history = getPermitTeamHistory(permit)

  if (!Array.isArray(permit.team) && history.length === 0) {
    return null
  }

  return (
    [...(Array.isArray(permit.team) ? permit.team : []), ...history].find((member) => {
      if (!member) {
        return false
      }

      if (member.userId && candidateId && member.userId === candidateId) {
        return true
      }

      if (member.id && candidateId && member.id === candidateId) {
        return true
      }

      if (!candidateEmail) {
        return false
      }

      const memberEmail = normalizeEmail(member.email)
      return Boolean(memberEmail) && memberEmail === candidateEmail
    }) ?? null
  )
}

const sanitizeLogPersonForViewer = (person, permit, context) => {
  if (!person || context.viewerHasHdabVisibility) {
    return person
  }

  const teamMember = findPermitTeamMemberMatch(permit, person)

  if (!teamMember) {
    return person
  }

  if (teamMember.userId && teamMember.userId === context.viewerId) {
    return person
  }

  const sanitizedMember = sanitizeTeamMemberForViewer(teamMember, context)

  if (
    sanitizedMember.name === teamMember.name &&
    sanitizedMember.email === teamMember.email &&
    sanitizedMember.organization === teamMember.organization
  ) {
    return person
  }

  return {
    ...person,
    name: sanitizedMember.name ?? person.name ?? null,
    email: sanitizedMember.email ?? null,
    ...(person.organization !== undefined
      ? { organization: sanitizedMember.organization ?? null }
      : {}),
  }
}

const applyDoubleBlindRedaction = (permit, user) => {
  if (!permit) {
    return permit
  }

  const context = createViewerContext(permit, user)
  const redactedPermit = { ...permit }

  if (
    context.viewerIsAnonymousReviewer &&
    !context.viewerHasHdabVisibility &&
    permit.principalInvestigator
  ) {
    redactedPermit.principalInvestigator = 'Redacted Principal Investigator'
  }

  if (Array.isArray(permit.team)) {
    redactedPermit.team = permit.team.map((member) =>
      sanitizeTeamMemberForViewer(member, context),
    )
  }

  return redactedPermit
}

const buildPermitResponse = (permit, user) => {
  if (!permit) {
    return null
  }

  const permitWithSummary = withEgressSummary(permit)
  return applyDoubleBlindRedaction(permitWithSummary, user)
}

export const handlers = [
  http.post('/api/auth/login', async ({ request }) => {
    const body = await request.json()
    const user = mockUsers.find(
      (candidate) =>
        candidate.email === body.email &&
        candidate.password === body.password,
    )

    await delay(400)

    if (!user) {
      return HttpResponse.json(
        { message: 'Invalid credentials.' },
        { status: 401 },
      )
    }

    const accessToken = `mock-token-${user.id}`
    tokenStore.set(accessToken, user)
    activeToken = accessToken

    return HttpResponse.json(
      {
        user: sanitizeUser(user),
      },
      {
        headers: {
          'Set-Cookie': `${SESSION_COOKIE_NAME}=${accessToken}; Path=/; SameSite=Lax`,
        },
      },
    )
  }),

  http.post('/api/auth/logout', async ({ request }) => {
    const token = getTokenFromRequest(request)

    if (token) {
      tokenStore.delete(token)
      if (activeToken === token) {
        activeToken = null
      }
    }

    activeToken = null

    return HttpResponse.json(
      { success: true },
      {
        headers: {
          'Set-Cookie': `${SESSION_COOKIE_NAME}=; Path=/; SameSite=Lax; Max-Age=0`,
        },
      },
    )
  }),

  http.get('/api/me', async ({ request }) => {
    const user = authenticate(request)
    await delay(200)
    if (!user) {
      return HttpResponse.json(
        { message: 'Unauthorized' },
        { status: 401 },
      )
    }

    return HttpResponse.json({ user: sanitizeUser(user) })
  }),

  http.get('/api/hdab/staff', async ({ request }) => {
    const user = authenticate(request)
    await delay(200)

    if (!user) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    if (!isSuperAdmin(user) && !isHdabPermitManager(user)) {
      return HttpResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    const url = new URL(request.url)
    const query = url.searchParams.get('q')?.trim().toLowerCase() ?? ''

    const staff = mockUsers.filter((candidate) =>
      candidate.roles.includes(HDAB_STAFF_ROLE),
    )

    const filtered = staff.filter((candidate) => {
      if (!query) {
        return true
      }

      const nameMatch = candidate.fullName
        ?.toLowerCase()
        .includes(query.toLowerCase())
      const emailMatch = candidate.email?.toLowerCase().includes(query)
      return Boolean(nameMatch || emailMatch)
    })

    return HttpResponse.json({
      results: filtered.slice(0, 20).map(sanitizeUser),
    })
  }),

  http.get('/api/data-holders', async ({ request }) => {
    const user = authenticate(request)
    await delay(200)

    if (!user) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    if (!isSuperAdmin(user) && !isHdabPermitManager(user)) {
      return HttpResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    const url = new URL(request.url)
    const query = url.searchParams.get('q')?.trim().toLowerCase() ?? ''

    const eligible = mockUsers.filter((candidate) =>
      hasGlobalDataHolderRole(candidate),
    )

    const filtered = eligible.filter((candidate) => {
      if (!query) {
        return true
      }

      const nameMatch = candidate.fullName
        ?.toLowerCase()
        .includes(query.toLowerCase())
      const emailMatch = candidate.email?.toLowerCase().includes(query)
      const organizationMatch = candidate.organization
        ?.toLowerCase()
        .includes(query.toLowerCase())
      return Boolean(nameMatch || emailMatch || organizationMatch)
    })

    return HttpResponse.json({
      results: filtered.slice(0, 20).map(sanitizeUser),
    })
  }),

  http.get('/api/permits', async ({ request }) => {
    const user = authenticate(request)
    await delay(300)

    if (!user) {
      return HttpResponse.json(
        { message: 'Unauthorized' },
        { status: 401 },
      )
    }

    let permits = mockPermits
    const statusFilter = new URL(request.url).searchParams.get('status')

    if (statusFilter) {
      permits = permits.filter((permit) => permit.status === statusFilter)
    }

    if (!isSuperAdmin(user)) {
      permits = permits.filter((permit) => {
        if (isHdabPermitManager(user)) {
          return true
        }

        const hdabAccess = hdabHasPermitAccess(permit, user)
        const teamAccess = isTeamMember(permit, user)
        const dataHolderAccess = isDataHolderForPermit(permit, user)

        if (isGlobalHdabStaff(user)) {
          return hdabAccess || teamAccess || dataHolderAccess
        }

        return teamAccess || dataHolderAccess
      })
    }

    return HttpResponse.json({
      permits: permits.map((permit) => buildPermitResponse(permit, user)),
    })
  }),

  http.get('/api/permits/:permitId', async ({ params, request }) => {
    const user = authenticate(request)
    await delay(200)

    if (!user) {
      return HttpResponse.json(
        { message: 'Unauthorized' },
        { status: 401 },
      )
    }

    const permit = mockPermits.find((item) => item.id === params.permitId)
    if (!permit) {
      return HttpResponse.json(
        { message: 'Permit not found' },
        { status: 404 },
      )
    }

    if (!userHasPermitAccess(permit, user)) {
      return HttpResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    return HttpResponse.json({ permit: buildPermitResponse(permit, user) })
  }),

  http.post('/api/permits/:permitId/initiate-ingress', async ({
    params,
    request,
  }) => {
    const user = authenticate(request)
    await delay(250)

    if (!user) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const permit = mockPermits.find((item) => item.id === params.permitId)

    if (!permit) {
      return HttpResponse.json(
        { message: 'Permit not found' },
        { status: 404 },
      )
    }

    if (!isHdabPermitManager(user) && !isSuperAdmin(user)) {
      return HttpResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    if (permit.status !== 'AWAITING_INGRESS') {
      return HttpResponse.json(
        { message: 'Permit is not awaiting ingress.' },
        { status: 400 },
      )
    }

    permit.status = 'INGRESS_IN_PROGRESS'
    permit.updatedAt = new Date().toISOString()

    recordAction({
      actor: user,
      type: 'INGRESS_INITIATED',
      description: 'Initiated the data ingress workflow.',
      permit,
    })

    return HttpResponse.json({
      permit: buildPermitResponse(permit, user),
      message: 'Data ingress initiated.',
    })
  }),

  http.post('/api/permits/:permitId/confirm-upload', async ({
    params,
    request,
  }) => {
    const user = authenticate(request)
    await delay(250)

    if (!user) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const permit = mockPermits.find((item) => item.id === params.permitId)

    if (!permit) {
      return HttpResponse.json(
        { message: 'Permit not found' },
        { status: 404 },
      )
    }

    const canConfirm =
      isSuperAdmin(user) ||
      isHdabPermitManager(user) ||
      isDataHolderForPermit(permit, user)

    if (!canConfirm) {
      return HttpResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    if (permit.status !== 'INGRESS_IN_PROGRESS') {
      return HttpResponse.json(
        { message: 'No ingress upload is currently in progress.' },
        { status: 400 },
      )
    }

    permit.status = 'DATA_PREPARATION_PENDING'
    permit.updatedAt = new Date().toISOString()

    recordAction({
      actor: user,
      type: 'INGRESS_CONFIRMED',
      description: 'Confirmed data ingress upload completion.',
      permit,
    })

    return HttpResponse.json({
      permit: buildPermitResponse(permit, user),
      message: 'Upload confirmed. Data preparation pending.',
    })
  }),

  http.post('/api/permits/:permitId/data-holders', async ({
    params,
    request,
  }) => {
    const user = authenticate(request)
    await delay(250)

    if (!user) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    if (!isHdabPermitManager(user) && !isSuperAdmin(user)) {
      return HttpResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    const permit = mockPermits.find((item) => item.id === params.permitId)

    if (!permit) {
      return HttpResponse.json(
        { message: 'Permit not found' },
        { status: 404 },
      )
    }

    const body = await request.json()
    const userId = body.userId?.trim()

    if (!userId) {
      return HttpResponse.json(
        { message: 'Select a registered data holder to assign.' },
        { status: 400 },
      )
    }

    const matchedUser = mockUsers.find((candidate) => candidate.id === userId)

    if (!matchedUser || !hasGlobalDataHolderRole(matchedUser)) {
      return HttpResponse.json(
        { message: 'The selected user is not eligible for data ingress.' },
        { status: 400 },
      )
    }

    const normalizedEmail = normalizeEmail(matchedUser.email)

    const existingHolder = getDataHolderAssignments(permit).find((holder) => {
      if (holder.userId && holder.userId === matchedUser.id) {
        return true
      }

      const holderEmail = normalizeEmail(holder.email)
      return Boolean(holderEmail) && holderEmail === normalizedEmail
    })

    if (existingHolder) {
      return HttpResponse.json(
        { message: 'This data holder is already assigned to the permit.' },
        { status: 400 },
      )
    }

    if (!Array.isArray(permit.dataHolders)) {
      permit.dataHolders = []
    }

    const assignment = {
      id: generateDataHolderId(),
      userId: matchedUser.id,
      role: DATA_HOLDER_ROLE,
      name: matchedUser.fullName ?? matchedUser.email,
      email: matchedUser.email,
      organization: matchedUser.organization ?? null,
    }

    permit.dataHolders.push(assignment)
    permit.updatedAt = new Date().toISOString()

    recordAction({
      actor: user,
      type: 'DATA_HOLDER_ASSIGNED',
      description: `Assigned ${assignment.name} as a data holder.`,
      permit,
      targetUser: {
        name: assignment.name,
        email: assignment.email,
      },
    })

    return HttpResponse.json({
      permit: buildPermitResponse(permit, user),
      message: `${assignment.name} added as a data holder.`,
    })
  }),

  http.delete('/api/permits/:permitId/data-holders/:holderId', async ({
    params,
    request,
  }) => {
    const user = authenticate(request)
    await delay(250)

    if (!user) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    if (!isHdabPermitManager(user) && !isSuperAdmin(user)) {
      return HttpResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    const permit = mockPermits.find((item) => item.id === params.permitId)

    if (!permit) {
      return HttpResponse.json(
        { message: 'Permit not found' },
        { status: 404 },
      )
    }

    const targetId = params.holderId
    const normalizedTarget = normalizeEmail(targetId)

    const holders = getDataHolderAssignments(permit)
    const holderIndex = holders.findIndex((holder) => {
      if (holder.userId && holder.userId === targetId) {
        return true
      }
      if (holder.id && holder.id === targetId) {
        return true
      }
      const holderEmail = normalizeEmail(holder.email)
      return Boolean(holderEmail) && holderEmail === normalizedTarget
    })

    if (holderIndex === -1) {
      return HttpResponse.json(
        { message: 'Data holder not found.' },
        { status: 404 },
      )
    }

    const [removedHolder] = permit.dataHolders.splice(holderIndex, 1)
    permit.updatedAt = new Date().toISOString()

    recordAction({
      actor: user,
      type: 'DATA_HOLDER_REMOVED',
      description: 'Removed a data holder assignment.',
      permit,
      targetUser: {
        name: removedHolder?.name ?? removedHolder?.email ?? 'Data holder',
        email: removedHolder?.email ?? null,
      },
    })

    return HttpResponse.json({
      permit: buildPermitResponse(permit, user),
      message: 'Data holder removed.',
    })
  }),

  http.post('/api/permits/:permitId/review', async ({ params, request }) => {
    const user = authenticate(request)
    await delay(300)

    if (!user) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const permit = mockPermits.find((item) => item.id === params.permitId)

    if (!permit) {
      return HttpResponse.json(
        { message: 'Permit not found' },
        { status: 404 },
      )
    }

    if (!hdabHasPermitAccess(permit, user) && !isSuperAdmin(user)) {
      return HttpResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    const assignedHdabRoles = getHdabRolesForUser(permit, user)

    if (!isSuperAdmin(user) && assignedHdabRoles.length === 0) {
      return HttpResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    const reviewTransitions = {
      PREPARATION: {
        SUBMIT_FOR_REVIEW: {
          next: 'DATA_PREPARATION_REVIEW_PENDING',
          allowed: ['DATA_PREPARATION_PENDING', 'DATA_PREPARATION_REWORK'],
          requiredRoles: ['HDAB_DATA_PREPARATOR'],
          message: 'Preparation submitted for HDAB review.',
        },
        APPROVED: {
          next: 'WORKSPACE_SETUP_PENDING',
          allowed: ['DATA_PREPARATION_REVIEW_PENDING'],
          requiredRoles: ['HDAB_DATA_REVIEWER'],
          message: 'Preparation approved. Permit now awaiting workspace setup.',
        },
        REWORK_REQUESTED: {
          next: 'DATA_PREPARATION_REWORK',
          allowed: ['DATA_PREPARATION_REVIEW_PENDING'],
          requiredRoles: ['HDAB_DATA_REVIEWER'],
          message: 'Preparation rework requested.',
        },
      },
      SETUP: {
        APPROVED: {
          next: 'ANALYSIS_ACTIVE',
          allowed: ['WORKSPACE_SETUP_REVIEW_PENDING'],
          requiredRoles: ['HDAB_SETUP_REVIEWER'],
          message: 'Workspace setup approved. Analysis may begin.',
        },
        REWORK_REQUESTED: {
          next: 'WORKSPACE_SETUP_REWORK',
          allowed: ['WORKSPACE_SETUP_REVIEW_PENDING'],
          requiredRoles: ['HDAB_SETUP_REVIEWER'],
          message: 'Setup rework requested from the project team.',
        },
      },
    }

    const stageConfig = reviewTransitions[body.stage]
    if (!stageConfig) {
      return HttpResponse.json(
        { message: 'Invalid review stage provided.' },
        { status: 400 },
      )
    }

    const transition = stageConfig[body.decision]
    if (!transition) {
      return HttpResponse.json(
        { message: 'Unsupported decision for the provided stage.' },
        { status: 400 },
      )
    }

    if (!transition.allowed.includes(permit.status)) {
      return HttpResponse.json(
        { message: 'Permit is not in a state that allows this action.' },
        { status: 409 },
      )
    }

    const requiredRoles = transition.requiredRoles ?? []
    if (requiredRoles.length > 0 && !isSuperAdmin(user)) {
      const hasRequiredPermitRole = requiredRoles.some((role) =>
        assignedHdabRoles.includes(role),
      )

      if (!hasRequiredPermitRole) {
        return HttpResponse.json({ message: 'Forbidden' }, { status: 403 })
      }
    }

    if (requiredRoles.length > 0) {
      const containsUnsupportedRole = requiredRoles.some(
        (role) => !HDAB_PERMIT_ROLES.includes(role),
      )
      if (containsUnsupportedRole) {
        return HttpResponse.json(
          { message: 'Unsupported reviewer role specified.' },
          { status: 400 },
        )
      }
    }

    if (
      !isSuperAdmin(user) &&
      !isHdabPermitManager(user) &&
      !hdabHasPermitAccess(permit, user)
    ) {
      return HttpResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    permit.status = transition.next
    permit.updatedAt = new Date().toISOString()

    recordAction({
      actor: user,
      type: 'PERMIT_REVIEW_DECISION',
      description: `Recorded ${body.decision.toLowerCase()} decision for ${body.stage.toLowerCase()} stage.`,
      permit,
      metadata: { stage: body.stage, decision: body.decision },
    })

    return HttpResponse.json({
      permit: buildPermitResponse(permit, user),
      message: transition.message ?? 'Decision recorded.',
    })
  }),

  http.post('/api/permits/:permitId/team/invite', async ({ params, request }) => {
    const user = authenticate(request)
    await delay(300)

    if (!user) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const permit = mockPermits.find((item) => item.id === params.permitId)

    if (!permit) {
      return HttpResponse.json(
        { message: 'Permit not found' },
        { status: 404 },
      )
    }

    const body = await request.json()
    const normalizedEmail = normalizeEmail(body.email)

    if (!normalizedEmail) {
      return HttpResponse.json(
        { message: 'A valid email address is required.' },
        { status: 400 },
      )
    }

    const canManageTeam = isSuperAdmin(user) || isPermitInvestigator(permit, user)

    if (!canManageTeam) {
      return HttpResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    const alreadyMember = permit.team.some((member) => {
      const memberEmail = normalizeEmail(member.email)
      return memberEmail && memberEmail === normalizedEmail
    })

    if (alreadyMember) {
      return HttpResponse.json(
        { message: 'Collaborator is already on this permit.' },
        { status: 409 },
      )
    }

    const trimmedEmail = body.email?.trim() ?? normalizedEmail
    const newMember = {
      id: generateTeamMemberId(),
      name: body.name?.trim() || trimmedEmail,
      role: body.role?.trim() || PROJECT_MEMBER_ROLE,
      organization: body.organization?.trim() || 'Pending assignment',
      email: normalizedEmail,
    }

    permit.team = [...permit.team, newMember]
    recordTeamHistoryEntry(permit, newMember)
    permit.updatedAt = new Date().toISOString()

    recordAction({
      actor: user,
      type: 'TEAM_MEMBER_INVITED',
      description: `Invited ${trimmedEmail} to permit team.`,
      permit,
      targetUser: { ...newMember, email: trimmedEmail },
    })

    return HttpResponse.json({
      permit: buildPermitResponse(permit, user),
      message: `Invitation sent to ${trimmedEmail}.`,
    })
  }),

  http.delete('/api/permits/:permitId/team/:memberId', async ({ params, request }) => {
    const user = authenticate(request)
    await delay(300)

    if (!user) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const permit = mockPermits.find((item) => item.id === params.permitId)

    if (!permit) {
      return HttpResponse.json(
        { message: 'Permit not found' },
        { status: 404 },
      )
    }

    const canManageTeam = isSuperAdmin(user) || isPermitInvestigator(permit, user)

    if (!canManageTeam) {
      return HttpResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    const memberIndex = permit.team.findIndex(
      (member) => member.id === params.memberId,
    )

    if (memberIndex === -1) {
      return HttpResponse.json(
        { message: 'Team member not found.' },
        { status: 404 },
      )
    }

    const [removedMember] = permit.team.splice(memberIndex, 1)
    recordTeamHistoryEntry(permit, removedMember)
    permit.updatedAt = new Date().toISOString()

    recordAction({
      actor: user,
      type: 'TEAM_MEMBER_REMOVED',
      description: `Removed ${removedMember.email ?? removedMember.name ?? 'collaborator'} from permit team.`,
      permit,
      targetUser: removedMember,
    })

    return HttpResponse.json({
      permit: buildPermitResponse(permit, user),
      message: `${removedMember.name ?? 'Collaborator'} removed from permit team.`,
    })
  }),

  http.post('/api/permits/:permitId/hdab-team', async ({ params, request }) => {
    const user = authenticate(request)
    await delay(300)

    if (!user) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    if (!isSuperAdmin(user) && !isHdabPermitManager(user)) {
      return HttpResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json()
    const { userId, permitRole } = body ?? {}

    if (!userId || !permitRole) {
      return HttpResponse.json(
        { message: 'User and permit role are required.' },
        { status: 400 },
      )
    }

    if (!HDAB_PERMIT_ROLES.includes(permitRole)) {
      return HttpResponse.json(
        { message: 'Invalid HDAB permit role specified.' },
        { status: 400 },
      )
    }

    const permit = mockPermits.find((item) => item.id === params.permitId)

    if (!permit) {
      return HttpResponse.json({ message: 'Permit not found' }, { status: 404 })
    }

    const staffMember = mockUsers.find((candidate) => candidate.id === userId)

    if (!staffMember || !staffMember.roles.includes(HDAB_STAFF_ROLE)) {
      return HttpResponse.json(
        { message: 'Selected user is not available for HDAB assignment.' },
        { status: 400 },
      )
    }

    const assignments = getHdabAssignments(permit)
    let assignment = assignments.find((item) => item.userId === userId)

    if (!assignment) {
      assignment = { userId, permitRoles: [] }
      assignments.push(assignment)
    }

    const permitRoles = normalizePermitRoles(assignment)

    if (permitRoles.includes(permitRole)) {
      return HttpResponse.json(
        { message: 'User already holds this HDAB role on the permit.' },
        { status: 409 },
      )
    }

    assignment.permitRoles = [...permitRoles, permitRole]
    permit.assignedHdabTeam = assignments
    permit.updatedAt = new Date().toISOString()

    recordAction({
      actor: user,
      type: 'HDAB_TEAM_MEMBER_ASSIGNED',
      description: `Assigned ${staffMember.fullName} to ${permitRole}.`,
      permit,
      targetUser: staffMember,
      metadata: { userId, permitRole },
    })

    return HttpResponse.json({
      permit: buildPermitResponse(permit, user),
      message: `${staffMember.fullName} assigned to permit as ${permitRole}.`,
    })
  }),

  http.delete('/api/permits/:permitId/hdab-team/:userId', async ({ params, request }) => {
    const user = authenticate(request)
    await delay(300)

    if (!user) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    if (!isSuperAdmin(user) && !isHdabPermitManager(user)) {
      return HttpResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    const permit = mockPermits.find((item) => item.id === params.permitId)

    if (!permit) {
      return HttpResponse.json({ message: 'Permit not found' }, { status: 404 })
    }

    const url = new URL(request.url)
    const permitRole = url.searchParams.get('permitRole')

    if (!permitRole) {
      return HttpResponse.json(
        { message: 'Permit role must be specified.' },
        { status: 400 },
      )
    }

    if (!HDAB_PERMIT_ROLES.includes(permitRole)) {
      return HttpResponse.json(
        { message: 'Invalid HDAB permit role specified.' },
        { status: 400 },
      )
    }

    const assignments = getHdabAssignments(permit)
    const assignmentIndex = assignments.findIndex(
      (assignment) => assignment.userId === params.userId,
    )

    if (assignmentIndex === -1) {
      return HttpResponse.json(
        { message: 'HDAB team member not found on this permit.' },
        { status: 404 },
      )
    }

    const assignment = assignments[assignmentIndex]
    const permitRoles = normalizePermitRoles(assignment)

    if (!permitRoles.includes(permitRole)) {
      return HttpResponse.json(
        { message: 'HDAB team member not found on this permit.' },
        { status: 404 },
      )
    }

    const remainingRoles = permitRoles.filter((role) => role !== permitRole)

    if (remainingRoles.length === 0) {
      assignments.splice(assignmentIndex, 1)
    } else {
      assignments[assignmentIndex] = {
        userId: assignment.userId,
        permitRoles: remainingRoles,
      }
    }

    permit.assignedHdabTeam = assignments
    permit.updatedAt = new Date().toISOString()

    const removedUser = mockUsers.find((candidate) => candidate.id === params.userId)
    const roleLabel = getHdabPermitRoleLabel(permitRole) ?? permitRole

    recordAction({
      actor: user,
      type: 'HDAB_TEAM_MEMBER_REMOVED',
      description: `Removed ${
        removedUser?.fullName ?? params.userId
      } (${roleLabel}) from the HDAB team.`,
      permit,
      targetUser: removedUser ?? { id: params.userId },
      metadata: { userId: params.userId, permitRole },
    })

    return HttpResponse.json({
      permit: buildPermitResponse(permit, user),
      message: removedUser
        ? `${removedUser.fullName} removed from the HDAB team as ${roleLabel}.`
        : `HDAB team member removed from the permit as ${roleLabel}.`,
    })
  }),

  http.post('/api/permits/:permitId/workspace/start', async ({ params, request }) => {
    const user = authenticate(request)
    await delay(400)

    if (!user) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const permit = mockPermits.find((item) => item.id === params.permitId)

    if (!permit) {
      return HttpResponse.json({ message: 'Permit not found' }, { status: 404 })
    }

    if (!userHasPermitAccess(permit, user)) {
      return HttpResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    if (!isSuperAdmin(user) && !isPermitContributor(permit, user)) {
      return HttpResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    const workspace = workspaceState[permit.id]
    if (!workspace) {
      workspaceState[permit.id] = {
        status: 'STARTING',
        connection: null,
      }
    } else {
      workspace.status = 'STARTING'
    }

    // simulate eventual running
    setTimeout(() => {
      workspaceState[permit.id] = {
        status: 'RUNNING',
        connection: {
          protocol: 'ssh',
          host: 'workspace.spe.test',
          port: 4822,
          tunnelId: `tun-${permit.id}`,
        },
      }
    }, 1200)

    recordAction({
      actor: user,
      type: 'WORKSPACE_START_REQUESTED',
      description: 'Requested secure workspace start.',
      permit,
    })

    return HttpResponse.json({
      status: workspaceState[permit.id].status,
      message: 'Workspace starting.',
    })
  }),

  http.post('/api/permits/:permitId/workspace/stop', async ({ params, request }) => {
    const user = authenticate(request)
    await delay(300)

    if (!user) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const permit = mockPermits.find((item) => item.id === params.permitId)

    if (!permit) {
      return HttpResponse.json({ message: 'Permit not found' }, { status: 404 })
    }

    if (!userHasPermitAccess(permit, user)) {
      return HttpResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    if (!isSuperAdmin(user) && !isPermitContributor(permit, user)) {
      return HttpResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    workspaceState[permit.id] = {
      status: 'STOPPED',
      connection: null,
    }

    recordAction({
      actor: user,
      type: 'WORKSPACE_STOP_REQUESTED',
      description: 'Requested secure workspace stop.',
      permit,
    })

    return HttpResponse.json({
      status: 'STOPPED',
      message: 'Workspace stopped.',
    })
  }),

  http.get('/api/permits/:permitId/workspace/status', async ({ params, request }) => {
    const user = authenticate(request)
    await delay(200)

    if (!user) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const permit = mockPermits.find((item) => item.id === params.permitId)

    if (!permit) {
      return HttpResponse.json({ message: 'Permit not found' }, { status: 404 })
    }

    if (!userHasPermitAccess(permit, user)) {
      return HttpResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    return HttpResponse.json({
      status: workspaceState[permit.id]?.status ?? 'STOPPED',
    })
  }),

  http.post(
    '/api/permits/:permitId/workspace/submit-for-review',
    async ({ params, request }) => {
      const user = authenticate(request)
      await delay(300)

      if (!user) {
        return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
      }

      const permit = mockPermits.find((item) => item.id === params.permitId)

      if (!permit) {
        return HttpResponse.json(
          { message: 'Permit not found' },
          { status: 404 },
        )
      }

      if (!userHasPermitAccess(permit, user)) {
        return HttpResponse.json({ message: 'Forbidden' }, { status: 403 })
      }

      const isProjectContributor = isPermitContributor(permit, user)
      const assignedHdabRoles = getHdabRolesForUser(permit, user)
      const isSetupEngineer = assignedHdabRoles.includes(
        HDAB_SETUP_ENGINEER_ROLE,
      )
      const hasHdabAccess = hdabHasPermitAccess(permit, user)

      const canSubmitWorkspace =
        isSuperAdmin(user) ||
        isProjectContributor ||
        (isSetupEngineer && hasHdabAccess)

      if (!canSubmitWorkspace) {
        return HttpResponse.json({ message: 'Forbidden' }, { status: 403 })
      }

      if (
        !['WORKSPACE_SETUP_PENDING', 'WORKSPACE_SETUP_REWORK'].includes(
          permit.status,
        )
      ) {
        return HttpResponse.json(
          { message: 'Workspace cannot be submitted for review in this state.' },
          { status: 409 },
        )
      }

      permit.status = 'WORKSPACE_SETUP_REVIEW_PENDING'
      permit.updatedAt = new Date().toISOString()

      recordAction({
        actor: user,
        type: 'WORKSPACE_SUBMITTED',
        description: 'Submitted workspace setup for review.',
        permit,
      })

      return HttpResponse.json({
        permit: buildPermitResponse(permit, user),
        message: 'Workspace setup submitted for HDAB review.',
      })
    },
  ),

  http.get('/api/permits/:permitId/workspace/connection', async ({ params, request }) => {
    const user = authenticate(request)
    await delay(200)

    if (!user) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const permit = mockPermits.find((item) => item.id === params.permitId)

    if (!permit) {
      return HttpResponse.json({ message: 'Permit not found' }, { status: 404 })
    }

    if (!userHasPermitAccess(permit, user)) {
      return HttpResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    const url = new URL(request.url)
    const reviewerMode = url.searchParams.get('reviewerMode')
    const connection = workspaceState[permit.id]?.connection ?? null
    const connectionResponse = connection
      ? {
          ...connection,
          ...(reviewerMode ? { reviewerMode } : {}),
        }
      : null

    return HttpResponse.json({
      connection: connectionResponse,
    })
  }),

  http.get('/api/permits/:permitId/workspace/browse', async ({ params, request }) => {
    const user = authenticate(request)
    await delay(200)

    if (!user) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const permit = mockPermits.find((item) => item.id === params.permitId)

    if (!permit) {
      return HttpResponse.json({ message: 'Permit not found' }, { status: 404 })
    }

    if (!userHasPermitAccess(permit, user)) {
      return HttpResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    const entries = [
      { name: 'analysis', path: '/analysis', isDirectory: true },
      { name: 'outputs', path: '/analysis/outputs', isDirectory: true },
      { name: 'readme.txt', path: '/analysis/readme.txt', isDirectory: false },
    ]

    return HttpResponse.json({ entries })
  }),

  http.post('/api/permits/:permitId/outputs', async ({ params, request }) => {
    const user = authenticate(request)
    await delay(300)

    if (!user) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()

    if (!body.folderPath) {
      return HttpResponse.json(
        { message: 'A folder path is required.' },
        { status: 400 },
      )
    }

    if (!body.description || !body.description.trim()) {
      return HttpResponse.json(
        { message: 'A justification describing the egress contents is required.' },
        { status: 400 },
      )
    }

    const permit = mockPermits.find((item) => item.id === params.permitId)

    if (!permit) {
      return HttpResponse.json({ message: 'Permit not found' }, { status: 404 })
    }

    const canSubmitOutput =
      isSuperAdmin(user) || isPermitContributor(permit, user)

    if (!canSubmitOutput) {
      return HttpResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    if (permit.status !== 'ANALYSIS_ACTIVE') {
      return HttpResponse.json(
        {
          message:
            'Outputs can only be submitted while analysis is in progress.',
        },
        { status: 409 },
      )
    }

    const newOutput = {
      id: `output-${Math.floor(Math.random() * 10000)}`,
      permitId: params.permitId,
      folderPath: body.folderPath,
      description: body.description.trim(),
      status: 'EGRESS_REVIEW_PENDING',
      submittedAt: new Date().toISOString(),
      reviewedAt: null,
    }

    mockOutputs.push(newOutput)

    permit.status = 'ANALYSIS_ACTIVE'
    permit.updatedAt = newOutput.submittedAt

    recordAction({
      actor: user,
      type: 'OUTPUT_SUBMITTED',
      description: `Submitted output folder ${body.folderPath}.`,
      permit,
      metadata: { folderPath: body.folderPath },
    })

    return HttpResponse.json({
      output: newOutput,
      permit: buildPermitResponse(permit, user),
      summary: summarizeOutputs(permit.id).summary,
      message: 'Output submitted for egress review.',
    })
  }),

  http.get('/api/permits/:permitId/outputs', async ({ params, request }) => {
    const user = authenticate(request)
    await delay(250)

    if (!user) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const permit = mockPermits.find((item) => item.id === params.permitId)

    if (!permit) {
      return HttpResponse.json({ message: 'Permit not found' }, { status: 404 })
    }

    if (!userHasPermitAccess(permit, user)) {
      return HttpResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    const { outputs, summary } = summarizeOutputs(permit.id)

    return HttpResponse.json({
      outputs: outputs.map((output) => ({ ...output })),
      summary,
    })
  }),

  http.get('/api/permits/:permitId/outputs/:outputId', async ({ params, request }) => {
    const user = authenticate(request)
    await delay(200)

    if (!user) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const permit = mockPermits.find((item) => item.id === params.permitId)

    if (!permit) {
      return HttpResponse.json({ message: 'Permit not found' }, { status: 404 })
    }

    if (!userHasPermitAccess(permit, user)) {
      return HttpResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    const output = mockOutputs.find(
      (item) => item.id === params.outputId && item.permitId === permit.id,
    )

    if (!output) {
      return HttpResponse.json({ message: 'Not found' }, { status: 404 })
    }

    return HttpResponse.json({ output })
  }),

  http.post('/api/permits/:permitId/outputs/:outputId/review', async ({ params, request }) => {
    const user = authenticate(request)
    await delay(200)

    if (!user) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const permit = mockPermits.find((item) => item.id === params.permitId)

    if (!permit) {
      return HttpResponse.json({ message: 'Permit not found' }, { status: 404 })
    }

    const assignedHdabRoles = getHdabRolesForUser(permit, user)
    const isEgressReviewer = assignedHdabRoles.includes(HDAB_EGRESS_REVIEWER_ROLE)

    if (!isSuperAdmin(user) && !isEgressReviewer) {
      return HttpResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    if (!hdabHasPermitAccess(permit, user) && !isSuperAdmin(user)) {
      return HttpResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    const output = mockOutputs.find(
      (item) => item.id === params.outputId && item.permitId === permit.id,
    )

    if (!output) {
      return HttpResponse.json({ message: 'Not found' }, { status: 404 })
    }

    if (body.decision === 'APPROVED') {
      output.status = 'EGRESS_APPROVED'
    } else {
      output.status = 'EGRESS_REWORK'
    }

    output.reviewedAt = new Date().toISOString()

    permit.updatedAt = new Date().toISOString()

    recordAction({
      actor: user,
      type: 'OUTPUT_REVIEW_DECISION',
      description:
        body.decision === 'APPROVED'
          ? `Approved output ${output.id} for egress.`
          : `Requested rework for output ${output.id}.`,
      permit,
      metadata: { decision: body.decision, outputId: output.id },
    })

    return HttpResponse.json({
      output,
      permit: buildPermitResponse(permit, user),
      summary: summarizeOutputs(permit.id).summary,
      message:
        body.decision === 'APPROVED'
          ? 'Output approved for egress.'
          : 'Egress rework requested.',
    })
  }),

  http.get('/api/permits/:permitId/outputs/:outputId/download-link', async ({ params, request }) => {
    const user = authenticate(request)
    await delay(200)

    if (!user) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const permit = mockPermits.find((item) => item.id === params.permitId)

    if (!permit) {
      return HttpResponse.json({ message: 'Permit not found' }, { status: 404 })
    }

    if (!userHasPermitAccess(permit, user)) {
      return HttpResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    const output = mockOutputs.find(
      (item) => item.id === params.outputId && item.permitId === permit.id,
    )

    if (!output || output.status !== 'EGRESS_APPROVED') {
      return HttpResponse.json(
        { message: 'Output not approved for download.' },
        { status: 403 },
      )
    }

    recordAction({
      actor: user,
      type: 'OUTPUT_DOWNLOAD_REQUESTED',
      description: `Requested download link for output ${output.id}.`,
      permit,
      metadata: { outputId: output.id },
    })

    return HttpResponse.json({
      url: `https://downloads.spe.test/${output.id}?token=mock`,
    })
  }),

  http.get('/api/permits/:permitId/activity', async ({ params, request }) => {
    const user = authenticate(request)
    await delay(200)

    if (!user) {
      return HttpResponse.json({ message: 'Unauthorized' }, { status: 401 })
    }

    const permit = mockPermits.find((item) => item.id === params.permitId)

    if (!permit) {
      return HttpResponse.json({ message: 'Permit not found' }, { status: 404 })
    }

    if (!userHasPermitAccess(permit, user)) {
      return HttpResponse.json({ message: 'Forbidden' }, { status: 403 })
    }

    const requestUrl = new URL(request.url, 'http://localhost')
    const limit = Math.min(
      Math.max(Number.parseInt(requestUrl.searchParams.get('limit'), 10) || 50, 1),
      100,
    )
    const offset = Math.max(
      Number.parseInt(requestUrl.searchParams.get('offset'), 10) || 0,
      0,
    )
    const sinceParam = requestUrl.searchParams.get('since')
    const untilParam = requestUrl.searchParams.get('until')
    const typeParams = requestUrl.searchParams.getAll('type').filter(Boolean)
    const searchParam = requestUrl.searchParams.get('search')?.trim().toLowerCase() ?? ''

    const parseDate = (value) => {
      if (!value) {
        return null
      }
      const date = new Date(value)
      return Number.isNaN(date.getTime()) ? null : date
    }

    const defaultSince = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const sinceDate = parseDate(sinceParam) ?? defaultSince
    const untilDate = parseDate(untilParam)

    const permitLog = [...(getPermitActivityLog(permit.id) ?? [])]

    const withinWindow = permitLog.filter((entry) => {
      const timestamp = new Date(entry.timestamp)
      if (Number.isNaN(timestamp.getTime())) {
        return false
      }
      if (sinceDate && timestamp < sinceDate) {
        return false
      }
      if (untilDate && timestamp > untilDate) {
        return false
      }
      return true
    })

    const availableTypes = Array.from(
      new Set(withinWindow.map((entry) => entry.type).filter(Boolean)),
    ).sort((a, b) => a.localeCompare(b))

    const filtered = withinWindow.filter((entry) => {
      if (typeParams.length > 0 && !typeParams.includes(entry.type)) {
        return false
      }

      if (searchParam) {
        const haystack = [
          entry.description,
          entry.actor?.name,
          entry.actor?.email,
          entry.targetUser?.name,
          entry.targetUser?.email,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

        if (!haystack.includes(searchParam)) {
          return false
        }
      }

      return true
    })

    const total = filtered.length
    const context = createViewerContext(permit, user)
    const actions = filtered
      .slice(offset, offset + limit)
      .map((entry) => ({
        ...entry,
        actor: sanitizeLogPersonForViewer(entry.actor, permit, context),
        targetUser: sanitizeLogPersonForViewer(entry.targetUser, permit, context),
      }))

    return HttpResponse.json({
      actions,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
      filters: {
        since: sinceDate ? sinceDate.toISOString() : null,
        until: untilDate ? untilDate.toISOString() : null,
      },
      facets: {
        types: availableTypes,
      },
    })
  }),
]
