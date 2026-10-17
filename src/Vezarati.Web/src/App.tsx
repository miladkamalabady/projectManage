import { useEffect, useMemo, useState } from "react";
import DatePicker from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import { CalendarDays, CheckCheck, CircleAlert, ClipboardList, FileText, LayoutDashboard, Plus, Search, ShieldCheck, Users, X } from "lucide-react";

type Member = { id: number; nationalId: string; displayName: string; title: string };
type Group = { id: number; name: string; members: Member[] };
type Resolution = { id: number; meetingDate: string; meetingDateJalali?: string; number: string; text: string; notes: string; status: string; groupId: number | null; groupAssignments?: { groupId: number; group?: { name: string } }[]; assignments: { nationalId: string }[] };
type Dashboard = { currentUser: { displayName: string; role: string }; groups: Group[]; resolutions: Resolution[] };
type Report = { total: number; completed: number; delayed: number; pending: number; people: { nationalId: string; displayName: string; total: number; completed: number; delayed: number; pending: number }[] };

const labels: Record<string, string> = { before: "قبل از اجرا", in_progress: "در حال اجرا", completed: "اجرا شده", delayed: "دارای تأخیر" };
const statusEntries = Object.entries(labels);
const today = () => new Date().toISOString().slice(0, 10);
const formatDate = (value: string, jalali?: string) => jalali || new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "medium", numberingSystem: "arabext" }).format(new Date(`${value}T12:00:00`));
const jalaliToGregorian = (value: string) => { const [jy,jm,jd] = value.split(".").map(Number); let days=365*(jy-979)+Math.floor((jy-979)/33)*8+Math.floor(((jy-979)%33+3)/4)+79; for(let m=1;m<jm;m++) days+=m<=6?31:30; days+=jd-1; let gy=1600+400*Math.floor(days/146097); days%=146097; let leap=true; if(days>=36525){days--;gy+=100*Math.floor(days/36524);days%=36524;if(days>=365)days++;else leap=false;}gy+=4*Math.floor(days/1461);days%=1461;if(days>=366){leap=false;days--;gy+=Math.floor(days/365);days%=365;}const md=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];let gm=0;while(gm<11&&days>=md[gm]){days-=md[gm++];}return `${gy}-${String(gm+1).padStart(2,"0")}-${String(days+1).padStart(2,"0")}`;};
const gregorianToJalali = (value: string) => new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(`${value}T12:00:00`)).replace(/(\d+)\/(\d+)\/(\d+)/,"$3.$1.$2");
const jalaliToday = () => gregorianToJalali(today());

