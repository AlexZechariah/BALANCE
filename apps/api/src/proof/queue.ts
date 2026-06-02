import { Queue, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';

function requiredEnv(name: string, fallback: string): string {
  const value = process.env[name];
  if (value && value.trim().length > 0) return value.trim();
  return fallback;
}

async function main() {
  const redisUrl = requiredEnv('REDIS_URL', 'redis://redis:6379');
  const queueName = requiredEnv('QUEUE_PROOF_NAME', 'queue_proof');

  const connection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const eventsConnection = new IORedis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue(queueName, { connection });
  const queueEvents = new QueueEvents(queueName, { connection: eventsConnection });

  try {
    await queueEvents.waitUntilReady();

    const job = await queue.add(
      'proof',
      { createdAt: new Date().toISOString(), source: 'node-producer' },
      { removeOnComplete: false, removeOnFail: false }
    );

    const result = await job.waitUntilFinished(queueEvents, 30_000);

    console.log(JSON.stringify({ queueName, jobId: job.id, result }, null, 2));
  } finally {
    await queueEvents.close();
    await queue.close();
    await eventsConnection.quit();
    await connection.quit();
  }
}

void main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
