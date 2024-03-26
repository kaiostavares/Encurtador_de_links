import { createClient } from "redis";

export const redis = createClient({
   url: 'redis://:frog*978@localhost:6379'
})

redis.connect();