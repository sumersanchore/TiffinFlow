import fs from 'node:fs/promises'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {db} from '../db'
import {projectRoot} from '../config'
import {seedAdmin} from '../services/auth'
import {preview,startImport,processImport,owned} from '../services/imports'
async function main(){
  const filename=path.resolve(process.argv[2]||path.join(projectRoot,'data/deduplicated_manufacturer_leads.xlsx'))
  const admin=await seedAdmin()
  const bytes=await fs.readFile(filename)
  const {job,counts}=await preview(bytes,path.basename(filename),admin.id)
  console.log('Preview',counts)
  // The supplied deduplicated source retains IDs 1248 and 1251 as separate records.
  const reference=createHash('sha256').update(bytes).digest('hex')==='eb1863321b8fd5531b19fd3d8b406f41728bdf9cc5b5792f27dd0e8ee7603012'
  const reviews=reference?await db.importRow.findMany({where:{jobId:job.id,kind:'review'}}):[]
  const distinct=reviews.filter(r=>{
    const ids=[(r.values as {searchId:string}).searchId,(r.match as {searchId:string}|null)?.searchId].sort()
    return ids.join(',')==='1248,1251'
  }).map(r=>r.rowNumber)
  await startImport(job.id,admin.id,distinct);await processImport(job.id)
  const result=await owned(job.id,admin.id)
  console.log('Import complete',JSON.stringify(result))
  if(result.failedRows||result.reviewedRows)process.exitCode=2
}
main().catch(err=>{console.error(err.message);process.exitCode=1}).finally(()=>db.$disconnect())
