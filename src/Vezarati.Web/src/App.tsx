import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import DatePicker from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import { Archive, Bell, CalendarDays, CheckCheck, CircleAlert, ClipboardList, FileText, LayoutDashboard, Paperclip, Plus, Search, ShieldCheck, Users, X } from "lucide-react";

type Member = { id: number; nationalId: string; displayName: string; title: string };
type Group = { id: number; name: string; members: Member[] };
type ResolutionProgress = { nationalId: string; status: string; notes: string; reportText?: string; approvalStatus?: string; adminFeedback?: string; updatedAt: string };
type UserNotification = { id: number; resolutionId?: number; resolutionNumber?: string; type: string; text: string; isRead: boolean; createdAt: string };
type ResolutionEvent = { id: number; nationalId: string; userName: string; text: string; createdAt: string };
type ResolutionAttachment = { id: number; originalName: string; contentType: string; size: number; uploadedBy: string; uploaderName: string; approvedForAll: boolean; uploadedAt: string };
type Resolution = { publishToAll?: boolean; isArchived?: boolean; updatedAt?: string | null; dueDate?: string | null; dueDateJalali?: string; id: number; meetingDate: string; meetingDateJalali?: string; number: string; text: string; notes: string; status: string; groupId: number | null; groupAssignments?: { groupId: number; group?: { name: string } }[]; assignments: { nationalId: string }[]; progress?: ResolutionProgress[]; attachments?: ResolutionAttachment[]; events?: ResolutionEvent[] };
type DirectoryUser = { nationalId: string; displayName: string; title?: string; province?: string | null };
type Dashboard = { currentUser: { displayName: string; role: string }; groups: Group[]; resolutions: Resolution[] };
type Report = { total: number; completed: number; delayed: number; pending: number; people: { nationalId: string; displayName: string; total: number; completed: number; delayed: number; pending: number; title?: string }[] };

const labels: Record<string, string> = { before: "قبل از اجرا", in_progress: "در حال اجرا", completed: "اجرا شده", delayed: "دارای تأخیر" };
const statusEntries = Object.entries(labels);
const today = () => new Date().toISOString().slice(0, 10);
const formatDate = (value: string, jalali?: string) => jalali || new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "medium", numberingSystem: "arabext" }).format(new Date(`${value}T12:00:00`));
const jalaliToGregorian = (value: string) => { const [jy,jm,jd] = value.split(".").map(Number); let days=365*(jy-979)+Math.floor((jy-979)/33)*8+Math.floor(((jy-979)%33+3)/4)+79; for(let m=1;m<jm;m++) days+=m<=6?31:30; days+=jd-1; let gy=1600+400*Math.floor(days/146097); days%=146097; let leap=true; if(days>=36525){days--;gy+=100*Math.floor(days/36524);days%=36524;if(days>=365)days++;else leap=false;}gy+=4*Math.floor(days/1461);days%=1461;if(days>=366){leap=false;days--;gy+=Math.floor(days/365);days%=365;}const md=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];let gm=0;while(gm<11&&days>=md[gm]){days-=md[gm++];}return `${gy}-${String(gm+1).padStart(2,"0")}-${String(days+1).padStart(2,"0")}`;};
const gregorianToJalali = (value: string) => new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", {year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(`${value}T12:00:00`)).replace(/(\d+)\/(\d+)\/(\d+)/,"$3.$1.$2");
const jalaliToday = () => gregorianToJalali(today());
const jalaliParts = (value: string) => value.split(".").map(Number);
const jalaliMonthTitle = (value: string) => new Intl.DateTimeFormat("fa-IR-u-ca-persian", { month: "long", year: "numeric", numberingSystem: "arabext" }).format(new Date(`${jalaliToGregorian(value)}T12:00:00`));
const jalaliMonthDays = (value: string) => { const [year,month]=jalaliParts(value); return month<=6?31:month<=11?30:((year-979)%33===1||(year-979)%33===5||(year-979)%33===9||(year-979)%33===13||(year-979)%33===17||(year-979)%33===22||(year-979)%33===26||(year-979)%33===30?30:29); };
const jalaliDayOffset = (value: string) => (new Date(`${jalaliToGregorian(value)}T12:00:00`).getDay()+1)%7;
const shiftJalaliMonth = (value: string, delta: number) => { let [year,month]=jalaliParts(value); month+=delta; if(month<1){month=12;year--;} if(month>12){month=1;year++;} return `${year}.${String(month).padStart(2,"0")}.01`; };
const jalaliDateAt = (monthValue: string, day: number) => { const [year,month]=jalaliParts(monthValue); return `${year}.${String(month).padStart(2,"0")}.${String(day).padStart(2,"0")}`; };

