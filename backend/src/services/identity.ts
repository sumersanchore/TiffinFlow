import {randomUUID} from 'node:crypto'
import {brandKey,fields,leadKeys,normalize,phoneKey,websiteKey,type LeadData,type RowKind} from '../../../shared/leads'
import type {Tx} from '../db'

export type LeadRecord = LeadData & {
  id:string
  searchId:string
  brandKey:string
  phoneKey:string|null
  whatsappKey:string|null
  websiteKey:string|null
}
export type MatchOn = 'search ID'|'mobile number'|'website'|'brand name'
export type Decision = {kind:RowKind;existing?:LeadRecord;reason?:string;matchedOn?:MatchOn}

export function record(data:LeadData):LeadRecord{
  return {
    ...data,
    id:randomUUID(),
    searchId:data.searchId||'ML-'+randomUUID(),
    ...leadKeys(data),
  }
}

function fromDb(row:LeadRecord):LeadRecord{
  return {...row,status:row.status as LeadData['status'],...leadKeys(row)}
}
function mobileKeys(row:LeadRecord|LeadData){
  const phone=(row as LeadRecord).phoneKey??phoneKey(row.phoneNumber)
  const whatsapp=(row as LeadRecord).whatsappKey??phoneKey(row.whatsapp)
  return [...new Set([phone,whatsapp].filter((key):key is string=>!!key))]
}
function sameCity(a:string|null,b:string|null){
  const left=normalize(a),right=normalize(b)
  return !left || !right || left===right
}
function phoneConflict(row:LeadData,existing:LeadRecord){
  const left=mobileKeys(row),right=mobileKeys(existing)
  return left.length>0 && right.length>0 && !left.some(key=>right.includes(key))
}
function siteConflict(row:LeadData,existing:LeadRecord){
  const site=websiteKey(row.website)
  return !!site && !!existing.websiteKey && site!==existing.websiteKey
}
function conflicts(row:LeadData,existing:LeadRecord){
  const reasons:string[]=[]
  const brand=brandKey(row.brandName)
  if(brand && existing.brandKey && brand!==existing.brandKey)reasons.push('brand name')
  if(phoneConflict(row,existing))reasons.push('mobile number')
  if(siteConflict(row,existing))reasons.push('website')
  return reasons
}
function uniqueRecords(rows:LeadRecord[]){
  return [...new Map(rows.map(row=>[row.id,row])).values()]
}
const unique=(values:string[])=>[...new Set(values.filter(Boolean))]

export class Candidates {
  private byId=new Map<string,LeadRecord>()
  private bySearch=new Map<string,LeadRecord>()
  private byBrand=new Map<string,Set<LeadRecord>>()
  private byPhone=new Map<string,Set<LeadRecord>>()
  private bySite=new Map<string,Set<LeadRecord>>()

