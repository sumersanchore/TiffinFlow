import {app} from './app'
import {config} from './config'
import {db} from './db'
import {seedAdmin} from './services/auth'
import {resumeImports} from './services/imports'
async function start(){
  await seedAdmin();await resumeImports()
  const server=app.listen(config.PORT,()=>console.log('Manufacturer Leads API listening on port',config.PORT))
  const stop=()=>server.close(()=>{void db.$disconnect().finally(()=>process.exit(0))})
  process.once('SIGTERM',stop);process.once('SIGINT',stop)
}
start().catch(err=>{console.error('Startup failed:',err.code||err.name);process.exitCode=1;void db.$disconnect()})
