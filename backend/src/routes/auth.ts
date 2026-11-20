import {Router, type RequestHandler} from 'express'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import {randomBytes} from 'node:crypto'
import {rateLimit} from 'express-rate-limit'
import {z} from 'zod'
import {db} from '../db'
import {config} from '../config'
import {publicAdmin} from '../services/auth'
import {HttpError,ok} from '../middleware/http'

const cookie='ml_session'
const options={httpOnly:true,secure:config.NODE_ENV==='production',sameSite:'strict' as const,path:'/'}
const lifetime=8*60*60*1000
const dummyHash=bcrypt.hashSync(randomBytes(20).toString('hex'),12)
const issuer='manufacturer-leads'
export const authenticate:RequestHandler=async(req,res,next)=>{
  let sid:string
  try {
    const claims=jwt.verify(req.cookies[cookie],config.JWT_SECRET,{algorithms:['HS256'],issuer})
    if(typeof claims==='string'||!claims.jti)throw Error()
    sid=claims.jti
  }catch{throw new HttpError(401,'Sign in to continue')}
  const session=await db.session.findUnique({where:{id:sid},include:{admin:{select:publicAdmin}}})
  if(!session || session.expiresAt<=new Date())throw new HttpError(401,'Your session has expired. Sign in again.')
  res.locals.admin=session.admin
  res.locals.sessionId=sid
  next()
}
export const auth=Router()
auth.post('/login',rateLimit({windowMs:15*60_000,limit:12,standardHeaders:'draft-7',legacyHeaders:false,skipSuccessfulRequests:true,message:{success:false,message:'Too many attempts. Try again in 15 minutes.'}}),async(req,res)=>{
  const {identifier,password}=z.object({identifier:z.string().trim().min(1).max(320),password:z.string().min(1).max(128)}).parse(req.body)
  const admin=await db.admin.findFirst({where:{OR:[{email:identifier.toLowerCase()},{phone:identifier}]}})
  const matches=await bcrypt.compare(password,admin?.passwordHash||dummyHash)
  if(!admin||!matches || Buffer.byteLength(password)>72)throw new HttpError(401,'Email, phone number or password is incorrect')
  await db.session.deleteMany({where:{expiresAt:{lte:new Date()}}})
  const session=await db.session.create({data:{adminId:admin.id,expiresAt:new Date(Date.now()+lifetime)}})
  const token=jwt.sign({},config.JWT_SECRET,{subject:admin.id,jwtid:session.id,expiresIn:'8h',issuer,algorithm:'HS256'})
  res.cookie(cookie,token,{...options,maxAge:lifetime}).json(ok({id:admin.id,email:admin.email,phone:admin.phone,role:admin.role}))
})
auth.get('/me',authenticate,(_req,res)=>{res.json(ok(res.locals.admin))})
auth.post('/logout',authenticate,async(_req,res)=>{
  await db.session.deleteMany({where:{id:res.locals.sessionId}})
  res.clearCookie(cookie,options).json(ok(null))
})
