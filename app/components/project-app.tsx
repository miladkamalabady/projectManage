"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CalendarClock, CheckCircle2, ClipboardCheck, FileWarning, Filter, Gauge, ListChecks, LoaderCircle, Plus, RefreshCw, Search, ShieldCheck, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Pagination, PaginationContent, PaginationItem, PaginationLink } from "@/components/ui/pagination";
import { Progress } from "@/components/ui/progress";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Toaster } from "@/components/ui/sonner";

type Task = {
  taskId: string; wbs: string; domain: string; title: string; acceptanceCriteria: string; sourcePage: string;
  priority: string; ownerType: string; status: string; progress: number; plannedStart: string | null;
  deadline: string | null; actualEnd: string | null; deliverable: string; supervisorApproval: string;
  supervisorNote: string; operatorApproval: string; operatorNote: string; nextAction: string;
  nextOwner: string; nextDeadline: string | null; updatedAt: string; updatedBy: string;
};
type Issue = { id: number; issueId: string; taskId: string | null; title: string; description: string; reporter: string; severity: string; priority: string; status: string; assignee: string; createdAt: string; deadline: string | null; resolvedAt: string | null; supervisorApproval: string; operatorApproval: string; retestNotes: string; updatedAt: string };
type Meeting = { id: number; meetingId: string; meetingDate: string | null; type: string; subject: string; attendees: string; decision: string; action: string; owner: string; deadline: string | null; status: string; taskId: string | null; documentUrl: string; updatedAt: string };
type User = { userId: string; email: string; displayName: string; role: Role; lastSeenAt: string };
type Role = "مدیر پروژه" | "پیمانکار" | "بهره‌بردار" | "ناظر" | "مشاهده‌گر";
type ProjectData = { tasks: Task[]; issues: Issue[]; meetings: Meeting[]; users: User[]; currentUser: User; roles: Role[] };

