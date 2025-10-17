import workspaceStateStore, { WorkspaceState } from '../lib/workspaceStateStore'
import type { PermitWithRelations } from '../types/database'
import type { AuthenticatedUser } from '../types/user'
import {
  hdabHasPermitAccess,
  isPermitContributor,
  userHasPermitAccess,
  getHdabRolesForUser,
} from '../utils/permitAccess'
import { isSuperAdmin } from '../utils/authorization'
import { HDAB_SETUP_ENGINEER_ROLE } from '../utils/roles'
import { PermitService, reviewTransitions } from './permitService'
import eventPublisher from '../events/eventPublisher'

export const WorkspaceService = {
  async start(permit: PermitWithRelations, actor: AuthenticatedUser) {
    if (!userHasPermitAccess(permit, actor)) {
      const error = new Error('Forbidden')
      ;(error as Error & { statusCode?: number }).statusCode = 403
      throw error
    }

    if (!(isSuperAdmin(actor) || isPermitContributor(permit, actor))) {
      const error = new Error('Forbidden')
      ;(error as Error & { statusCode?: number }).statusCode = 403
      throw error
    }

    const state: WorkspaceState = { status: 'STARTING', connection: null }

    await PermitService.recordActivity(permit.id, actor, 'WORKSPACE_START_REQUESTED', 'Requested secure workspace start.')

    await eventPublisher.publish({
      name: 'permit.workspace.start_requested',
      payload: { permitId: permit.id },
    })

    await workspaceStateStore.set(permit.id, state)

    return state
  },

  async stop(permit: PermitWithRelations, actor: AuthenticatedUser) {
    if (!userHasPermitAccess(permit, actor)) {
      const error = new Error('Forbidden')
      ;(error as Error & { statusCode?: number }).statusCode = 403
      throw error
    }

    if (!(isSuperAdmin(actor) || isPermitContributor(permit, actor))) {
      const error = new Error('Forbidden')
      ;(error as Error & { statusCode?: number }).statusCode = 403
      throw error
    }

    const state: WorkspaceState = { status: 'STOPPED', connection: null }

    await PermitService.recordActivity(permit.id, actor, 'WORKSPACE_STOP_REQUESTED', 'Requested secure workspace stop.')

    await eventPublisher.publish({
      name: 'permit.workspace.stop_requested',
      payload: { permitId: permit.id },
    })

    await workspaceStateStore.set(permit.id, state)

    return state
  },

  async getStatus(permitId: string) {
    const state = await workspaceStateStore.get(permitId)
    return { status: state?.status ?? 'STOPPED' }
  },

  async submitForReview(permit: PermitWithRelations, actor: AuthenticatedUser) {
    if (!userHasPermitAccess(permit, actor)) {
      const error = new Error('Forbidden')
      ;(error as Error & { statusCode?: number }).statusCode = 403
      throw error
    }

    const roles = getHdabRolesForUser(permit, actor)
    const isSetupEngineer = roles.includes(HDAB_SETUP_ENGINEER_ROLE)
    const canSubmit =
      isSuperAdmin(actor) || isPermitContributor(permit, actor) || (isSetupEngineer && hdabHasPermitAccess(permit, actor))

    if (!canSubmit) {
      const error = new Error('Forbidden')
      ;(error as Error & { statusCode?: number }).statusCode = 403
      throw error
    }

    const transition = reviewTransitions.SETUP.SUBMIT_FOR_REVIEW
    if (!transition.allowed.includes(permit.status)) {
      const error = new Error('Workspace cannot be submitted for review in this state.')
      ;(error as Error & { statusCode?: number }).statusCode = 409
      throw error
    }

    const updated = await PermitService.updateStatus(permit.id, transition.next, actor)
    await PermitService.recordActivity(
      permit.id,
      actor,
      'WORKSPACE_SUBMITTED',
      'Submitted workspace setup for review.',
    )

    return updated
  },

  async getConnection(permitId: string, reviewerMode?: string | null) {
    const state = await workspaceStateStore.get(permitId)
    const connection = state?.connection
    if (!connection) {
      return { connection: null }
    }

    return {
      connection: reviewerMode ? { ...connection, reviewerMode } : connection,
    }
  },

  async browse(permit: PermitWithRelations, actor: AuthenticatedUser) {
    if (!userHasPermitAccess(permit, actor)) {
      const error = new Error('Forbidden')
      ;(error as Error & { statusCode?: number }).statusCode = 403
      throw error
    }

    return {
      entries: [
        { name: 'analysis', path: '/analysis', isDirectory: true },
        { name: 'outputs', path: '/analysis/outputs', isDirectory: true },
        { name: 'readme.txt', path: '/analysis/readme.txt', isDirectory: false },
      ],
    }
  },
}

