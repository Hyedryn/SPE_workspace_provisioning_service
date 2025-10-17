import type { FastifyInstance } from 'fastify'
import permitsRoutes from './permits'

const registerRoutes = async (app: FastifyInstance) => {
  app.register(permitsRoutes, { prefix: '/api/permits' })
}

export default registerRoutes
