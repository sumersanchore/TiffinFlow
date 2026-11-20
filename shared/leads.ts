import { z } from 'zod'

export const columns = {
  searchId: 'Search ID', brandName: 'Brand Name', category: 'Category', area: 'Area', city: 'City',
  contactPerson: 'Contact Person', phoneNumber: 'Phone Number', whatsapp: 'WhatsApp',
  email: 'Email', website: 'Website', fullAddress: 'Full Address', status: 'Status',
} as const
export type Field = keyof typeof columns
export const fields = Object.keys(columns) as Field[]
export const statuses = ['Not Started','In Progress','Contacted','Follow Up','Converted','Not Interested'] as const

const controlCharacters = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/
const phoneCharacters = /^\+?[\d(][\d() .\-\/]*(?:\s*(?:ext\.?|extension|x)\s*\d{1,6})?$/i
const pathScopedHosts = new Set([
  'instagram.com','facebook.com','fb.com','youtube.com','youtu.be','twitter.com','x.com','linkedin.com',
  'pinterest.com','threads.net','t.me','telegram.me','wa.me','wa.link','whatsapp.com','snapchat.com',
  'reddit.com','quora.com','tumblr.com','indiamart.com','tradeindia.com','exportersindia.com',
  'indianyellowpages.com','justdial.com','sulekha.com','olx.in','amazon.in','flipkart.com','alibaba.com',
  'aliexpress.com','etsy.com','ebay.com','google.com','goo.gl','g.page','maps.google.com',
  'business.google.com','yelp.com','mouthshut.com','trustpilot.com','imarble.in','stonecontact.com',
  'linktr.ee','beacons.ai','bio.link','linkin.bio','taplink.cc','carrd.co','about.me',
])

export function websiteUrl(value: string) {
  const text = value.trim()
  if (!text || /[\s\u0000-\u001f]/.test(text)) return null
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(text) ? text : 'https://' + text)
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null
    const host = url.hostname.toLowerCase().replace(/\.$/, '')
    if (!host || host.length > 253 || !host.includes('.') || host.startsWith('.') || host.endsWith('.')) return null
    const labels = host.split('.')
    if (labels.some(label => !label || label.length > 63 || label.startsWith('-') || label.endsWith('-'))) return null
    if (!/^(?:[a-z]{2,63}|xn--[a-z0-9-]{2,59})$/i.test(labels[labels.length - 1])) return null
    return url.href
  } catch {
    return null
  }
}

export function normalize(value: string | null | undefined) {
  return (value || '').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

export function brandKey(value: string | null | undefined) {
  let text = (value || '').normalize('NFKC').toLowerCase()
  text = text.split(/[|\n\r\t]+/)[0]
  text = text.split(/\s+[-–—]\s*/)[0]
  text = text.split(/\s+\/|\/\s+/)[0]
  text = text.replace(/\([^)]*\)/g, ' ')
  text = text.replace(/\b(?:private|pvt|limited|ltd|llp|inc|incorporated|corp|corporation|company|co)\b\.?/g, ' ')
  const words = text.split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean)
    .filter(word => !['and','the','of','for'].includes(word))
    .map(word => word.length > 3 && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word)
  const key = words.join('')
  return key || normalize(value).replace(/ /g, '')
}

export function phoneKey(value: string | null | undefined) {
  if (!value) return null
  let text = value.split(/[\/,;|&]|\bor\b/i)[0]
  text = text.replace(/\s*(?:ext\.?|extension|x)\s*\d{1,6}\s*$/i, '')
  let digits = text.replace(/\D/g, '')
  if (!digits) return null
  if (digits.startsWith('00')) digits = digits.slice(2)
  if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2)
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1)
  if (digits.length < 7 || digits.length > 15) return null
  return digits
}

