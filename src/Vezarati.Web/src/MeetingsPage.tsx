import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import DatePicker from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import { CalendarDays, Check, ChevronDown, FileText, Pencil, Plus, Printer, Save, Search, Users, X } from "lucide-react";

type Person = { nationalId: string; displayName: string; title?: string; organizationUnit?: string };
type Group = { id: number; name: string; members: Person[] };
type MeetingAttendee = { id: number; nationalId: string; displayName: string; title: string; isPresent: boolean; absenceReason: string };
type MeetingFile = { id: number; originalName: string; contentType: string; size: number; contentHash?: string };
type Meeting = { id: number; date: string; dateJalali: string; title: string; guestText: string; attendees: MeetingAttendee[]; attachments?: MeetingFile[] };
type Resolution = { id: number; meetingId?: number | null; number: string; text: string; notes?: string; status: string; meetingDate?: string; meetingDateJalali?: string; startDate?: string | null; startDateJalali?: string; dueDate?: string | null; dueDateJalali?: string; groupId?: number | null; groupAssignments?: { groupId: number }[]; assignments?: { nationalId: string }[]; progress?: { nationalId: string; status: string; notes?: string; reportText?: string; updatedAt?: string }[]; attachments?: { id: number; originalName: string; contentType?: string; size?: number }[]; requiresPeriodicReport?: boolean; reportFrequency?: string; cancellationReason?: string };
type MeetingDraft = { date: string; dateJalali: string; title: string; guestText: string; attendees: Record<string, { isPresent: boolean; absenceReason: string }> };
type Props = { users: Person[]; groups: Group[]; resolutions: Resolution[]; openCreateRequest: number; onCreateResolution: (meeting: Meeting) => void; onRefresh: () => void };

