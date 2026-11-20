import bcrypt from 'bcryptjs'
import {db} from '../db'
import {config} from '../config'
export const publicAdmin = {id:true,email:true,phone:true,role:true} as const
export async function seedAdmin(){
  const email=config.ADMIN_EMAIL.toLowerCase()
  const passwordHash=await bcrypt.hash(config.ADMIN_PASSWORD,12)
  return db.admin.upsert({
    where:{email},
    update:{phone:config.ADMIN_PHONE,passwordHash},
    create:{email,phone:config.ADMIN_PHONE,passwordHash},
    select:publicAdmin
  })
}
