import {db} from '../db'
import {leadKeys} from '../../../shared/leads'

// One-time idempotent backfill of the normalized identity keys (brandKey, phoneKey,
// whatsappKey, websiteKey) for leads that predate the fingerprint columns. Run after
// applying the 202611200002_identity_keys migration so duplicate detection by phone,
// website and brand name works against the historical data too.
async function main(){
  const leads=await db.lead.findMany({select:{id:true,brandName:true,phoneNumber:true,whatsapp:true,website:true,brandKey:true,phoneKey:true,whatsappKey:true,websiteKey:true}})
  let updated=0
  const updates:Parameters<typeof db.lead.update>[0][]=[]
  for(const lead of leads){
    const keys=leadKeys(lead)
    let changed=false
    for(const key of ['brandKey','phoneKey','whatsappKey','websiteKey'] as const){
      if((lead[key]??null)!==keys[key])changed=true
    }
    if(changed){updates.push({where:{id:lead.id},data:keys});updated++}
  }
  // Apply in batches to keep the advisory-lock window and query size bounded.
  for(let i=0;i<updates.length;i+=500){
    await Promise.all(updates.slice(i,i+500).map(u=>db.lead.update(u)))
    console.log(`backfilled ${Math.min(i+500,updates.length)}/${updates.length}`)
  }
  console.log(`Identity keys backfilled for ${updated} of ${leads.length} leads.`)
}
main().catch(err=>{console.error(err.message);process.exitCode=1}).finally(()=>db.$disconnect())
