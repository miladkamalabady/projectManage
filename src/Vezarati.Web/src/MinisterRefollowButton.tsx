import { useRef, useState } from 'react';
export default function MinisterRefollowButton({id,api,onSent}:{id:number;api:typeof fetch;onSent?:()=>void}) {
  const [busy,setBusy]=useState(false), [notice,setNotice]=useState('');
  const requestId=useRef<string|null>(null);
  async function send(){
    if(busy)return;setBusy(true);setNotice('');requestId.current??=crypto.randomUUID();
    try{
      const response=await api(`/api/resolutions/${id}/refollow`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({requestId:requestId.current})});
      const data=await response.json();if(!response.ok)throw Error(data.error||'ثبت پیگیری ناموفق بود.');
      setNotice(data.duplicate?'این پیگیری قبلاً ثبت شده است.':`${data.queued} پیام بله در صف ارسال قرار گرفت.${data.missingMobile?.length?` بدون موبایل: ${data.missingMobile.join('، ')}`:''}`);
      requestId.current=null;onSent?.();
    }catch(error){setNotice(error instanceof Error?error.message:'ثبت پیگیری ناموفق بود.');}finally{setBusy(false);}
  }
  return <span className="minister-refollow-control"><button type="button" className="secondary" disabled={busy} onClick={()=>void send()}>{busy?'در حال ثبت پیگیری…':'پیگیری مجدد در بله'}</button>{notice&&<small role="status">{notice}</small>}</span>;
}
