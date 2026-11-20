import {Navigate,Route,Routes} from 'react-router-dom'
import {useQuery} from '@tanstack/react-query'
import {api,ApiError} from './services/api'
import type {AdminUser} from '../../shared/leads'
import {Login} from './pages/Login'
import {Leads} from './pages/Leads'
import {Brand} from './components/Brand'
import {Button} from './components/ui/button'

export function App(){
  const session=useQuery({queryKey:['session'],queryFn:async()=>{
    try{return await api<AdminUser>('/auth/me')}catch(e){if(e instanceof ApiError&&e.status===401)return null;throw e}
  }})
  if(session.isPending || session.isError)return <main className="startup"><Brand/>{session.isError?<><p>Unable to reach the workspace.</p><Button onClick={()=>session.refetch()}>Try again</Button></>:<p role="status">Opening workspace…</p>}</main>
  const user=session.data
  return <Routes><Route path="/login" element={user?<Navigate to="/leads" replace/>:<Login/>}/><Route path="/leads" element={user?<Leads user={user}/>:<Navigate to="/login" replace/>}/><Route path="*" element={<Navigate replace to={user?'/leads':'/login'}/>}/></Routes>
}
