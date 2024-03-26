import fastify from 'fastify'
import {string, z} from 'zod';
import { sql } from './lib/postgres';
import postgres from 'postgres';
import { redis } from './lib/redis';

const app = fastify(); 

app.post('/api/links', async(request, reply) => {
    const createLinkSchema = z.object({
        code: z.string().min(3),
        url: z.string().url(),
    });

    const {code,url} = createLinkSchema.parse(request.body);
    try{
        const result = await sql`
            INSERT INTO shorted_link (code, original_url)
            VALUES (${code}, ${url})
            RETURNING id`;
        const link = result[0];
        return reply.status(201).send({shortLinkId: link.id});
    }catch(err){
        if(err instanceof postgres.PostgresError){
            if(err.code === '23505'){
                return reply.status(400).send({message: 'Codigo duplicado'});
            }
        }

        console.log(err);
        return reply.status(500).send({message: 'Erro interno'})
    }
})

app.get('/:code', async(request, reply) =>{
    const getLinkSchema = z.object({
        code: z.string().min(3),
    });

    const {code} = getLinkSchema.parse(request.params)

    const result = await sql`
        SELECT id, original_url
        FROM shorted_link
        WHERE shorted_link.code = ${code}
    `
    if(result.length === 0){
        return reply.status(400).send({message: 'Link não encontrado'});
    }

    const link = result[0];

    await redis.zIncrBy('metrics', 1, String(link.id));

    return reply.redirect(301, link.original_url)
})

app.get('/api/links', async () =>{
    const result = await sql`
        SELECT * FROM shorted_link
        ORDER BY created_at DESC
    `
    return result;
})

app.get('/api/metrics', async() => {
    const result = await redis.zRangeByScoreWithScores('metrics', 0, 50)

    const metrics = result
        .sort((a,b) => b.score - a.score)
        .map(item => {
            return {
                shorLinkId: Number(item.value),
                clicks: item.score,
            }
    })

    return metrics;
    
})

app.listen({
    port: 7575,               
}).then(()=>{
    console.log('HTTP server running')
})