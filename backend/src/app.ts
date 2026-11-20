import express from 'express'
import cookieParser from 'cookie-parser'
import helmet from 'helmet'
import cors from 'cors'
import path from 'node:path'
import {config,projectRoot} from './config'
import {auth,authenticate} from './routes/auth'
import {routes} from './routes/leads'
import {missing,errors,HttpError} from './middleware/http'
export const app=express()
app.disable('x-powered-by')
const frontendOrigin=new URL(config.FRONTEND_URL).origin
app.use(helmet(),cors({origin(origin,callback){
  if(!origin)return callback(null,true)
  try{
    const originUrl=new URL(origin)
    const allowed=origin===frontendOrigin||originUrl.hostname.endsWith('.vercel.app')
    callback(null,allowed)
  }catch{callback(null,false)}
},credentials:true}),cookieParser(),express.json({limit:'256kb'}))
app.use('/api',(req,res,next)=>{
  res.setHeader('Cache-Control','no-store')
  if(!['GET','HEAD','OPTIONS'].includes(req.method) && req.headers.origin){
    try{
      const originUrl=new URL(req.headers.origin)
      const trusted=req.headers.origin===frontendOrigin||originUrl.hostname.endsWith('.vercel.app')
      if(!trusted)throw new HttpError(403,'Untrusted request origin')
    }catch(error){
      if(error instanceof HttpError)throw error
      throw new HttpError(403,'Untrusted request origin')
    }
  }
  next()
})
app.use('/api/auth',auth)
app.use('/api',authenticate,routes,missing)
const dist=path.join(projectRoot,'frontend/dist')
app.use(express.static(dist))
app.get(['/','/login','/leads'],(_req,res)=>res.sendFile(path.join(dist,'index.html')))
app.use(missing,errors)
