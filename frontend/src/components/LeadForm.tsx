import {useEffect,useRef,useState} from 'react'
import {useForm,useWatch} from 'react-hook-form'
import type {z} from 'zod'
import {zodResolver} from '@hookform/resolvers/zod'
import {toast} from 'sonner'
import {AlertTriangle,Link2,Phone,Search} from 'lucide-react'
import {columns,fields,leadSchema,statuses,type Lead,type LeadData} from '../../../shared/leads'
import {api,message,refreshLeads} from '../services/api'
import {Dialog} from './ui/dialog'
import {Button} from './ui/button'

type FormValues=z.output<typeof leadSchema>
type DuplicateResult={kind:string;reason:string|null;match:(Partial<LeadData>&{id?:string})|null}

export function LeadForm({lead,categories,onClose}:{lead?:Lead;categories:string[];onClose:()=>void}){
  const initial=Object.fromEntries(fields.map(f=>[f,lead?.[f]??(f==='status'?'Not Started':'')])) as FormValues
  const {register,handleSubmit,setError,control,formState:{errors,isSubmitting}}=useForm<z.input<typeof leadSchema>,unknown,z.output<typeof leadSchema>>({resolver:zodResolver(leadSchema),defaultValues:initial})
  const identity=useWatch({control,name:['brandName','phoneNumber','whatsapp','website'] as const}) as [string,string,string,string]
  const [duplicate,setDuplicate]=useState<DuplicateResult|null>(null)
  const [checking,setChecking]=useState(false)
  const timer=useRef<ReturnType<typeof setTimeout>|undefined>(undefined)
  useEffect(()=>()=>clearTimeout(timer.current),[])
  // Debounced live duplicate check against phone / website / brand name.
  useEffect(()=>{
    const [brandName,phoneNumber,whatsapp,website]=identity
    const hasIdentity=!!brandName||!!phoneNumber||!!whatsapp||!!website
    if(!hasIdentity){setDuplicate(null);return}
    clearTimeout(timer.current)
    setChecking(true)
    timer.current=setTimeout(async()=>{
      try{
        const params=new URLSearchParams()
        if(brandName)params.set('brandName',brandName)
        if(phoneNumber)params.set('phoneNumber',phoneNumber)
        if(whatsapp)params.set('whatsapp',whatsapp)
        if(website)params.set('website',website)
        if(lead)params.set('exclude',lead.id)
        const result=await api<DuplicateResult>('/leads/duplicate-check?'+params.toString())
        setDuplicate(result)
      }catch(e){
        setDuplicate(null);if(e instanceof TypeError)console.error(message(e))
      }finally{setChecking(false)}
    },450)
  },[identity,lead])
  return <Dialog title={lead?'Edit lead':'Add lead'} onClose={onClose} wide><form noValidate onSubmit={handleSubmit(async data=>{
    try{await api('/leads'+(lead?'/'+lead.id:''),{method:lead?'PATCH':'POST',body:JSON.stringify(data)});await refreshLeads();toast.success(lead?'Lead updated':'Lead added');onClose()}catch(e){setError('root',{message:message(e)})}
  })}><div className="form-grid">{fields.map(f=><div className={'form-field '+(f==='fullAddress'?'full':'')} key={f}><label htmlFor={'lead-'+f}>{columns[f]}{f==='brandName'&&<span className="required"> *</span>}</label>
    {f==='status'?<select id={'lead-'+f} {...register(f)}>{statuses.map(s=><option key={s}>{s}</option>)}</select>:f==='fullAddress'?<textarea id={'lead-'+f} rows={2} {...register(f)}/>:<input id={'lead-'+f} {...register(f)} list={f==='category'?'categories':undefined} placeholder={f==='searchId'?'Generated automatically':undefined} aria-invalid={!!errors[f]} type={f==='email'?'email':f==='phoneNumber'||f==='whatsapp'?'tel':'text'}/>}
    {errors[f]&&<small className="field-error">{String(errors[f]?.message)}</small>}</div>)}<datalist id="categories">{categories.map(c=><option key={c} value={c}/>)}</datalist></div>
    {checking&&<p className="duplicate-check checking"><Search size={14}/>Checking for existing matches…</p>}
    {duplicate&&duplicate.kind!=='new'&&<div className="duplicate-check hit" role="alert"><AlertTriangle size={16}/><div><strong>Could match an existing lead</strong><p>{duplicate.reason||'A matching lead already exists'}.</p>{duplicate.match&&<p className="duplicate-match">Matched: <Link2 size={12}/> <a href={'/leads'}>{duplicate.match.searchId||duplicate.match.brandName}</a>{duplicate.match.phoneNumber&&<span><Phone size={11}/>{duplicate.match.phoneNumber}</span>}{duplicate.match.city&&<span> · {duplicate.match.city}</span>}</p>}<small>If this is the same business, edit or enrich the existing record instead of creating a duplicate.</small></div></div>}
    {errors.root&&<p className="error-box" role="alert">{errors.root.message}</p>}<footer className="dialog-foot"><Button onClick={onClose}>Cancel</Button><Button variant="primary" type="submit" disabled={isSubmitting}>{isSubmitting?'Saving…':'Save lead'}</Button></footer></form></Dialog>
}
