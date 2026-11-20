import {db} from '../db'
import {seedAdmin} from '../services/auth'
seedAdmin().then(()=>console.log('Admin account ready')).catch(()=>{console.error('Admin setup failed');process.exitCode=1}).finally(()=>db.$disconnect())
