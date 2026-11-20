import {QueryClient} from '@tanstack/react-query'
import {toast} from 'sonner'
export const client=new QueryClient({defaultOptions:{queries:{retry:false,refetchOnWindowFocus:false,staleTime:15000}}})
export class ApiError extends Error {constructor(public status:number,message:string){super(message)}}
const apiOrigin=import.meta.env.DEV?'http://localhost:5000':''
async function response(path:string,options:RequestInit={}){
  const res=await fetch(apiOrigin+'/api'+path,{...options,credentials:'include',headers:{...options.body && !(options.body instanceof FormData)&&{'Content-Type':'application/json'},...options.headers}})
  if(!res.ok){
    const fallback='Request failed ('+res.status+')'
    const data=await res.json().catch(()=>({message:fallback}))
    if(res.status===401 && !path.startsWith('/auth/')){
      client.clear();client.setQueryData(['session'],null);toast.error('Session expired. Sign in again.')
    }
    throw new ApiError(res.status,data.message||fallback)
  }
  return res
}
export async function api<T>(path:string,options?:RequestInit):Promise<T>{return (await (await response(path,options)).json()).data}
export async function pageApi<T>(path:string,signal?:AbortSignal):Promise<T>{return (await response(path,{signal})).json()}
export async function download(path:string,filename:string){
  try{
    const blob=await (await response(path)).blob(),url=URL.createObjectURL(blob),a=document.createElement('a')
    a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000)
  }catch(e){toast.error(message(e))}
}
export const message=(e:unknown)=>e instanceof Error?e.message:'Unable to complete request'
export const refreshLeads=()=>client.invalidateQueries({predicate:q=>['leads','filters','stats','history'].includes(String(q.queryKey[0]))})
