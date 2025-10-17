import dotenv from 'dotenv'

dotenv.config()

type Env = {
  NODE_ENV: string
  PORT: number
  LOG_LEVEL: string
  DATABASE_URL: string
  API_GATEWAY_SECRET: string
  RABBITMQ_URL?: string
}

const required = ['NODE_ENV', 'PORT', 'LOG_LEVEL', 'DATABASE_URL', 'API_GATEWAY_SECRET'] as const

const env: Env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 3001),
  LOG_LEVEL: process.env.LOG_LEVEL ?? 'info',
  DATABASE_URL: process.env.DATABASE_URL ?? '',
  API_GATEWAY_SECRET: process.env.API_GATEWAY_SECRET ?? '',
  RABBITMQ_URL: process.env.RABBITMQ_URL,
}

for (const key of required) {
  if (!env[key]) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
}

export default env
