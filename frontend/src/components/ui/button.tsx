import {forwardRef,type ButtonHTMLAttributes} from 'react'
export const Button=forwardRef<HTMLButtonElement,ButtonHTMLAttributes<HTMLButtonElement> & {variant?:'primary'|'outline'|'ghost'|'danger'}>(
  ({variant='outline',className='',type='button',...props},ref)=><button ref={ref} type={type} className={'btn '+variant+' '+className} {...props}/>
)
Button.displayName='Button'
