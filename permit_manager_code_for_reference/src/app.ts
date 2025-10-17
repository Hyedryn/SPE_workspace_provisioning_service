import fastify from 'fastify'
import helmet from '@fastify/helmet'
import cors from '@fastify/cors'
import sensible from '@fastify/sensible'
import logger from './lib/logger'
import authenticationPlugin from './plugins/authentication'
import registerRoutes from './routes'

export const createApp = () => {
  const app = fastify({ logger })

  app.register(helmet)
  app.register(cors, { origin: false })
  app.register(sensible)
  app.register(authenticationPlugin)

  app.get('/health', async () => ({ status: 'ok' }))

  app.register(registerRoutes)

  return app
}