export function websiteKey(value: string | null | undefined) {
  if (!value) return null
  const href = websiteUrl(value)
  if (!href) return null
  const url = new URL(href)
  let host = url.hostname.toLowerCase().replace(/\.$/, '').replace(/^www\./, '')
  if (host === 'm.facebook.com' || host === 'mobile.facebook.com') host = 'facebook.com'
  if (host === 'm.youtube.com' || host === 'music.youtube.com') host = 'youtube.com'
  let pathname = url.pathname.toLowerCase().replace(/\/+/g, '/')
  try {
    pathname = decodeURIComponent(pathname)
  } catch {}
  pathname = pathname.replace(/\/index\.(?:html?|php|aspx?)$/i, '').replace(/\/+$/, '')
  const pathScoped = pathScopedHosts.has(host) || /^(?:dealers|stores|store|locate|find|showrooms?|branches?)\./.test(host)
  return pathScoped ? (pathname && pathname !== '/' ? host + pathname : null) : host
}

export function leadKeys(data: Pick<LeadData, 'brandName' | 'phoneNumber' | 'whatsapp' | 'website'>) {
  return {
    brandKey: brandKey(data.brandName),
    phoneKey: phoneKey(data.phoneNumber),
    whatsappKey: phoneKey(data.whatsapp),
    websiteKey: websiteKey(data.website),
  }
}

const text = (max: number) => z.preprocess(
  value => typeof value === 'number' ? String(value) : value,
  z.string().trim().max(max).refine(value => !controlCharacters.test(value), 'Contains a control character'),
)
const optional = (max: number) => text(max).nullish().transform(value => value || null)
const phone = optional(80).refine(value =>
  !value || (phoneKey(value) !== null && phoneCharacters.test(value)),
  'Enter a valid phone number with 7 to 15 digits',
)
const statusNames = new Map(statuses.map(status => [status.toLowerCase(), status]))

export const leadSchema = z.object({
  searchId: optional(80).refine(value => !value || /^[\p{L}\p{N}][\p{L}\p{N}_.\-/ ]*$/u.test(value), 'Use letters, digits, spaces, dots, slashes, dashes or underscores'),
  brandName: text(500).refine(value => value.length > 0, 'Brand name is required'),
  category: optional(200), area: optional(300), city: optional(200), contactPerson: optional(300),
  phoneNumber: phone, whatsapp: phone,
  email: optional(320).refine(value => !value || z.string().email().safeParse(value).success, 'Enter a valid email'),
  website: optional(2048).refine(value => !value || !!websiteUrl(value), 'Enter a valid website'),
  fullAddress: optional(3000),
  status: z.preprocess(value => {
    if (value == null) return 'Not Started'
    const name = String(value).trim()
    if (!name) return 'Not Started'
    return statusNames.get(name.toLowerCase()) || name
  }, z.enum(statuses)),
}).strict()
export type LeadData = z.output<typeof leadSchema>
export type Lead = LeadData & { id: string; searchId: string }
export const limits = [10,25,50,100] as const
export const listSchema = z.object({
  page:z.coerce.number().int().min(1).max(2147483647).default(1),
  limit:z.coerce.number().refine(n=>limits.some(size=>size===n),'Invalid page size').default(25),
  search:z.string().trim().max(300).default(''), category:z.string().max(200).default(''),
  city:z.string().max(200).default(''), status:z.union([z.enum(statuses),z.literal('')]).default(''),
  sort:z.enum(fields as [Field,...Field[]]).default('searchId'), direction:z.enum(['asc','desc']).default('asc'),
})
export type ListOptions = z.output<typeof listSchema>
export type Pagination = {page:number;limit:number;total:number;totalPages:number;hasNextPage:boolean;hasPreviousPage:boolean}
export type AdminUser = {id:string;email:string;phone:string;role:string}
export type RowKind = 'new'|'duplicate'|'update'|'invalid'|'review'
export type PreviewRow = {rowNumber:number;values:Partial<LeadData>;kind:RowKind;reason:string|null;match:Partial<LeadData>|null;allowDistinct:boolean}
export type Job = {id:string;filename:string;totalRows:number;processed:number;state:string;error:string|null;importedRows:number;duplicateRows:number;updatedRows:number;failedRows:number;reviewedRows:number;createdAt:string}
export type Preview = {job:Job;counts:Record<RowKind,number>}
