import path from 'node:path'
import {Prisma} from '@prisma/client'
import {db,lockLeads,type Tx} from '../db'
import {HttpError} from '../middleware/http'
import {fields,leadKeys,leadSchema,type LeadData,type RowKind} from '../../../shared/leads'
import {Candidates,merge,record} from './identity'
import {readWorkbook} from './workbooks'

const batch=200
const json=(v:unknown)=>v as Prisma.InputJsonValue
const summarySelect={id:true,filename:true,totalRows:true,importedRows:true,duplicateRows:true,updatedRows:true,failedRows:true,reviewedRows:true,processed:true,state:true,error:true,createdAt:true} as const
export async function owned(id:string,adminId:string){
  const job=await db.importHistory.findFirst({where:{id,importedBy:adminId},select:summarySelect})
  if(!job)throw new HttpError(404,'Import not found')
  return job
}
export async function preview(bytes:Buffer,filename:string,adminId:string){
  const input=await readWorkbook(bytes,filename)
  const counts:Record<RowKind,number>={new:0,duplicate:0,update:0,invalid:0,review:0}
  const staged=new Candidates()
  // All staging rows become visible together. A failed preview leaves no partial job.
  const job=await db.$transaction(async tx=>{
    const job=await tx.importHistory.create({data:{filename:path.basename(filename).slice(0,250),importedBy:adminId,totalRows:input.rows.length,categories:input.categories},select:summarySelect})
    for(let offset=0;offset<input.rows.length;offset+=batch){
      const parsed=input.rows.slice(offset,offset+batch).map(row=>({row,parsed:leadSchema.safeParse(row.values)}))
      await staged.load(tx,parsed.flatMap(p=>p.parsed.success?[p.parsed.data]:[]))
      const rows:Prisma.ImportRowCreateManyInput[]=[]
      for(const {row,parsed:result} of parsed){
        let kind:RowKind='invalid', reason=row.error, match:Prisma.InputJsonValue|undefined,values=json(row.values)
        if(!reason && result.success){
          const data=result.data,decision=staged.classify(data)
          kind=decision.kind;reason=decision.reason||null;values=json(data)
          if(decision.existing)match=json({id:decision.existing.id,...Object.fromEntries(fields.map(k=>[k,decision.existing![k]]))})
          if(kind==='new')staged.add(record(data))
          if(kind==='update' && decision.existing)staged.add(merge(decision.existing,data).merged)
        }else if(!reason && !result.success)reason=result.error.issues.map(i=>i.path.join('.')+' — '+i.message).join(', ')
        counts[kind]++
        rows.push({jobId:job.id,rowNumber:row.rowNumber,kind,reason,values,match})
      }
      await tx.importRow.createMany({data:rows})
    }
    return job
  },{timeout:90000})
  return {job,counts}
}
export async function startImport(id:string,adminId:string,distinct:number[]){
  await owned(id,adminId)
  await db.$transaction(async tx=>{
    await lockLeads(tx)
    const job=await tx.importHistory.findUniqueOrThrow({where:{id}})
    if(job.state!=='preview')return
    if(distinct.length)await tx.importRow.updateMany({where:{jobId:id,kind:'review',rowNumber:{in:distinct}},data:{allowDistinct:true}})
    await saveCategories(tx,job.categories)
    await tx.importHistory.update({where:{id},data:{state:'importing'}})
  })
}
export async function saveCategories(tx:Tx,categories:(string|null)[]){
  const names=[...new Set(categories.filter((n):n is string=>!!n))]
  if(names.length)await tx.category.createMany({data:names.map(name=>({name})),skipDuplicates:true})
}
async function processBatch(id:string){
  return db.$transaction(async tx=>{
    await lockLeads(tx)
    const job=await tx.importHistory.findUniqueOrThrow({where:{id},select:{state:true,processed:true,totalRows:true}})
    if(job.state!=='importing')return false
    const rows=await tx.importRow.findMany({where:{jobId:id},orderBy:{rowNumber:'asc'},skip:job.processed,take:batch})
    const candidates=new Candidates()
    await candidates.load(tx,rows.filter(r=>r.kind!=='invalid').map(r=>r.values as LeadData))
    const inserts:ReturnType<typeof record>[]=[], updates=new Map<string,Prisma.LeadUpdateInput>(), categories:string[]=[]
    let duplicateRows=0,updatedRows=0,failedRows=0,reviewedRows=0
    for(const row of rows){
      if(row.kind==='invalid'){failedRows++;continue}
      const data=row.values as LeadData
      const decision=candidates.classify(data)
      let kind=decision.kind
      // Approval only applies to the exact candidate shown at preview time.
      const reviewed=row.match as (Partial<LeadData>&{id?:string})|null
      const approved=row.allowDistinct && reviewed && decision.existing &&
        (!reviewed.id || reviewed.id===decision.existing.id) &&
        fields.every(f=>reviewed[f]===decision.existing?.[f])
      if(kind==='review' && approved)kind='new'
      if(kind==='new'){
        const fresh=record({...data,searchId:decision.existing?.searchId===data.searchId?null:data.searchId})
        inserts.push(fresh);candidates.add(fresh)
      }else if(kind==='duplicate'){duplicateRows++}
      else if(kind==='update' && decision.existing){
        const existing=decision.existing,{changes,merged}=merge(existing,data)
        updates.set(existing.id,{...updates.get(existing.id),...changes,...leadKeys(merged)} as Prisma.LeadUpdateInput)
        candidates.add(merged);updatedRows++
      }else{
        reviewedRows++
        await tx.importRow.update({
          where:{jobId_rowNumber:{jobId:id,rowNumber:row.rowNumber}},
          data:{kind:'review',reason:decision.reason||'Match changed since preview',match:decision.existing?json(decision.existing):undefined},
        })
      }
      if((kind==='new'||kind==='update')&&data.category)categories.push(data.category)
    }
    if(inserts.length)await tx.lead.createMany({data:inserts})
    for(const [leadId,changes] of updates)await tx.lead.update({where:{id:leadId},data:changes as Prisma.LeadUpdateInput})
    await saveCategories(tx,categories)
    const processed=job.processed+rows.length, more=processed<job.totalRows
    await tx.importHistory.update({where:{id},data:{processed,state:more?'importing':'complete',importedRows:{increment:inserts.length},duplicateRows:{increment:duplicateRows},updatedRows:{increment:updatedRows},failedRows:{increment:failedRows},reviewedRows:{increment:reviewedRows}}})
    return more
  },{timeout:60000,maxWait:60000})
}
const running=new Map<string,Promise<void>>()
export function processImport(id:string){
  const existing=running.get(id)
  if(existing)return existing
  const task=(async()=>{
    try{while(await processBatch(id)){await new Promise(r=>setImmediate(r))}}
    catch(err){
      await db.importHistory.updateMany({where:{id,state:'importing'},data:{state:'failed',error:'Import interrupted. Reimport the workbook to resume safely.'}})
      throw err
    }finally{running.delete(id)}
  })()
  running.set(id,task);return task
}
export const dispatch=(id:string)=>{void processImport(id).catch(()=>console.error('Import interrupted',id))}
export async function resumeImports(){
  await db.importHistory.deleteMany({where:{state:'preview',createdAt:{lt:new Date(Date.now()-86400000)}}})
  const unfinished=await db.importHistory.findMany({where:{state:'importing'},select:{id:true}})
  for(const job of unfinished)dispatch(job.id)
}