const todayKey = () => { const d = new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
const toJalali = (value: string) => { if (!value) return ""; const d = new Date(value+"T12:00:00"); return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("fa-IR-u-ca-persian",{year:"numeric",month:"2-digit",day:"2-digit",numberingSystem:"latn"}).format(d).replace(/\//g,"."); };
const dateKey = (value: Date) => value.getFullYear()+"-"+String(value.getMonth()+1).padStart(2,"0")+"-"+String(value.getDate()).padStart(2,"0");
const formatJalali = (value: string, jalali?: string) => jalali || toJalali(value).replace(/\./g,"/");
const statusText = (value: string) => ({before:"قبل از اجرا",in_progress:"در حال اجرا",completed:"اجرا شده",delayed:"دارای تأخیر",cancelled:"لغو شده",rejected:"رد شده"} as Record<string,string>)[value]||value;
const frequencyText = (value?: string) => ({daily:"روزانه",weekly:"هفتگی",monthly:"ماهانه"} as Record<string,string>)[value||""]||value||"—";
const norm = (value: string) => value.normalize("NFKC").replace(/[يى]/g,"ی").replace(/ك/g,"ک").trim().toLocaleLowerCase("fa");
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[character] ?? character));

export default function MeetingsPage({ users, groups, resolutions, openCreateRequest, onCreateResolution, onRefresh }: Props) {
  const [section,setSection]=useState<"meetings"|"attendance">("meetings");
  const [meetings,setMeetings]=useState<Meeting[]>([]);
  const [meetingsLoaded,setMeetingsLoaded]=useState(false);
  const defaultMeetingSelected=useRef(false);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [meetingQuery,setMeetingQuery]=useState("");
  const [meetingPage,setMeetingPage]=useState(1);
  const meetingPageSize=10;
  const [meetingFiles,setMeetingFiles]=useState<File[]>([]);
  const [expandedId,setExpandedId]=useState<number|null>(null);
  const [meetingDetailTabs,setMeetingDetailTabs]=useState<Record<number,"resolutions"|"description"|"attendance">>({});
  const [expandedMeetingLists,setExpandedMeetingLists]=useState<Record<string,boolean>>({});
  const [meetingResolutionQueries,setMeetingResolutionQueries]=useState<Record<number,string>>({});
  const [expandedResolutionDetails,setExpandedResolutionDetails]=useState<Record<number,boolean>>({});
  const [editing,setEditing]=useState<Meeting|null>(null);
  const [creating,setCreating]=useState(false);
  const [search,setSearch]=useState("");
  const [groupToAdd,setGroupToAdd]=useState("");
  const [absenceReasons,setAbsenceReasons]=useState<string[]>(["ماموریت","بیماری","سایر"]);
  const [reasonDraft,setReasonDraft]=useState("");
  const [showReasonEditor,setShowReasonEditor]=useState(false);
  const fromDatePickerRef=useRef<any>(null);
  const toDatePickerRef=useRef<any>(null);
  const meetingDatePickerRef=useRef<any>(null);
  const [from,setFrom]=useState("");
  const [to,setTo]=useState("");
  const [personQuery,setPersonQuery]=useState("");
  const [draft,setDraft]=useState<MeetingDraft>({date:todayKey(),dateJalali:toJalali(todayKey()),title:"",guestText:"",attendees:{}});

  async function hashFile(file:File):Promise<string>{if(!globalThis.crypto?.subtle)return "FALLBACK:"+file.name.toLowerCase()+"|"+file.size;const digest=await crypto.subtle.digest("SHA-256",await file.arrayBuffer());return Array.from(new Uint8Array(digest),value=>value.toString(16).padStart(2,"0")).join("").toUpperCase();}
  async function loadMeetings() {
    const response=await fetch("/api/meetings",{credentials:"include"});
    const result=await response.json();
    if(!response.ok) throw new Error(result?.error||"فهرست جلسات دریافت نشد.");
    setMeetings(Array.isArray(result)?result:[]);setMeetingsLoaded(true);
  }
  async function loadReasons() {
    const response=await fetch("/api/attendance/reasons",{credentials:"include"});
    if(response.ok){const result=await response.json();if(Array.isArray(result))setAbsenceReasons(result);}
  }
  useEffect(()=>{void loadMeetings().catch(error=>setMessage(error.message));void loadReasons();},[]);
  useEffect(()=>{if(openCreateRequest>0){setSection("meetings");openNew();}},[openCreateRequest]);
  useEffect(()=>{if(section==="meetings")void loadMeetings().catch(error=>setMessage(error.message));},[section]);
  useEffect(()=>{if(!message)return;const timer=window.setTimeout(()=>setMessage(""),6000);return()=>window.clearTimeout(timer);},[message]);
  useEffect(()=>{
    if(section!=="attendance")return;
    const query=new URLSearchParams();if(from)query.set("from",from);if(to)query.set("to",to);
    void fetch("/api/attendance/report?"+query.toString(),{credentials:"include"}).then(async response=>{const result=await response.json();if(!response.ok)throw new Error(result?.error||"گزارش حضور و غیاب دریافت نشد.");setMeetings(Array.isArray(result.meetings)?result.meetings:[]);}).catch(error=>setMessage(error.message));
  },[section,from,to]);

  const people=useMemo(()=>{
    const map=new Map<string,Person>();
    for(const user of users)if(user.nationalId)map.set(user.nationalId,user);
    for(const group of groups)for(const member of group.members||[])if(member.nationalId&&!map.has(member.nationalId))map.set(member.nationalId,member);
    return Array.from(map.values()).sort((a,b)=>(a.displayName||"").localeCompare(b.displayName||"","fa"));
  },[users,groups]);
  const visiblePeople=people.filter(person=>!search||norm(person.displayName+" "+(person.title||"")+" "+(person.organizationUnit||"")).includes(norm(search)));
  const selectedCount=Object.keys(draft.attendees).length;
  const meetingHasOpenTasks=(meeting:Meeting)=>resolutions.some(item=>item.meetingId===meeting.id&&item.status!=="completed"&&item.status!=="cancelled");
  const meetingList=meetings.filter(meeting=>!meetingQuery||norm(meeting.title+" "+meeting.dateJalali+" "+(meeting.guestText||"")).includes(norm(meetingQuery))).slice().sort((left,right)=>(right.date||"").localeCompare(left.date||"")||right.id-left.id);
  const meetingPageCount=Math.max(1,Math.ceil(meetingList.length/meetingPageSize));
  const pagedMeetingList=meetingList.slice((meetingPage-1)*meetingPageSize,meetingPage*meetingPageSize);
  useEffect(()=>setMeetingPage(1),[meetingQuery]);
  useEffect(()=>{if(meetingPage>meetingPageCount)setMeetingPage(meetingPageCount);},[meetingPage,meetingPageCount]);
  useEffect(()=>{if(!meetingsLoaded||defaultMeetingSelected.current)return;defaultMeetingSelected.current=true;const preferred=meetings.slice().sort((left,right)=>Number(meetingHasOpenTasks(right))-Number(meetingHasOpenTasks(left))||(right.date||"").localeCompare(left.date||"")||right.id-left.id)[0];if(preferred)setExpandedId(preferred.id);},[meetingsLoaded,meetings,resolutions]);
  const peopleStats=useMemo(()=>{
    const totals=new Map<string,{nationalId:string;displayName:string;title:string;total:number;present:number;absent:number;reasons:Record<string,number>}>();
    for(const meeting of meetings)for(const attendee of meeting.attendees||[]){
      const current=totals.get(attendee.nationalId)||{nationalId:attendee.nationalId,displayName:attendee.displayName,title:attendee.title,total:0,present:0,absent:0,reasons:{}};
      current.total++;if(attendee.isPresent)current.present++;else{current.absent++;if(attendee.absenceReason)current.reasons[attendee.absenceReason]=(current.reasons[attendee.absenceReason]||0)+1;}
      totals.set(attendee.nationalId,current);
    }
    return Array.from(totals.values()).filter(person=>!personQuery||norm(person.displayName+" "+person.title).includes(norm(personQuery))).sort((a,b)=>b.absent-a.absent||b.total-a.total);
  },[meetings,personQuery]);
  const stats=useMemo(()=>meetings.reduce((sum,meeting)=>{sum.meetings++;for(const person of meeting.attendees||[]){sum.total++;if(person.isPresent)sum.present++;else sum.absent++;}return sum;},{meetings:0,total:0,present:0,absent:0}),[meetings]);

  function openNew() {
    setEditing(null);setCreating(true);setSearch("");setGroupToAdd("");setMeetingFiles([]);
    setDraft({date:todayKey(),dateJalali:toJalali(todayKey()),title:"",guestText:"",attendees:{}});
  }
  function openEdit(meeting:Meeting) {
    setEditing(meeting);setCreating(false);setSearch("");setGroupToAdd("");setMeetingFiles([]);
    const attendees:MeetingDraft["attendees"]={};
    for(const person of meeting.attendees||[])attendees[person.nationalId]={isPresent:person.isPresent,absenceReason:person.absenceReason||""};
    setDraft({date:meeting.date,dateJalali:meeting.dateJalali||toJalali(meeting.date),title:meeting.title,guestText:meeting.guestText||"",attendees});
  }
  function selectPerson(id:string,selected:boolean) {
    setDraft(current=>{const attendees={...current.attendees};if(selected)attendees[id]??={isPresent:true,absenceReason:""};else delete attendees[id];return {...current,attendees};});
  }
  function addGroupMembers(groupId:string) {
    const group=groups.find(item=>String(item.id)===groupId);if(!group)return;
    setDraft(current=>{const attendees={...current.attendees};for(const person of group.members||[])if(person.nationalId)attendees[person.nationalId]??={isPresent:true,absenceReason:""};return {...current,attendees};});
    setGroupToAdd("");
  }
  function selectAll() { setDraft(current=>({...current,attendees:Object.fromEntries(people.map(person=>[person.nationalId,current.attendees[person.nationalId]??{isPresent:true,absenceReason:""}]))})); }
  function clearAll() { setDraft(current=>({...current,attendees:{}})); }
  async function saveMeeting() {
    if(!draft.date||!draft.title.trim()){setMessage("تاریخ و عنوان جلسه را وارد کنید.");return;}
    setBusy(true);setMessage("");
    const payload={date:draft.date,dateJalali:draft.dateJalali,title:draft.title.trim(),guestText:draft.guestText.trim(),attendees:Object.entries(draft.attendees).map(([nationalId,state])=>({nationalId,...state}))};
    try{
      const response=await fetch(editing?"/api/meetings/"+editing.id:"/api/meetings",{method:editing?"PUT":"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const result=await response.json();if(!response.ok)throw new Error(result?.error||"ذخیره جلسه انجام نشد.");
      const meetingId=editing?.id??result?.id;
      if(!meetingId&&meetingFiles.length)throw new Error("جلسه ذخیره شد اما شناسه آن برای بارگذاری فایل دریافت نشد.");
      for(const file of meetingFiles){const data=new FormData();data.append("file",file);const uploaded=await fetch(`/api/meetings/${meetingId}/attachments`,{method:"POST",credentials:"include",body:data});const uploadResult=await uploaded.json();if(!uploaded.ok)throw new Error(uploadResult?.error||"بارگذاری فایل صورت‌جلسه انجام نشد.");}
      setEditing(null);setCreating(false);setMeetingFiles([]);setMessage("جلسه ذخیره شد.");await loadMeetings();onRefresh();
    }catch(error){setMessage(error instanceof Error?error.message:"ذخیره جلسه انجام نشد.");}finally{setBusy(false);}
  }
  async function saveReasons() {
    const items=absenceReasons.map(item=>item.trim()).filter(Boolean);
    const response=await fetch("/api/attendance/reasons",{method:"PUT",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({reasons:items})});
    const result=await response.json();if(!response.ok){setMessage(result?.error||"ذخیره دلایل انجام نشد.");return;}
    setAbsenceReasons(result);setShowReasonEditor(false);setMessage("دلایل غیبت ذخیره شد.");
  }
  function printMeeting(meeting:Meeting) {
    const tasks=resolutions.filter(item=>item.meetingId===meeting.id);
    const attendees=(meeting.attendees||[]).map(person=>"<tr><td>"+escapeHtml(person.displayName)+"</td><td>"+escapeHtml(person.title||"—")+"</td><td>"+(person.isPresent?"حاضر":"غایب")+"</td><td>"+escapeHtml(person.absenceReason||"—")+"</td></tr>").join("");
    const taskRows=tasks.map(task=>"<tr><td>"+escapeHtml(task.number)+"</td><td>"+escapeHtml(task.text)+"</td><td>"+escapeHtml(task.dueDateJalali||"—")+"</td></tr>").join("");
    const popup=window.open("","_blank","width=900,height=700");if(!popup){setMessage("اجازه بازشدن پنجره چاپ را در مرورگر فعال کنید.");return;}
    popup.document.write("<!doctype html><html lang='fa' dir='rtl'><meta charset='utf-8'><title>"+escapeHtml(meeting.title)+"</title><style>@font-face{font-family:Vazirmatn;src:url('/fonts/Vazirmatn[wght].woff2') format('woff2');font-weight:100 900;font-style:normal}body{font-family:Vazirmatn,Tahoma,Arial;padding:28px;color:#203238}h1{font-size:22px}h2{margin-top:28px;font-size:16px}p{color:#56666b}table{border-collapse:collapse;width:100%;margin:12px 0 24px}td,th{border:1px solid #ccd5d7;padding:8px;text-align:right}th{background:#f1f5f4}@media print{button{display:none}}</style><h1>"+escapeHtml(meeting.title)+"</h1><p>تاریخ جلسه: "+escapeHtml(formatJalali(meeting.date,meeting.dateJalali))+"</p><p>مهمانان: "+escapeHtml(meeting.guestText||"—")+"</p><h2>مصوبات و وظایف جلسه</h2><table><thead><tr><th>شماره</th><th>متن مصوبه</th><th>مهلت</th></tr></thead><tbody>"+taskRows+"</tbody></table><h2>حاضرین و غایبین</h2><table><thead><tr><th>نام</th><th>سمت</th><th>وضعیت</th><th>دلیل غیبت</th></tr></thead><tbody>"+attendees+"</tbody></table><script>window.onload=()=>document.fonts.ready.then(()=>window.print())<\/script></html>");
    popup.document.close();
  }

  return <div className="meetings-module">
    <div className="meetings-tabs" role="tablist"><button className={section==="meetings"?"active":""} onClick={()=>setSection("meetings")}><CalendarDays size={16}/>جلسات</button><button className={section==="attendance"?"active":""} onClick={()=>setSection("attendance")}><Users size={16}/>گزارش حضور و غیاب</button></div>
    {message&&<div className="api-toast-stack meeting-toast-stack" aria-live="polite"><div className="api-toast api-toast-message" role="status"><span>{message}</span><button type="button" className="api-toast-close" aria-label="بستن پیام" onClick={()=>setMessage("")}>×</button></div></div>}
    {section==="meetings"&&<><div className="section-head"><div><h2>جلسات</h2><p>ابتدا جلسه را ثبت کنید؛ مصوبات و وظایف بعداً به همان جلسه متصل می‌شوند.</p></div><button className="primary" onClick={openNew}><Plus size={16}/>ثبت جلسه</button></div>
      <div className="search meetings-search"><Search size={15}/><input value={meetingQuery} onChange={event=>setMeetingQuery(event.target.value)} placeholder="جستجو در عنوان، تاریخ یا مهمانان جلسه"/></div>
      <div className="meeting-list">{pagedMeetingList.map(meeting=>{const tasks=resolutions.filter(item=>item.meetingId===meeting.id);const present=(meeting.attendees||[]).filter(item=>item.isPresent).length;const absent=(meeting.attendees||[]).length-present;const attendees=meeting.attendees||[];const activeDetailTab=meetingDetailTabs[meeting.id]||"resolutions";const attendanceListKey="attendance:"+meeting.id;const resolutionQuery=meetingResolutionQueries[meeting.id]||"";const filteredTasks=tasks.filter(task=>{const ids=[...(task.groupAssignments||[]).map(item=>item.groupId),...(task.groupId?[task.groupId]:[])];const referral=[...ids.map(id=>groups.find(group=>group.id===id)?.name||""),...(task.assignments||[]).map(assignment=>{const person=users.find(user=>user.nationalId===assignment.nationalId);return person?.displayName+" "+(person?.title||"");})].join(" ");const progress=(task.progress||[]).map(item=>item.notes+" "+item.reportText+" "+(users.find(user=>user.nationalId===item.nationalId)?.displayName||"")).join(" ");return !resolutionQuery||norm(task.number+" "+task.text+" "+(task.notes||"")+" "+referral+" "+progress).includes(norm(resolutionQuery));});const visibleAttendees=expandedMeetingLists[attendanceListKey]?attendees:attendees.slice(0,3);return <article className="meeting-card" key={meeting.id}><div className="meeting-card-head"><button className="meeting-title-button" onClick={()=>setExpandedId(expandedId===meeting.id?null:meeting.id)}><span><b>{meeting.title}</b><small>{formatJalali(meeting.date,meeting.dateJalali)} · {tasks.length} مصوبه · {present} حاضر · {absent} غایب</small></span><ChevronDown size={17}/></button><div className="meeting-actions"><button className="secondary" onClick={()=>openEdit(meeting)}><Pencil size={14}/>ویرایش</button><button className="secondary" onClick={()=>printMeeting(meeting)}><Printer size={14}/>چاپ</button><button className="secondary" onClick={()=>onCreateResolution(meeting)}><Plus size={14}/>ثبت مصوبه</button></div></div>
        {expandedId===meeting.id&&<div className="meeting-details"><div className="meeting-detail-tabs" role="tablist" aria-label="جزئیات جلسه"><button type="button" className={activeDetailTab==="resolutions"?"active":""} onClick={()=>setMeetingDetailTabs(current=>({...current,[meeting.id]:"resolutions"}))}>مصوبات <span>{tasks.length}</span></button><button type="button" className={activeDetailTab==="description"?"active":""} onClick={()=>setMeetingDetailTabs(current=>({...current,[meeting.id]:"description"}))}>توضیحات</button><button type="button" className={activeDetailTab==="attendance"?"active":""} onClick={()=>setMeetingDetailTabs(current=>({...current,[meeting.id]:"attendance"}))}>حاضرین و غایبین <span>{attendees.length}</span></button></div>{activeDetailTab==="description"&&<div className="meeting-description-tab"><div className="meeting-guests"><b>مهمانان جلسه</b><span>{meeting.guestText||"مهمانی ثبت نشده است."}</span></div>{(meeting.attachments||[]).length>0?<div className="meeting-file-list"><b>فایل صورت‌جلسه</b>{meeting.attachments!.map(file=><a key={file.id} href={"/api/meeting-attachments/"+file.id} target="_blank" rel="noreferrer"><FileText size={14}/>{file.originalName}</a>)}</div>:<p className="muted">فایل صورت‌جلسه‌ای پیوست نشده است.</p>}</div>}{activeDetailTab==="resolutions"&&<section className="meeting-detail-section"><div className="meeting-resolution-list-head"><h3>مصوبات جلسه</h3><div className="search meeting-resolution-search"><Search size={14}/><input value={resolutionQuery} onChange={event=>setMeetingResolutionQueries(current=>({...current,[meeting.id]:event.target.value}))} placeholder="جستجو در شماره، متن، ارجاع یا گزارش"/></div></div>{tasks.length?filteredTasks.length?<div className="table-wrap meeting-resolutions-table"><table><thead><tr><th>مصوبه</th><th>شرح</th><th>ارجاع</th><th>وضعیت و مهلت</th><th>جزئیات</th></tr></thead><tbody>{filteredTasks.map(task=>{const expanded=!!expandedResolutionDetails[task.id];const groupNames=Array.from(new Set([...(task.groupAssignments||[]).map(item=>item.groupId),...(task.groupId?[task.groupId]:[])])).map(id=>groups.find(group=>group.id===id)?.name).filter(Boolean);const personNames=(task.assignments||[]).map(assignment=>users.find(person=>person.nationalId===assignment.nationalId)?.displayName||"کاربر");return <Fragment key={task.id}><tr><td><b>{task.number}</b><small>شناسه یکتا: {task.id}</small></td><td className="meeting-resolution-summary-cell">{task.text}</td><td className="meeting-resolution-routing-cell">{[...groupNames,...personNames].join("، ")||"—"}</td><td><span className={"status "+task.status}>{statusText(task.status)}</span><small>{task.dueDate?formatJalali(task.dueDate,task.dueDateJalali):"بدون سررسید"}</small></td><td><button type="button" className="meeting-row-detail-button" aria-expanded={expanded} onClick={()=>setExpandedResolutionDetails(current=>({...current,[task.id]:!current[task.id]}))}>{expanded?"بستن":"جزئیات"}</button></td></tr>{expanded&&<tr className="meeting-resolution-expanded-row"><td colSpan={5}><article className="meeting-task meeting-resolution-detail"><div className="meeting-resolution-head"><b>مصوبه {task.number} · شناسه یکتا: {task.id}</b><span className={"status "+task.status}>{statusText(task.status)}</span></div><p className="meeting-resolution-text">{task.text}</p>{task.notes&&<div className="meeting-resolution-notes"><b>توضیحات</b><p>{task.notes}</p></div>}<div className="meeting-resolution-meta"><span><b>تاریخ جلسه</b>{task.meetingDate?formatJalali(task.meetingDate,task.meetingDateJalali):formatJalali(meeting.date,meeting.dateJalali)}</span><span><b>زمان شروع</b>{task.startDate?formatJalali(task.startDate,task.startDateJalali):"—"}</span><span><b>زمان سررسید</b>{task.dueDate?formatJalali(task.dueDate,task.dueDateJalali):"بدون سررسید"}</span>{task.requiresPeriodicReport&&<span><b>گزارش مستمر</b>{frequencyText(task.reportFrequency)}</span>}</div>{task.cancellationReason&&<div className="meeting-resolution-notes"><b>دلیل لغو</b><p>{task.cancellationReason}</p></div>}<div className="meeting-resolution-routing"><b>ارجاع به</b><span>{groupNames.join("، ")||"—"}</span><span>{personNames.join("، ")}</span></div>{(task.attachments||[]).length>0&&<div className="meeting-resolution-files"><b>پیوست‌های مصوبه</b>{task.attachments!.map(file=><a key={file.id} href={"/api/attachments/"+file.id} target="_blank" rel="noreferrer"><FileText size={13}/>{file.originalName}</a>)}</div>}{(task.progress||[]).length>0&&<details className="meeting-resolution-progress"><summary>وضعیت افراد ({task.progress!.length})</summary><div>{task.progress!.map(progress=>{const person=users.find(user=>user.nationalId===progress.nationalId);return <article key={progress.nationalId}><span><b>{person?.displayName||"کاربر"}</b><small>{person?.title||"سمت ثبت نشده"}</small></span><span className={"status "+progress.status}>{statusText(progress.status)}</span>{progress.notes&&<p>{progress.notes}</p>}{progress.reportText&&<blockquote>{progress.reportText}</blockquote>}</article>;})}</div></details>}</article></td></tr>}</Fragment>;})}</tbody></table></div>:<p className="muted">مصوبه‌ای با این جستجو پیدا نشد.</p>:<p className="muted">هنوز مصوبه‌ای برای این جلسه ثبت نشده است.</p>}</section>}{activeDetailTab==="attendance"&&<section className="meeting-detail-section"><h3>حاضرین و غایبین</h3><div className="meeting-attendance-list">{visibleAttendees.map(person=><div key={person.nationalId}><span>{person.displayName}<small>{person.title||"سمت ثبت نشده"}</small></span><span className={person.isPresent?"attendance-present":"attendance-absent"}>{person.isPresent?"حاضر":("غایب"+(person.absenceReason?" · "+person.absenceReason:""))}</span></div>)}</div>{attendees.length>3&&<button type="button" className="meeting-show-more" onClick={()=>setExpandedMeetingLists(current=>({...current,[attendanceListKey]:!current[attendanceListKey]}))}>{expandedMeetingLists[attendanceListKey]?"نمایش کمتر":"مشاهده بیشتر ("+(attendees.length-3)+" نفر دیگر)"}</button>}</section>}</div>}</article>;})}{meetingList.length===0&&<div className="report-empty">جلسه‌ای پیدا نشد.</div>}</div>{meetingList.length>0&&<div className="event-report-pagination"><span>{meetingList.length} جلسه · صفحه {meetingPage} از {meetingPageCount}</span><div><button type="button" className="secondary" disabled={meetingPage<=1} onClick={()=>setMeetingPage(page=>Math.max(1,page-1))}>قبلی</button><button type="button" className="secondary" disabled={meetingPage>=meetingPageCount} onClick={()=>setMeetingPage(page=>Math.min(meetingPageCount,page+1))}>بعدی</button></div></div>}
    </>}
    {section==="attendance"&&<><div className="section-head"><div><h2>گزارش حضور و غیاب</h2><p>آمار حضور، غیبت و دلایل ثبت‌شده را در بازهٔ شمسی ببینید.</p></div><button className="secondary" onClick={()=>setShowReasonEditor(value=>!value)}>تنظیم دلایل غیبت</button></div>
      {showReasonEditor&&<div className="panel absence-reason-editor"><b>دلایل غیبت</b>{absenceReasons.map((reason,index)=><div className="absence-reason-row" key={index}><input value={reason} onChange={event=>setAbsenceReasons(current=>current.map((item,i)=>i===index?event.target.value:item))}/><button className="icon-btn" onClick={()=>setAbsenceReasons(current=>current.filter((_,i)=>i!==index))}><X size={15}/></button></div>)}<div className="inline-form"><input value={reasonDraft} onChange={event=>setReasonDraft(event.target.value)} placeholder="دلیل جدید"/><button className="secondary" onClick={()=>{if(reasonDraft.trim()){setAbsenceReasons(current=>[...current,reasonDraft.trim()]);setReasonDraft("");}}}><Plus size={14}/>افزودن</button><button className="primary" onClick={()=>void saveReasons()}><Save size={14}/>ذخیره دلایل</button></div></div>}
      <div className="attendance-filters"><label>از تاریخ<DatePicker ref={fromDatePickerRef} calendar={persian} locale={persian_fa} format="YYYY/MM/DD" value={from?toJalali(from).replace(/\./g,"/"):""} onChange={date=>{setFrom(date?dateKey(date.toDate()):"");window.setTimeout(() => fromDatePickerRef.current?.closeCalendar(), 50);}}/></label><label>تا تاریخ<DatePicker ref={toDatePickerRef} calendar={persian} locale={persian_fa} format="YYYY/MM/DD" value={to?toJalali(to).replace(/\./g,"/"):""} onChange={date=>{setTo(date?dateKey(date.toDate()):"");window.setTimeout(() => toDatePickerRef.current?.closeCalendar(), 50);}}/></label><div className="search"><Search size={15}/><input value={personQuery} onChange={event=>setPersonQuery(event.target.value)} placeholder="جستجوی نام یا سمت فرد"/></div></div>
      <div className="attendance-kpis"><div><span>جلسات در بازه</span><b>{stats.meetings}</b></div><div><span>کل موارد حضور</span><b>{stats.total}</b></div><div><span>حاضر</span><b className="attendance-present">{stats.present}</b></div><div><span>غایب</span><b className="attendance-absent">{stats.absent}</b></div></div>
      <section className="panel attendance-chart"><h3>آمار به تفکیک فرد</h3>{peopleStats.map(person=>{const percent=person.total?Math.round(person.present*100/person.total):0;return <div className="attendance-chart-row" key={person.nationalId}><span><b>{person.displayName}</b><small>{person.title||"سمت ثبت نشده"} · {person.present} حاضر / {person.absent} غایب</small></span><div className="attendance-chart-track"><i style={{width:percent+"%"}}/></div><strong>{percent}٪</strong></div>;})}{peopleStats.length===0&&<p className="muted">با این فیلتر فردی پیدا نشد.</p>}</section>
      <section className="panel attendance-detail"><h3>جزئیات جلسه‌ها</h3>{meetings.map(meeting=><details key={meeting.id}><summary>{formatJalali(meeting.date,meeting.dateJalali)} · {meeting.title}</summary><div>{(meeting.attendees||[]).filter(person=>!personQuery||norm(person.displayName+" "+person.title).includes(norm(personQuery))).map(person=><p key={person.nationalId}><b>{person.displayName}</b> — {person.isPresent?"حاضر":"غایب"}{person.absenceReason?" · "+person.absenceReason:""}</p>)}</div></details>)}{meetings.length===0&&<p className="muted">جلسه‌ای در این بازه ثبت نشده است.</p>}</section>
    </>}
    {editing&&<div className="modal-backdrop" onClick={()=>setEditing(null)}><section className="modal meeting-modal" onClick={event=>event.stopPropagation()}><div className="modal-head"><div><h2>ویرایش جلسه</h2><p>اطلاعات جلسه و وضعیت حضور افراد را تنظیم کنید.</p></div><button className="icon-btn" onClick={()=>setEditing(null)}><X/></button></div>{renderForm()}</section></div>}
    {creating&&!editing&&<div className="modal-backdrop" onClick={()=>setCreating(false)}><section className="modal meeting-modal" onClick={event=>event.stopPropagation()}><div className="modal-head"><div><h2>ثبت جلسه</h2><p>ابتدا مشخصات جلسه و حاضرین را ثبت کنید.</p></div><button className="icon-btn" onClick={()=>setCreating(false)}><X/></button></div>{renderForm()}</section></div>}
  </div>;

  function renderForm() {
    return <><div className="meeting-form-grid"><label className="date-field required-field">تاریخ جلسه<DatePicker ref={meetingDatePickerRef} calendar={persian} locale={persian_fa} format="YYYY/MM/DD" value={draft.dateJalali.replace(/\./g,"/")} onChange={date=>{if(date)setDraft(current=>({...current,date:dateKey(date.toDate()),dateJalali:date.format("YYYY.MM.DD")}));window.setTimeout(() => meetingDatePickerRef.current?.closeCalendar(), 50);}} /></label><label className="required-field">عنوان جلسه<input required autoFocus value={draft.title} onChange={event=>setDraft(current=>({...current,title:event.target.value}))} placeholder="مثلاً جلسه شورای معاونان"/></label><label className="span2">مهمانان جلسه<textarea rows={2} value={draft.guestText} onChange={event=>setDraft(current=>({...current,guestText:event.target.value}))} placeholder="نام مهمانان را وارد کنید"/></label><label className="span2">فایل صورت‌جلسه (PDF یا تصویر)<input type="file" accept="application/pdf,image/*,.pdf" multiple onChange={async event=>{const input=event.currentTarget;const selected=Array.from(input.files||[]);input.value="";const existingHashes=new Set((editing?.attachments||[]).map(file=>file.contentHash||"").filter(Boolean));const known=new Set([...existingHashes,...await Promise.all(meetingFiles.map(hashFile))]);const knownNames=new Set([...(editing?.attachments||[]).map(file=>file.originalName.toLowerCase()+"|"+file.size),...meetingFiles.map(file=>file.name.toLowerCase()+"|"+file.size)]);const additions:File[]=[];for(const file of selected){const hash=await hashFile(file);const fileKey=file.name.toLowerCase()+"|"+file.size;if(known.has(hash)||knownNames.has(fileKey)){setMessage("فایل صورت‌جلسه تکراری انتخاب نشد: "+file.name);continue;}known.add(hash);knownNames.add(fileKey);additions.push(file);}if(additions.length)setMeetingFiles(current=>[...current,...additions]);}}/><small>فایل تکراری برای همین جلسه پذیرفته نمی‌شود.</small>{editing?.attachments?.length? <div className="meeting-file-list"><b>فایل‌های ثبت‌شده</b>{editing.attachments.map(file=><a key={file.id} href={`/api/meeting-attachments/${file.id}`} target="_blank" rel="noreferrer"><FileText size={14}/>{file.originalName}</a>)}</div>:null}{meetingFiles.length>0&&<div className="draft-file-list">{meetingFiles.map((file,index)=><div key={index}><span>{file.name}</span><button type="button" className="icon-btn" onClick={()=>setMeetingFiles(current=>current.filter((_,i)=>i!==index))}><X size={14}/></button></div>)}</div>}</label></div>
      <section className="meeting-people-picker"><div className="meeting-picker-head"><div><b>حاضرین جلسه</b><small>{selectedCount} نفر انتخاب‌شده · انتخاب‌شده‌ها ابتدا حاضر هستند</small></div><div><button className="secondary" onClick={selectAll}>انتخاب همه</button><button className="secondary" onClick={clearAll}>لغو همه</button></div></div><div className="meeting-picker-tools"><select value={groupToAdd} onChange={event=>addGroupMembers(event.target.value)}><option value="">افزودن همه اعضای یک گروه…</option>{groups.filter(group=>group.members?.length).map(group=><option key={group.id} value={group.id}>{group.name} ({group.members.length})</option>)}</select><div className="search"><Search size={14}/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="جستجوی نام، سمت یا کد ملی"/></div></div><div className="meeting-people-list">{visiblePeople.map(person=>{const selected=draft.attendees[person.nationalId];return <div className="meeting-person-row" key={person.nationalId}><label><input type="checkbox" checked={!!selected} onChange={event=>selectPerson(person.nationalId,event.target.checked)}/><span><b>{person.displayName}</b><small>{person.title||person.organizationUnit||"سمت ثبت نشده"}</small></span></label>{selected&&<div className="meeting-person-status"><select value={selected.isPresent?"present":"absent"} onChange={event=>setDraft(current=>({...current,attendees:{...current.attendees,[person.nationalId]:{...selected,isPresent:event.target.value==="present",absenceReason:event.target.value==="present"?"":selected.absenceReason}}}))}><option value="present">حاضر</option><option value="absent">غایب</option></select>{!selected.isPresent&&<select value={selected.absenceReason} onChange={event=>setDraft(current=>({...current,attendees:{...current.attendees,[person.nationalId]:{...selected,absenceReason:event.target.value}}}))}><option value="">بدون دلیل</option>{absenceReasons.map(reason=><option key={reason}>{reason}</option>)}</select>}</div>}</div>;})}{visiblePeople.length===0&&<p className="muted">فردی پیدا نشد.</p>}</div></section>
      <div className="modal-actions"><button className="secondary" onClick={()=>{setEditing(null);setCreating(false);}}>انصراف</button><button className="primary" disabled={busy} onClick={()=>void saveMeeting()}><Save size={15}/>{busy?"در حال ذخیره…":editing?"ذخیره تغییرات":"ثبت جلسه"}</button></div></>;
  }
}
