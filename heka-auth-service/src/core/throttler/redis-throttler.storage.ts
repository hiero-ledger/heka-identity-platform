import { Injectable } from '@nestjs/common'
import { ThrottlerStorage } from '@nestjs/throttler'
import { ThrottlerStorageRecord } from '@nestjs/throttler/dist/throttler-storage-record.interface'
import { Redis } from 'ioredis'

const SCRIPT = `
local key       = KEYS[1]
local blockKey  = KEYS[1] .. ':block'
local ttl       = tonumber(ARGV[1])
local limit     = tonumber(ARGV[2])
local blockDur  = tonumber(ARGV[3])

local blockedTtl = redis.call('PTTL', blockKey)
if blockedTtl > 0 then
  return {limit + 1, 0, 1, blockedTtl}
end

local count   = tonumber(redis.call('INCR', key))
local keyTtl  = redis.call('PTTL', key)

if count == 1 or keyTtl == -1 then
  redis.call('PEXPIRE', key, ttl)
  keyTtl = ttl
end

if count > limit and blockDur > 0 then
  redis.call('SET', blockKey, 1, 'PX', blockDur)
  return {count, keyTtl, 1, blockDur}
end

return {count, keyTtl, 0, 0}
`

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  constructor(private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    _throttlerName: string,
  ): Promise<ThrottlerStorageRecord> {
    const result = (await this.redis.eval(SCRIPT, 1, key, String(ttl), String(limit), String(blockDuration))) as number[]
    return {
      totalHits: result[0],
      timeToExpire: result[1],
      isBlocked: result[2] === 1,
      timeToBlockExpire: result[3],
    }
  }
}
