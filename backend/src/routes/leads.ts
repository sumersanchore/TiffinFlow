import {Router} from 'express'
import multer from 'multer'
import {z} from 'zod'
import {db,lockLeads} from '../db'
import {statuses} from '../../../shared/leads'
import {ok,HttpError} from '../middleware/http'
import {list,save,stats,filters,exportRows,duplicateCheck,omitKeys} from '../controllers/leads'
import {dispatch,owned,preview,startImport} from '../services/imports'
import {issueWorkbook,maxBytes,workbook} from '../services/workbooks'

export const routes=Router()
const upload=multer({storage:multer.memoryStorage(),limits:{fileSize:maxBytes,files:1,fields:0,parts:2}})
routes.get('/categories',async(_req,res)=>res.json(ok((await filters()).categories)))
routes.get('/leads/filters',async(_req,res)=>res.json(ok(await filters())))
routes.get('/leads/stats',async(_req,res)=>res.json(ok(await stats())))
routes.get('/leads',async(req,res)=>res.json(await list(req.query)))
routes.post('/leads',async(req,res)=>res.status(201).json(ok(await save(req.body))))
routes.post('/leads/import/preview',upload.single('file'),async(req,res)=>{
  if(!req.file)throw new HttpError(422,'Choose a workbook first')
  res.status(201).json(ok(await preview(req.file.buffer,req.file.originalname,res.locals.admin.id)))
})
routes.post('/leads/import',async(req,res)=>{
  const {id,distinct}=z.object({id:z.string().uuid(),distinct:z.array(z.number().int().positive()).max(20000).default([])}).parse(req.body)
  await startImport(id,res.locals.admin.id,distinct);dispatch(id)
  res.status(202).json(ok(await owned(id,res.locals.admin.id)))
})
routes.get('/leads/import/:id',async(req,res)=>res.json(ok(await owned(req.params.id,res.locals.admin.id))))
routes.get('/leads/import/:id/rows',async(req,res)=>{
  await owned(req.params.id,res.locals.admin.id)
  const query=z.object({page:z.coerce.number().int().min(1).max(1000).default(1),kind:z.enum(['new','update','duplicate','review','invalid']).optional()}).parse(req.query)
  const where={jobId:req.params.id,kind:query.kind}
  const [rows,total]=await db.$transaction([db.importRow.findMany({where,take:25,skip:(query.page-1)*25,orderBy:{rowNumber:'asc'}}),db.importRow.count({where})])
  res.json(ok({rows,total}))
})
routes.get('/leads/import/:id/errors',async(req,res)=>{
  await owned(req.params.id,res.locals.admin.id)
  const rows=await db.importRow.findMany({where:{jobId:req.params.id,kind:{in:['invalid','review']}},orderBy:{rowNumber:'asc'}})
  res.attachment('import-row-issues.xlsx').send(issueWorkbook(rows))
})
routes.get('/import-history',async(req,res)=>{
  const page=z.coerce.number().int().min(1).max(100000).parse(req.query.page||1)
  const where={importedBy:res.locals.admin.id,state:{not:'preview'}}
  const [rows,total]=await db.$transaction([db.importHistory.findMany({where,omit:{categories:true},skip:(page-1)*25,take:25,orderBy:[{createdAt:'desc'},{id:'desc'}]}),db.importHistory.count({where})])
  res.json(ok({rows,total}))
})
routes.get('/leads/template',async(_req,res)=>res.attachment('manufacturer-leads-template.xlsx').send(workbook([],(await filters()).categories)))
routes.get('/leads/export',async(req,res)=>res.attachment('manufacturer-leads.xlsx').send(workbook(await exportRows(req.query),(await filters()).categories)))
routes.get('/leads/duplicate-check',async(req,res)=>res.json(ok(await duplicateCheck(req.query))))
routes.get('/leads/:id',async(req,res)=>res.json(ok(await db.lead.findUniqueOrThrow({where:{id:req.params.id},omit:omitKeys}))))
routes.patch('/leads/:id',async(req,res)=>res.json(ok(await save(req.body,req.params.id))))
routes.patch('/leads/:id/status',async(req,res)=>{
  const body=z.object({status:z.enum(statuses)}).strict().parse(req.body)
  res.json(ok(await save(body,req.params.id)))
})
routes.delete('/leads/:id',async(req,res)=>{
  await db.$transaction(async tx=>{await lockLeads(tx);await tx.lead.delete({where:{id:req.params.id}})})
  res.json(ok(null))
})
