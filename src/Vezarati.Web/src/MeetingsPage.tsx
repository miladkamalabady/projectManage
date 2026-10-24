import { useEffect, useMemo, useState } from "react";
import DatePicker from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import { CalendarDays, Check, ChevronDown, FileText, Pencil, Plus, Printer, Save, Search, Users, X } from "lucide-react";

type Person = { nationalId: string; displayName: string; title?: string; organizationUnit?: string };
type Group = { id: number; name: string; members: Person[] };
type MeetingAttendee = { id: number; nationalId: string; displayName: string; title: string; isPresent: boolean; absenceReason: string };
type Meeting = { id: number; date: string; dateJalali: string; title: string; guestText: string; attendees: MeetingAttendee[] };
type Resolution = { id: number; meetingId?: number | null; number: string; text: string; status: string; dueDateJalali?: string };
type MeetingDraft = { date: string; dateJalali: string; title: string; guestText: string; attendees: Record<string, { isPresent: boolean; absenceReason: string }> };
type Props = { users: Person[]; groups: Group[]; resolutions: Resolution[]; onCreateResolution: (meeting: Meeting) => void; onRefresh: () => void };

const todayKey = () => { const d = new Date(); return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0"); };
const toJalali = (value: string) => { if (!value) return ""; const d = new Date(value+"T12:00:00"); return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("fa-IR-u-ca-persian",{year:"numeric",month:"2-digit",day:"2-digit",numberingSystem:"latn"}).format(d).replace(/\//g,"."); };
const dateKey = (value: Date) => value.getFullYear()+"-"+String(value.getMonth()+1).padStart(2,"0")+"-"+String(value.getDate()).padStart(2,"0");
const formatJalali = (value: string, jalali?: string) => jalali || toJalali(value).replace(/\./g,"/");
const norm = (value: string) => value.normalize("NFKC").replace(/[يى]/g,"ی").replace(/ك/g,"ک").trim().toLocaleLowerCase("fa");
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, character => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[character] ?? character));

export default function MeetingsPage({ users, groups, resolutions, onCreateResolution, onRefresh }: Props) {
  const [section,setSection]=useState<"meetings"|"attendance">("meetings");
  const [meetings,setMeetings]=useState<Meeting[]>([]);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [meetingQuery,setMeetingQuery]=useState("");
  const [expandedId,setExpandedId]=useState<number|null>(null);
  const [editing,setEditing]=useState<Meeting|null>(null);
  const [creating,setCreating]=useState(false);
  const [search,setSearch]=useState("");
  const [groupToAdd,setGroupToAdd]=useState("");
  const [absenceReasons,setAbsenceReasons]=useState<string[]>(["ماموریت","بیماری","سایر"]);
  const [reasonDraft,setReasonDraft]=useState("");
  const [showReasonEditor,setShowReasonEditor]=useState(false);
  const [from,setFrom]=useState("");
  const [to,setTo]=useState("");
  const [personQuery,setPersonQuery]=useState("");
  const [draft,setDraft]=useState<MeetingDraft>({date:todayKey(),dateJalali:toJalali(todayKey()),title:"",guestText:"",attendees:{}});

  async function loadMeetings() {
    const response=await fetch("/api/meetings",{credentials:"include"});
    const result=await response.json();
    if(!response.ok) throw new Error(result?.error||"فهرست جلسات دریافت نشد.");
    setMeetings(Array.isArray(result)?result:[]);
  }
  async function loadReasons() {
    const response=await fetch("/api/attendance/reasons",{credentials:"include"});
    if(response.ok){const result=await response.json();if(Array.isArray(result))setAbsenceReasons(result);}
  }
  useEffect(()=>{void loadMeetings().catch(error=>setMessage(error.message));void loadReasons();},[]);
  useEffect(()=>{if(section==="meetings")void loadMeetings().catch(error=>setMessage(error.message));},[section]);
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
  const meetingList=meetings.filter(meeting=>!meetingQuery||norm(meeting.title+" "+meeting.dateJalali+" "+(meeting.guestText||"")).includes(norm(meetingQuery)));
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
    setEditing(null);setCreating(true);setSearch("");setGroupToAdd("");
    setDraft({date:todayKey(),dateJalali:toJalali(todayKey()),title:"",guestText:"",attendees:{}});
  }
  function openEdit(meeting:Meeting) {
    setEditing(meeting);setCreating(false);setSearch("");setGroupToAdd("");
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
    if(!draft.title.trim()){setMessage("عنوان جلسه را وارد کنید.");return;}
    setBusy(true);setMessage("");
    const payload={date:draft.date,dateJalali:draft.dateJalali,title:draft.title.trim(),guestText:draft.guestText.trim(),attendees:Object.entries(draft.attendees).map(([nationalId,state])=>({nationalId,...state}))};
    try{
      const response=await fetch(editing?"/api/meetings/"+editing.id:"/api/meetings",{method:editing?"PUT":"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify(payload)});
      const result=await response.json();if(!response.ok)throw new Error(result?.error||"ذخیره جلسه انجام نشد.");
      setEditing(null);setCreating(false);setMessage("جلسه ذخیره شد.");await loadMeetings();onRefresh();
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
    popup.document.write("<!doctype html><html lang='fa' dir='rtl'><meta charset='utf-8'><title>"+escapeHtml(meeting.title)+"</title><style>body{font-family:Tahoma,Arial;padding:28px;color:#203238}h1{font-size:22px}h2{margin-top:28px;font-size:16px}p{color:#56666b}table{border-collapse:collapse;width:100%;margin:12px 0 24px}td,th{border:1px solid #ccd5d7;padding:8px;text-align:right}th{background:#f1f5f4}@media print{button{display:none}}</style><h1>"+escapeHtml(meeting.title)+"</h1><p>تاریخ جلسه: "+escapeHtml(formatJalali(meeting.date,meeting.dateJalali))+"</p><p>مهمانان: "+escapeHtml(meeting.guestText||"—")+"</p><h2>حاضرین و غایبین</h2><table><thead><tr><th>نام</th><th>سمت</th><th>وضعیت</th><th>دلیل غیبت</th></tr></thead><tbody>"+attendees+"</tbody></table><h2>مصوبات و وظایف جلسه</h2><table><thead><tr><th>شماره</th><th>متن مصوبه</th><th>مهلت</th></tr></thead><tbody>"+taskRows+"</tbody></table><script>window.onload=()=>window.print()<\/script></html>");
    popup.document.close();
  }

  return <div className="meetings-module">
    <div className="meetings-tabs" role="tablist"><button className={section==="meetings"?"active":""} onClick={()=>setSection("meetings")}><CalendarDays size={16}/>جلسات</button><button className={section==="attendance"?"active":""} onClick={()=>setSection("attendance")}><Users size={16}/>گزارش حضور و غیاب</button></div>
    {message&&<div className="notice">{message}<button type="button" onClick={()=>setMessage("")}>بستن</button></div>}
    {section==="meetings"&&<><div className="section-head"><div><h2>جلسات</h2><p>ابتدا جلسه را ثبت کنید؛ مصوبات و وظایف بعداً به همان جلسه متصل می‌شوند.</p></div><button className="primary" onClick={openNew}><Plus size={16}/>ثبت جلسه</button></div>
      <div className="search meetings-search"><Search size={15}/><input value={meetingQuery} onChange={event=>setMeetingQuery(event.target.value)} placeholder="جستجو در عنوان، تاریخ یا مهمانان جلسه"/></div>
      <div className="meeting-list">{meetingList.map(meeting=>{const tasks=resolutions.filter(item=>item.meetingId===meeting.id);const present=(meeting.attendees||[]).filter(item=>item.isPresent).length;const absent=(meeting.attendees||[]).length-present;return <article className="meeting-card" key={meeting.id}><div className="meeting-card-head"><button className="meeting-title-button" onClick={()=>setExpandedId(expandedId===meeting.id?null:meeting.id)}><span><b>{meeting.title}</b><small>{formatJalali(meeting.date,meeting.dateJalali)} · {tasks.length} مصوبه · {present} حاضر · {absent} غایب</small></span><ChevronDown size={17}/></button><div className="meeting-actions"><button className="secondary" onClick={()=>openEdit(meeting)}><Pencil size={14}/>ویرایش</button><button className="secondary" onClick={()=>printMeeting(meeting)}><Printer size={14}/>چاپ</button><button className="secondary" onClick={()=>onCreateResolution(meeting)}><Plus size={14}/>ثبت مصوبه</button></div></div>
        {expandedId===meeting.id&&<div className="meeting-details"><div className="meeting-guests"><b>مهمانان</b><span>{meeting.guestText||"مهمانی ثبت نشده است."}</span></div><h3>حاضرین و غایبین</h3><div className="meeting-attendance-list">{(meeting.attendees||[]).map(person=><div key={person.nationalId}><span>{person.displayName}<small>{person.title||"سمت ثبت نشده"}</small></span><span className={person.isPresent?"attendance-present":"attendance-absent"}>{person.isPresent?"حاضر":("غایب"+(person.absenceReason?" · "+person.absenceReason:""))}</span></div>)}</div><h3>مصوبات جلسه</h3>{tasks.length?tasks.map(task=><div className="meeting-task" key={task.id}><b>مصوبه {task.number} · شناسه یکتا: {task.id}</b><span>{task.text}</span><small>{task.dueDateJalali?"مهلت: "+task.dueDateJalali:"بدون سررسید"}</small></div>):<p className="muted">هنوز مصوبه‌ای برای این جلسه ثبت نشده است.</p>}</div>}</article>;})}{meetingList.length===0&&<div className="report-empty">جلسه‌ای پیدا نشد.</div>}</div>
    </>}
    {section==="attendance"&&<><div className="section-head"><div><h2>گزارش حضور و غیاب</h2><p>آمار حضور، غیبت و دلایل ثبت‌شده را در بازهٔ شمسی ببینید.</p></div><button className="secondary" onClick={()=>setShowReasonEditor(value=>!value)}>تنظیم دلایل غیبت</button></div>
      {showReasonEditor&&<div className="panel absence-reason-editor"><b>دلایل غیبت</b>{absenceReasons.map((reason,index)=><div className="absence-reason-row" key={index}><input value={reason} onChange={event=>setAbsenceReasons(current=>current.map((item,i)=>i===index?event.target.value:item))}/><button className="icon-btn" onClick={()=>setAbsenceReasons(current=>current.filter((_,i)=>i!==index))}><X size={15}/></button></div>)}<div className="inline-form"><input value={reasonDraft} onChange={event=>setReasonDraft(event.target.value)} placeholder="دلیل جدید"/><button className="secondary" onClick={()=>{if(reasonDraft.trim()){setAbsenceReasons(current=>[...current,reasonDraft.trim()]);setReasonDraft("");}}}><Plus size={14}/>افزودن</button><button className="primary" onClick={()=>void saveReasons()}><Save size={14}/>ذخیره دلایل</button></div></div>}
      <div className="attendance-filters"><label>از تاریخ<DatePicker calendar={persian} locale={persian_fa} format="YYYY/MM/DD" value={from?toJalali(from).replace(/\./g,"/"):""} onChange={date=>setFrom(date?dateKey(date.toDate()):"")}/></label><label>تا تاریخ<DatePicker calendar={persian} locale={persian_fa} format="YYYY/MM/DD" value={to?toJalali(to).replace(/\./g,"/"):""} onChange={date=>setTo(date?dateKey(date.toDate()):"")}/></label><div className="search"><Search size={15}/><input value={personQuery} onChange={event=>setPersonQuery(event.target.value)} placeholder="جستجوی نام یا سمت فرد"/></div></div>
      <div className="attendance-kpis"><div><span>جلسات در بازه</span><b>{stats.meetings}</b></div><div><span>کل موارد حضور</span><b>{stats.total}</b></div><div><span>حاضر</span><b className="attendance-present">{stats.present}</b></div><div><span>غایب</span><b className="attendance-absent">{stats.absent}</b></div></div>
      <section className="panel attendance-chart"><h3>آمار به تفکیک فرد</h3>{peopleStats.map(person=>{const percent=person.total?Math.round(person.present*100/person.total):0;return <div className="attendance-chart-row" key={person.nationalId}><span><b>{person.displayName}</b><small>{person.title||"سمت ثبت نشده"} · {person.present} حاضر / {person.absent} غایب</small></span><div className="attendance-chart-track"><i style={{width:percent+"%"}}/></div><strong>{percent}٪</strong></div>;})}{peopleStats.length===0&&<p className="muted">با این فیلتر فردی پیدا نشد.</p>}</section>
      <section className="panel attendance-detail"><h3>جزئیات جلسه‌ها</h3>{meetings.map(meeting=><details key={meeting.id}><summary>{formatJalali(meeting.date,meeting.dateJalali)} · {meeting.title}</summary><div>{(meeting.attendees||[]).filter(person=>!personQuery||norm(person.displayName+" "+person.title).includes(norm(personQuery))).map(person=><p key={person.nationalId}><b>{person.displayName}</b> — {person.isPresent?"حاضر":"غایب"}{person.absenceReason?" · "+person.absenceReason:""}</p>)}</div></details>)}{meetings.length===0&&<p className="muted">جلسه‌ای در این بازه ثبت نشده است.</p>}</section>
    </>}
    {editing&&<div className="modal-backdrop" onClick={()=>setEditing(null)}><section className="modal meeting-modal" onClick={event=>event.stopPropagation()}><div className="modal-head"><div><h2>ویرایش جلسه</h2><p>اطلاعات جلسه و وضعیت حضور افراد را تنظیم کنید.</p></div><button className="icon-btn" onClick={()=>setEditing(null)}><X/></button></div>{renderForm()}</section></div>}
    {creating&&!editing&&<div className="modal-backdrop" onClick={()=>setCreating(false)}><section className="modal meeting-modal" onClick={event=>event.stopPropagation()}><div className="modal-head"><div><h2>ثبت جلسه</h2><p>ابتدا مشخصات جلسه و حاضرین را ثبت کنید.</p></div><button className="icon-btn" onClick={()=>setCreating(false)}><X/></button></div>{renderForm()}</section></div>}
  </div>;

  function renderForm() {
    return <><div className="meeting-form-grid"><label className="date-field">تاریخ جلسه<DatePicker calendar={persian} locale={persian_fa} format="YYYY/MM/DD" value={draft.dateJalali.replace(/\./g,"/")} onChange={date=>{if(date)setDraft(current=>({...current,date:dateKey(date.toDate()),dateJalali:date.format("YYYY.MM.DD")}));}} /></label><label>عنوان جلسه<input autoFocus value={draft.title} onChange={event=>setDraft(current=>({...current,title:event.target.value}))} placeholder="مثلاً جلسه شورای معاونان"/></label><label className="span2">مهمانان جلسه<textarea rows={2} value={draft.guestText} onChange={event=>setDraft(current=>({...current,guestText:event.target.value}))} placeholder="نام مهمانان را وارد کنید"/></label></div>
      <section className="meeting-people-picker"><div className="meeting-picker-head"><div><b>حاضرین جلسه</b><small>{selectedCount} نفر انتخاب‌شده · انتخاب‌شده‌ها ابتدا حاضر هستند</small></div><div><button className="secondary" onClick={selectAll}>انتخاب همه</button><button className="secondary" onClick={clearAll}>لغو همه</button></div></div><div className="meeting-picker-tools"><select value={groupToAdd} onChange={event=>addGroupMembers(event.target.value)}><option value="">افزودن همه اعضای یک گروه…</option>{groups.filter(group=>group.members?.length).map(group=><option key={group.id} value={group.id}>{group.name} ({group.members.length})</option>)}</select><div className="search"><Search size={14}/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="جستجوی نام، سمت یا کد ملی"/></div></div><div className="meeting-people-list">{visiblePeople.map(person=>{const selected=draft.attendees[person.nationalId];return <div className="meeting-person-row" key={person.nationalId}><label><input type="checkbox" checked={!!selected} onChange={event=>selectPerson(person.nationalId,event.target.checked)}/><span><b>{person.displayName}</b><small>{person.title||person.organizationUnit||"سمت ثبت نشده"}</small></span></label>{selected&&<div className="meeting-person-status"><select value={selected.isPresent?"present":"absent"} onChange={event=>setDraft(current=>({...current,attendees:{...current.attendees,[person.nationalId]:{...selected,isPresent:event.target.value==="present",absenceReason:event.target.value==="present"?"":selected.absenceReason}}}))}><option value="present">حاضر</option><option value="absent">غایب</option></select>{!selected.isPresent&&<select value={selected.absenceReason} onChange={event=>setDraft(current=>({...current,attendees:{...current.attendees,[person.nationalId]:{...selected,absenceReason:event.target.value}}}))}><option value="">بدون دلیل</option>{absenceReasons.map(reason=><option key={reason}>{reason}</option>)}</select>}</div>}</div>;})}{visiblePeople.length===0&&<p className="muted">فردی پیدا نشد.</p>}</div></section>
      <div className="modal-actions"><button className="secondary" onClick={()=>{setEditing(null);setCreating(false);}}>انصراف</button><button className="primary" disabled={busy} onClick={()=>void saveMeeting()}><Save size={15}/>{busy?"در حال ذخیره…":editing?"ذخیره تغییرات":"ثبت جلسه"}</button></div></>;
  }
}
