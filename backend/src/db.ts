import './config'
import {Prisma, PrismaClient} from '@prisma/client'
export const db = new PrismaClient()
export type Tx = Prisma.TransactionClient
// Coordinate writers across processes so identity checks and writes are one operation.
export const lockLeads = (tx:Tx) => tx.$executeRaw`SELECT pg_advisory_xact_lock(648220196)`
