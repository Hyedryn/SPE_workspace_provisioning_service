import prisma from '../lib/prisma'
import type { PermitWithRelations } from '../types/database'
import type { PermitActivityLogRecord } from '../types/models'
import type { AuthenticatedUser } from '../types/user'
import { userHasPermitAccess } from '../utils/permitAccess'
import { createViewerContext, sanitizeLogPersonForViewer } from '../utils/redaction'

export interface ActivityQuery {
  limit?: number
  offset?: number
  since?: Date | null
  until?: Date | null
  types?: string[]
  search?: string | null
}

export const ActivityLogService = {
  async list(
    permit: PermitWithRelations,
    user: AuthenticatedUser,
    query: ActivityQuery,
  ) {
    if (!userHasPermitAccess(permit, user)) {
      const error = new Error('Forbidden')
      ;(error as Error & { statusCode?: number }).statusCode = 403
      throw error
    }

    const limit = Math.min(Math.max(query.limit ?? 50, 1), 100)
    const offset = Math.max(query.offset ?? 0, 0)
    const since = query.since ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const until = query.until ?? null
    const search = query.search?.toLowerCase() ?? null
    const types = query.types && query.types.length > 0 ? query.types : undefined

    const where: Record<string, unknown> = {
      permitId: permit.id,
      createdAt: {
        gte: since,
        ...(until ? { lte: until } : {}),
      },
      ...(types ? { type: { in: types } } : {}),
    }

    if (search) {
      where.OR = [
        { description: { contains: search, mode: 'insensitive' } },
        { actorName: { contains: search, mode: 'insensitive' } },
        { actorEmail: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [total, entries] = await Promise.all([
      prisma.permitActivityLog.count({ where }),
      prisma.permitActivityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }) as Promise<PermitActivityLogRecord[]>,
    ])

    const availableTypes = (await prisma.permitActivityLog.findMany({
      where: { permitId: permit.id },
      select: { type: true },
      distinct: ['type'],
    })) as Array<{ type: string | null }>

    const context = createViewerContext(permit, user)

    const actions = entries.map((entry: PermitActivityLogRecord) => ({
      id: entry.id,
      timestamp: entry.createdAt.toISOString(),
      type: entry.type,
      description: entry.description ?? null,
      actor: sanitizeLogPersonForViewer(
        entry.actorUserId
          ? {
              id: entry.actorUserId,
              name: entry.actorName ?? null,
              email: entry.actorEmail ?? null,
            }
          : null,
        permit,
        context,
      ),
      permit: {
        id: permit.id,
        reference: permit.reference,
        projectTitle: permit.projectTitle,
      },
      targetUser: sanitizeLogPersonForViewer(
        entry.targetUser as { id?: string; name?: string; email?: string } | null,
        permit,
        context,
      ),
      metadata: entry.metadata ?? {},
    }))

    return {
      actions,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + limit < total,
      },
      filters: {
        since: since.toISOString(),
        until: until ? until.toISOString() : null,
      },
      facets: {
        types: availableTypes
          .map((item: { type: string | null }) => item.type)
          .filter((value: string | null): value is string => Boolean(value))
          .sort((a: string, b: string) => a.localeCompare(b)),
      },
    }
  },
}
