import {useSearchParams} from 'react-router-dom'
import {listSchema,type ListOptions} from '../../../shared/leads'
export function useListState(){
  const [params,setParams]=useSearchParams()
  const raw=Object.fromEntries(params)
  const defaults=listSchema.parse({})
  for(const key of Object.keys(defaults) as (keyof ListOptions)[]){
    if(!listSchema.shape[key].safeParse(raw[key]).success)delete raw[key]
  }
  const value=listSchema.parse(raw)
  const change=(patch:Partial<ListOptions>,replace=false)=>{
    const next=new URLSearchParams(params)
    for(const [key,v] of Object.entries(patch)){if(v==='')next.delete(key);else next.set(key,String(v))}
    setParams(next,{replace})
  }
  return {value,change,key:new URLSearchParams(Object.entries(value).map(([k,v])=>[k,String(v)])).toString()}
}
