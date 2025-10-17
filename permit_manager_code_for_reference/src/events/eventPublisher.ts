import { connect, Channel, Connection } from 'amqplib'
import env from '../config'
import logger from '../lib/logger'

const EXCHANGE_NAME = 'spe_events'
const ROUTING_PREFIX = 'permit.'

export type PermitEvent = {
  name: string
  payload: Record<string, unknown>
}

type RabbitConnection = Connection & { createChannel: () => Promise<Channel> }

class EventPublisher {
  private connection: RabbitConnection | null = null
  private channel: Channel | null = null

  async publish(event: PermitEvent): Promise<void> {
    if (!env.RABBITMQ_URL) {
      logger.debug({ event }, 'Skipping event publish because RABBITMQ_URL is not configured')
      return
    }

    const channel = await this.getChannel()
    if (!channel) {
      logger.error({ event }, 'Unable to publish event: channel is not available')
      return
    }

    const routingKey = `${ROUTING_PREFIX}${event.name}`
    await channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true })
    const payload = Buffer.from(JSON.stringify(event.payload))

    channel.publish(EXCHANGE_NAME, routingKey, payload, {
      contentType: 'application/json',
      persistent: true,
    })
    logger.info({ routingKey }, 'Published permit event')
  }

  private async getChannel(): Promise<Channel | null> {
    try {
      if (!this.connection) {
        this.connection = (await connect(env.RABBITMQ_URL as string)) as unknown as RabbitConnection
        this.connection!.on('close', () => {
          logger.warn('RabbitMQ connection closed, resetting channel')
          this.connection = null
          this.channel = null
        })
        this.connection!.on('error', (error: Error) => {
          logger.error({ error }, 'RabbitMQ connection error')
        })
      }

      if (!this.channel && this.connection) {
        this.channel = await this.connection.createChannel()
      }

      return this.channel
    } catch (error: unknown) {
      logger.error({ error }, 'Failed to connect to RabbitMQ')
      this.connection = null
      this.channel = null
      return null
    }
  }
}

const publisher = new EventPublisher()
export default publisher
