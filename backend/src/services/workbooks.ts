import {Worker} from 'node:worker_threads'
import path from 'node:path'
import * as XLSX from 'xlsx'
import {columns,fields,type LeadData} from '../../../shared/leads'
import {HttpError} from '../middleware/http'

export interface RawRow {rowNumber:number;values:Partial<Record<keyof LeadData,string>>;error:string|null}
export const maxBytes=8*1024*1024
let parsing=0
export async function readWorkbook(bytes:Buffer,filename:string):Promise<{rows:RawRow[];categories:string[]}>{
  const ext=path.extname(filename).toLowerCase()
  if(!['.xlsx','.xls','.csv'].includes(ext))throw new HttpError(415,'Choose an XLSX, XLS or CSV file')
  if(bytes.length>maxBytes || bytes.length<2)throw new HttpError(422,'File is empty or exceeds 8 MB')
  if(parsing>=2)throw new HttpError(429,'Other workbooks are being read. Try again shortly.')
  parsing++
  try{return await new Promise((resolve,reject)=>{
    const worker=new Worker(path.join(__dirname,'workbook-worker.cjs'),{workerData:{bytes,ext,columns},resourceLimits:{maxOldGenerationSizeMb:192}})
    const timer=setTimeout(()=>{void worker.terminate();reject(new HttpError(422,'Workbook processing timed out'))},45000)
    worker.once('message',msg=>{clearTimeout(timer);msg.error?reject(new HttpError(422,msg.error)):resolve(msg.data)})
    worker.once('error',()=>{clearTimeout(timer);reject(new HttpError(422,'Workbook could not be read'))})
    worker.once('exit',code=>{clearTimeout(timer);if(code)reject(new HttpError(422,'Workbook is too complex to read'))})
  })}finally{parsing--}
}
export function workbook(rows:LeadData[],categories:string[]){
  const book=XLSX.utils.book_new()
  const sheet=XLSX.utils.aoa_to_sheet([Object.values(columns),...rows.map(r=>fields.map(f=>r[f]))])
  sheet['!cols']=fields.map(f=>({wch:f==='fullAddress'?55:f==='brandName'?34:18}))
  XLSX.utils.book_append_sheet(book,sheet,'Manufacturer Leads')
  XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet([['Category'],...categories.map(c=>[c])]),'Categories')
  return XLSX.write(book,{type:'buffer',bookType:'xlsx',compression:true}) as Buffer
}
export function issueWorkbook(rows:{rowNumber:number;reason:string|null;values:unknown}[]){
  const book=XLSX.utils.book_new()
  const sheet=XLSX.utils.aoa_to_sheet([['Workbook row','Reason',...Object.values(columns)],...rows.map(r=>[r.rowNumber,r.reason,...fields.map(f=>(r.values as LeadData)[f])])])
  XLSX.utils.book_append_sheet(book,sheet,'Row issues')
  return XLSX.write(book,{type:'buffer',bookType:'xlsx',compression:true}) as Buffer
}