  private put(index:Map<string,Set<LeadRecord>>,key:string|null,row:LeadRecord){
    if(!key)return
    const group=index.get(key)||new Set<LeadRecord>()
    group.add(row);index.set(key,group)
  }
  private drop(index:Map<string,Set<LeadRecord>>,key:string|null,row:LeadRecord){
    if(!key)return
    const group=index.get(key)
    if(!group)return
    group.delete(row)
    if(!group.size)index.delete(key)
  }
  private remove(row:LeadRecord){
    if(this.bySearch.get(row.searchId)===row)this.bySearch.delete(row.searchId)
    this.drop(this.byBrand,row.brandKey,row)
    this.drop(this.bySite,row.websiteKey,row)
    for(const key of mobileKeys(row))this.drop(this.byPhone,key,row)
  }
  add(row:LeadRecord){
    const old=this.byId.get(row.id)
    if(old)this.remove(old)
    this.byId.set(row.id,row)
    this.bySearch.set(row.searchId,row)
    this.put(this.byBrand,row.brandKey,row)
    this.put(this.bySite,row.websiteKey,row)
    for(const key of mobileKeys(row))this.put(this.byPhone,key,row)
  }
  async load(tx:Tx,rows:LeadData[],excludeId?:string){
    const searchIds=unique(rows.flatMap(row=>row.searchId?[row.searchId]:[]))
    const brandKeys=unique(rows.map(row=>brandKey(row.brandName)))
    const phones=unique(rows.flatMap(row=>[phoneKey(row.phoneNumber),phoneKey(row.whatsapp)].filter((key):key is string=>!!key)))
    const sites=unique(rows.map(row=>websiteKey(row.website)).filter((key):key is string=>!!key))
    const or=[
      ...(searchIds.length?[{searchId:{in:searchIds}}]:[]),
      ...(brandKeys.length?[{brandKey:{in:brandKeys}}]:[]),
      ...(phones.length?[{phoneKey:{in:phones}},{whatsappKey:{in:phones}}]:[]),
      ...(sites.length?[{websiteKey:{in:sites}}]:[]),
    ]
    if(!or.length)return
    const found=await tx.lead.findMany({where:{...(excludeId?{id:{not:excludeId}}:{}),OR:or}})
    for(const row of found){
      if(!this.byId.has(row.id))this.add(fromDb(row as LeadRecord))
    }
  }
  private phoneHits(row:LeadData){
    const hits=new Set<LeadRecord>()
    for(const key of mobileKeys(row)){
      for(const match of this.byPhone.get(key)||[])hits.add(match)
    }
    return [...hits]
  }
  private settle(existing:LeadRecord,row:LeadData,matchedOn:MatchOn,notes:string[]=[]):Decision{
    const changes=enrich(existing,row)
    const kind:RowKind=Object.keys(changes).length?'update':'duplicate'
    const detail=notes.length?' ('+notes.join('; ')+')':''
    return {
      kind,existing,matchedOn,
      reason:`${kind==='update'?'Completes':'Duplicate of'} ${existing.searchId} matched by ${matchedOn}${detail}`,
    }
  }
  classify(row:LeadData):Decision{
    const sameId=row.searchId?this.bySearch.get(row.searchId):undefined
    if(sameId){
      const mismatches=conflicts(row,sameId)
      if(mismatches.length)return {
        kind:'review',existing:sameId,
        reason:`Search ID ${row.searchId} belongs to a lead with a different ${mismatches.join(', ')}`,
      }
      return this.settle(sameId,row,'search ID')
    }

    const phones=this.phoneHits(row)
    const siteKey=websiteKey(row.website)
    const sites=siteKey?[...(this.bySite.get(siteKey)||[])]:[]
    const strong=uniqueRecords([...phones,...sites])
    if(strong.length===1){
      const existing=strong[0]
      const matchedOn:MatchOn=phones.includes(existing)?'mobile number':'website'
      const notes:string[]=[]
      if(brandKey(row.brandName)!==existing.brandKey)notes.push(`brand name differs, ${existing.brandName} kept`)
      if(matchedOn==='mobile number'&&siteConflict(row,existing))notes.push('website differs, existing website kept')
      if(matchedOn==='website'&&phoneConflict(row,existing))notes.push('mobile number differs, existing mobile kept')
      return this.settle(existing,row,matchedOn,notes)
    }
    if(strong.length>1)return {
      kind:'review',existing:strong[0],
      reason:`Matches ${strong.length} leads by mobile number or website (${strong.map(match=>match.searchId).join(', ')}) — confirm which lead this row belongs to`,
    }

    const brands=[...(this.byBrand.get(brandKey(row.brandName))||[])]
    if(brands.length===1){
      const existing=brands[0],mismatches=conflicts(row,existing)
      if(mismatches.length)return {
        kind:'review',existing,
        reason:`Same brand name as ${existing.searchId} but ${mismatches.join(' and ')} differ`,
      }
      if(!sameCity(row.city,existing.city))return {
        kind:'review',existing,
        reason:`Same brand name as ${existing.searchId} in a different city (${existing.city} vs ${row.city||'unknown'}) — confirm whether this is a separate business`,
      }
      return this.settle(existing,row,'brand name')
    }
    if(brands.length>1)return {
      kind:'review',existing:brands[0],
      reason:`${brands.length} leads share this brand name (${brands.map(match=>match.searchId).join(', ')}) — confirm which lead this row belongs to`,
    }
    return {kind:'new'}
  }
}

// Fields that may be back-filled onto an existing lead when a row supplies a value
// the record does not yet have. Identity fields (searchId/brandName/status) and the
// fingerprint keys are excluded so enrich/merge can never change who a lead is.
type FillableFields = Omit<LeadData,'searchId'|'brandName'|'status'>
const fillable = (fields as readonly (keyof LeadData)[]).filter(
  (field): field is keyof FillableFields =>
    field!=='searchId' && field!=='brandName' && field!=='status',
)

export function enrich(existing:LeadRecord,row:LeadData){
  const changes:Partial<FillableFields>={}
  for(const field of fillable){
    if(!existing[field]&&row[field])changes[field]=row[field] as FillableFields[typeof field]
  }
  return changes
}

export function merge(existing:LeadRecord,row:LeadData){
  const changes=enrich(existing,row)
  const merged={...existing,...changes}
  return {changes,merged:{...merged,...leadKeys(merged)}}
}
