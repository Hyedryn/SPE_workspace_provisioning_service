import env from './config'
import { createApp } from './app'
import logger from './lib/logger'

const start = async () => {
  const app = createApp()
  try {
    await app.listen({ port: env.PORT, host: '0.0.0.0' })
    logger.info(`Permit Manager service running on port ${env.PORT}`)
  } catch (error) {
    logger.error({ error }, 'Failed to start Permit Manager service')
    process.exit(1)
  }
}

void start()
