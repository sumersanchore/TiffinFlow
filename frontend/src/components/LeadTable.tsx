import {useState} from 'react'
import {Building2,ChevronDown,ChevronUp,ChevronsUpDown,ExternalLink,MessageCircle,PhoneCall,Pencil,Trash2} from 'lucide-react'
import {toast} from 'sonner'
import {columns,phoneKey,statuses,websiteUrl,type Lead,type Field,type ListOptions} from '../../../shared/leads'
import {api,message,refreshLeads} from '../services/api'
import './LeadTable.css'
const visibleFields:Field[]=['brandName','website','phoneNumber','fullAddress','status']
export const initials=(name:string)=>name.trim().split(/\s+/).slice(0,2).map(s=>s[0]?.toUpperCase()).join('')
function Status({lead}:{lead:Lead}){
  const [busy,setBusy]=useState(false)
  return <span className={'status s'+statuses.indexOf(lead.status)}><i/><select aria-label={'Status for '+lead.brandName} value={lead.status} disabled={busy} onChange={async e=>{
    const status=e.target.value;setBusy(true)
    try{await api('/leads/'+lead.id+'/status',{method:'PATCH',body:JSON.stringify({status})});await refreshLeads();toast.success('Status updated')}catch(e){toast.error(message(e))}finally{setBusy(false)}
  }}>{statuses.map(s=><option key={s}>{s}</option>)}</select></span>
}
function Cell({field,lead}:{field:Field;lead:Lead}){
  if(field==='whatsapp'){
    const number=lead.whatsapp||lead.phoneNumber
    const digits=number&&phoneKey(number)
    if(!number||!digits)return <span className="muted">—</span>
    const international=digits.length===10?'91'+digits:digits
    return <a href={'https://wa.me/'+international} target="_blank" rel="noopener noreferrer" aria-label={'Message '+number+' on WhatsApp'}><MessageCircle size={13}/>{number}</a>
  }
  const value=lead[field]
  if(!value)return <span className="muted">—</span>
  if(field==='brandName')return <div className="brand-cell"><strong>{value}</strong></div>
  if(field==='searchId')return <span className="record-id">{value}</span>
  if(field==='status')return <Status lead={lead}/>
  if(field==='category')return <span className="category-chip">{value}</span>
  if(field==='phoneNumber')return <a href={'tel:'+value.replace(/[^+\d]/g,'')} aria-label={'Call '+value}><PhoneCall size={13}/>{value}</a>
  if(field==='email')return <a href={'mailto:'+value}>{value}</a>
  if(field==='website'&&websiteUrl(value))return <a href={websiteUrl(value)!} target="_blank" rel="noreferrer">{new URL(websiteUrl(value)!).hostname}<ExternalLink size={12}/></a>
  return value
}
export function LeadTable({rows,loading,options,onSort,onEdit,onDelete}:{rows:Lead[];loading:boolean;options:ListOptions;onSort:(f:Field)=>void;onEdit:(l:Lead)=>void;onDelete:(l:Lead)=>void}){
  return <div className="table-scroll" tabIndex={0} role="region" aria-label="Scrollable lead directory"><p className="table-scroll-hint">Swipe horizontally to see all columns</p><table className="directory-table"><thead><tr>{visibleFields.map(f=><th key={f} aria-sort={f===options.sort?(options.direction==='asc'?'ascending':'descending'):'none'}><button onClick={()=>onSort(f)}>{f==='phoneNumber'?'Contact Number':f==='fullAddress'?'Address':columns[f]}{options.sort===f?(options.direction==='asc'?<ChevronUp size={13}/>:<ChevronDown size={13}/>):<ChevronsUpDown size={12}/>}</button></th>)}<th>Rating</th><th>Review Count</th><th>WhatsApp</th><th className="action-col">Actions</th></tr></thead><tbody>
    {loading?Array.from({length:6},(_,i)=><tr key={i}>{[...visibleFields,'rating','reviewCount','whatsapp','actions'].map(f=><td key={f}><span className="skeleton"/></td>)}</tr>):rows.map(row=><tr key={row.id}>{visibleFields.map(f=><td key={f} className={'col-'+f}><Cell field={f} lead={row}/></td>)}<td className="muted">—</td><td className="muted">—</td><td className="col-whatsapp"><Cell field="whatsapp" lead={row}/></td><td className="action-col"><div className="row-actions"><button className="icon-button" aria-label={'Edit '+row.brandName} onClick={()=>onEdit(row)}><Pencil size={15}/></button><button className="icon-button delete-action" aria-label={'Delete '+row.brandName} onClick={()=>onDelete(row)}><Trash2 size={15}/></button></div></td></tr>)}
  </tbody></table>{!loading&&!rows.length&&<div className="empty"><Building2 size={30}/><h3>No leads found</h3><p>Change your filters or add a manufacturer lead.</p></div>}</div>
}
