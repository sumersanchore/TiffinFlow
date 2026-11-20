const {parentPort,workerData}=require('node:worker_threads')
const XLSX=require('xlsx')
const yauzl=require('yauzl')
const MAX_ROWS=20000
function checkZip(bytes){
  return new Promise((resolve,reject)=>yauzl.fromBuffer(bytes,{lazyEntries:true},(err,zip)=>{
    if(err)return reject(Error('Invalid Excel archive'))
    let size=0
    zip.on('error',()=>reject(Error('Unreadable Excel archive')))
    zip.on('end',resolve)
    zip.on('entry',entry=>{
      size+=entry.uncompressedSize
      if(size>64*1024*1024||zip.entryCount>3000){
        zip.close();reject(Error('Workbook exceeds the expanded size limit'));return
      }
      zip.readEntry()
    })
    zip.readEntry()
  }))
}
const header=v=>String(v).trim().toLowerCase()
function bounds(sheet){
  const r=XLSX.utils.decode_range(sheet['!fullref']||sheet['!ref']||'A1')
  if(r.e.r>MAX_ROWS || r.e.c>127)throw Error('Use at most 20,000 data rows and 128 columns per sheet')
  return r
}
function cellAt(sheet,r,c){return sheet[XLSX.utils.encode_cell({r,c})]}
function cellValue(cell){
  if(!cell || cell.v==null)return ''
  return typeof cell.v==='string'?cell.v:XLSX.utils.format_cell(cell)
}
async function read(){
  const {ext,columns}=workerData
  const bytes=Buffer.from(workerData.bytes)
  let source=bytes
  if(ext==='.xlsx'){
    if(bytes.readUInt16LE(0)!==0x4b50)throw Error('Expected an XLSX workbook')
    await checkZip(bytes)
  }else if(ext==='.xls'){
    if(!bytes.subarray(0,8).equals(Buffer.from('d0cf11e0a1b11ae1','hex')))throw Error('Expected a binary XLS workbook')
  }else{
    source=new TextDecoder('utf-8',{fatal:true}).decode(bytes)
    if(source.includes('\0'))throw Error('CSV must be UTF-8 text')
  }
  const book=XLSX.read(source,{type:ext==='.csv'?'string':'buffer',raw:true,cellFormula:true,cellHTML:false,sheetRows:MAX_ROWS+2})
  const named=book.SheetNames.find(n=>header(n)==='manufacturer leads')
  const sheet=book.Sheets[named||book.SheetNames[0]]
  if(!sheet || header(named||book.SheetNames[0])==='categories')throw Error('Manufacturer Leads sheet is missing')
  const range=bounds(sheet), mapping=new Map()
  for(let c=range.s.c;c<=range.e.c;c++){
    const label=header(cellValue(cellAt(sheet,range.s.r,c)))
    const key=Object.keys(columns).find(k=>header(columns[k])===label)
    if(!key)continue
    if(mapping.has(key))throw Error('Duplicate header: '+columns[key])
    mapping.set(key,c)
  }
  if(!mapping.has('brandName'))throw Error('Required column missing: Brand Name')
  const rows=[]
  for(let r=range.s.r+1;r<=range.e.r;r++){
    const values={};let error=null,hasValue=false
    for(const [key,c] of mapping){
      const cell=cellAt(sheet,r,c)
      const value=cellValue(cell)
      if(cell?.f||cell?.t==='e'||(ext==='.csv'&&/^\s*[=@]/.test(value)))error=columns[key]+' contains a formula or spreadsheet error'
      if(value.includes('\0')||value.length>4096)error=columns[key]+' contains unsupported text or exceeds 4096 characters'
      values[key]=value.replaceAll('\0','').slice(0,4096)
      if(value.trim()||cell?.f)hasValue=true
    }
    if(hasValue)rows.push({rowNumber:r+1,values,error})
  }
  if(!rows.length)throw Error('No data rows found under the headers')
  const categories=new Set(),categoryName=book.SheetNames.find(n=>header(n)==='categories')
  if(categoryName){
    const cat=book.Sheets[categoryName],b=bounds(cat)
    for(let r=b.s.r;r<=b.e.r;r++){
      const cell=cellAt(cat,r,b.s.c),value=cellValue(cell).trim()
      if(!cell?.f && cell?.t!=='e' && value && value.length<=200 && !/[\u0000-\u001f]/.test(value) && !(r===b.s.r&&['category','category name','categories'].includes(header(value))))categories.add(value)
    }
  }
  return {rows,categories:[...categories]}
}
read().then(data=>parentPort.postMessage({data})).catch(e=>parentPort.postMessage({error:e.message}))
