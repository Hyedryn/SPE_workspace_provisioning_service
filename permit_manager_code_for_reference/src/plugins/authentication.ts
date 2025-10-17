import fp from 'fastify-plugin'
import type { FastifyPluginCallback } from 'fastify'
import { extractUserFromRequest } from '../utils/authentication'

const authenticationPlugin: FastifyPluginCallback = (fastify, _opts, done) => {
  fastify.decorateRequest('user', null)

  fastify.addHook('preHandler', async (request, reply) => {
    const user = extractUserFromRequest(request)
    if (!user) {
      throw fastify.httpErrors.unauthorized('Missing authentication context')
    }

    request.user = user
  })

  done()
}

export default fp(authenticationPlugin)