export default function App() {
  const [tab, setTab] = useState("wall");
  const [wallStatusFilter, setWallStatusFilter] = useState("all");
  const [eventDrafts, setEventDrafts] = useState<Record<number, string>>({});
  const [reportDrafts, setReportDrafts] = useState<Record<number, string>>({});
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [archiveQuery, setArchiveQuery] = useState("");
  const [archiveOpenId, setArchiveOpenId] = useState<number | null>(null);
  const [viewerId, setViewerId] = useState(localStorage.getItem("vezarati.userId") || "admin");
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [resolutions, setResolutions] = useState<Resolution[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [reports, setReports] = useState<Report | null>(null);
  const [users, setUsers] = useState<{ nationalId: string; displayName: string; title?: string; province?: string | null }[]>([]);
  const [query, setQuery] = useState("");
  const [reportQuery, setReportQuery] = useState("");
  const [reportPage, setReportPage] = useState(1);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [resolutionPage, setResolutionPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingResolutionId, setEditingResolutionId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [form, setForm] = useState({ meetingDate: today(), meetingDateJalali: jalaliToday(), number: "", text: "", notes: "", status: "before", groupId: "", people: [] as string[], publishToAll: false, dueDate: "", dueDateJalali: "" });
  const [groupName, setGroupName] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [memberMatches, setMemberMatches] = useState<DirectoryUser[]>([]);
  const [memberSearching, setMemberSearching] = useState(false);
  const [memberSearchMessage, setMemberSearchMessage] = useState("استاندارد جستجو: حداقل ۲ حرف از نام یا کد ملی را وارد کنید.");
  const memberSearchSequence = useRef(0);
  const [selectedPerson, setSelectedPerson] = useState<DirectoryUser | null>(null);
  const [newPerson, setNewPerson] = useState({ nationalId: "", firstName: "", lastName: "", title: "" });
  const [calendarMonth, setCalendarMonth] = useState(jalaliToday().slice(0,7) + ".01");
  const [selectedDay, setSelectedDay] = useState(jalaliToday());
  const [memberTitle, setMemberTitle] = useState("");

  async function load() {
    setError("");
    try {
      const [dashboardResponse, resolutionsResponse, groupsResponse, reportsResponse, usersResponse, notificationsResponse] = await Promise.all([
        fetch(`/api/dashboard?userId=${encodeURIComponent(localStorage.getItem("vezarati.userId") || "admin")}`), fetch(`/api/resolutions?userId=${encodeURIComponent(localStorage.getItem("vezarati.userId") || "admin")}`), fetch("/api/groups"), fetch("/api/reports"), fetch("/api/users"), fetch(`/api/notifications?userId=${encodeURIComponent(localStorage.getItem("vezarati.userId") || "admin")}`)
      ]);
      for (const response of [dashboardResponse, resolutionsResponse, groupsResponse, reportsResponse, usersResponse, notificationsResponse]) if (!response.ok) throw new Error("گرفتن اطلاعات از API ناموفق بود.");
      setDashboard(await dashboardResponse.json()); setResolutions(await resolutionsResponse.json()); setGroups(await groupsResponse.json()); setReports(await reportsResponse.json()); setUsers(await usersResponse.json()); setNotifications(await notificationsResponse.json());
    } catch (cause) { setError(cause instanceof Error ? cause.message : "خطا در دریافت اطلاعات"); }
  }
  useEffect(() => { void load(); }, [viewerId]);

  async function uploadAttachment(resolutionId: number, file: File) {
    if (file.size > 50 * 1024 * 1024) { setMessage("حداکثر حجم هر فایل ۵۰ مگابایت است."); return; }
    const formData = new FormData(); formData.append("file", file); formData.append("nationalId", viewerId); formData.append("uploaderName", dashboard?.currentUser.displayName ?? viewerId);
    setMessage("");
    try {
      const response = await fetch(`/api/resolutions/${resolutionId}/attachments`, { method: "POST", body: formData });
      const result = response.status === 204 ? null : await response.json();
      if (!response.ok) throw new Error(result?.error || "بارگذاری فایل انجام نشد.");
      setMessage("فایل پیوست شد."); await load();
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "خطا در بارگذاری فایل"); }
  }

  async function addResolutionEvent(resolutionId: number) {
    const text = (eventDrafts[resolutionId] ?? "").trim();
    if (!text) { setMessage("شرح رویداد را وارد کنید."); return; }
    const ok = await request(`/api/resolutions/${resolutionId}/events`, "POST", { text, nationalId: viewerId, userName: dashboard?.currentUser.displayName ?? viewerId });
    if (ok) setEventDrafts(current => ({ ...current, [resolutionId]: "" }));
  }

  async function submitCompletionReport(resolutionId: number) {
    const text = (reportDrafts[resolutionId] ?? "").trim();
    if (!text) { setMessage("شرح اقدام را وارد کنید."); return; }
    const ok = await request(`/api/resolutions/${resolutionId}/completion-report`, "POST", { nationalId: viewerId, userName: dashboard?.currentUser.displayName ?? viewerId, text });
    if (ok) setReportDrafts(current => ({ ...current, [resolutionId]: "" }));
  }
  async function reviewCompletionReport(resolutionId: number, assigneeNationalId: string, approved: boolean) {
    const feedback = window.prompt(approved ? "توضیح تأیید (اختیاری)" : "علت برگشت برای اصلاح") ?? "";
    if (!approved && !feedback.trim()) { setMessage("برای برگشت گزارش، علت اصلاح را بنویسید."); return; }
    await request(`/api/resolutions/${resolutionId}/completion-review`, "PATCH", { nationalId: viewerId, assigneeNationalId, approved, feedback });
  }
  async function toggleArchive(item: Resolution, isArchived: boolean) {
    await request(`/api/resolutions/${item.id}/archive`, "PATCH", { nationalId: viewerId, isArchived });
  }
  async function markNotificationRead(id: number) {
    await request(`/api/notifications/${id}/read`, "PATCH", { nationalId: viewerId });
  }
  function exportPeopleExcel() {
    const escape = (value: unknown) => String(value ?? "").replace(/[&<>"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[char]!));
    const rows = [["نام و نام خانوادگی","سمت","کل مصوبات","اجراشده","در حال پیگیری","دارای تأخیر","درصد اجرا"], ...(reports?.people ?? []).map(person => [person.displayName, person.title ?? "", person.total, person.completed, person.pending, person.delayed, person.total ? Math.round(person.completed * 100 / person.total) + "%" : "0%"])];
    const html = "<html><head><meta charset='utf-8'></head><body><table dir='rtl'><thead><tr>" + rows[0].map(cell => "<th>" + escape(cell) + "</th>").join("") + "</tr></thead><tbody>" + rows.slice(1).map(row => "<tr>" + row.map(cell => "<td>" + escape(cell) + "</td>").join("") + "</tr>").join("") + "</tbody></table></body></html>";
    const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "گزارش-مصوبات.xls"; link.click(); URL.revokeObjectURL(url);
  }
  function printReport() { window.print(); }

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
  function openCreateResolution() {
    setEditingResolutionId(null); setPeopleQuery("");
    setForm({ meetingDate: today(), meetingDateJalali: jalaliToday(), number: "", text: "", notes: "", status: "before", groupId: "", people: [], publishToAll: false, dueDate: "", dueDateJalali: "" });
    setModalOpen(true);
  }
  function openEditResolution(item: Resolution) {
    setEditingResolutionId(item.id); setPeopleQuery("");
    setForm({ meetingDate: item.meetingDate, meetingDateJalali: item.meetingDateJalali || gregorianToJalali(item.meetingDate), number: item.number, text: item.text, notes: item.notes, status: item.status, dueDate: item.dueDate ?? "", dueDateJalali: item.dueDateJalali ?? "", publishToAll: item.publishToAll ?? false, groupId: String(item.groupId ?? item.groupAssignments?.[0]?.groupId ?? ""), people: item.assignments?.map(a => a.nationalId) ?? [] });
    setModalOpen(true);
  }
  async function createResolution() {
    const url = editingResolutionId ? `/api/resolutions/${editingResolutionId}` : "/api/resolutions";
    const ok = await request(url, editingResolutionId ? "PUT" : "POST", { ...form, groupId: form.groupId ? Number(form.groupId) : null, groupIds: form.groupId ? [Number(form.groupId)] : [], people: form.people, publishToAll: form.publishToAll, dueDate: form.dueDate || null, dueDateJalali: form.dueDateJalali });
    if (ok) { setModalOpen(false); setEditingResolutionId(null); setForm({ meetingDate: today(), meetingDateJalali: jalaliToday(), number: "", text: "", notes: "", status: "before", groupId: "", people: [], publishToAll: false, dueDate: "", dueDateJalali: "" }); }
  }
  async function deleteResolution(item: Resolution) {
    const confirmed = window.confirm(`مصوبه «${item.number}» حذف شود؟`);
    if (confirmed) await request(`/api/resolutions/${item.id}`, "DELETE");
  }
  async function createGroup() { if (await request("/api/groups", "POST", { name: groupName })) setGroupName(""); }
  async function addMember() {
    if (!selectedGroup) { setMessage("ابتدا گروه را انتخاب کنید."); return; }
    if (!selectedPerson) { setMessage("ابتدا یک شخص را از فهرست انتخاب کنید."); return; }
    if (await request(`/api/groups/${selectedGroup}/members/lookup`, "POST", { nationalId: selectedPerson.nationalId, title: memberTitle })) { setNationalId(""); setMemberTitle(""); setMemberSearch(""); setSelectedPerson(null); setMemberMatches([]); }
  }
  async function createDirectoryPerson() {
    if (await request("/api/users", "POST", { nationalId: newPerson.nationalId, firstName: newPerson.firstName, lastName: newPerson.lastName, title: newPerson.title })) { setNewPerson({ nationalId: "", firstName: "", lastName: "", title: "" }); await load(); }
  }
  async function searchMembers(value: string) {
    setMemberSearch(value); setSelectedPerson(null); setMemberSearchMessage("");
    const term = value.trim(); const sequence = ++memberSearchSequence.current;
    if (term.length < 2) { setMemberMatches([]); setMemberSearchMessage("برای جستجو حداقل ۲ حرف یا رقم وارد کنید."); return; }
    setMemberSearching(true);
    try {
      const response = await fetch(`/api/users/search?q=${encodeURIComponent(term)}`);
      if (!response.ok) throw new Error("جستجوی افراد از سرور ناموفق بود.");
      const people: DirectoryUser[] = await response.json();
      if (sequence !== memberSearchSequence.current) return;
      setMemberMatches(people);
      setMemberSearchMessage(people.length ? "" : "شخصی با این نام یا کد ملی پیدا نشد.");
    } catch (error) {
      if (sequence === memberSearchSequence.current) { setMemberMatches([]); setMemberSearchMessage(error instanceof Error ? error.message : "خطا در جستجوی افراد"); }
    } finally {
      if (sequence === memberSearchSequence.current) setMemberSearching(false);
    }
  }

  const filtered = useMemo(() => { const term = query.trim().toLocaleLowerCase("fa"); return resolutions.filter(item => !item.isArchived && (!term || `${item.number} ${item.text} ${item.notes} ${item.status}`.toLocaleLowerCase("fa").includes(term))); }, [resolutions, query]);
  const pageSize = 10;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const pageRows = useMemo(() => filtered.slice((resolutionPage - 1) * pageSize, resolutionPage * pageSize), [filtered, resolutionPage]);
  const filteredUsers = useMemo(() => { const term = peopleQuery.trim().toLocaleLowerCase("fa"); return users.filter(user => !term || `${user.displayName} ${user.nationalId}`.toLocaleLowerCase("fa").includes(term)); }, [users, peopleQuery]);
  useEffect(() => { setResolutionPage(1); }, [query]);
  useEffect(() => { if (resolutionPage > pageCount) setResolutionPage(pageCount); }, [resolutionPage, pageCount]);
  const reportPeople = useMemo(() => { const term = reportQuery.trim().toLocaleLowerCase("fa"); return (reports?.people ?? []).filter(person => !term || `${person.displayName} ${person.nationalId}`.toLocaleLowerCase("fa").includes(term)).sort((a,b) => b.total - a.total || a.displayName.localeCompare(b.displayName, "fa")); }, [reports, reportQuery]);
  const reportPageSize = 10;
  const reportPageCount = Math.max(1, Math.ceil(reportPeople.length / reportPageSize));
  const pagedReportPeople = useMemo(() => reportPeople.slice((reportPage - 1) * reportPageSize, reportPage * reportPageSize), [reportPeople, reportPage]);
  useEffect(() => { setReportPage(1); }, [reportQuery]);
  useEffect(() => { if (reportPage > reportPageCount) setReportPage(reportPageCount); }, [reportPage, reportPageCount]);
  const reportMax = Math.max(1, ...pagedReportPeople.map(person => person.total));
  const mine = dashboard?.resolutions ?? [];
  const personalCounts = mine.reduce((counts, item) => { const status = viewerId === "admin" ? item.status : item.progress?.find(progress => progress.nationalId === viewerId)?.status ?? item.status; if(status === "completed") counts.completed++; else if(status === "delayed") counts.delayed++; else counts.pending++; return counts; }, { completed: 0, delayed: 0, pending: 0 });
  const completed = viewerId === "admin" ? reports?.completed ?? 0 : personalCounts.completed;
  const delayed = viewerId === "admin" ? reports?.delayed ?? 0 : personalCounts.delayed;
  const pending = viewerId === "admin" ? reports?.pending ?? 0 : personalCounts.pending;
  const reportDenominator = Math.max(1, completed + delayed + pending);
  const reportShares = { completed: completed * 100 / reportDenominator, delayed: delayed * 100 / reportDenominator, pending: pending * 100 / reportDenominator };
  const completedEnd = reportShares.completed;
  const delayedEnd = completedEnd + reportShares.delayed;
  const reportDonut = `conic-gradient(#4c9a70 0% ${completedEnd}%, #ce7068 ${completedEnd}% ${delayedEnd}%, #d7a33f ${delayedEnd}% 100%)`;
  const reportMonths = Array.from({ length: 6 }, (_, index) => {
    const month = new Date(); month.setDate(1); month.setHours(12, 0, 0, 0); month.setMonth(month.getMonth() - 5 + index);
    const key = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`;
    const monthItems = activeResolutions.filter(item => item.meetingDate?.slice(0, 7) === key);
    return { key, title: new Intl.DateTimeFormat("fa-IR", { month: "short" }).format(month), total: monthItems.length, completed: monthItems.filter(item => item.status === "completed").length, delayed: monthItems.filter(item => item.status === "delayed").length, pending: monthItems.filter(item => item.status === "before" || item.status === "in_progress").length };
  });
  const monthMax = Math.max(1, ...reportMonths.map(month => month.total));
  const groupReport = groups.map(group => {
    const items = activeResolutions.filter(item => item.groupId === group.id || item.groupAssignments?.some(assignment => assignment.groupId === group.id));
    const states = items.flatMap(item => {
      const people = group.members.filter(member => item.groupId === group.id || item.groupAssignments?.some(assignment => assignment.groupId === group.id));
      return people.length ? people.map(person => item.progress?.find(progress => progress.nationalId === person.nationalId)?.status ?? item.status) : [item.status];
    });
    const groupTotal = states.length;
    const groupCompleted = states.filter(status => status === "completed").length;
    const groupDelayed = states.filter(status => status === "delayed").length;
    const groupPending = states.filter(status => status === "before" || status === "in_progress").length;
    return { id: group.id, name: group.name, resolutions: items.length, total: groupTotal, completed: groupCompleted, delayed: groupDelayed, pending: groupPending, percent: groupTotal ? Math.round(groupCompleted * 100 / groupTotal) : 0 };
  }).sort((left, right) => right.percent - left.percent || right.resolutions - left.resolutions);
  const wallItems = wallStatusFilter === "all" ? [] : mine.filter(item => { const status = viewerId === "admin" ? item.status : item.progress?.find(progress => progress.nationalId === viewerId)?.status ?? item.status; return wallStatusFilter === "pending" ? status === "before" || status === "in_progress" : status === wallStatusFilter; });
  const unreadNotifications = notifications.filter(item => !item.isRead).length;
  const activeResolutions = resolutions.filter(item => !item.isArchived);
  const archivedResolutions = resolutions.filter(item => item.isArchived && (!archiveQuery.trim() || `${item.number} ${item.text} ${item.notes}`.toLocaleLowerCase("fa").includes(archiveQuery.trim().toLocaleLowerCase("fa"))));
  const awaitingReview = activeResolutions.flatMap(item => (item.progress ?? []).filter(progress => progress.approvalStatus === "pending" && progress.reportText).map(progress => ({ item, progress })));


  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-icon"><ShieldCheck /></span><div><b>دفتر وزارتی</b><small>سامانه پیگیری مصوبات</small></div></div>
      <div className="profile"><div className="avatar">{dashboard?.currentUser.displayName?.[0] || "م"}</div><div><b>{dashboard?.currentUser.displayName || "مدیر دفتر وزارتی"}</b><small>دسترسی: {dashboard?.currentUser.role || "ادمین"}</small><select aria-label="کاربر آزمایشی" value={viewerId} onChange={event => { localStorage.setItem("vezarati.userId", event.target.value); setViewerId(event.target.value); }}><option value="admin">مدیر</option>{users.map(user => <option key={user.nationalId} value={user.nationalId}>{user.displayName}{user.title ? ` — ${user.title}` : ""}{user.province ? ` (${user.province})` : ""}</option>)}</select></div></div>
      <nav>{[["wall", LayoutDashboard, "دیواره من"], ["notifications", Bell, `اعلان‌ها ${notifications.filter(item=>!item.isRead).length ? "(" + notifications.filter(item=>!item.isRead).length + ")" : ""}`], ["resolutions", ClipboardList, "مصوبات"], ...(viewerId === "admin" ? [["archive", Archive, "بایگانی"], ["groups", Users, "گروه‌ها و اعضا"], ["reports", FileText, "گزارش‌ها"]] : [])].map(([key, Icon, title]: any) => <button key={key} className={`nav ${tab === key ? "active" : ""}`} onClick={() => setTab(key)}><Icon size={18} />{title}</button>)}</nav>
      <div className="sidebar-foot">محیط پیگیری اجرایی<br /><span>دفتر وزارتی</span></div>
    </aside>

    <main className="main">
      <header className="top"><div><div className="eyebrow">سامانه یکپارچه پیگیری</div><h1>{tab === "wall" ? "دیواره پیگیری من" : tab === "resolutions" ? "مصوبات و جلسات" : tab === "groups" ? "مدیریت گروه‌ها و اعضا" : tab === "archive" ? "بایگانی مصوبات" : tab === "notifications" ? "اعلان‌های من" : "گزارش‌های اجرایی"}</h1><p>مصوبات، مسئولیت‌ها و روند اجرای اقدامات</p></div><div className="top-actions"><span className="today"><CalendarDays size={16} />{formatDate(today(), gregorianToJalali(today()).replace(/\./g, "/"))}</span>{viewerId === "admin" && tab !== "groups" && tab !== "archive" && tab !== "notifications" && tab !== "reports" && <button className="primary" onClick={openCreateResolution}><Plus size={17} />ثبت مصوبه</button>}</div></header>
      {error && <div className="notice">{error}<button onClick={() => void load()}>تلاش دوباره</button></div>}{message && <div className="notice">{message}</div>}
      <section className="metrics"><Metric icon={<ClipboardList />} label="کل مصوبات" value={viewerId === "admin" ? reports?.total ?? resolutions.length : mine.length} color="blue" active={wallStatusFilter === "all" && tab === "wall"} onClick={() => { setTab("wall"); setWallStatusFilter("all"); }} /><Metric icon={<CheckCheck />} label="اجراشده" value={completed} color="green" active={tab === "wall" && wallStatusFilter === "completed"} onClick={() => { setTab("wall"); setWallStatusFilter("completed"); }} /><Metric icon={<CircleAlert />} label="نیازمند پیگیری" value={pending} color="amber" active={tab === "wall" && wallStatusFilter === "pending"} onClick={() => { setTab("wall"); setWallStatusFilter("pending"); }} /><Metric icon={<CalendarDays />} label="دارای تأخیر" value={delayed} color="red" active={tab === "wall" && wallStatusFilter === "delayed"} onClick={() => { setTab("wall"); setWallStatusFilter("delayed"); }} /></section>

      {tab === "wall" && (wallStatusFilter === "all" ? <><div className="section-head"><div><h2>تقویم پیگیری من</h2><p>برای دیدن مصوبه‌ها و کارهای ارجاع‌شده، یک روز را انتخاب کنید.</p></div><span className="counter">{mine.length} وظیفه</span></div><section className="calendar-panel"><div className="calendar-heading"><button className="secondary" onClick={() => { const month=shiftJalaliMonth(calendarMonth,-1); setCalendarMonth(month); setSelectedDay(month); }}>ماه قبل</button><h3>{jalaliMonthTitle(calendarMonth)}</h3><button className="secondary" onClick={() => { const month=shiftJalaliMonth(calendarMonth,1); setCalendarMonth(month); setSelectedDay(month); }}>ماه بعد</button></div><div className="calendar-grid">{["شنبه","یکشنبه","دوشنبه","سه‌شنبه","چهارشنبه","پنجشنبه","جمعه"].map(day=><b className="calendar-weekday" key={day}>{day}</b>)}{Array.from({length:jalaliDayOffset(calendarMonth)},(_,index)=><span className="calendar-blank" key={`blank-${index}`} />)}{Array.from({length:jalaliMonthDays(calendarMonth)},(_,index)=>{const day=index+1;const date=jalaliDateAt(calendarMonth,day);const tasks=mine.filter(item=>item.meetingDateJalali?.replace(/\./g,".")===date);return <button key={date} className={`calendar-day ${selectedDay===date?"active":""} ${tasks.length?"has-tasks":""}`} onClick={()=>setSelectedDay(date)}><span>{new Intl.NumberFormat("fa-IR").format(day)}</span>{tasks.length>0&&<small>{tasks.length} کار</small>}</button>;})}</div></section><div className="section-head day-head"><div><h2>کارهای {selectedDay.replace(/\./g,"/")}</h2><p>مصوبات و وظایف ثبت‌شده برای این روز</p></div><span className="counter">{mine.filter(item=>item.meetingDateJalali?.replace(/\./g,".")===selectedDay).length} مورد</span></div><div className="cards">{mine.filter(item=>item.meetingDateJalali?.replace(/\./g,".")===selectedDay).map(item=><ResolutionCard key={item.id} item={item} groups={groups} viewerId={viewerId} onStatus={status=>void request(`/api/resolutions/${item.id}/status`,"PATCH",{status,nationalId:viewerId})} onUpload={file=>uploadAttachment(item.id,file)} eventDraft={eventDrafts[item.id] ?? ""} onEventChange={text=>setEventDrafts(current=>({...current,[item.id]:text}))} onEventSubmit={()=>void addResolutionEvent(item.id)} onReportDraftChange={text=>setReportDrafts(current=>({...current,[item.id]:text}))} reportDraft={reportDrafts[item.id] ?? ""} onReportSubmit={()=>void submitCompletionReport(item.id)} onApproveAttachment={(attachmentId,approved)=>void request(`/api/attachments/${attachmentId}/approval`,"PATCH",{nationalId:viewerId,approvedForAll:approved})}/>)}</div>{!mine.some(item=>item.meetingDateJalali?.replace(/\./g,".")===selectedDay)&&<Empty />}</> : <><div className="section-head"><div><h2>{wallStatusFilter === "completed" ? "مصوبات اجراشده" : wallStatusFilter === "delayed" ? "مصوبات دارای تأخیر" : "مصوبات نیازمند پیگیری"}</h2><p>موارد بر اساس وضعیت پیگیری شما فیلتر شده‌اند.</p></div><button className="secondary" onClick={() => setWallStatusFilter("all")}>بازگشت به تقویم</button></div><div className="cards">{wallItems.map(item=><ResolutionCard key={item.id} item={item} groups={groups} viewerId={viewerId} onStatus={status=>void request(`/api/resolutions/${item.id}/status`,"PATCH",{status,nationalId:viewerId})} onUpload={file=>uploadAttachment(item.id,file)} eventDraft={eventDrafts[item.id] ?? ""} onEventChange={text=>setEventDrafts(current=>({...current,[item.id]:text}))} onEventSubmit={()=>void addResolutionEvent(item.id)} onReportDraftChange={text=>setReportDrafts(current=>({...current,[item.id]:text}))} reportDraft={reportDrafts[item.id] ?? ""} onReportSubmit={()=>void submitCompletionReport(item.id)} onApproveAttachment={(attachmentId,approved)=>void request(`/api/attachments/${attachmentId}/approval`,"PATCH",{nationalId:viewerId,approvedForAll:approved})} />)}</div>{!wallItems.length && <Empty />}</>)}{tab === "resolutions" && viewerId === "admin" && <><div className="toolbar"><div className="search"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="جستجو در شماره، متن، توضیحات یا وضعیت" /></div><span>{filtered.length} مصوبه</span></div><div className="table-wrap"><table><thead><tr><th>تاریخ جلسه</th><th>شماره</th><th>متن مصوبه</th><th>ارجاع</th><th>مهلت اجرا</th><th>وضعیت اجرا</th><th>عملیات</th></tr></thead><tbody>{pageRows.map(item => <tr key={item.id}><td>{formatDate(item.meetingDate, item.meetingDateJalali?.replace(/\./g, "/"))}</td><td><b>{item.number}</b></td><td>{item.text}<small>{item.notes}</small></td><td>{item.groupAssignments?.map(a => a.group?.name || groups.find(g => g.id === a.groupId)?.name).filter(Boolean).join("، ") || groups.find(group => group.id === item.groupId)?.name || "ارجاع مستقیم"}</td><td>{item.dueDate ? formatDate(item.dueDate,item.dueDateJalali?.replace(/\./g,"/")) : "—"}</td><td><div className={`status-cell ${item.status}`}><span className={`status ${item.status}`}>{labels[item.status] || item.status}</span><select className={`status-select ${item.status}`} aria-label="تغییر وضعیت اجرا" value={item.status} onChange={event => void request(`/api/resolutions/${item.id}/status`, "PATCH", { status: event.target.value, nationalId: viewerId })}>{statusEntries.map(([key, title]) => <option key={key} value={key} disabled={viewerId !== "admin" && key === "completed"}>{title}</option>)}</select></div></td><td><div className="resolution-actions"><button className="action-edit" onClick={() => openEditResolution(item)}>ویرایش</button><button className="action-delete" onClick={() => void toggleArchive(item,true)}>بایگانی</button></div></td></tr>)}</tbody></table></div></>}

      {tab === "archive" && viewerId === "admin" && <div className="panel archive-panel"><div className="section-head"><div><h2>مصوبات بایگانی‌شده</h2><p>موارد بسته‌شده را می‌توان از بایگانی بازگرداند.</p></div><span className="counter">{archivedResolutions.length} مصوبه</span></div><div className="search archive-search"><Search size={17}/><input value={archiveQuery} onChange={event=>setArchiveQuery(event.target.value)} placeholder="جستجو در شماره، متن یا توضیحات مصوبه‌های قدیمی"/></div>{archivedResolutions.length ? <div className="table-wrap"><table><thead><tr><th>تاریخ جلسه</th><th>شماره</th><th>متن مصوبه</th><th>تاریخ بایگانی/آخرین تغییر</th><th>عملیات</th></tr></thead><tbody>{archivedResolutions.map(item=><Fragment key={item.id}><tr><td>{formatDate(item.meetingDate,item.meetingDateJalali?.replace(/\./g,"/"))}</td><td>{item.number}</td><td>{item.text}</td><td>{item.updatedAt ? formatDate(item.updatedAt.slice(0,10)) : "—"}</td><td><button className="secondary" onClick={()=>setArchiveOpenId(current=>current===item.id?null:item.id)}>{archiveOpenId===item.id?"بستن سوابق":"سوابق و پیوست‌ها"}</button> <button className="secondary" onClick={()=>void toggleArchive(item,false)}>بازگردانی</button></td></tr>{archiveOpenId===item.id && <tr className="archive-detail-row"><td colSpan={5}><p>{item.text}</p>{item.notes&&<div className="note">توضیحات: {item.notes}</div>}<div className="event-list">{(item.events??[]).slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(entry=><div className="event-row" key={entry.id}><span><b>{entry.userName}</b><small>{formatDate(entry.createdAt.slice(0,10))}</small></span><p>{entry.text}</p></div>)}</div><div className="archive-files">{(item.attachments??[]).map(file=><a key={file.id} href={`/api/attachments/${file.id}?nationalId=${encodeURIComponent(viewerId)}`}><FileText size={14}/>{file.originalName} · فرستنده: {file.uploaderName||file.uploadedBy}</a>)}</div></td></tr>}</Fragment>)}</tbody></table></div> : <Empty />}</div>}
      {tab === "groups" && viewerId === "admin" && <div className="group-layout"><section className="panel"><h2>ساخت گروه</h2><p>گروه‌های سازمانی برای ارجاع مصوبه</p><div className="inline"><input value={groupName} onChange={event => setGroupName(event.target.value)} placeholder="نام گروه جدید" /><button className="primary" disabled={busy || !groupName.trim()} onClick={() => void createGroup()}>ایجاد</button></div><div className="group-list">{groups.map(group => <div className="group-row" key={group.id}><div className="group-avatar"><Users /></div><div><b>{group.name}</b><small>{group.members.length} عضو</small></div><span>{group.members.length}</span></div>)}</div></section><section className="panel"><h2>افزودن عضو با کد ملی یا نام</h2><p>با کد ملی یا نام و نام خانوادگی جستجو کنید، سپس سمت را وارد کنید.</p><label>گروه<select value={selectedGroup} onChange={event => setSelectedGroup(event.target.value)}><option value="">انتخاب گروه</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><label>جستجوی شخص<input value={memberSearch} onChange={event => void searchMembers(event.target.value)} placeholder="کد ملی یا نام و نام خانوادگی" /></label>{memberSearching && <div className="selected-person">در حال جستجو…</div>}{memberSearchMessage && <div className="member-search-message">{memberSearchMessage}</div>}{memberMatches.length > 0 && <div className="member-search-results">{memberMatches.map(person => <button type="button" key={person.nationalId} className={selectedPerson?.nationalId === person.nationalId ? "selected" : ""} onClick={() => { setSelectedPerson(person); setMemberSearch(person.displayName); setNationalId(person.nationalId); setMemberMatches([]); }}><span>{person.displayName}</span>{viewerId === "admin" && /[0-9۰-۹٠-٩]/.test(memberSearch) && <small>{person.nationalId}</small>}</button>)}</div>}{selectedPerson && <div className="selected-person">انتخاب‌شده: <b>{selectedPerson.displayName}</b></div>}<label>سمت در گروه<input value={memberTitle} onChange={event => setMemberTitle(event.target.value)} placeholder="مثلاً معاون وزیر" /></label><button className="primary wide" disabled={busy || !selectedGroup || !selectedPerson} onClick={() => void addMember()}>افزودن عضو به گروه</button><div className="members">{(groups.find(group => String(group.id) === selectedGroup)?.members ?? []).map(member => <div className="member" key={member.id}><span className="avatar small">{member.displayName[0]}</span><div><b>{member.displayName}</b><small>{member.title || "سمت ثبت نشده"}</small></div><button className="icon-btn" title="حذف عضو" onClick={() => void request(`/api/groups/${selectedGroup}/members/${member.nationalId}`, "DELETE")}><X size={17} /></button></div>)}</div></section><section className="panel add-directory-person"><h2>افزودن فرد به فهرست اشخاص</h2><p>این فرد در جست‌وجوی اعضا و ارجاع مستقیم قابل انتخاب خواهد بود.</p><label>کد ملی<input value={newPerson.nationalId} onChange={event => setNewPerson({ ...newPerson, nationalId: event.target.value })} inputMode="numeric" maxLength={11} /></label><div className="person-name-fields"><label>نام<input value={newPerson.firstName} onChange={event => setNewPerson({ ...newPerson, firstName: event.target.value })} /></label><label>نام خانوادگی<input value={newPerson.lastName} onChange={event => setNewPerson({ ...newPerson, lastName: event.target.value })} /></label></div><label>سمت<input value={newPerson.title} onChange={event => setNewPerson({ ...newPerson, title: event.target.value })} placeholder="سمت سازمانی" /></label><button className="primary wide" disabled={busy || newPerson.nationalId.trim().length < 8 || !newPerson.firstName.trim() || !newPerson.lastName.trim()} onClick={() => void createDirectoryPerson()}>ثبت فرد در فهرست</button></section></div>}

      {tab === "reports" && viewerId === "admin" && <><div className="section-head report-actions-head"><div><h2>گزارش مدیریتی</h2><p>عملکرد مصوبات، گزارش اقدامات و روند اجرا</p></div><div className="report-export-actions"><button className="secondary" onClick={exportPeopleExcel}>دریافت Excel</button><button className="secondary" onClick={printReport}>چاپ / ذخیره PDF</button></div></div><div className="report-kpis"><div><span>کل مصوبات</span><b>{reports?.total ?? 0}</b></div><div><span>نرخ اجرا</span><b>{reports?.total ? Math.round(completed * 100 / reports.total) : 0}٪</b></div><div><span>موارد دارای تأخیر</span><b className="red-text">{delayed}</b></div><div><span>مهلت گذشته</span><b className="red-text">{activeResolutions.filter(item=>item.dueDate&&item.dueDate<today()&&item.status!=="completed").length}</b></div></div>{awaitingReview.length > 0 && <div className="panel review-queue"><div className="section-head"><div><h2>گزارش‌های اقدام در انتظار تأیید</h2><p>پس از تأیید، وضعیت پیگیری فرد اجراشده می‌شود.</p></div><span className="counter">{awaitingReview.length} گزارش</span></div><div className="review-list">{awaitingReview.map(({item,progress})=>{const person=users.find(user=>user.nationalId===progress.nationalId);return <article className="review-item" key={item.id + "-" + progress.nationalId}><div className="review-item-head"><b>مصوبه {item.number} · {person?.displayName ?? "کاربر"}</b><small>{person?.title || "سمت ثبت نشده"} · {formatDate(progress.updatedAt.slice(0,10))}</small></div><p>{progress.reportText}</p><div className="review-actions"><button className="primary" onClick={()=>void reviewCompletionReport(item.id,progress.nationalId,true)}>تأیید اجرا</button><button className="secondary" onClick={()=>void reviewCompletionReport(item.id,progress.nationalId,false)}>بازگشت برای اصلاح</button></div></article>;})}</div></div>}<div className="manager-report-grid">
        <section className="panel executive-panel"><div className="report-panel-heading"><div><span className="report-kicker">نمای کلی</span><h2>وضعیت اجرای مصوبات</h2><p>جمع‌بندی وضعیت ثبت‌شده برای مدیر</p></div><span className="report-period">به‌روزرسانی لحظه‌ای</span></div><div className="status-overview"><div className="report-donut" style={{background:reportDonut}}><div><b>{reports?.total ?? 0}</b><small>مصوبه</small></div></div><div className="status-breakdown"><div><i className="legend-completed"/><span>اجرا شده</span><b>{completed}</b></div><div><i className="legend-pending"/><span>در حال پیگیری</span><b>{pending}</b></div><div><i className="legend-delayed"/><span>دارای تأخیر</span><b>{delayed}</b></div></div></div></section>
        <section className="panel trend-panel"><div className="report-panel-heading"><div><span className="report-kicker">روند زمانی</span><h2>مصوبات بر اساس ماه جلسه</h2><p>شش ماه اخیر، تفکیک‌شده با وضعیت فعلی</p></div></div><div className="monthly-chart">{reportMonths.map(month=><div className="month-column" key={month.key}><div className="month-total">{month.total || ""}</div><div className="month-bars" title={`${month.total} مصوبه`}><i className="completed-segment" style={{height:`${month.completed*100/monthMax}%`}}/><i className="delayed-segment" style={{height:`${month.delayed*100/monthMax}%`}}/><i className="pending-segment" style={{height:`${month.pending*100/monthMax}%`}}/></div><small>{month.title}</small></div>)}</div><div className="mini-legend"><span><i className="legend-completed"/>اجراشده</span><span><i className="legend-pending"/>در جریان</span><span><i className="legend-delayed"/>دارای تأخیر</span></div></section>
        <section className="panel group-report-panel"><div className="report-panel-heading"><div><span className="report-kicker">مقایسه عملکرد</span><h2>پیشرفت گروه‌ها</h2><p>درصد موارد اجراشده در هر گروه ارجاع</p></div></div>{groupReport.length ? <div className="group-report-list">{groupReport.map(group=><div className="group-report-row" key={group.id}><div className="group-report-label"><b>{group.name}</b><small>{group.resolutions} مصوبه · {group.delayed} مورد دارای تأخیر</small></div><div className="group-report-track"><i style={{width:`${group.percent}%`}}/></div><strong>{group.percent}٪</strong></div>)}</div> : <div className="report-empty">گروهی برای مقایسه وجود ندارد.</div>}</section>
      </div><div className="panel event-report"><div className="individual-report-head"><div><h2>گزارش رویدادهای تسک‌ها</h2><p>رویدادهای ثبت‌شده توسط کاربران برای مصوبه‌ها و پیگیری‌ها</p></div></div>{resolutions.flatMap(item=>(item.events ?? []).map(entry=>({ ...entry, resolutionNumber:item.number, resolutionText:item.text }))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).length ? <div className="table-wrap report-table"><table><thead><tr><th>زمان</th><th>مصوبه</th><th>ثبت‌کننده</th><th>رویداد</th></tr></thead><tbody>{resolutions.flatMap(item=>(item.events ?? []).map(entry=>({ ...entry, resolutionNumber:item.number, resolutionText:item.text }))).sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(entry=><tr key={entry.id}><td>{formatDate(entry.createdAt.slice(0,10))}</td><td><b>{entry.resolutionNumber}</b><small>{entry.resolutionText}</small></td><td>{entry.userName}</td><td>{entry.text}</td></tr>)}</tbody></table></div> : <div className="report-empty">رویدادی برای نمایش ثبت نشده است.</div>}</div><div className="panel individual-report"><div className="individual-report-head"><div><h2>گزارش به تفکیک فرد</h2><p>مقایسه تعداد مصوبه‌های هر شخص بر اساس وضعیت اجرا</p></div><div className="search report-search"><Search size={17} /><input value={reportQuery} onChange={event => setReportQuery(event.target.value)} placeholder="جستجوی نام یا کد ملی" /></div></div><div className="chart-legend"><span><i className="legend-completed" />اجراشده</span><span><i className="legend-pending" />باز</span><span><i className="legend-delayed" />دارای تأخیر</span></div><div className="people-chart">{pagedReportPeople.map(person => { const completedWidth = person.total ? person.completed * 100 / reportMax : 0; const delayedWidth = person.total ? person.delayed * 100 / reportMax : 0; const pendingWidth = person.total ? Math.max(0, person.total - person.completed - person.delayed) * 100 / reportMax : 0; return <div className="chart-row" key={person.nationalId}><div className="chart-person"><b>{person.displayName}</b><small>{person.title || "سمت ثبت نشده"}</small></div><div className="chart-bar-track" title={`${person.total} مصوبه`}><span className="chart-segment completed-segment" style={{width: `${completedWidth}%`}}/><span className="chart-segment delayed-segment" style={{width: `${delayedWidth}%`}}/><span className="chart-segment pending-segment" style={{width: `${pendingWidth}%`}}/></div><b className="chart-total">{person.total}</b></div>;})}{reportPeople.length === 0 && <div className="report-empty">فردی با این نام یا کد ملی پیدا نشد.</div>}</div><div className="table-wrap report-table"><table><thead><tr><th>فرد</th><th>سمت</th><th>کل</th><th>اجراشده</th><th>باز</th><th>دارای تأخیر</th><th>درصد اجرا</th></tr></thead><tbody>{pagedReportPeople.map(person => <tr key={person.nationalId}><td>{person.displayName}</td><td>{person.title || "—"}</td><td>{person.total}</td><td>{person.completed}</td><td>{person.pending}</td><td>{person.delayed}</td><td>{person.total ? Math.round(person.completed * 100 / person.total) : 0}٪</td></tr>)}</tbody></table></div><div className="pagination"><span>{reportPeople.length ? `نمایش ${(reportPage - 1) * reportPageSize + 1} تا ${Math.min(reportPage * reportPageSize, reportPeople.length)} از ${reportPeople.length} نفر` : "فردی یافت نشد"}</span><div><button disabled={reportPage <= 1} onClick={() => setReportPage(page => Math.max(1, page - 1))}>قبلی</button><span>صفحه {reportPage} از {reportPageCount}</span><button disabled={reportPage >= reportPageCount} onClick={() => setReportPage(page => Math.min(reportPageCount, page + 1))}>بعدی</button></div></div></div></>}
    </main>

    {modalOpen && <div className="modal-backdrop" onClick={() => setModalOpen(false)}><section className="modal" onClick={event => event.stopPropagation()}><div className="modal-head"><div><h2>{editingResolutionId ? "ویرایش مصوبه" : "ثبت مصوبه جلسه"}</h2><p>مشخصات جلسه، متن مصوبه و گیرندگان پیگیری را وارد کنید.</p></div><button className="icon-btn" onClick={() => setModalOpen(false)}><X /></button></div><div className="form-grid"><label>تاریخ جلسه<DatePicker calendar={persian} locale={persian_fa} format="YYYY/MM/DD" value={form.meetingDateJalali.replace(/\./g, "/")} onChange={date => { if(date) { const jalali = date.format("YYYY.MM.DD"); setForm({ ...form, meetingDate: jalaliToGregorian(jalali), meetingDateJalali: jalali }); } }} /></label><label>مهلت اجرا<DatePicker calendar={persian} locale={persian_fa} format="YYYY/MM/DD" value={form.dueDateJalali.replace(/\./g, "/")} onChange={date => { if(date) { const jalali=date.format("YYYY.MM.DD"); setForm({ ...form, dueDate: jalaliToGregorian(jalali), dueDateJalali: jalali }); } else setForm({ ...form, dueDate: "", dueDateJalali: "" }); }} /></label><label>شماره مصوبه<input value={form.number} onChange={event => setForm({ ...form, number: event.target.value })} placeholder="مثلاً ۱۴۰۵/۱۲" /></label><label className="span2">متن مصوبه<textarea rows={4} value={form.text} onChange={event => setForm({ ...form, text: event.target.value })} /></label><label>وضعیت اجرا<select value={form.status} onChange={event => setForm({ ...form, status: event.target.value })}>{statusEntries.map(([key, title]) => <option key={key} value={key} disabled={viewerId !== "admin" && key === "completed"}>{title}</option>)}</select></label><label>ارجاع به گروه<select value={form.groupId} onChange={event => setForm({ ...form, groupId: event.target.value })}><option value="">بدون گروه</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}</select></label><div className="direct-people-field"><label htmlFor="direct-people-search">ارجاع مستقیم به اشخاص</label><div className="search"><Search size={16} /><input id="direct-people-search" value={peopleQuery} onChange={event => setPeopleQuery(event.target.value)} placeholder="جستجو با نام یا کد ملی" /></div><div className="people-results">{filteredUsers.map(user => <label className="person-option" key={user.nationalId}><input type="checkbox" checked={form.people.includes(user.nationalId)} onChange={event => setForm({ ...form, people: event.target.checked ? [...form.people, user.nationalId] : form.people.filter(id => id !== user.nationalId) })} /><span>{user.displayName}<small className="person-title">{user.title || "سمت ثبت نشده"}</small></span>{viewerId === "admin" && /[0-9۰-۹٠-٩]/.test(peopleQuery) && <small>{user.nationalId}</small>}</label>)}{filteredUsers.length === 0 && <div className="people-empty">شخصی با این مشخصات پیدا نشد.</div>}</div><small className="selection-count">{form.people.length} نفر انتخاب شده</small></div><label className="publish-toggle span2"><input type="checkbox" checked={form.publishToAll} onChange={event => setForm({ ...form, publishToAll: event.target.checked })} /><span><b>انتشار برای همه کاربران</b><small>مصوبه و پیوست‌های آن برای همه در دیواره نمایش داده می‌شود.</small></span></label><label className="span2">توضیحات<textarea rows={2} value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></label></div><div className="modal-actions"><button className="secondary" onClick={() => setModalOpen(false)}>انصراف</button><button className="primary" disabled={busy || !form.number.trim() || !form.text.trim()} onClick={() => void createResolution()}>{busy ? "در حال ذخیره…" : editingResolutionId ? "ذخیره تغییرات" : "ثبت و ارجاع مصوبه"}</button></div></section></div>}
  </div>;
}

function Metric({ icon, label, value, color, active, onClick }: { icon: React.ReactNode; label: string; value: number; color: string; active: boolean; onClick: () => void }) { return <button type="button" className={`metric ${active ? "active" : ""}`} onClick={onClick}><div className={`metric-icon ${color}`}>{icon}</div><div><span>{label}</span><b>{value}</b></div></button>; }
function ResolutionCard({ item, groups, viewerId, onStatus, onUpload, eventDraft, onEventChange, onEventSubmit, onApproveAttachment, reportDraft, onReportDraftChange, onReportSubmit }: { item: Resolution; groups: Group[]; viewerId: string; onStatus: (status: string) => void; onUpload: (file: File) => Promise<void>; eventDraft: string; onEventChange: (text: string) => void; onEventSubmit: () => void; onApproveAttachment: (attachmentId: number, approved: boolean) => void; reportDraft: string; onReportDraftChange: (text: string) => void; onReportSubmit: () => void }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const visibleAttachments = (item.attachments ?? []).filter(attachment => viewerId === "admin" || attachment.approvedForAll);
  const groupIds = new Set([...(item.groupId ? [item.groupId] : []), ...(item.groupAssignments ?? []).map(a => a.groupId)]);
  const memberMap = new Map<string, Member>();
  groups.filter(group => groupIds.has(group.id)).flatMap(group => group.members).forEach(member => memberMap.set(member.nationalId, member));
  const members = Array.from(memberMap.values());
  const personalProgress = item.progress?.find(progress => progress.nationalId === viewerId);
  const personalStatus = viewerId === "admin" ? item.status : personalProgress?.status ?? item.status;
  const statusFor = (nationalId: string) => item.progress?.find(progress => progress.nationalId === nationalId)?.status ?? item.status;
  const completedCount = members.filter(member => statusFor(member.nationalId) === "completed").length;
  const completionPercent = members.length ? Math.round(completedCount * 100 / members.length) : 0;
  const statusCounts = ["completed", "in_progress", "before", "delayed"].map(status => ({ status, count: members.filter(member => statusFor(member.nationalId) === status).length }));
  return <article className="resolution-card">
    <div className="card-top"><span className="resolution-no">مصوبه {item.number}</span><span className={`status ${personalStatus}`}>{labels[personalStatus] || personalStatus}</span></div>
    <div className="card-meta"><span><CalendarDays size={14} />{formatDate(item.meetingDate, item.meetingDateJalali?.replace(/\\./g, "/"))}</span><span><Users size={14} />{item.groupAssignments?.map(a => a.group?.name || groups.find(g => g.id === a.groupId)?.name).filter(Boolean).join("، ") || groups.find(group => group.id === item.groupId)?.name || "ارجاع مستقیم"}</span></div>
    <p>{item.text}</p>{item.notes && <div className="note">توضیحات: {item.notes}</div>}{item.dueDate && <div className={`deadline-chip ${item.dueDate < today() && personalStatus !== "completed" ? "overdue" : ""}`}><CalendarDays size={14}/><span>مهلت اجرا: {formatDate(item.dueDate, item.dueDateJalali?.replace(/\./g,"/"))}</span>{item.dueDate < today() && item.status !== "completed" && <b>گذشته</b>}</div>}
    {viewerId !== "admin" && <div className="completion-report"><div className="report-status-line"><b>گزارش اقدام و درخواست تأیید</b>{personalProgress?.approvalStatus && personalProgress.approvalStatus !== "none" && <span className={`report-approval ${personalProgress.approvalStatus}`}>{personalProgress.approvalStatus === "pending" ? "در انتظار بررسی" : personalProgress.approvalStatus === "approved" ? "تأیید شده" : "نیازمند اصلاح"}</span>}</div>{personalProgress?.reportText && <div className="submitted-report"><p>{personalProgress.reportText}</p>{personalProgress.adminFeedback && <small>نظر ادمین: {personalProgress.adminFeedback}</small>}</div>}<textarea rows={2} value={reportDraft} onChange={event=>onReportDraftChange(event.target.value)} placeholder="اقدام انجام‌شده و نتیجه را شرح دهید…" /><button type="button" className="secondary" onClick={onReportSubmit}>ارسال برای تأیید ادمین</button></div>}
    {members.length > 0 && <div className="group-progress">
      <button className="progress-summary" type="button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(open => !open)}>
        <span className="progress-summary-top"><b>پیشرفت اعضای گروه</b><strong>{completionPercent}٪ اجرا شده</strong></span>
        <span className="progress-track">{statusCounts.map(({status,count}) => count > 0 && <i key={status} className={`progress-segment ${status}`} style={{width:`${count*100/members.length}%`}} title={`${labels[status]}: ${count}`} />)}</span>
        <span className="progress-summary-bottom">{statusCounts.filter(item=>item.count>0).map(item=><small key={item.status}>{labels[item.status]}: {item.count}</small>)}</span>
      </button>
      {detailsOpen && <div className="member-progress-details">{members.map(member => { const status=statusFor(member.nationalId); const update=item.progress?.find(progress=>progress.nationalId===member.nationalId); return <div className="member-progress-row" key={member.nationalId}><div><b>{member.displayName}</b><small>{member.title || "سمت ثبت نشده"}</small></div><div><span className={`status ${status}`}>{labels[status] || status}</span>{viewerId === "admin" && update?.approvalStatus === "pending" && <small className="review-pending-tag">گزارش در انتظار تأیید</small>}{update?.updatedAt && <small className="progress-updated">به‌روزرسانی: {formatDate(update.updatedAt.slice(0,10))}</small>}</div></div>;})}</div>}
    </div>}
    {visibleAttachments.length > 0 && <div className="attachment-list"><b>فایل‌های پیوست</b>{visibleAttachments.map(attachment=><div className="attachment-item" key={attachment.id}><FileText size={15} /><a className="attachment-download" href={`/api/attachments/${attachment.id}?nationalId=${encodeURIComponent(viewerId)}`} download={attachment.originalName}><span>{attachment.originalName}<small>{formatFileSize(attachment.size)} · فرستنده: {attachment.uploaderName || "کاربر"}</small></span></a>{viewerId === "admin" && <button type="button" className={`attachment-approval ${attachment.approvedForAll ? "approved" : ""}`} onClick={event=>{event.preventDefault();event.stopPropagation();onApproveAttachment(attachment.id,!attachment.approvedForAll);}}>{attachment.approvedForAll ? "نمایش برای همه فعال است · لغو" : "تأیید و نمایش برای همه"}</button>}</div>)}</div>}
    <div className="attachment-actions"><label className={`attachment-upload ${uploading ? "disabled" : ""}`}><Paperclip size={15} />{uploading ? "در حال بارگذاری…" : "پیوست فایل"}<input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.rtf,.odt,.ods,.odp,.jpg,.jpeg,.png,.gif,.webp,.bmp,.tif,.tiff,.zip,.rar,.7z,.tar,.gz,.mp3,.wav,.ogg,.m4a,.aac,.flac,.mp4,.mov,.avi,.mkv,.webm" disabled={uploading} onChange={event=>{const file=event.target.files?.[0];event.target.value="";if(file){setUploading(true);void onUpload(file).finally(()=>setUploading(false));}}} /></label><small>سند، تصویر، فشرده، صوت یا فیلم؛ حداکثر ۵۰ مگابایت</small></div>
    <div className="event-log"><b>رویدادهای پیگیری</b>{(item.events ?? []).length > 0 ? <div className="event-list">{item.events!.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(entry=><div className="event-row" key={entry.id}><span><b>{entry.userName}</b><small>{formatDate(entry.createdAt.slice(0,10))}</small></span><p>{entry.text}</p></div>)}</div> : <small className="event-empty">هنوز رویدادی ثبت نشده است.</small>}<div className="event-compose"><textarea rows={2} value={eventDraft} onChange={event=>onEventChange(event.target.value)} placeholder="شرح رویداد یا اقدام انجام‌شده…" /><button type="button" className="secondary" onClick={onEventSubmit}>ثبت رویداد</button></div></div>
    <div className="card-bottom"><small>وضعیت پیگیری خود را به‌روز کنید.</small><select value={personalStatus} onChange={event => onStatus(event.target.value)}>{statusEntries.map(([key,title]) => <option key={key} value={key}>{title}</option>)}</select></div>
  </article>;
}
function formatFileSize(size: number) { return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} کیلوبایت` : `${(size / (1024 * 1024)).toFixed(1)} مگابایت`; }
function Empty() { return <div className="empty"><ClipboardList size={34} /><b>مصوبه‌ای برای نمایش نیست</b><span>مصوبه‌های ارجاع‌شده در این بخش نمایش داده می‌شوند.</span></div>; }
