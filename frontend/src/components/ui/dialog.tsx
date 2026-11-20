import * as DialogPrimitive from '@radix-ui/react-dialog'
import {X} from 'lucide-react'
import type {ReactNode} from 'react'
export function Dialog({title,description,children,onClose,wide=false}:{title:string;description?:string;children:ReactNode;onClose:()=>void;wide?:boolean}){
  return <DialogPrimitive.Root open onOpenChange={open=>{if(!open)onClose()}}>
    <DialogPrimitive.Portal><DialogPrimitive.Overlay className="dialog-overlay"/><DialogPrimitive.Content className={'dialog-content '+(wide?'wide':'')} aria-describedby={description?'dialog-description':undefined}>
      <header className="dialog-head"><div><DialogPrimitive.Title>{title}</DialogPrimitive.Title>{description && <DialogPrimitive.Description id="dialog-description">{description}</DialogPrimitive.Description>}</div>
        <DialogPrimitive.Close className="icon-button" aria-label="Close dialog"><X size={19}/></DialogPrimitive.Close>
      </header>{children}
    </DialogPrimitive.Content></DialogPrimitive.Portal>
  </DialogPrimitive.Root>
}
