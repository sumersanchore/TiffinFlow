import path from 'node:path'
import fs from 'node:fs'
import dotenv from 'dotenv'
import {z} from 'zod'

// Locate the workspace from both the source tree and the compiled server.
let root = __dirname
while (!fs.existsSync(path.join(root, 'backend/prisma/schema.prisma'))) {
  const parent = path.dirname(root)
  if (parent === root) throw new Error('Manufacturer Leads workspace is missing')
  root = parent
}
export const projectRoot = root
if(process.env.NODE_ENV!=='production') {
  dotenv.config({path:path.join(root,'.env.development.local'),quiet:true})
  dotenv.config({path:path.join(root,'.env.local'),quiet:true})
}
dotenv.config({path:path.join(root,'.env'),quiet:true})
const schema = z.object({
  DATABASE_URL:z.string().url().regex(/^postgres(ql)?:\/\//),
  PORT:z.coerce.number().int().min(1).max(65535).default(5000),
  FRONTEND_URL:z.string().url().default('http://localhost:5173'),
  JWT_SECRET:z.string().min(32).refine(s=>new Set(s).size>=12,'Use a random secret'),
  ADMIN_EMAIL:z.string().email().default('thesumerjangid@gmail.com'),
  ADMIN_PHONE:z.string().regex(/^\+?\d{7,15}$/).default('8949470181'),
  ADMIN_PASSWORD:z.string().min(12).refine(s=>Buffer.byteLength(s)<=72,'Maximum 72 UTF-8 bytes'),
  NODE_ENV:z.enum(['production','test','development']).default('development')
})
const result = schema.safeParse(process.env)
if (!result.success) throw new Error('Check environment configuration: '+result.error.issues.map(i=>i.path.join('.')+' '+i.message).join(', '))
export const config = result.data
