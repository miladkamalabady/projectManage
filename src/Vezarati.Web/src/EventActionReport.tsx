import { useEffect, useState } from 'react';
type Report = { userName:string; text:string; submittedAt:string; approvalStatus:string; adminFeedback:string; attachments:{id:number;originalName:string;uploadedAt:string}[] };
export default function EventActionReport({resolutionId,eventId,api,formatDateTime}:{resolutionId:number;eventId:number;api:typeof fetch;formatDateTime:(value:string)=>string}) {
  const [open,setOpen]=useState(false), [report,setReport]=useState<Report|null>(null), [error,setError]=useState(''), [retry,setRetry]=useState(0);
  useEffect(()=>{
    if(!open||report)return;
    const controller=new AbortController();setError('');
    api(`/api/resolutions/${resolutionId}/events/${eventId}/report`,{signal:controller.signal}).then(async response=>{
      if(!response.ok)throw new Error(response.status===404?'جزئیات متناظر با این رویداد در دسترس نیست.':'دریافت گزارش ناموفق بود.');
      const data=await response.json();if(!controller.signal.aborted)setReport(data);
    }).catch(error=>{if(error.name!=='AbortError')setError(error.message);});
    return()=>controller.abort();
  },[open,report,resolutionId,eventId,retry,api]);
  return <div className="event-action-report"><button type="button" className="secondary" aria-expanded={open} aria-controls={`event-action-report-${eventId}`} onClick={()=>setOpen(!open)}>{open?'بستن گزارش':'مشاهده گزارش اقدام'}</button>{open&&<div id={`event-action-report-${eventId}`} className="event-action-report-body">{error?<div role="alert">{error}<button type="button" className="secondary" onClick={()=>setRetry(value=>value+1)}>تلاش دوباره</button></div>:report?<><div className="event-action-report-heading"><b>{report.userName}</b><small>ارسال: {formatDateTime(report.submittedAt)}</small><span>{report.approvalStatus==='approved'?'تأیید شده':report.approvalStatus==='rejected'?'نیازمند اصلاح':'در انتظار بررسی'}</span></div><p>{report.text}</p>{report.adminFeedback&&<p><b>نظر مدیر: </b>{report.adminFeedback}</p>}{report.attachments.length?<div className="report-task-files">{report.attachments.map(file=><a key={file.id} href={`/api/attachments/${file.id}`} target="_blank" rel="noreferrer">{file.originalName}</a>)}</div>:<small>پیوستی ثبت نشده است.</small>}</>:<p role="status">در حال دریافت گزارش…</p>}</div>}</div>;
}