export default function App() {
  const [tab, setTab] = useState("wall");
  const [viewerId, setViewerId] = useState(localStorage.getItem("vezarati.userId") || "admin");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [resolutions, setResolutions] = useState<Resolution[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [reports, setReports] = useState<Report | null>(null);
  const [users, setUsers] = useState<{ nationalId: string; displayName: string }[]>([]);
  const [query, setQuery] = useState("");
  const [peopleQuery, setPeopleQuery] = useState("");
  const [resolutionPage, setResolutionPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ meetingDate: today(), meetingDateJalali: jalaliToday(), number: "", text: "", notes: "", status: "before", groupId: "", people: [] as string[] });
  const [groupName, setGroupName] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [memberTitle, setMemberTitle] = useState("");

  async function load() {
    setError("");
    try {
      const [dashboardResponse, resolutionsResponse, groupsResponse, reportsResponse, usersResponse] = await Promise.all([
        fetch(`/api/dashboard?userId=${encodeURIComponent(localStorage.getItem("vezarati.userId") || "admin")}`), fetch("/api/resolutions"), fetch("/api/groups"), fetch("/api/reports"), fetch("/api/users")
      ]);
      for (const response of [dashboardResponse, resolutionsResponse, groupsResponse, reportsResponse, usersResponse]) if (!response.ok) throw new Error("گرفتن اطلاعات از API ناموفق بود.");
      setDashboard(await dashboardResponse.json()); setResolutions(await resolutionsResponse.json()); setGroups(await groupsResponse.json()); setReports(await reportsResponse.json()); setUsers(await usersResponse.json());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "خطا در دریافت اطلاعات"); }
  }
  useEffect(() => { void load(); }, [viewerId]);

  async function request(url: string, method: string, body?: unknown) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      const result = response.status === 204 ? null : await response.json();
      if (!response.ok) throw new Error(result?.error || "عملیات انجام نشد.");
      setMessage("عملیات با موفقیت انجام شد."); await load(); return true;
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "خطا در ذخیره اطلاعات"); return false; }
    finally { setBusy(false); }
  }
  async function createResolution() {
    const ok = await request("/api/resolutions", "POST", { ...form, groupId: form.groupId ? Number(form.groupId) : null, groupIds: form.groupId ? [Number(form.groupId)] : [] });
    if (ok) { setModalOpen(false); setForm({ meetingDate: today(), meetingDateJalali: jalaliToday(), number: "", text: "", notes: "", status: "before", groupId: "", people: [] }); }
  }
  async function createGroup() { if (await request("/api/groups", "POST", { name: groupName })) setGroupName(""); }
  async function addMember() {
    if (!selectedGroup) { setMessage("ابتدا گروه را انتخاب کنید."); return; }
    if (await request(`/api/groups/${selectedGroup}/members/lookup`, "POST", { nationalId, title: memberTitle })) { setNationalId(""); setMemberTitle(""); }
  }

  const filtered = useMemo(() => { const term = query.trim().toLocaleLowerCase("fa"); return resolutions.filter(item => !term || `${item.number} ${item.text} ${item.notes} ${item.status}`.toLocaleLowerCase("fa").includes(term)); }, [resolutions, query]);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = useMemo(() => filtered.slice((resolutionPage - 1) * pageSize, resolutionPage * pageSize), [filtered, resolutionPage]);
  const filteredUsers = useMemo(() => { const term = peopleQuery.trim().toLocaleLowerCase("fa"); return users.filter(user => !term || `${user.displayName} ${user.nationalId}`.toLocaleLowerCase("fa").includes(term)); }, [users, peopleQuery]);
  useEffect(() => { setResolutionPage(1); }, [query]);
  useEffect(() => { if (resolutionPage > pageCount) setResolutionPage(pageCount); }, [resolutionPage, pageCount]);
  const completed = reports?.completed ?? 0;
  const delayed = reports?.delayed ?? 0;
  const pending = reports?.pending ?? 0;
  const mine = dashboard?.resolutions ?? [];

  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-icon"><ShieldCheck /></span><div><b>دفتر وزارتی</b><small>سامانه پیگیری مصوبات</small></div></div>
      <div className="profile"><div className="avatar">{dashboard?.currentUser.displayName?.[0] || "م"}</div><div><b>{dashboard?.currentUser.displayName || "مدیر دفتر وزارتی"}</b><small>دسترسی: {dashboard?.currentUser.role || "ادمین"}</small><select aria-label="کاربر آزمایشی" value={viewerId} onChange={event => { localStorage.setItem("vezarati.userId", event.target.value); setViewerId(event.target.value); }}><option value="admin">مدیر</option>{users.map(user => <option key={user.nationalId} value={user.nationalId}>{user.displayName}</option>)}</select></div></div>
      <nav>{[["wall", LayoutDashboard, "دیواره من"], ["resolutions", ClipboardList, "مصوبات"], ...(viewerId === "admin" ? [["groups", Users, "گروه‌ها و اعضا"], ["reports", FileText, "گزارش‌ها"]] : [])].map(([key, Icon, title]: any) => <button key={key} className={`nav ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}><Icon size={18} />{title}</button>)}</nav>
      <div className="sidebar-foot">محیط پیگیری اجرایی<br /><span>دفتر وزارتی</span></div>
    </aside>

    <main className="main">
      <header className="top"><div><div className="eyebrow">سامانه یکپارچه پیگیری</div><h1>{tab === "wall" ? "دیواره پیگیری من" : tab === "resolutions" ? "مصوبات و جلسات" : tab === "groups" ? "مدیریت گروه‌ها و اعضا" : "گزارش‌های اجرایی"}</h1><p>مصوبات، مسئولیت‌ها و روند اجرای اقدامات</p></div><div className="top-actions"><span className="today"><CalendarDays size={16} />{formatDate(today(), gregorianToJalali(today()).replace(/\./g, "/"))}</span>{viewerId === "admin" && tab !== "groups" && <button className="primary" onClick={() => setModalOpen(true)}><Plus size={17} />ثبت مصوبه</button>}</div></header>
      {error && <div className="notice">{error}<button onClick={() => void load()}>تلاش دوباره</button></div>}{message && <div className="notice">{message}</div>}
      <section className="metrics"><Metric icon={<ClipboardList />} label="کل مصوبات" value={reports?.total ?? resolutions.length} color="blue" /><Metric icon={<CheckCheck />} label="اجراشده" value={completed} color="green" /><Metric icon={<CircleAlert />} label="نیازمند پیگیری" value={pending} color="amber" /><Metric icon={<CalendarDays />} label="دارای تأخیر" value={delayed} color="red" /></section>

      {tab === "wall" && <><div className="section-head"><div><h2>ارجاع‌شده به من</h2><p>مصوبه‌های ارجاع‌شده به گروه‌های عضو یا کد ملی شما</p></div><span className="counter">{mine.length} مورد</span></div><div className="cards">{mine.map(item => <ResolutionCard key={item.id} item={item} groups={groups} onStatus={status => void request(`/api/resolutions/${item.id}/status`, "PATCH", { status })} />)}</div>{!mine.length && <Empty />}</>}

      {tab === "resolutions" && viewerId === "admin" && <><div className="toolbar"><div className="search"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="جستجو در شماره، متن، توضیحات یا وضعیت" /></div><span>{filtered.length} مصوبه</span></div><div className="table-wrap"><table><thead><tr><th>تاریخ جلسه</th><th>شماره</th><th>متن مصوبه</th><th>ارجاع</th><th>وضعیت اجرا</th></tr></thead><tbody>{pageRows.map(item => <tr key={item.id}><td>{formatDate(item.meetingDate, item.meetingDateJalali?.replace(/\./g, "/"))}</td><td><b>{item.number}</b></td><td>{item.text}<small>{item.notes}</small></td><td>{item.groupAssignments?.map(a => a.group?.name || groups.find(g => g.id === a.groupId)?.name).filter(Boolean).join("، ") || groups.find(group => group.id === item.groupId)?.name || "ارجاع مستقیم"}</td><td><div className={`status-cell ${item.status}`}><span className={`status ${item.status}`}>{labels[item.status] || item.status}</span><select className={`status-select ${item.status}`} aria-label="تغییر وضعیت اجرا" value={item.status} onChange={event => void request(`/api/resolutions/${item.id}/status`, "PATCH", { status: event.target.value })}>{statusEntries.map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></div></td></tr>)}</tbody></table></div></>}

      {tab === "groups" && viewerId === "admin" && <div className="group-layout"><section className="panel"><h2>ساخت گروه</h2><p>گروه‌های سازمانی برای ارجاع مصوبه</p><div className="inline"><input value={groupName} onChange={event => setGroupName(event.target.value)} placeholder="نام گروه جدید" /><button className="primary" disabled={busy || !groupName.trim()} onClick={() => void createGroup()}>ایجاد</button></div><div className="group-list">{groups.map(group => <div className="group-row" key={group.id}><div className="group-avatar"><Users /></div><div><b>{group.name}</b><small>{group.members.length} عضو</small></div><span>{group.members.length}</span></div>)}</div></section><section className="panel"><h2>افزودن عضو با کد ملی</h2><p>کاربر از فهرست موجود استعلام و با سمت به گروه افزوده می‌شود.</p><label>گروه<select value={selectedGroup} onChange={event => setSelectedGroup(event.target.value)}><option value="">انتخاب گروه</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><label>کد ملی<input value={nationalId} onChange={event => setNationalId(event.target.value)} inputMode="numeric" maxLength={10} /></label><label>سمت در گروه<input value={memberTitle} onChange={event => setMemberTitle(event.target.value)} placeholder="مثلاً معاون وزیر" /></label><button className="primary wide" disabled={busy || !nationalId} onClick={() => void addMember()}>استعلام و افزودن</button><div className="members">{groups.flatMap(group => group.members.map(member => <div className="member" key={member.id}><span className="avatar small">{member.displayName[0]}</span><div><b>{member.displayName}</b><small>{group.name} · {member.title || member.nationalId}</small></div><button className="icon-btn" title="حذف عضو" onClick={() => void request(`/api/groups/${group.id}/members/${member.nationalId}`, "DELETE")}><X size={17} /></button></div>))}</div></section></div>}

      {tab === "reports" && viewerId === "admin" && <><div className="report-kpis"><div><span>کل مصوبات</span><b>{reports?.total ?? 0}</b></div><div><span>نرخ اجرا</span><b>{reports?.total ? Math.round(completed * 100 / reports.total) : 0}٪</b></div><div><span>موارد دارای تأخیر</span><b className="red-text">{delayed}</b></div></div><div className="panel"><h2>گزارش به تفکیک فرد</h2><p>تعداد مصوبه‌های ارجاع‌شده و وضعیت پیگیری</p><div className="table-wrap"><table><thead><tr><th>فرد</th><th>کل</th><th>اجراشده</th><th>باز</th><th>دارای تأخیر</th><th>درصد اجرا</th></tr></thead><tbody>{(reports?.people ?? []).map(person => <tr key={person.nationalId}><td>{person.displayName}</td><td>{person.total}</td><td>{person.completed}</td><td>{person.pending}</td><td>{person.delayed}</td><td>{person.total ? Math.round(person.completed * 100 / person.total) : 0}٪</td></tr>)}</tbody></table></div></div></>}
    </main>

    {modalOpen && <div className="modal-backdrop" onClick={() => setModalOpen(false)}><section className="modal" onClick={event => event.stopPropagation()}><div className="modal-head"><div><h2>ثبت مصوبه جلسه</h2><p>مشخصات جلسه، متن مصوبه و گیرندگان پیگیری را وارد کنید.</p></div><button className="icon-btn" onClick={() => setModalOpen(false)}><X /></button></div><div className="form-grid"><label>تاریخ جلسه<DatePicker calendar={persian} locale={persian_fa} format="YYYY/MM/DD" value={form.meetingDateJalali.replace(/\./g, "/")} onChange={date => { if(date) { const jalali = date.format("YYYY.MM.DD"); setForm({ ...form, meetingDate: jalaliToGregorian(jalali), meetingDateJalali: jalali }); } }} /></label><label>شماره مصوبه<input value={form.number} onChange={event => setForm({ ...form, number: event.target.value })} placeholder="مثلاً ۱۴۰۵/۱۲" /></label><label className="span2">متن مصوبه<textarea rows={4} value={form.text} onChange={event => setForm({ ...form, text: event.target.value })} /></label><label>وضعیت اجرا<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}>{statusEntries.map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label><label>ارجاع به گروه<select value={form.groupId} onChange={event => setForm({ ...form, groupId: event.target.value })}><option value="">بدون گروه</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><div className="direct-people-field"><label htmlFor="direct-people-search">ارجاع مستقیم به اشخاص</label><div className="search"><Search size={16} /><input id="direct-people-search" value={peopleQuery} onChange={event => setPeopleQuery(event.target.value)} placeholder="جستجو با نام یا کد ملی" /></div><div className="people-results">{filteredUsers.map(user => <label className="person-option" key={user.nationalId}><input type="checkbox" checked={form.people.includes(user.nationalId)} onChange={event => setForm({ ...form, people: event.target.checked ? [...form.people, user.nationalId] : form.people.filter(id => id !== user.nationalId) })} /><span>{user.displayName}</span><small>{user.nationalId}</small></label>)}{filteredUsers.length === 0 && <div className="people-empty">شخصی با این مشخصات پیدا نشد.</div>}</div><small className="selection-count">{form.people.length} نفر انتخاب شده</small></div><label className="span2">توضیحات<textarea rows={2} value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></label></div><div className="modal-actions"><button className="secondary" onClick={() => setModalOpen(false)}>انصراف</button><button className="primary" disabled={busy || !form.number.trim() || !form.text.trim()} onClick={() => void createResolution()}>{busy ? "در حال ثبت…" : "ثبت و ارجاع مصوبه"}</button></div></section></div>}
  </div>;
}

function Metric({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) { return <article className="metric"><div className={`metric-icon ${color}`}>{icon}</div><div><span>{label}</span><b>{value}</b></div></article>; }
function ResolutionCard({ item, groups, onStatus }: { item: Resolution; groups: Group[]; onStatus: (status: string) => void }) { return <article className="resolution-card"><div className="card-top"><span className="resolution-no">مصوبه {item.number}</span><span className={`status ${item.status}`}>{labels[item.status] || item.status}</span></div><div className="card-meta"><span><CalendarDays size={14} />{formatDate(item.meetingDate, item.meetingDateJalali?.replace(/\./g, "/"))}</span><span><Users size={14} />{item.groupAssignments?.map(a => a.group?.name || groups.find(g => g.id === a.groupId)?.name).filter(Boolean).join("، ") || groups.find(group => group.id === item.groupId)?.name || "ارجاع مستقیم"}</span></div><p>{item.text}</p>{item.notes && <div className="note">توضیحات: {item.notes}</div>}<div className="card-bottom"><small>وضعیت پیگیری را به‌روز کنید.</small><select value={item.status} onChange={event => onStatus(event.target.value)}>{statusEntries.map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></div></article>; }
function Empty() { return <div className="empty"><ClipboardList size={34} /><b>مصوبه‌ای برای نمایش نیست</b><span>مصوبه‌های ارجاع‌شده در این بخش نمایش داده می‌شوند.</span></div>; }
