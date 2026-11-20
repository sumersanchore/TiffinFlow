import {useEffect,useRef,useState} from 'react'
import {useQuery} from '@tanstack/react-query'
import {CheckCircle2,FileSpreadsheet,UploadCloud,Download,LoaderCircle} from 'lucide-react'
import {toast} from 'sonner'
import type {Job,Preview,PreviewRow,RowKind} from '../../../shared/leads'
import {columns,fields} from '../../../shared/leads'
import {api,download,message,refreshLeads} from '../services/api'
import {Dialog} from './ui/dialog'
import {Button} from './ui/button'

type Rows={rows:PreviewRow[];total:number}
const labels:Record<RowKind,string>={new:'New',update:'Enrich',duplicate:'Duplicate',invalid:'Invalid',review:'Review'}
export function ImportDialog({onClose,initialJob}:{onClose:()=>void;initialJob?:Job}){
  const input=useRef<HTMLInputElement>(null)
  const [preview,setPreview]=useState<Preview>(),[job,setJob]=useState<Job|undefined>(initialJob)
  const [busy,setBusy]=useState(false),[drag,setDrag]=useState(false),[error,setError]=useState('')
  const [page,setPage]=useState(1),[kind,setKind]=useState(''),[distinct,setDistinct]=useState<Set<number>>(new Set())
  const jobId=preview?.job.id||job?.id
  const rows=useQuery({queryKey:['preview',jobId,page,kind],enabled:!!preview&&!job,queryFn:()=>api<Rows>('/leads/import/'+jobId+'/rows?page='+page+(kind?'&kind='+kind:''))})
  const progress=useQuery({queryKey:['job',job?.id],enabled:!!job,queryFn:()=>api<Job>('/leads/import/'+job!.id),refetchInterval:q=>q.state.data?.state==='importing'||(!q.state.data&&!!job)?600:false})
  const current=progress.data||job
  useEffect(()=>{if(current?.state==='complete'||current?.state==='failed')void refreshLeads()},[current?.state])
  async function inspect(file?:File){
    if(!file||busy)return
    setError('');if(!/\.(xlsx|xls|csv)$/i.test(file.name)||file.size>8*1024*1024){setError('Choose an XLSX, XLS or CSV file up to 8 MB.');return}
    setBusy(true)
    try{const form=new FormData();form.append('file',file);setPreview(await api<Preview>('/leads/import/preview',{method:'POST',body:form}));setPage(1);setKind('');setDistinct(new Set())}catch(e){setError(message(e))}finally{setBusy(false)}
  }
  async function confirm(){
    setBusy(true);setError('')
    try{setJob(await api<Job>('/leads/import',{method:'POST',body:JSON.stringify({id:jobId,distinct:[...distinct]})}));toast.success('Import started')}catch(e){setError(message(e))}finally{setBusy(false)}
  }
  const issues=()=>download('/leads/import/'+jobId+'/errors','import-row-issues.xlsx')
  return <Dialog title={current?'Import results':preview?'Review import':'Bulk import'} description={current?.filename||preview?.job.filename||'Upload a manufacturer workbook to preview its records.'} onClose={onClose} wide={!!preview&&!current}>
    <div className="dialog-body">{current?<><div className="result-icon">{current.state==='complete'?<CheckCircle2/>:<FileSpreadsheet/>}</div><h3>{current.state==='complete'?'Import complete':current.state==='failed'?'Import interrupted':'Importing leads…'}</h3><p>{current.processed.toLocaleString()} of {current.totalRows.toLocaleString()} rows processed</p><progress max={current.totalRows} value={current.processed}/><div className="count-grid">{Object.entries({Imported:current.importedRows,Enriched:current.updatedRows,Duplicates:current.duplicateRows,Invalid:current.failedRows,'Review skipped':current.reviewedRows}).map(([k,n])=><div key={k}><strong>{n}</strong><small>{k}</small></div>)}</div>{current.error&&<p role="alert">{current.error}</p>}{(current.failedRows+current.reviewedRows)>0&&<Button onClick={issues}><Download/>Download row issues</Button>}</>:!preview?<><div className={'dropzone '+(drag?'dragging':'')} onDragOver={e=>{e.preventDefault();setDrag(true)}} onDragLeave={()=>setDrag(false)} onDrop={e=>{e.preventDefault();setDrag(false);void inspect(e.dataTransfer.files[0])}}>
      {busy?<LoaderCircle className="spin"/>:<UploadCloud/>}<strong>{busy?'Reading workbook…':'Drop your workbook here'}</strong><small>XLSX, XLS or CSV · Up to 8 MB</small><Button disabled={busy} onClick={()=>input.current?.click()}>Choose file</Button><input ref={input} type="file" aria-label="Workbook file" hidden accept=".xlsx,.xls,.csv" onChange={e=>void inspect(e.target.files?.[0])}/>
    </div><Button variant="ghost" onClick={()=>download('/leads/template','manufacturer-leads-template.xlsx')}><Download/>Download Excel template</Button></>:<>
      <div className="count-grid">{Object.entries(preview.counts).map(([k,n])=><div key={k}><strong>{n}</strong><small>{labels[k as RowKind]}</small></div>)}</div>
      <div className="preview-controls"><select aria-label="Preview row type" value={kind} onChange={e=>{setKind(e.target.value);setPage(1)}}><option value="">All preview rows</option>{Object.keys(labels).map(k=><option key={k} value={k}>{labels[k as RowKind]}</option>)}</select>{(preview.counts.invalid+preview.counts.review)>0&&<Button onClick={issues}><Download/>Row issues</Button>}</div>
      {preview.counts.review>0&&<p className="notice">Review similar businesses below. Select “Keep as distinct” to import a separate record. A conflicting Search ID gets a new ID.</p>}
      <div className="preview-scroll">{rows.isError?<p role="alert">{message(rows.error)}</p>:rows.isPending?<p>Loading preview…</p>:<table><thead><tr><th>Row</th><th>Result</th>{fields.map(f=><th key={f}>{columns[f]}</th>)}</tr></thead><tbody>{rows.data.rows.map(r=><tr key={r.rowNumber}><td>{r.rowNumber}</td><td><strong>{labels[r.kind]}</strong>{r.reason&&<small>{r.reason}</small>}{r.kind==='review'&&<><details><summary>Compare record</summary>{fields.filter(f=>r.match?.[f]).map(f=><small key={f}>{columns[f]} · {r.match?.[f]}</small>)}</details><label className="check"><input type="checkbox" checked={distinct.has(r.rowNumber)} onChange={e=>{const next=new Set(distinct);e.target.checked?next.add(r.rowNumber):next.delete(r.rowNumber);setDistinct(next)}}/>Keep as distinct</label></>}</td>{fields.map(f=><td key={f}>{r.values[f]||'—'}</td>)}</tr>)}</tbody></table>}</div>
      <div className="pager-small"><Button disabled={page===1} onClick={()=>setPage(page-1)}>Previous</Button><span>Page {page} of {Math.max(1,Math.ceil((rows.data?.total||0)/25))}</span><Button disabled={page*25>=(rows.data?.total||0)} onClick={()=>setPage(page+1)}>Next</Button></div>
    </>}{error&&<p className="error-box" role="alert">{error}</p>}{progress.isError&&<p role="alert">{message(progress.error)}</p>}</div>
    <footer className="dialog-foot">{preview&&!current&&<Button disabled={busy} onClick={()=>setPreview(undefined)}>Choose another file</Button>}{preview&&!current?<Button variant="primary" disabled={busy} onClick={confirm}>{busy?'Starting…':'Confirm import'}</Button>:<Button onClick={onClose}>{current?.state==='importing'?'Continue in background':'Close'}</Button>}</footer>
  </Dialog>
}