const statusOptions = ["بررسی نشده","نیازمند تحلیل","در حال انجام","مسدود","آماده تأیید","تکمیل شده","خارج از دامنه"];
const approvalOptions = ["در انتظار","تأیید شد","رد شد","نیازمند اصلاح","نیاز ندارد"];
const issueStatusOptions = ["باز","در حال رفع","آماده آزمون","بسته","لغو شده"];
const priorityOptions = ["بحرانی","بالا","متوسط","کم"];
const pageSize = 18;

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value.length === 10 ? `${value}T12:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fa-IR", { year: "numeric", month: "short", day: "numeric" }).format(date);
}
function isOverdue(task: Task) {
  if (!task.deadline || task.status === "تکمیل شده" || task.status === "خارج از دامنه") return false;
  return new Date(`${task.deadline}T23:59:59`).getTime() < Date.now();
}
function statusClass(value: string) {
  if (["تکمیل شده","تأیید شد","بسته"].includes(value)) return "state state-success";
  if (["مسدود","رد شد","بحرانی","باز"].includes(value)) return "state state-danger";
  if (["در حال انجام","آماده تأیید","نیازمند اصلاح","در حال رفع","بالا"].includes(value)) return "state state-warning";
  return "state state-neutral";
}

function FieldSelect({ value, options, onValueChange, disabled, placeholder = "انتخاب کنید" }: { value?: string | null; options: string[]; onValueChange: (value: string) => void; disabled?: boolean; placeholder?: string }) {
  return <Select value={value || undefined} onValueChange={onValueChange} disabled={disabled}>
    <SelectTrigger className="w-full"><SelectValue placeholder={placeholder} /></SelectTrigger>
    <SelectContent dir="rtl">{options.map((item) => <SelectItem key={item} value={item}>{item}</SelectItem>)}</SelectContent>
  </Select>;
}

function MetricCard({ label, value, note, icon: Icon, tone }: { label: string; value: string | number; note: string; icon: typeof Gauge; tone: string }) {
  return <article className="metric-card">
    <div className={`metric-icon ${tone}`}><Icon size={21} /></div>
    <div><p className="metric-label">{label}</p><p className="metric-value">{value}</p><p className="metric-note">{note}</p></div>
  </article>;
}

export default function ProjectApp() {
  const [data, setData] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("همه وضعیت‌ها");
  const [priorityFilter, setPriorityFilter] = useState("همه اولویت‌ها");
  const [domainFilter, setDomainFilter] = useState("همه حوزه‌ها");
  const [page, setPage] = useState(1);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskDraft, setTaskDraft] = useState<Partial<Task>>({});
  const [issueOpen, setIssueOpen] = useState(false);
  const [meetingOpen, setMeetingOpen] = useState(false);
  const [issueDraft, setIssueDraft] = useState<Record<string, string>>({ severity: "متوسط", priority: "متوسط", assignee: "پیمانکار" });
  const [meetingDraft, setMeetingDraft] = useState<Record<string, string>>({ type: "جلسه تحلیل", status: "باز" });
  const [saving, setSaving] = useState(false);

  async function loadData(showToast = false) {
    setLoading(true); setError("");
    try {
      const response = await fetch("/api/project", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "دریافت اطلاعات ناموفق بود.");
      setData(json);
      if (showToast) toast.success("اطلاعات به‌روز شد");
    } catch (err) { setError(err instanceof Error ? err.message : "خطا در دریافت اطلاعات"); }
    finally { setLoading(false); }
  }
  useEffect(() => { void loadData(); }, []);

  const domains = useMemo(() => [...new Set((data?.tasks ?? []).map((task) => task.domain))], [data]);
  const filteredTasks = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (data?.tasks ?? []).filter((task) =>
      (!q || [task.taskId, task.title, task.domain, task.acceptanceCriteria].some((value) => value.toLowerCase().includes(q))) &&
      (statusFilter === "همه وضعیت‌ها" || task.status === statusFilter) &&
      (priorityFilter === "همه اولویت‌ها" || task.priority === priorityFilter) &&
      (domainFilter === "همه حوزه‌ها" || task.domain === domainFilter)
    );
  }, [data, query, statusFilter, priorityFilter, domainFilter]);
  useEffect(() => { setPage(1); }, [query, statusFilter, priorityFilter, domainFilter]);
  const totalPages = Math.max(1, Math.ceil(filteredTasks.length / pageSize));
  const visibleTasks = filteredTasks.slice((page - 1) * pageSize, page * pageSize);

  const stats = useMemo(() => {
    const tasks = data?.tasks ?? [];
    const completed = tasks.filter((task) => task.status === "تکمیل شده").length;
    const inProgress = tasks.filter((task) => task.status === "در حال انجام").length;
    const overdue = tasks.filter(isOverdue).length;
    const progress = tasks.length ? Math.round(tasks.reduce((sum, task) => sum + Number(task.progress || 0), 0) / tasks.length) : 0;
    const openIssues = (data?.issues ?? []).filter((issue) => !["بسته","لغو شده"].includes(issue.status)).length;
    return { total: tasks.length, completed, inProgress, overdue, progress, openIssues };
  }, [data]);
  const statusCounts = useMemo(() => statusOptions.map((status) => ({ status, count: (data?.tasks ?? []).filter((task) => task.status === status).length })), [data]);

  const role = data?.currentUser.role ?? "مشاهده‌گر";
  const canEditTask = role !== "مشاهده‌گر";
  const canContractor = ["مدیر پروژه","پیمانکار"].includes(role);
  const canSupervisor = ["مدیر پروژه","ناظر"].includes(role);
  const canOperator = ["مدیر پروژه","بهره‌بردار"].includes(role);
  const canMeeting = ["مدیر پروژه","ناظر","بهره‌بردار"].includes(role);

  async function send(method: "POST" | "PATCH", body: unknown, successMessage: string) {
    setSaving(true);
    try {
      const response = await fetch("/api/project", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "ذخیره تغییرات ناموفق بود.");
      toast.success(successMessage);
      await loadData();
      return true;
    } catch (err) { toast.error(err instanceof Error ? err.message : "خطا در ذخیره"); return false; }
    finally { setSaving(false); }
  }
  function openTask(task: Task) { setSelectedTask(task); setTaskDraft({ ...task }); }
  async function saveTask() {
    if (!selectedTask) return;
    const keys = ["status","progress","plannedStart","deadline","actualEnd","deliverable","supervisorApproval","supervisorNote","operatorApproval","operatorNote","nextAction","nextOwner","nextDeadline","ownerType","priority"] as const;
    const updates = Object.fromEntries(keys.filter((key) => taskDraft[key] !== selectedTask[key]).map((key) => [key, taskDraft[key] ?? ""]));
    if (!Object.keys(updates).length) { toast.info("تغییری برای ذخیره وجود ندارد"); return; }
    if (await send("PATCH", { entity: "task", id: selectedTask.taskId, updates }, "فعالیت به‌روزرسانی شد")) setSelectedTask(null);
  }
  async function createIssue() {
    if (await send("POST", { entity: "issue", data: issueDraft }, "اشکال ثبت شد")) {
      setIssueOpen(false); setIssueDraft({ severity: "متوسط", priority: "متوسط", assignee: "پیمانکار" });
    }
  }
  async function updateIssue(issue: Issue, updates: Record<string, unknown>) {
    await send("PATCH", { entity: "issue", id: issue.id, updates }, "وضعیت اشکال به‌روزرسانی شد");
  }
  async function createMeeting() {
    if (await send("POST", { entity: "meeting", data: meetingDraft }, "مصوبه ثبت شد")) {
      setMeetingOpen(false); setMeetingDraft({ type: "جلسه تحلیل", status: "باز" });
    }
  }
  async function updateUser(userId: string, newRole: string) { await send("PATCH", { entity: "user", id: userId, updates: { role: newRole } }, "نقش کاربر تغییر کرد"); }

  if (loading && !data) return <main className="app-shell center-state"><LoaderCircle className="animate-spin" /><p>در حال آماده‌سازی اطلاعات پروژه…</p></main>;
  if (error && !data) return <main className="app-shell center-state"><AlertTriangle /><h1>سامانه در دسترس نیست</h1><p>{error}</p><Button onClick={() => void loadData()}>تلاش دوباره</Button></main>;
  if (!data) return null;

  return <main className="app-shell">
    <Toaster position="top-center" richColors />
    <header className="topbar">
      <div className="brand-block"><div className="brand-mark"><ClipboardCheck /></div><div><h1>سامانه کنترل پروژه سمپاد</h1><p>اهداف و دامنه کسب‌وکار — صفحات ۶ تا ۱۶</p></div></div>
      <div className="user-block"><div><strong>{data.currentUser.displayName}</strong><span>{data.currentUser.role}</span></div><Button variant="outline" size="icon" aria-label="به‌روزرسانی" onClick={() => void loadData(true)} disabled={loading}><RefreshCw className={loading ? "animate-spin" : ""} /></Button></div>
    </header>

    <div className="workspace">
      <Tabs defaultValue="dashboard" dir="rtl" className="w-full">
        <div className="nav-row">
          <TabsList className="main-tabs">
            <TabsTrigger value="dashboard"><Gauge />داشبورد</TabsTrigger>
            <TabsTrigger value="tasks"><ListChecks />فعالیت‌ها</TabsTrigger>
            <TabsTrigger value="issues"><FileWarning />اشکالات</TabsTrigger>
            <TabsTrigger value="meetings"><ClipboardCheck />مصوبات</TabsTrigger>
            <TabsTrigger value="team"><Users />کاربران</TabsTrigger>
          </TabsList>
          <Badge variant="outline" className="source-badge">۱۵۹ تعهد مبنا</Badge>
        </div>

        <TabsContent value="dashboard" className="space-y-5">
          <section className="metrics-grid">
            <MetricCard label="پیشرفت کل" value={`${stats.progress}٪`} note={`${stats.completed} فعالیت تکمیل‌شده`} icon={Gauge} tone="tone-teal" />
            <MetricCard label="در حال انجام" value={stats.inProgress} note={`از ${stats.total} فعالیت`} icon={ListChecks} tone="tone-blue" />
            <MetricCard label="معوق" value={stats.overdue} note="عبور از مهلت برنامه‌ای" icon={CalendarClock} tone="tone-red" />
            <MetricCard label="اشکال باز" value={stats.openIssues} note="نیازمند رفع یا آزمون" icon={FileWarning} tone="tone-amber" />
          </section>
          <section className="dashboard-grid">
            <article className="panel progress-panel">
              <div className="panel-heading"><div><h2>وضعیت تحقق تعهدات</h2><p>میانگین درصد پیشرفت ۱۵۹ فعالیت</p></div><ShieldCheck /></div>
              <div className="progress-hero"><div className="progress-ring" style={{ "--progress": `${stats.progress * 3.6}deg` } as React.CSSProperties}><strong>{stats.progress}٪</strong><span>پیشرفت</span></div>
                <div className="progress-copy"><h3>{stats.progress === 0 ? "در انتظار جلسه تطبیق وضعیت" : "پروژه در حال پایش است"}</h3><p>برای واقعی‌شدن شاخص، وضعیت و درصد پیشرفت هر فعالیت را همراه مستند تحویل ثبت کنید.</p><Progress value={stats.progress} /></div></div>
            </article>
            <article className="panel distribution-panel">
              <div className="panel-heading"><div><h2>توزیع وضعیت‌ها</h2><p>تعداد فعالیت در هر مرحله</p></div><Filter /></div>
              <div className="bars">{statusCounts.map((item) => <div className="bar-row" key={item.status}><span>{item.status}</span><div className="bar-track"><i style={{ width: `${Math.max(1, stats.total ? item.count / stats.total * 100 : 0)}%` }} /></div><strong>{item.count}</strong></div>)}</div>
            </article>
          </section>
          <section className="panel attention-panel"><div className="panel-heading"><div><h2>موارد نیازمند توجه</h2><p>اولویت جلسه بعدی پروژه</p></div><AlertTriangle /></div>
            <div className="attention-grid"><div><strong>{stats.overdue}</strong><span>فعالیت معوق</span></div><div><strong>{data.tasks.filter((t) => t.status === "آماده تأیید").length}</strong><span>منتظر تأیید</span></div><div><strong>{data.tasks.filter((t) => t.supervisorApproval === "رد شد" || t.operatorApproval === "رد شد").length}</strong><span>ردشده در تأیید</span></div><div><strong>{data.tasks.filter((t) => !t.deadline).length}</strong><span>بدون ددلاین</span></div></div>
          </section>
        </TabsContent>

        <TabsContent value="tasks" className="space-y-4">
          <section className="panel filter-panel"><div className="search-box"><Search /><Input aria-label="جستجوی فعالیت" placeholder="جستجو در شناسه، عنوان یا معیار پذیرش…" value={query} onChange={(e) => setQuery(e.target.value)} /></div>
            <FieldSelect value={statusFilter} options={["همه وضعیت‌ها",...statusOptions]} onValueChange={setStatusFilter} />
            <FieldSelect value={priorityFilter} options={["همه اولویت‌ها",...priorityOptions]} onValueChange={setPriorityFilter} />
            <FieldSelect value={domainFilter} options={["همه حوزه‌ها",...domains]} onValueChange={setDomainFilter} />
          </section>
          <section className="panel table-panel">
            <div className="table-summary"><span>{filteredTasks.length.toLocaleString("fa-IR")} فعالیت</span><span>برای مشاهده و ویرایش روی ردیف کلیک کنید</span></div>
            <Table><TableHeader><TableRow><TableHead>شناسه</TableHead><TableHead>حوزه و فعالیت</TableHead><TableHead>مسئول</TableHead><TableHead>اولویت</TableHead><TableHead>وضعیت</TableHead><TableHead>پیشرفت</TableHead><TableHead>مهلت</TableHead><TableHead>تأییدها</TableHead></TableRow></TableHeader>
              <TableBody>{visibleTasks.map((task) => <TableRow key={task.taskId} className="clickable-row" tabIndex={0} onClick={() => openTask(task)} onKeyDown={(e) => { if (e.key === "Enter") openTask(task); }}>
                <TableCell><strong dir="ltr">{task.taskId}</strong><small>WBS {task.wbs}</small></TableCell>
                <TableCell className="task-title-cell"><small>{task.domain} · صفحه {task.sourcePage}</small><strong>{task.title}</strong></TableCell>
                <TableCell>{task.ownerType}</TableCell><TableCell><span className={statusClass(task.priority)}>{task.priority}</span></TableCell>
                <TableCell><span className={statusClass(task.status)}>{task.status}</span></TableCell>
                <TableCell className="progress-cell"><span>{task.progress}٪</span><Progress value={task.progress} /></TableCell>
                <TableCell><span className={isOverdue(task) ? "deadline overdue" : "deadline"}>{formatDate(task.deadline)}</span></TableCell>
                <TableCell><div className="approval-pair"><span title="ناظر" className={task.supervisorApproval === "تأیید شد" ? "approved" : ""}>ن</span><span title="بهره‌بردار" className={task.operatorApproval === "تأیید شد" ? "approved" : ""}>ب</span></div></TableCell>
              </TableRow>)}</TableBody></Table>
            {!visibleTasks.length && <div className="empty-state"><Search /><strong>فعالیتی پیدا نشد</strong><span>فیلترها یا عبارت جستجو را تغییر دهید.</span></div>}
            {totalPages > 1 && <Pagination className="mt-5" dir="ltr"><PaginationContent><PaginationItem><PaginationLink href="#" aria-label="صفحه قبلی" className={page === 1 ? "pointer-events-none opacity-40" : ""} onClick={(e) => { e.preventDefault(); setPage(Math.max(1, page - 1)); }}>قبلی</PaginationLink></PaginationItem><PaginationItem><span className="page-counter">صفحه {page.toLocaleString("fa-IR")} از {totalPages.toLocaleString("fa-IR")}</span></PaginationItem><PaginationItem><PaginationLink href="#" aria-label="صفحه بعدی" className={page === totalPages ? "pointer-events-none opacity-40" : ""} onClick={(e) => { e.preventDefault(); setPage(Math.min(totalPages, page + 1)); }}>بعدی</PaginationLink></PaginationItem></PaginationContent></Pagination>}
          </section>
        </TabsContent>

        <TabsContent value="issues" className="space-y-4">
          <div className="section-actions"><div><h2>اشکالات و اقدامات اصلاحی</h2><p>هر اشکال را به شناسه فعالیت مربوط متصل کنید.</p></div><Button onClick={() => setIssueOpen(true)} disabled={role === "مشاهده‌گر"}><Plus />ثبت اشکال</Button></div>
          <section className="panel table-panel"><Table><TableHeader><TableRow><TableHead>شناسه</TableHead><TableHead>عنوان</TableHead><TableHead>فعالیت</TableHead><TableHead>شدت</TableHead><TableHead>مسئول</TableHead><TableHead>مهلت</TableHead><TableHead>وضعیت</TableHead></TableRow></TableHeader>
            <TableBody>{data.issues.map((issue) => <TableRow key={issue.id}><TableCell dir="ltr"><strong>{issue.issueId}</strong></TableCell><TableCell className="task-title-cell"><strong>{issue.title}</strong><small>{issue.reporter}</small></TableCell><TableCell dir="ltr">{issue.taskId || "—"}</TableCell><TableCell><span className={statusClass(issue.severity)}>{issue.severity}</span></TableCell><TableCell>{issue.assignee}</TableCell><TableCell>{formatDate(issue.deadline)}</TableCell><TableCell><FieldSelect value={issue.status} options={issueStatusOptions} onValueChange={(value) => void updateIssue(issue, { status: value, resolvedAt: value === "بسته" ? new Date().toISOString().slice(0,10) : "" })} disabled={role === "مشاهده‌گر"} /></TableCell></TableRow>)}</TableBody></Table>
            {!data.issues.length && <div className="empty-state"><CheckCircle2 /><strong>اشکال بازی ثبت نشده است</strong><span>در صورت مشاهده مغایرت، آن را به فعالیت مربوط وصل کنید.</span></div>}
          </section>
        </TabsContent>

        <TabsContent value="meetings" className="space-y-4">
          <div className="section-actions"><div><h2>جلسات و مصوبات</h2><p>تصمیم‌های مؤثر بر دامنه، مهلت و پذیرش را ثبت کنید.</p></div><Button onClick={() => setMeetingOpen(true)} disabled={!canMeeting}><Plus />ثبت مصوبه</Button></div>
          <section className="panel table-panel"><Table><TableHeader><TableRow><TableHead>شناسه</TableHead><TableHead>تاریخ</TableHead><TableHead>نوع</TableHead><TableHead>موضوع</TableHead><TableHead>تصمیم / اقدام</TableHead><TableHead>مسئول</TableHead><TableHead>مهلت</TableHead><TableHead>وضعیت</TableHead></TableRow></TableHeader>
            <TableBody>{data.meetings.map((meeting) => <TableRow key={meeting.id}><TableCell dir="ltr"><strong>{meeting.meetingId}</strong></TableCell><TableCell>{formatDate(meeting.meetingDate)}</TableCell><TableCell>{meeting.type}</TableCell><TableCell className="task-title-cell"><strong>{meeting.subject}</strong><small dir="ltr">{meeting.taskId || "بدون فعالیت مرتبط"}</small></TableCell><TableCell className="wrap-cell">{meeting.action || meeting.decision || "—"}</TableCell><TableCell>{meeting.owner || "—"}</TableCell><TableCell>{formatDate(meeting.deadline)}</TableCell><TableCell><span className={statusClass(meeting.status)}>{meeting.status}</span></TableCell></TableRow>)}</TableBody></Table>
            {!data.meetings.length && <div className="empty-state"><ClipboardCheck /><strong>هنوز مصوبه‌ای ثبت نشده است</strong><span>جلسه تطبیق اولیه بهترین نقطه شروع است.</span></div>}
          </section>
        </TabsContent>

        <TabsContent value="team" className="space-y-4"><div className="section-actions"><div><h2>کاربران و نقش‌ها</h2><p>هر کاربر پس از اولین ورود در این فهرست ظاهر می‌شود.</p></div><Badge variant="outline"><ShieldCheck />کنترل دسترسی سمت سرور</Badge></div>
          <section className="team-grid">{data.users.map((user) => <article className="user-card" key={user.userId}><div className="avatar">{user.displayName.slice(0,1)}</div><div className="user-info"><strong>{user.displayName}</strong><span>{user.email}</span><small>آخرین حضور: {formatDate(user.lastSeenAt)}</small></div><div className="role-control"><FieldSelect value={user.role} options={data.roles} onValueChange={(value) => void updateUser(user.userId, value)} disabled={role !== "مدیر پروژه" || user.userId === data.currentUser.userId} /></div></article>)}</section>
        </TabsContent>
      </Tabs>
    </div>

    <Sheet open={!!selectedTask} onOpenChange={(open) => { if (!open) setSelectedTask(null); }}>
      <SheetContent side="left" dir="rtl" className="detail-sheet sm:max-w-xl">
        {selectedTask && <><SheetHeader className="detail-header"><div className="detail-kicker"><span dir="ltr">{selectedTask.taskId}</span><Badge variant="outline">صفحه {selectedTask.sourcePage}</Badge></div><SheetTitle>{selectedTask.title}</SheetTitle><SheetDescription>{selectedTask.domain} · معیار پذیرش: {selectedTask.acceptanceCriteria}</SheetDescription></SheetHeader>
          <div className="detail-body"><div className="form-grid two"><label>وضعیت<FieldSelect value={String(taskDraft.status || "")} options={statusOptions} onValueChange={(v) => setTaskDraft({ ...taskDraft, status: v })} disabled={!canContractor} /></label><label>اولویت<FieldSelect value={String(taskDraft.priority || "")} options={priorityOptions} onValueChange={(v) => setTaskDraft({ ...taskDraft, priority: v })} disabled={role !== "مدیر پروژه"} /></label></div>
            <label>درصد پیشرفت <strong>{Number(taskDraft.progress || 0)}٪</strong><input className="range-input" type="range" min="0" max="100" step="5" value={Number(taskDraft.progress || 0)} onChange={(e) => setTaskDraft({ ...taskDraft, progress: Number(e.target.value) })} disabled={!canContractor} /></label>
            <div className="form-grid three"><label>شروع برنامه‌ای<Input type="date" value={String(taskDraft.plannedStart || "")} onChange={(e) => setTaskDraft({ ...taskDraft, plannedStart: e.target.value })} disabled={!canContractor} /></label><label>مهلت برنامه‌ای<Input type="date" value={String(taskDraft.deadline || "")} onChange={(e) => setTaskDraft({ ...taskDraft, deadline: e.target.value })} disabled={!canContractor} /></label><label>پایان واقعی<Input type="date" value={String(taskDraft.actualEnd || "")} onChange={(e) => setTaskDraft({ ...taskDraft, actualEnd: e.target.value })} disabled={!canContractor} /></label></div>
            <label>خروجی یا لینک مستند<Textarea value={String(taskDraft.deliverable || "")} onChange={(e) => setTaskDraft({ ...taskDraft, deliverable: e.target.value })} disabled={!canContractor} placeholder="شماره نامه، لینک نسخه، گزارش آزمون یا مستند تحویل" /></label>
            <div className="approval-box"><h3>تأیید ناظر</h3><FieldSelect value={String(taskDraft.supervisorApproval || "")} options={approvalOptions} onValueChange={(v) => setTaskDraft({ ...taskDraft, supervisorApproval: v })} disabled={!canSupervisor} /><Textarea value={String(taskDraft.supervisorNote || "")} onChange={(e) => setTaskDraft({ ...taskDraft, supervisorNote: e.target.value })} disabled={!canSupervisor} placeholder="نظر، ایراد یا شرط تأیید ناظر" /></div>
            <div className="approval-box"><h3>تأیید بهره‌بردار</h3><FieldSelect value={String(taskDraft.operatorApproval || "")} options={approvalOptions} onValueChange={(v) => setTaskDraft({ ...taskDraft, operatorApproval: v })} disabled={!canOperator} /><Textarea value={String(taskDraft.operatorNote || "")} onChange={(e) => setTaskDraft({ ...taskDraft, operatorNote: e.target.value })} disabled={!canOperator} placeholder="نظر، ایراد یا شرط تأیید بهره‌بردار" /></div>
            <label>اقدام بعدی<Textarea value={String(taskDraft.nextAction || "")} onChange={(e) => setTaskDraft({ ...taskDraft, nextAction: e.target.value })} disabled={!canEditTask} /></label><div className="form-grid two"><label>مسئول اقدام<Input value={String(taskDraft.nextOwner || "")} onChange={(e) => setTaskDraft({ ...taskDraft, nextOwner: e.target.value })} disabled={!canEditTask} /></label><label>مهلت اقدام<Input type="date" value={String(taskDraft.nextDeadline || "")} onChange={(e) => setTaskDraft({ ...taskDraft, nextDeadline: e.target.value })} disabled={!canEditTask} /></label></div>
          </div><SheetFooter><Button onClick={() => void saveTask()} disabled={saving || !canEditTask}>{saving && <LoaderCircle className="animate-spin" />}ذخیره تغییرات</Button></SheetFooter></>}
      </SheetContent>
    </Sheet>

    <Sheet open={issueOpen} onOpenChange={setIssueOpen}><SheetContent side="left" dir="rtl" className="detail-sheet sm:max-w-lg"><SheetHeader><SheetTitle>ثبت اشکال جدید</SheetTitle><SheetDescription>اشکال را به یک فعالیت پیوند دهید تا در داشبورد آن فعالیت دیده شود.</SheetDescription></SheetHeader><div className="detail-body"><label>عنوان اشکال<Input value={issueDraft.title || ""} onChange={(e) => setIssueDraft({ ...issueDraft, title: e.target.value })} /></label><label>شناسه فعالیت<Input dir="ltr" placeholder="مثال: JDG-05" value={issueDraft.taskId || ""} onChange={(e) => setIssueDraft({ ...issueDraft, taskId: e.target.value.toUpperCase() })} /></label><label>شرح و گام بازتولید<Textarea value={issueDraft.description || ""} onChange={(e) => setIssueDraft({ ...issueDraft, description: e.target.value })} /></label><div className="form-grid two"><label>شدت<FieldSelect value={issueDraft.severity} options={["بحرانی","زیاد","متوسط","کم"]} onValueChange={(v) => setIssueDraft({ ...issueDraft, severity: v })} /></label><label>اولویت<FieldSelect value={issueDraft.priority} options={priorityOptions} onValueChange={(v) => setIssueDraft({ ...issueDraft, priority: v })} /></label></div><div className="form-grid two"><label>مسئول رفع<Input value={issueDraft.assignee || ""} onChange={(e) => setIssueDraft({ ...issueDraft, assignee: e.target.value })} /></label><label>مهلت رفع<Input type="date" value={issueDraft.deadline || ""} onChange={(e) => setIssueDraft({ ...issueDraft, deadline: e.target.value })} /></label></div></div><SheetFooter><Button onClick={() => void createIssue()} disabled={saving || !issueDraft.title}>{saving && <LoaderCircle className="animate-spin" />}ثبت اشکال</Button></SheetFooter></SheetContent></Sheet>

    <Sheet open={meetingOpen} onOpenChange={setMeetingOpen}><SheetContent side="left" dir="rtl" className="detail-sheet sm:max-w-lg"><SheetHeader><SheetTitle>ثبت جلسه یا مصوبه</SheetTitle><SheetDescription>تغییرهای دامنه و زمان فقط با مصوبه ثبت‌شده قابل پیگیری‌اند.</SheetDescription></SheetHeader><div className="detail-body"><div className="form-grid two"><label>تاریخ<Input type="date" value={meetingDraft.meetingDate || ""} onChange={(e) => setMeetingDraft({ ...meetingDraft, meetingDate: e.target.value })} /></label><label>نوع<FieldSelect value={meetingDraft.type} options={["جلسه تحلیل","جلسه فنی","دمو","آزمون پذیرش","کمیته تغییر","تحویل"]} onValueChange={(v) => setMeetingDraft({ ...meetingDraft, type: v })} /></label></div><label>موضوع<Input value={meetingDraft.subject || ""} onChange={(e) => setMeetingDraft({ ...meetingDraft, subject: e.target.value })} /></label><label>حاضرین<Input value={meetingDraft.attendees || ""} onChange={(e) => setMeetingDraft({ ...meetingDraft, attendees: e.target.value })} /></label><label>تصمیم<Textarea value={meetingDraft.decision || ""} onChange={(e) => setMeetingDraft({ ...meetingDraft, decision: e.target.value })} /></label><label>اقدام<Textarea value={meetingDraft.action || ""} onChange={(e) => setMeetingDraft({ ...meetingDraft, action: e.target.value })} /></label><div className="form-grid two"><label>مسئول<Input value={meetingDraft.owner || ""} onChange={(e) => setMeetingDraft({ ...meetingDraft, owner: e.target.value })} /></label><label>مهلت<Input type="date" value={meetingDraft.deadline || ""} onChange={(e) => setMeetingDraft({ ...meetingDraft, deadline: e.target.value })} /></label></div><label>شناسه فعالیت مرتبط<Input dir="ltr" placeholder="اختیاری" value={meetingDraft.taskId || ""} onChange={(e) => setMeetingDraft({ ...meetingDraft, taskId: e.target.value.toUpperCase() })} /></label></div><SheetFooter><Button onClick={() => void createMeeting()} disabled={saving || !meetingDraft.subject}>{saving && <LoaderCircle className="animate-spin" />}ثبت مصوبه</Button></SheetFooter></SheetContent></Sheet>
  </main>;
}
