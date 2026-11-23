import { useEffect, useRef, useState, type AnchorHTMLAttributes } from 'react';
import { createPortal } from 'react-dom';

type Props = AnchorHTMLAttributes<HTMLAnchorElement> & { fileName:string };
export default function AttachmentLink({fileName,children,onClick,...props}:Props) {
  const [open,setOpen]=useState(false), [loaded,setLoaded]=useState(false), [failed,setFailed]=useState(false);
  const dialog=useRef<HTMLDialogElement>(null);
  const isJpeg=/\.jpe?g$/i.test(fileName.trim());
  useEffect(()=>{
    if(!open)return;
    const previous=document.activeElement;
    dialog.current?.showModal();
    return()=>{if(previous instanceof HTMLElement&&previous.isConnected)previous.focus();};
  },[open]);
  return <><a {...props} onClick={event=>{
    onClick?.(event);
    if(event.defaultPrevented||!isJpeg||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    event.preventDefault();event.stopPropagation();setLoaded(false);setFailed(false);setOpen(true);
  }}>{children}</a>{open&&createPortal(<dialog ref={dialog} className="attachment-image-dialog" aria-label={`پیش‌نمایش ${fileName}`} onKeyDown={event=>event.stopPropagation()} onCancel={event=>{event.stopPropagation();setOpen(false);}} onClick={event=>{event.stopPropagation();if(event.target===event.currentTarget)setOpen(false);}}>
    <section onClick={event=>event.stopPropagation()}><header><b>{fileName}</b><button type="button" className="secondary" autoFocus onClick={()=>setOpen(false)}>بستن</button></header>
      <div className="attachment-image-stage">{!loaded&&!failed&&<p role="status">در حال دریافت تصویر…</p>}{failed&&<p role="alert">تصویر قابل نمایش نیست. می‌توانید فایل را دریافت کنید.</p>}<img src={props.href} alt={fileName} hidden={failed} onLoad={()=>setLoaded(true)} onError={()=>setFailed(true)}/></div>
      <footer><a href={props.href} download={fileName} target="_blank" rel="noreferrer">دریافت فایل اصلی</a></footer>
    </section>
  </dialog>,document.body)}</>;
}
