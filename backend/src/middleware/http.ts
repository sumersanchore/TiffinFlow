import type {RequestHandler,ErrorRequestHandler} from 'express'
import {Prisma} from '@prisma/client'
import {ZodError} from 'zod'
import {MulterError} from 'multer'
export class HttpError extends Error {
  constructor(public status:number,message:string){super(message)}
}
export const ok = (data:unknown) => ({success:true,data})
export const missing:RequestHandler = (_req,_res,next) => next(new HttpError(404,'Endpoint not found'))
export const errors:ErrorRequestHandler = (err, _req, res, _next) => {
  if(res.headersSent) return _next(err)
  if(err instanceof ZodError){res.status(422).json({success:false,message:err.issues.map(i=>[i.path.join('.'),i.message].filter(Boolean).join(' — ')).join(', ')});return}
  let status=500, message='The request could not be completed'
  if(err instanceof HttpError){status=err.status;message=err.message}
  else if(err instanceof MulterError){status=err.code==='LIMIT_FILE_SIZE'?413:400;message=status===413?'Maximum upload size is 8 MB':'Invalid file upload'}
  else if(err instanceof Prisma.PrismaClientKnownRequestError && err.code==='P2002'){status=409;message='That identifier already exists'}
  else if(err instanceof Prisma.PrismaClientKnownRequestError && err.code==='P2025'){status=404;message='Record not found'}
  else if(err.status===400 || err.status===413){status=err.status;message=status===400?'Invalid request body':'Request body is too large'}
  else console.error('Request failed',err.name,err.code || '')
  res.status(status).json({success:false,message})
}
