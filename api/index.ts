import type {IncomingMessage,ServerResponse} from 'node:http'
import {app} from '../backend/src/app'
import {seedAdmin} from '../backend/src/services/auth'

let seeding: Promise<unknown>|undefined

async function ensureSeeded(){
  seeding ||= seedAdmin()
  await seeding
}

export default async function handler(req:IncomingMessage,res:ServerResponse){
  await ensureSeeded()
  app(req,res)
}
