import {useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {FileSpreadsheet,ChevronRight} from 'lucide-react'
import type {Job} from '../../../shared/leads'
import {api,message} from '../services/api'
import {Dialog} from './ui/dialog'
import {Button} from './ui/button'
export function History({onClose,onSelect}:{onClose:()=>void;onSelect:(j:Job)=>void}){
  const [page,setPage]=useState(1)
  const query=useQuery({queryKey:['history',page],queryFn:()=>api<{rows:Job[];total:number}>('/import-history?page='+page),refetchInterval:q=>q.state.data?.rows.some(j=>j.state==='importing')?1200:false})
  return <Dialog title="Import history" onClose={onClose}><div className="dialog-body history">{query.isPending?<p>Loading imports…</p>:query.isError?<p role="alert">{message(query.error)}</p>:!query.data.rows.length?<p>No imports yet.</p>:query.data.rows.map(j=><button key={j.id} onClick={()=>onSelect(j)}><FileSpreadsheet/><span><strong>{j.filename}</strong><small>{new Date(j.createdAt).toLocaleString()} · {j.totalRows} rows · {j.state}</small></span><ChevronRight size={16}/></button>)}</div>{(query.data?.total||0)>25&&<div className="pager-small"><Button disabled={page===1} onClick={()=>setPage(page-1)}>Previous</Button><span>Page {page}</span><Button disabled={page*25>=(query.data?.total||0)} onClick={()=>setPage(page+1)}>Next</Button></div>}</Dialog>
}
