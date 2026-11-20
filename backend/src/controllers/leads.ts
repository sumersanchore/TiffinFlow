import {Prisma} from '@prisma/client'
import {z} from 'zod'
import {db,lockLeads} from '../db'
import {fields,leadKeys,listSchema,leadSchema,type ListOptions,type LeadData} from '../../../shared/leads'
import {HttpError} from '../middleware/http'
import {Candidates,record,type Decision} from '../services/identity'
import {saveCategories} from '../services/imports'

export const omitKeys={brandKey:true,phoneKey:true,whatsappKey:true,websiteKey:true} as const
const identitySignature=(row:LeadData)=>leadKeys(row)
const publicMatch=(row:{id:string}&LeadData)=>({id:row.id,...Object.fromEntries(fields.map(field=>[field,row[field]]))})
const duplicateMessage=(decision:Decision)=>{
  const reason=decision.reason||'A matching lead already exists'
  return decision.existing?`${reason}. Open ${decision.existing.searchId} to update it instead.`:reason
}

export function whereFor(q:ListOptions):Prisma.LeadWhereInput{
  return {...q.category&&{category:q.category},...q.city&&{city:q.city},...q.status&&{status:q.status},
    ...q.search&&{OR:fields.map(f=>({[f]:{contains:q.search.replace(/[\\%_]/g,'\\$&'),mode:'insensitive'}}))}}
}
export const ordering=(q:ListOptions):Prisma.LeadOrderByWithRelationInput[]=>[{[q.sort]:q.direction},{id:'asc'}]
export async function list(query:unknown){
  const q=listSchema.parse(query),where=whereFor(q)
  return db.$transaction(async tx=>{
    const total=await tx.lead.count({where}),totalPages=Math.max(1,Math.ceil(total/q.limit)),page=Math.min(q.page,totalPages)
    const data=await tx.lead.findMany({where,orderBy:ordering(q),skip:(page-1)*q.limit,take:q.limit,omit:omitKeys})
    return {success:true,data,pagination:{page,limit:q.limit,total,totalPages,hasNextPage:page<totalPages,hasPreviousPage:page>1}}
  },{isolationLevel:'RepeatableRead'})
}
export async function save(body:unknown,id?:string){
  return db.$transaction(async tx=>{
    await lockLeads(tx)
    const previous=id?await tx.lead.findUniqueOrThrow({where:{id}}):null
    if(!body || typeof body!=='object' || Array.isArray(body))throw new HttpError(422,'Expected lead fields')
    const data=leadSchema.parse({...previous&&Object.fromEntries(fields.map(k=>[k,previous[k]])),...body})
    const keys=identitySignature(data)
    const oldKeys=previous?identitySignature(previous as LeadData):null
    const identityChanged=!previous || !oldKeys ||
      (data.searchId||'')!==previous.searchId ||
      keys.brandKey!==oldKeys.brandKey ||
      keys.phoneKey!==oldKeys.phoneKey ||
      keys.whatsappKey!==oldKeys.whatsappKey ||
      keys.websiteKey!==oldKeys.websiteKey
    if(identityChanged){
      const candidates=new Candidates()
      await candidates.load(tx,[data],id)
      const decision=candidates.classify(data)
      if(decision.kind!=='new')throw new HttpError(409,duplicateMessage(decision))
    }
    await saveCategories(tx,[data.category])
    if(previous)return tx.lead.update({
      where:{id},
      data:{...data,...keys,searchId:data.searchId||previous.searchId},
      omit:omitKeys,
    })
    return tx.lead.create({data:record(data),omit:omitKeys})
  })
}
export async function duplicateCheck(body:unknown){
  const input=z.object({
    searchId:z.union([z.string(),z.number()]).nullish(),
    brandName:z.union([z.string(),z.number()]).nullish(),
    phoneNumber:z.union([z.string(),z.number()]).nullish(),
    whatsapp:z.union([z.string(),z.number()]).nullish(),
    website:z.union([z.string(),z.number()]).nullish(),
    city:z.union([z.string(),z.number()]).nullish(),
    exclude:z.string().uuid().optional(),
  }).strict().parse(body)
  const data=leadSchema.parse({
    searchId:input.searchId,brandName:input.brandName,phoneNumber:input.phoneNumber,
    whatsapp:input.whatsapp,website:input.website,city:input.city,status:'Not Started',
  })
  return db.$transaction(async tx=>{
    const candidates=new Candidates()
    await candidates.load(tx,[data],input.exclude)
    const decision=candidates.classify(data)
    return {kind:decision.kind,reason:decision.reason||null,match:decision.existing?publicMatch(decision.existing):null}
  })
}
export async function filters(){
  const [categories,cities]=await Promise.all([db.category.findMany({orderBy:{name:'asc'},select:{name:true}}),db.lead.groupBy({by:['city'],where:{city:{not:null}},orderBy:{city:'asc'}})])
  return {categories:categories.map(c=>c.name),cities:cities.map(c=>c.city!)}
}
export async function stats(){
  const groups=await db.lead.groupBy({by:['status'],_count:true})
  const categories=await db.category.count()
  return {total:groups.reduce((sum,g)=>sum+g._count,0),categories,statuses:Object.fromEntries(groups.map(g=>[g.status,g._count]))}
}
export async function exportRows(query:unknown){
  const q=listSchema.parse(query)
  const rows=await db.lead.findMany({where:whereFor(q),orderBy:ordering(q),select:Object.fromEntries(fields.map(f=>[f,true]))})
  return rows.map(row=>({...row,status:row.status as LeadData['status']})) as LeadData[]
}
