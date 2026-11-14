import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import DatePicker from "react-multi-date-picker";
import MeetingsPage from "./MeetingsPage";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";
import { Archive, Bell, Bookmark, CalendarDays, CheckCheck, ChevronDown, CircleAlert, ClipboardList, FileText, LayoutDashboard, MapPin, MessageCircle, Paperclip, Palette, Plus, Search, Send, ShieldCheck, Trash2, Upload, Users, X } from "lucide-react";

type Member = { id: number; nationalId: string; displayName: string; title: string; organizationUnit?: string; mobile?: string };
type Group = { id: number; name: string; category?: string; members: Member[] };
type AssignmentOption = { key: string; kind: "group" | "unit" | "post"; label: string; detail: string; groupId?: number; nationalId?: string };
type ResolutionReport = { id: number; resolutionId: number; resolutionNumber: string; resolutionText: string; nationalId: string; userName: string; text: string; reportType: string; periodKey: string; submittedAt: string; userTitle?: string; dueDate?: string | null; approvalStatus?: string; adminFeedback?: string; attachments?: { id: number; resolutionReportId?: number | null; originalName: string; contentType: string; size: number; uploaderName: string; approvedForAll: boolean; uploadedAt: string }[] };
type ResolutionProgress = { nationalId: string; status: string; notes: string; reportText?: string; approvalStatus?: string; adminFeedback?: string; updatedAt: string };
type ChatTurn = { role: "user" | "assistant"; content: string };
type UserNotification = { id: number; resolutionId?: number; resolutionNumber?: string; type: string; text: string; isRead: boolean; createdAt: string };
type BaleMessageReportItem = { id: number; displayName: string; mobile: string; text: string; status: string; attempts: number; createdAt: string; sentAt?: string | null; lastError: string };
type BaleMessageReport = { total: number; page: number; pageSize: number; items: BaleMessageReportItem[] };
type DatabaseBackupFile = { fileName: string; createdAt: string; sizeBytes: number; source: string };
type ResolutionEvent = { id: number; nationalId: string; userName: string; text: string; createdAt: string };
type ResolutionAttachment = { id: number; resolutionReportId?: number | null; originalName: string; contentType: string; size: number; contentHash?: string; uploadedBy: string; uploaderName: string; approvedForAll: boolean; uploadedAt: string };
type MeetingFile = { id: number; originalName: string; contentType: string; size: number; contentHash?: string };
async function sha256File(file: File): Promise<string> { if (!globalThis.crypto?.subtle) return `FALLBACK:${file.name.toLowerCase()}|${file.size}|${file.lastModified}`; const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer()); return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("").toUpperCase(); }
type MeetingOption = { id: number; date: string; dateJalali: string; title: string; guestText: string; attendees: { nationalId: string; displayName: string; title: string; isPresent: boolean; absenceReason: string }[] };
type Resolution = { province?: string; specialTrackingType?: string; ministerCategory?: string; isSpecialTracking?: boolean; meetingAttachments?: MeetingFile[]; meetingId?: number | null; publishToAll?: boolean; isArchived?: boolean; updatedAt?: string | null; startDate?: string | null; startDateJalali?: string; dueDate?: string | null; dueDateJalali?: string; meetingTitle?: string; hasSubmittedReport?: boolean; requiresPeriodicReport?: boolean; reportFrequency?: string; cancellationReason?: string; id: number; meetingDate: string; meetingDateJalali?: string; number: string; text: string; notes: string; isConfidential?: boolean; status: string; groupId: number | null; groupAssignments?: { groupId: number; group?: { name: string } }[]; assignments: { nationalId: string }[]; progress?: ResolutionProgress[]; attachments?: ResolutionAttachment[]; events?: ResolutionEvent[] };
type DirectoryUser = { nationalId: string; displayName: string; title?: string; organizationUnit?: string; province?: string | null; role?: string; canChangeRole?: boolean };
type Dashboard = { currentUser: { nationalId: string; displayName: string; role: string; title?: string; organizationUnit?: string }; groups: Group[]; resolutions: Resolution[] };
type AuthUser = { nationalId: string; displayName: string; role: string; title?: string; organizationUnit?: string; province?: string | null; mobile?: string };

let pendingSsoLogin: { code: string; task: Promise<AuthUser> } | null = null;
const sessionExpiredMessage = "نشست شما منقضی شده است. لطفاً از درگاه سازمانی دوباره وارد شوید.";
async function fetchApi(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const response = await fetch(input, init);
  if (response.status === 401) {
    window.dispatchEvent(new Event("vezarati-session-expired"));
    throw new Error(sessionExpiredMessage);
  }
  return response;
}

function loginWithSso(code: string): Promise<AuthUser> {
  if (pendingSsoLogin?.code === code) return pendingSsoLogin.task;
  const task = (async () => {
    const response = await fetch("/api/auth/sso", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code }) });
    const body = await response.text();
    if (!response.ok) throw new Error(response.status === 401 ? "کد ورود نامعتبر یا منقضی شده است؛ دوباره از درگاه وارد شوید." : body || `ورود ناموفق بود (HTTP ${response.status}).`);
    let sessionResponse: Response | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      sessionResponse = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
      if (sessionResponse.ok) return await sessionResponse.json() as AuthUser;
      if (sessionResponse.status !== 401) break;
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    throw new Error("ورود SSO انجام شد اما نشست کاربر دریافت نشد؛ دوباره تلاش کنید.");
  })();
  pendingSsoLogin = { code, task };
  void task.then(() => { if (pendingSsoLogin?.task === task) pendingSsoLogin = null; }, () => { if (pendingSsoLogin?.task === task) pendingSsoLogin = null; });
  return task;
}
type ReportTask = { resolutionId: number; number: string; text: string; dueDateJalali?: string; status: string };
type Report = { total: number; completed: number; delayed: number; pending: number; peopleTotal?: number; page?: number; pageSize?: number; people: { nationalId: string; displayName: string; total: number; completed: number; delayed: number; pending: number; title?: string; tasks?: ReportTask[] }[] };
type SavedQuickReportView = { id: string; name: string; query: string; selection: string; taskFilter: string };
type DataQualityPerson = { displayName: string; title?: string; organizationUnit?: string };
type DataQualityResolution = { id: number; number: string; text: string; dueDate?: string | null; meetingDate?: string };
type DataQualityReport = {
  checkedAt: string; usersTotal: number;
  usersWithoutMobileCount: number; usersWithoutMobile: DataQualityPerson[];
  usersWithoutTasksCount: number; usersWithoutTasks: DataQualityPerson[];
  resolutionsTotal: number; resolutionsWithoutDueDateCount: number; resolutionsWithoutDueDate: DataQualityResolution[];
  resolutionsWithoutSpecificAssigneesCount: number; resolutionsWithoutSpecificAssignees: DataQualityResolution[];
};

const asArray = <T,>(value: unknown): T[] => { if (Array.isArray(value)) return value as T[]; if (value && typeof value === "object") { const object = value as { items?: unknown; results?: unknown; data?: unknown }; for (const candidate of [object.items, object.results, object.data]) if (Array.isArray(candidate)) return candidate as T[]; } return []; };
const asGroups = (value: unknown): Group[] => asArray<Partial<Group>>(value).filter(group => !!group && typeof group === "object").map(group => ({ ...group, members: asArray<Member>(group.members) } as Group));
const labels: Record<string, string> = { before: "قبل از اجرا", in_progress: "در حال پیگیری", completed: "اجرا شده", delayed: "انجام نشده", cancelled: "لغو شده", rejected: "رد شده" };
const baleMessageStatusLabel = (status: string) => ({ pending: "در صف ارسال", processing: "در حال ارسال", sent: "ارسال شد", failed: "ناموفق" } as Record<string, string>)[status] ?? status;
const frequencyLabels: Record<string, string> = { daily: "روزانه", weekly: "هفتگی", monthly: "ماهانه" };
const iranProvinceOptions = ["آذربایجان شرقی","آذربایجان غربی","اردبیل","اصفهان","البرز","ایلام","بوشهر","تهران","چهارمحال و بختیاری","خراسان جنوبی","خراسان رضوی","خراسان شمالی","خوزستان","زنجان","سمنان","سیستان و بلوچستان","فارس","قزوین","قم","کردستان","کرمان","کرمانشاه","کهگیلویه و بویراحمد","گلستان","گیلان","لرستان","مازندران","مرکزی","هرمزگان","همدان","یزد"];
const formatReportPeriod = (periodKey: string) => {
  const separator = periodKey.lastIndexOf(":");
  if (separator < 0) return frequencyLabels[periodKey] ?? periodKey;
  const frequency = periodKey.slice(0, separator);
  const rawDate = periodKey.slice(separator + 1);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? formatDate(rawDate) : rawDate;
  return `${frequencyLabels[frequency] ?? frequency} · ${date}`;
};
const statusEntries = Object.entries(labels);
const coreGroupNames = new Set(["شورای معاونان", "مدیران کل"]);
const regionalGroupNames = new Set(["تهران، شهرستان های تهران", "تهران،قم، خراسان", "هرمزگان، بوشهر، خوزستان، سیستان"]);
const normalizeGroupName = (name: string) => name.split(String.fromCharCode(8204)).join("").replace(/[\s،؛,]+/g, "").replace(/[يى]/g, "ی").replace(/ك/g, "ک");
const isRegionalGroup = (name: string) => Array.from(regionalGroupNames).some(item => normalizeGroupName(item) === normalizeGroupName(name));
const isResolutionGroup = (name: string, category?: string) => category === "group" || (category !== "unit" && (coreGroupNames.has(name) || isRegionalGroup(name)));
const isIndividualRecipientGroup = (name: string) => name.startsWith("آقای ");
const groupDisplayName = (name: string) => name === "شورای معاونان" ? "معاونین" : name;
function getResolutionRouting(item: Resolution, groups: Group[], directoryUsers: { nationalId: string; displayName: string }[] = []) {
  const ids = Array.from(new Set([...(item.groupAssignments ?? []).map(assignment => assignment.groupId), ...(item.groupId ? [item.groupId] : [])]));
  const selected = ids.map(id => groups.find(group => group.id === id)).filter((group): group is Group => Boolean(group));
  const core = selected.filter(group => isResolutionGroup(group.name, group.category)).map(group => groupDisplayName(group.name));
  const departments = selected.filter(group => !isResolutionGroup(group.name, group.category) && !isIndividualRecipientGroup(group.name)).map(group => group.name);
  const directIds = new Set((item.assignments ?? []).map(assignment => assignment.nationalId));
  const groupMembers = groups.flatMap(group => group.members.filter(member => directIds.has(member.nationalId)).map(member => member.displayName));
  const directoryNames = directoryUsers.filter(person => directIds.has(person.nationalId)).map(person => person.displayName);
  const people = Array.from(new Set([...selected.filter(group => isIndividualRecipientGroup(group.name)).flatMap(group => group.members.map(member => member.displayName)), ...groupMembers, ...directoryNames]));
  return { core, departments, people };
}
function getFallbackPersonTitle(nationalId: string, groups: Group[], users: DirectoryUser[]) {
  const directoryTitle = users.find(person => person.nationalId === nationalId)?.title?.trim();
  if (directoryTitle) return directoryTitle;
  const memberships = groups.filter(group => group.members?.some(member => member.nationalId === nationalId));
  const unit = memberships.find(group => group.category === "unit" || (!isResolutionGroup(group.name, group.category) && !isRegionalGroup(group.name)));
  return unit?.name || memberships.find(group => !isResolutionGroup(group.name, group.category))?.name || "";
}
function resolutionRoutingLabel(item: Resolution, groups: Group[], directoryUsers: { nationalId: string; displayName: string }[] = []) {
  const routing = getResolutionRouting(item, groups, directoryUsers);
  const parts = [
    routing.core.length ? "گروه: " + routing.core.join("، ") : "",
    routing.departments.length ? "معاونت/واحد: " + routing.departments.join("، ") : "",
    routing.people.length ? "افراد مسئول: " + routing.people.join("، ") : ""
  ].filter(Boolean);
  return parts.join(" · ") || (item.assignments?.length ? "ارجاع مستقیم به افراد" : "بدون ارجاع");
}
const appTabPaths: Record<string, string> = { wall: "/", "execution-calendar": "/execution-calendar", assistant: "/assistant", notifications: "/notifications", resolutions: "/resolutions", "special-followups": "/special-followups", "provincial-trips": "/provincial-trips", sessions: "/sessions", archive: "/archive", groups: "/groups", reports: "/reports" };
const specialTrackingLabel = (type?: string) => type === "provincial" ? "سفرهای استانی وزیر" : "دستورات وزیر";
const tabForPath = (pathname: string) => { const normalized = pathname.endsWith("/") && pathname !== "/" ? pathname.slice(0, -1) : pathname; return Object.entries(appTabPaths).find(([, path]) => path !== "/" && normalized === path)?.[0] ?? "wall"; };
const pathForTab = (tab: string) => appTabPaths[tab] ?? "/";
const localDateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
const oneMonthAgoDateKey = () => {
  const date = new Date();
  date.setHours(12,0,0,0);
  const day = date.getDate();
  date.setDate(1);
  date.setMonth(date.getMonth()-1);
  const daysInMonth = new Date(date.getFullYear(),date.getMonth()+1,0).getDate();
  date.setDate(Math.min(day,daysInMonth));
  return localDateKey(date);
};
const today = () => new Date().toISOString().slice(0, 10);
const addMonthsToDateKey = (value: string, offset: number) => { const [year, month, day] = value.split("-").map(Number); const date = new Date(Date.UTC(year, month - 1, 1)); date.setUTCMonth(date.getUTCMonth() + offset); const maxDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate(); return date.getUTCFullYear() + "-" + String(date.getUTCMonth() + 1).padStart(2, "0") + "-" + String(Math.min(day, maxDay)).padStart(2, "0"); };
const tomorrow = () => { const date=new Date(`${today()}T12:00:00`); date.setDate(date.getDate()+1); return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`; };
const formatDate = (value: string, jalali?: string) => jalali || new Intl.DateTimeFormat("fa-IR-u-ca-persian", { dateStyle: "medium", numberingSystem: "arabext" }).format(new Date(`${value}T12:00:00`));
const formatDateTime = (value: string) => { const date=new Date(value); return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("fa-IR-u-ca-persian",{dateStyle:"medium",timeStyle:"short",numberingSystem:"arabext"}).format(date); };
const jalaliToGregorian = (value: string) => { const [jy,jm,jd] = jalaliParts(value); let days=365*(jy-979)+Math.floor((jy-979)/33)*8+Math.floor(((jy-979)%33+3)/4)+79; for(let m=1;m<jm;m++) days+=m<=6?31:30; days+=jd-1; let gy=1600+400*Math.floor(days/146097); days%=146097; let leap=true; if(days>=36525){days--;gy+=100*Math.floor(days/36524);days%=36524;if(days>=365)days++;else leap=false;}gy+=4*Math.floor(days/1461);days%=1461;if(days>=366){leap=false;days--;gy+=Math.floor(days/365);days%=365;}const md=[31,leap?29:28,31,30,31,30,31,31,30,31,30,31];let gm=0;while(gm<11&&days>=md[gm]){days-=md[gm++];}return `${gy}-${String(gm+1).padStart(2,"0")}-${String(days+1).padStart(2,"0")}`;};
const gregorianToJalali = (value: string) => {
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-US-u-ca-persian-nu-latn", { year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const part = (type: string) => parts.find(item => item.type === type)?.value ?? "";
  const year = part("year"), month = part("month"), day = part("day");
  return year && month && day ? `${year}.${month.padStart(2,"0")}.${day.padStart(2,"0")}` : "";
};
const jalaliToday = () => gregorianToJalali(today());
const formatEventDateTime = (value: string) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("fa-IR-u-ca-persian", {
    dateStyle: "medium",
    timeStyle: "short",
    numberingSystem: "arabext"
  }).format(date);
};
const toLatinDigits = (value: string) => value.replace(/[۰-۹٠-٩]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit) >= 0 ? "۰۱۲۳۴۵۶۷۸۹".indexOf(digit) : "٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
const normalizeSearchText = (value: unknown) => String(value ?? "").normalize("NFKC").replace(/[يى]/g, "ی").replace(/ك/g, "ک").trim().toLocaleLowerCase("fa");
const normalizeResolutionNumber = (value: string) => normalizeSearchText(toLatinDigits(value)).replace(/\s+/g, "");
const parsePersonalCompletionCommand = (value: string) => value.trim().match(/^مصوبه\s+(?:شماره\s+)?([0-9۰-۹٠-٩]+(?:[./_-][0-9۰-۹٠-٩]+)*)\s+را\s+ت(?:ا|أ)یید\s+کن\s*[.!؟]?$/u)?.[1] ?? null;
const displayLocation = (value?: string | null) => { const text = String(value ?? "").trim(); return /^[0-9۰-۹٠-٩]+$/.test(text) ? "" : text; };
const jalaliParts = (value: string) => toLatinDigits(String(value||"")).replace(/[/-]/g,".").split(".").map(Number);
const normalizeJalaliDate = (value: string) => { const [year,month,day]=jalaliParts(value); if(Number.isInteger(year)&&year>=1300&&year<=1600&&Number.isInteger(month)&&month>=1&&month<=12&&Number.isInteger(day)&&day>=1&&day<=jalaliMonthDays(`${year}.${String(month).padStart(2,"0")}.01`)) return `${year}.${String(month).padStart(2,"0")}.${String(day).padStart(2,"0")}`; return jalaliToday(); };
const resolutionMeetingDay = (item: Resolution) => normalizeJalaliDate(item.meetingDateJalali || gregorianToJalali(item.meetingDate));
const resolutionJalaliMonth = (item: Resolution) => normalizeJalaliDate(item.meetingDateJalali || gregorianToJalali(item.meetingDate)).slice(0,7);
const normalizeJalaliMonth = (value: string) => { const [year,month]=jalaliParts(value); if(Number.isInteger(year)&&year>=1300&&year<=1600&&Number.isInteger(month)&&month>=1&&month<=12) return `${year}.${String(month).padStart(2,"0")}.01`; const [fallbackYear,fallbackMonth]=jalaliParts(jalaliToday()); return `${fallbackYear}.${String(fallbackMonth).padStart(2,"0")}.01`; };
const jalaliMonthTitle = (value: string) => { const safeMonth=normalizeJalaliMonth(value); const date=new Date(`${jalaliToGregorian(safeMonth)}T12:00:00`); return new Intl.DateTimeFormat("fa-IR-u-ca-persian", { month: "long", year: "numeric", numberingSystem: "arabext" }).format(Number.isNaN(date.getTime())?new Date():date); };
const jalaliMonthDays = (value: string) => { const [year,month]=jalaliParts(normalizeJalaliMonth(value)); return month<=6?31:month<=11?30:((year-979)%33===1||(year-979)%33===5||(year-979)%33===9||(year-979)%33===13||(year-979)%33===17||(year-979)%33===22||(year-979)%33===26||(year-979)%33===30?30:29); };
const jalaliDayOffset = (value: string) => { const date=new Date(`${jalaliToGregorian(normalizeJalaliMonth(value))}T12:00:00`); return Number.isNaN(date.getTime())?0:(date.getDay()+1)%7; };
const jalaliWeekCount = (monthValue: string) => {
  const month = normalizeJalaliMonth(monthValue);
  const count = Math.ceil((jalaliDayOffset(month) + jalaliMonthDays(month)) / 7);
  return Number.isFinite(count) && count > 0 ? count : 5;
};
const jalaliWeekNumber = (monthValue: string, selectedValue: string) => {
  const month = normalizeJalaliMonth(monthValue);
  const [, , day] = jalaliParts(normalizeJalaliDate(selectedValue));
  const safeDay = Number.isFinite(day) ? day : 1;
  const number = Math.floor((jalaliDayOffset(month) + safeDay - 1) / 7) + 1;
  return Math.min(Math.max(number, 1), jalaliWeekCount(month));
};
const shiftJalaliMonth = (value: string, delta: number) => { let [year,month]=jalaliParts(value); month+=delta; if(month<1){month=12;year--;} if(month>12){month=1;year++;} return `${year}.${String(month).padStart(2,"0")}.01`; };
const jalaliDateAt = (monthValue: string, day: number) => { const [year,month]=jalaliParts(monthValue); return `${year}.${String(month).padStart(2,"0")}.${String(day).padStart(2,"0")}`; };

export default function App() {
  const [tab, setTab] = useState(() => tabForPath(window.location.pathname));
  const [assistantMessages, setAssistantMessages] = useState<ChatTurn[]>([]);
  const [assistantInput, setAssistantInput] = useState("");
  const [assistantSending, setAssistantSending] = useState(false);
  const [assistantError, setAssistantError] = useState("");
  const assistantEndRef = useRef<HTMLDivElement | null>(null);
  const skipRoutePush = useRef(false);
  const [openMeetingRequest, setOpenMeetingRequest] = useState(0);
  const [wallStatusFilter, setWallStatusFilter] = useState("all");
  const [radarFilter, setRadarFilter] = useState("all");
  const [eventDrafts, setEventDrafts] = useState<Record<number, string>>({});
  const [reportDrafts, setReportDrafts] = useState<Record<number, string>>({});
  const [fadingReportedResolutionIds, setFadingReportedResolutionIds] = useState<number[]>([]);
  const [hiddenReportedResolutionIds, setHiddenReportedResolutionIds] = useState<number[]>([]);
  const [periodicDrafts, setPeriodicDrafts] = useState<Record<number, string>>({});
  const [reportSubmissions, setReportSubmissions] = useState<ResolutionReport[]>([]);
  const [reportSubmissionQuery, setReportSubmissionQuery] = useState("");
  const [expandedReport, setExpandedReport] = useState<ResolutionReport | null>(null);
  const [baleMessageReport, setBaleMessageReport] = useState<BaleMessageReport>({ total: 0, page: 1, pageSize: 20, items: [] });
  const [baleMessageQuery, setBaleMessageQuery] = useState("");
  const [baleMessageStatus, setBaleMessageStatus] = useState("all");
  const [baleMessageFrom, setBaleMessageFrom] = useState(() => oneMonthAgoDateKey());
  const [baleMessageTo, setBaleMessageTo] = useState(() => localDateKey(new Date()));
  const [baleMessagePage, setBaleMessagePage] = useState(1);
  const [baleMessageLoading, setBaleMessageLoading] = useState(false);
  const [baleMessageError, setBaleMessageError] = useState("");
  const [reportGroupQuery, setReportGroupQuery] = useState("");
  const [reportViewTab, setReportViewTab] = useState<"groups" | "units" | "people">("groups");
  const [reportMainTab, setReportMainTab] = useState<"overview" | "bale" | "actions" | "special" | "groups" | "units" | "people" | "events" | "lookup" | "resolution" | "backup" | "quality">("overview");
  const [quickReportQuery, setQuickReportQuery] = useState("");
  const [quickReportSelection, setQuickReportSelection] = useState("");
  const [quickReportTaskFilter, setQuickReportTaskFilter] = useState("all");
  const [quickSavedViewName, setQuickSavedViewName] = useState("");
  const [savedQuickViewRevision, setSavedQuickViewRevision] = useState(0);
  const [dataQualityReport, setDataQualityReport] = useState<DataQualityReport | null>(null);
  const [dataQualityLoading, setDataQualityLoading] = useState(false);
  const [dataQualityLoaded, setDataQualityLoaded] = useState(false);
  const [dataQualityError, setDataQualityError] = useState("");
  const [dataQualityRetry, setDataQualityRetry] = useState(0);
  const dataQualityFetchStarted = useRef(false);
  const [resolutionReportLookupQuery, setResolutionReportLookupQuery] = useState("");
  const [selectedResolutionReportId, setSelectedResolutionReportId] = useState<number | null>(null);
  const [resolutionReportPeopleQuery, setResolutionReportPeopleQuery] = useState("");
  const [resolutionReportPersonFilter, setResolutionReportPersonFilter] = useState<"all" | "submitted" | "missing">("all");
  const [reportPersonStatusFilter, setReportPersonStatusFilter] = useState("all");
  const [selectedReportGroupIds, setSelectedReportGroupIds] = useState<string[]>([]);
  const [eventReportQuery, setEventReportQuery] = useState("");
  const [eventReportFrom, setEventReportFrom] = useState("");
  const [eventReportTo, setEventReportTo] = useState("");
  const [eventReportPage, setEventReportPage] = useState(1);
  const [eventReportPageSize, setEventReportPageSize] = useState(10);
  const [notifications, setNotifications] = useState<UserNotification[]>([]);
  const [baleNotificationsEnabled, setBaleNotificationsEnabled] = useState(false);
  const [baleNotificationsConfigured, setBaleNotificationsConfigured] = useState(false);
  const [notificationPage, setNotificationPage] = useState(1);
  const [notificationTab, setNotificationTab] = useState<"notifications" | "events">("notifications");
  const notificationPageSize = 10;
  const [archiveQuery, setArchiveQuery] = useState("");
  const [specialFollowupQuery, setSpecialFollowupQuery] = useState("");
  const [specialFollowupStatusFilter, setSpecialFollowupStatusFilter] = useState("all");
  const [specialFollowupProvinceFilter, setSpecialFollowupProvinceFilter] = useState("all");
  const [archiveOpenId, setArchiveOpenId] = useState<number | null>(null);
  const [viewerId, setViewerId] = useState("");
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const isAdmin = authUser?.role === "ادمین";
  const [dashboard, setDashboard] = useState<Dashboard | null>(null);
  const [dashboardLoaded, setDashboardLoaded] = useState(false);
  const [resolutions, setResolutions] = useState<Resolution[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [meetings, setMeetings] = useState<MeetingOption[]>([]);
  const [reports, setReports] = useState<Report | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);
  const [databaseBackups, setDatabaseBackups] = useState<DatabaseBackupFile[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [reportsLoading, setReportsLoading] = useState(false);
  const [reportsLoaded, setReportsLoaded] = useState(false);
  const [reportsError, setReportsError] = useState("");
  const summaryFetchStarted = useRef(false);
  const submissionsFetchStarted = useRef(false);
  const [submissionsLoaded, setSubmissionsLoaded] = useState(false);
  const [reportsRetryCount, setReportsRetryCount] = useState(0);
  const [users, setUsers] = useState<{ nationalId: string; displayName: string; title?: string; organizationUnit?: string; mobile?: string; province?: string | null; role?: string; canChangeRole?: boolean }[]>([]);
  const [query, setQuery] = useState("");
  const [resolutionDateFrom, setResolutionDateFrom] = useState("");
  const [resolutionDateTo, setResolutionDateTo] = useState("");
  const [resolutionMeetingFilter, setResolutionMeetingFilter] = useState("");
  const [resolutionPersonFilter, setResolutionPersonFilter] = useState("");
  const [resolutionReportFilter, setResolutionReportFilter] = useState("all");
  const [resolutionConfidentialFilter, setResolutionConfidentialFilter] = useState("all");
  const [resolutionTypeFilter, setResolutionTypeFilter] = useState("all");
  const [specialReportSearch, setSpecialReportSearch] = useState("");
  const [specialReportStatus, setSpecialReportStatus] = useState("all");
  const [specialReportPresence, setSpecialReportPresence] = useState("all");
  const [specialReportProvinceFilter, setSpecialReportProvinceFilter] = useState("all");
  const [specialReportCategory, setSpecialReportCategory] = useState("all");
  const [ministerDirectiveCategories, setMinisterDirectiveCategories] = useState<string[]>(["دفتر مقام معظم رهبری", "دفتر ریاست جمهوری، نهاد، معاونان ریاست جمهوری", "وزارت خانه ها، سازمان ها، نهادهای دولتی", "نمایندگان مجلس", "قوه قضائیه، سازمان بازرسی", "مکاتبات داخلی وزارت خانه", "سایر مکاتبات"]);
  const [ministerDirectiveCategoriesDraft, setMinisterDirectiveCategoriesDraft] = useState("دفتر مقام معظم رهبری\nدفتر ریاست جمهوری، نهاد، معاونان ریاست جمهوری\nوزارت خانه ها، سازمان ها، نهادهای دولتی\nنمایندگان مجلس\nقوه قضائیه، سازمان بازرسی\nمکاتبات داخلی وزارت خانه\nسایر مکاتبات");
  const [resolutionStatusFilter, setResolutionStatusFilter] = useState("all");
  const [reportQuery, setReportQuery] = useState("");
  const [peopleReportLoaded, setPeopleReportLoaded] = useState(false);
  const peopleReportFetchStarted = useRef(false);
  const [reportPage, setReportPage] = useState(1);
  const [reportTaskSelection, setReportTaskSelection] = useState<{person: Report["people"][number]; status: "all" | "completed" | "pending" | "delayed"} | null>(null);
  const [reportTaskDetails, setReportTaskDetails] = useState<Resolution[]>([]);
  const [reportTaskDetailsLoading, setReportTaskDetailsLoading] = useState(false);
  const [reportTaskDetailsError, setReportTaskDetailsError] = useState("");
  const reportTaskRequestId = useRef(0);
  const [peopleQuery, setPeopleQuery] = useState("");
  const [adminUserQuery, setAdminUserQuery] = useState("");
  const [resolutionPage, setResolutionPage] = useState(1);
  const [openResolutionReportsId, setOpenResolutionReportsId] = useState<number | null>(null);
  const [resolutionPageSize, setResolutionPageSize] = useState(10);
  const [archiveLoading, setArchiveLoading] = useState(false);
  const [archiveLoaded, setArchiveLoaded] = useState(false);
  const archiveFetchStarted = useRef(false);
  const [resolutionSort, setResolutionSort] = useState<{ key: "meetingTitle" | "meetingDate" | "number" | "text" | "assignment" | "dueDate" | "status"; direction: "asc" | "desc" }>({ key: "meetingDate", direction: "desc" });
  const [modalOpen, setModalOpen] = useState(false);
  const [reportRejectionTarget, setReportRejectionTarget] = useState<{ kind: "submission"; report: ResolutionReport } | { kind: "completion"; resolutionId: number; assigneeNationalId: string } | null>(null);
  const [reportRejectionFeedback, setReportRejectionFeedback] = useState("");
  const resolutionDateFromPickerRef = useRef<any>(null);
  const resolutionDateToPickerRef = useRef<any>(null);
  const baleMessageFromPickerRef = useRef<any>(null);
  const baleMessageToPickerRef = useRef<any>(null);
  const eventReportFromPickerRef = useRef<any>(null);
  const eventReportToPickerRef = useRef<any>(null);
  const meetingDatePickerRef = useRef<any>(null);
  const [meetingPickerQuery, setMeetingPickerQuery] = useState("");
  const [meetingPickerOpen, setMeetingPickerOpen] = useState(false);
  const [fontScale, setFontScale] = useState(() => { try { const saved = Number(localStorage.getItem("vezarati.fontScale")); return Number.isFinite(saved) && saved >= 14 && saved <= 20 ? saved : 16; } catch { return 16; } });
  const [theme, setTheme] = useState<"light" | "blue" | "violet" | "dark">("light");
  const [themeLoadedFor, setThemeLoadedFor] = useState("");
  const overviewFromPickerRef = useRef<any>(null);
  const overviewToPickerRef = useRef<any>(null);
  const [overviewFrom, setOverviewFrom] = useState("");
  const [overviewTo, setOverviewTo] = useState("");
  const [overviewDrilldown, setOverviewDrilldown] = useState<{ monthKey: string } | { status: "completed" | "pending" | "delayed" } | null>(null);
  const [selectedTopic, setSelectedTopic] = useState<string | null>(null);
  const [editingResolutionHashes, setEditingResolutionHashes] = useState<string[]>([]);
  const startDatePickerRef = useRef<any>(null);
  const dueDatePickerRef = useRef<any>(null);
  const [editingResolutionId, setEditingResolutionId] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [sentWarningKeys, setSentWarningKeys] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [resolutionFormError, setResolutionFormError] = useState("");
  const [form, setForm] = useState({ meetingId: "", meetingDate: today(), meetingDateJalali: jalaliToday(), number: "", text: "", notes: "", isConfidential: false, isSpecialTracking: false, specialTrackingType: "minister", province: "", ministerCategory: "", groupIds: [] as string[], unitIds: [] as string[], people: [] as string[], publishToAll: false, startDate: tomorrow(), startDateJalali: gregorianToJalali(tomorrow()), dueDate: "", dueDateJalali: "", requiresPeriodicReport: false, reportFrequency: "weekly" });
  const [resolutionFiles, setResolutionFiles] = useState<File[]>([]);
  const [resolutionEventDraft, setResolutionEventDraft] = useState("");
  const [groupName, setGroupName] = useState("");
  const [groupDeleteError, setGroupDeleteError] = useState("");
  const [selectedGroup, setSelectedGroup] = useState("");
  const [selectedUnit, setSelectedUnit] = useState("");
  const [newUnitName, setNewUnitName] = useState("");
  const [nationalId, setNationalId] = useState("");
  const [memberSearch, setMemberSearch] = useState("");
  const [memberMatches, setMemberMatches] = useState<DirectoryUser[]>([]);
  const [memberSearching, setMemberSearching] = useState(false);
  const [memberSearchMessage, setMemberSearchMessage] = useState("استاندارد جستجو: حداقل ۲ حرف از نام یا کد ملی را وارد کنید.");
  const memberSearchSequence = useRef(0);
  const [selectedPerson, setSelectedPerson] = useState<DirectoryUser | null>(null);
  const [newPerson, setNewPerson] = useState({ nationalId: "", firstName: "", lastName: "", title: "", organizationUnit: "" });
  const [calendarMonth, setCalendarMonth] = useState(jalaliToday().slice(0,7) + ".01");
  const [executionCalendarFrom, setExecutionCalendarFrom] = useState(() => addMonthsToDateKey(today(), -3));
  const [executionCalendarTo, setExecutionCalendarTo] = useState(() => addMonthsToDateKey(today(), 3));
  const [executionCalendarMonth, setExecutionCalendarMonth] = useState(() => jalaliToday().slice(0, 7) + ".01");
  const [executionCalendarSelectedDay, setExecutionCalendarSelectedDay] = useState(() => jalaliToday());
  const [executionCalendarView, setExecutionCalendarView] = useState<"summary" | "calendar" | "attention">("calendar");
  const [executionCalendarScrollTaskId, setExecutionCalendarScrollTaskId] = useState<number | null>(null);
  const executionCalendarFromPickerRef = useRef<any>(null);
  const executionCalendarToPickerRef = useRef<any>(null);
  const [calendarFilterStatus, setCalendarFilterStatus] = useState("all");
  const [calendarFrom, setCalendarFrom] = useState("");
  const [calendarTo, setCalendarTo] = useState("");
  const calendarFromPickerRef = useRef<any>(null);
  const calendarToPickerRef = useRef<any>(null);
  const [calendarSearch, setCalendarSearch] = useState("");
  const weekDatePickerRef = useRef<any>(null);
  const [selectedDay, setSelectedDay] = useState(jalaliToday());
  const [calendarTargetId, setCalendarTargetId] = useState<number | null>(null);
  useEffect(() => { if (authUser?.role === "ادمین" && tab === "reports" && reportMainTab === "backup") void loadDatabaseBackups(); }, [authUser?.nationalId, authUser?.role, tab, reportMainTab]);
  useEffect(() => { if (authUser?.role === "ادمین") void loadMinisterDirectiveCategories(); }, [authUser?.nationalId, authUser?.role]);

  async function loadMinisterDirectiveCategories() {
    try {
      const response = await fetchApi("/api/settings/minister-directive-categories", { credentials: "include", cache: "no-store" });
      const result = await response.json().catch(() => []);
      if (!response.ok) throw new Error(result?.detail || result?.title || "دریافت دسته‌بندی دستورات ناموفق بود.");
      if (Array.isArray(result) && result.length) {
        setMinisterDirectiveCategories(result);
        setMinisterDirectiveCategoriesDraft(result.join("\n"));
      }
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "دریافت دسته‌بندی دستورات ناموفق بود.");
    }
  }

  async function saveMinisterDirectiveCategories() {
    const categories = ministerDirectiveCategoriesDraft.split(/\r?\n/).map(item => item.trim()).filter(Boolean);
    if (!categories.length) { setMessage("حداقل یک دسته‌بندی وارد کنید."); return; }
    try {
      const response = await fetchApi("/api/settings/minister-directive-categories", { method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ categories }) });
      const result = await response.json().catch(() => []);
      if (!response.ok) throw new Error(result?.detail || result?.title || result?.error || "ذخیره دسته‌بندی‌ها ناموفق بود.");
      setMinisterDirectiveCategories(Array.isArray(result) ? result : categories);
      setMinisterDirectiveCategoriesDraft((Array.isArray(result) ? result : categories).join("\n"));
      setMessage("دسته‌بندی‌های دستورات وزیر ذخیره شد.");
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "ذخیره دسته‌بندی‌ها ناموفق بود.");
    }
  }

  async function loadDatabaseBackups() {
    setBackupsLoading(true);
    try {
      const response = await fetchApi("/api/admin/database/backups", { credentials: "include", cache: "no-store" });
      const result = await response.json().catch(() => []);
      if (!response.ok) throw new Error(result?.detail || result?.title || "دریافت فهرست نسخه‌های پشتیبان ناموفق بود.");
      setDatabaseBackups(Array.isArray(result) ? result : []);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "دریافت فهرست نسخه‌های پشتیبان ناموفق بود.");
    } finally {
      setBackupsLoading(false);
    }
  }

  async function createDatabaseBackup() {
    setBackupBusy(true);
    setMessage("");
    try {
      const response = await fetchApi("/api/admin/database/backups", { method: "POST", credentials: "include", cache: "no-store" });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.detail || result?.error || result?.title || "تهیه نسخه پشتیبان ناموفق بود.");
      setMessage(result?.message || "نسخه پشتیبان روی سرور ذخیره شد.");
      await loadDatabaseBackups();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "تهیه نسخه پشتیبان ناموفق بود.");
    } finally {
      setBackupBusy(false);
    }
  }

  async function restoreDatabaseBackup(fileName: string) {
    const confirmed = window.confirm("بازیابی، اطلاعات فعلی دیتابیس را با نسخه پشتیبان جایگزین می‌کند. ادامه می‌دهید؟");
    if (!confirmed) return;
    setBackupBusy(true);
    setMessage("");
    try {
      const response = await fetchApi("/api/admin/database/backups/restore", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName })
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.detail || result?.error || result?.title || "بازیابی نسخه پشتیبان ناموفق بود.");
      setMessage(result?.message || "بازیابی اطلاعات انجام شد.");
      window.setTimeout(() => window.location.reload(), 1600);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "بازیابی نسخه پشتیبان ناموفق بود.");
    } finally {
      setBackupBusy(false);
    }
  }

  async function openReportPersonTasks(person: Report["people"][number], status: "all" | "completed" | "pending" | "delayed") {
    const requestId = ++reportTaskRequestId.current;
    setReportTaskSelection({ person, status });
    setReportTaskDetails([]);
    setReportTaskDetailsError("");
    setReportTaskDetailsLoading(true);
    try {
      const response = await fetchApi(`/api/reports/people/${encodeURIComponent(person.nationalId)}/tasks?status=${status}`, { credentials: "include", cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || "جزئیات مصوبات دریافت نشد.");
      if (requestId === reportTaskRequestId.current) setReportTaskDetails(asArray<Resolution>(data));
    } catch (cause) {
      if (requestId === reportTaskRequestId.current) setReportTaskDetailsError(cause instanceof Error ? cause.message : "جزئیات مصوبات دریافت نشد.");
    } finally {
      if (requestId === reportTaskRequestId.current) setReportTaskDetailsLoading(false);
    }
  }

  async function load() {
    if (!authUser) return;
    setError("");
    try {
      const [dashboardResponse, groupsResponse, usersResponse, notificationsResponse, baleSettingsResponse, meetingsResponse] = await Promise.all([
        fetchApi("/api/dashboard"), fetchApi("/api/groups"), isAdmin ? fetchApi("/api/users") : Promise.resolve(new Response(JSON.stringify({ total: 0, completed: 0, delayed: 0, pending: 0, people: [] }), { status: 200 })), fetchApi("/api/notifications"), isAdmin ? fetchApi("/api/settings/bale-notifications") : Promise.resolve(new Response(JSON.stringify({ enabled: false, configured: false }), { status: 200 })), isAdmin ? fetchApi("/api/meetings") : Promise.resolve(new Response("[]", { status: 200 }))
      ]);
      for (const response of [dashboardResponse, groupsResponse, usersResponse, notificationsResponse, baleSettingsResponse, meetingsResponse]) if (!response.ok) throw new Error(response.status === 401 ? "نشست شما منقضی شده است." : "گرفتن اطلاعات از API ناموفق بود.");
      const baleSettings = await baleSettingsResponse.json();
      setBaleNotificationsEnabled(!!baleSettings.enabled);
      setBaleNotificationsConfigured(!!baleSettings.configured);
      const dashboardData = await dashboardResponse.json();
      const resolutionData = asArray<Resolution>(dashboardData && typeof dashboardData === "object" ? dashboardData.resolutions : []);
      const groupData = asGroups(await groupsResponse.json());
      const userData = asArray<{ nationalId: string; displayName: string; title?: string; organizationUnit?: string; mobile?: string; province?: string | null; role?: string; canChangeRole?: boolean }>(await usersResponse.json());
      const notificationData = asArray<UserNotification>(await notificationsResponse.json());
      const meetingData = asArray<MeetingOption>(await meetingsResponse.json());
      setMeetings(meetingData);
      setDashboard(dashboardData && typeof dashboardData === "object" ? { ...dashboardData, groups: asGroups(dashboardData.groups), resolutions: asArray<Resolution>(dashboardData.resolutions) } : null);
      setResolutions(current => [...resolutionData, ...current.filter(item => item.isArchived)]);
      setGroups(groupData);
      setUsers(userData);
      setNotifications(notificationData);
      setDashboardLoaded(true);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "خطا در دریافت اطلاعات"); }
  }
  function requestNewMeeting() { setTab("sessions"); setOpenMeetingRequest(value => value + 1); }

  function openWallTask(item: Resolution) {
    const date = resolutionMeetingDay(item);
    setTab("wall");
    setWallStatusFilter("all");
    setCalendarSearch("");
    setCalendarFilterStatus("all");
    setCalendarFrom("");
    setCalendarTo("");
    setCalendarMonth(date.slice(0, 7) + ".01");
    setSelectedDay(date);
    setCalendarTargetId(item.id);
  }

  function moveExecutionCalendarMonth(delta: number) { const next = shiftJalaliMonth(executionCalendarMonth, delta); const month = next.slice(0, 7); if (month < executionCalendarFirstMonth || month > executionCalendarLastMonth) return; setExecutionCalendarMonth(next); }

  function moveCalendarWeek(delta: number) {
    const safeSelectedDay = normalizeJalaliDate(selectedDay);
    const gregorian = jalaliToGregorian(safeSelectedDay);
    const date = new Date(`${gregorian}T12:00:00`);
    if (Number.isNaN(date.getTime())) {
      const fallback = jalaliToday();
      setCalendarMonth(fallback.slice(0,7)+".01");
      setSelectedDay(fallback);
      return;
    }
    date.setDate(date.getDate() + delta * 7);
    const gregorianNext = `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
    const normalizedNext = normalizeJalaliDate(gregorianToJalali(gregorianNext));
    setCalendarMonth(normalizedNext.slice(0,7)+".01");
    setSelectedDay(normalizedNext);
  }
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    setAuthUser(null); setViewerId(""); setDashboard(null); setResolutions([]); setGroups([]); setReports(null); setReportsLoaded(false); setSubmissionsLoaded(false); summaryFetchStarted.current = false; submissionsFetchStarted.current = false; setReportsError(""); setReportSubmissions([]); setUsers([]); setNotifications([]);
  }
  useEffect(() => {
    const handleExpiredSession = () => {
      setError(sessionExpiredMessage);
      setMessage("");
      setAuthUser(null);
      setViewerId("");
      setDashboard(null);
      setDashboardLoaded(false);
      setResolutions([]);
      setGroups([]);
      setReports(null);
      setReportsLoaded(false);
      setSubmissionsLoaded(false);
      summaryFetchStarted.current = false;
      submissionsFetchStarted.current = false;
      setReportsError("");
      setReportSubmissions([]);
      setUsers([]);
      setNotifications([]);
    };
    window.addEventListener("vezarati-session-expired", handleExpiredSession);
    return () => window.removeEventListener("vezarati-session-expired", handleExpiredSession);
  }, []);
  useEffect(() => {
    let active = true;
    const params = new URLSearchParams(window.location.search);
    const queryCode = params.get("code");
    const storedCode = sessionStorage.getItem("vezarati.pendingSsoCode");
    const code = queryCode || storedCode;
    if (code) {
      sessionStorage.setItem("vezarati.pendingSsoCode", code);
      if (queryCode) window.history.replaceState({}, document.title, window.location.pathname);
      loginWithSso(code)
        .then(user => { sessionStorage.removeItem("vezarati.pendingSsoCode"); if (active) { if (window.location.pathname === "/" && user.role !== "ادمین") setTab("execution-calendar"); setAuthUser(user); setViewerId(user.nationalId); } })
        .catch(cause => { sessionStorage.removeItem("vezarati.pendingSsoCode"); if (active) setError(cause instanceof Error ? cause.message : "ورود یکپارچه ناموفق بود."); })
        .finally(() => { if (active) setAuthReady(true); });
    } else {
      fetch("/api/auth/me", { credentials: "include", cache: "no-store" }).then(async response => { if (!response.ok) throw new Error("ورود لازم است."); return response.json(); })
        .then(user => { if (active) { if (window.location.pathname === "/" && user.role !== "ادمین") setTab("execution-calendar"); setAuthUser(user); setViewerId(user.nationalId); } })
        .catch(() => { if (active) { setAuthUser(null); setViewerId(""); } })
        .finally(() => { if (active) setAuthReady(true); });
    }
    return () => { active = false; };
  }, []);  useEffect(() => {
    const handlePopState = () => {
      const nextTab = tabForPath(window.location.pathname);
      if (nextTab !== tab) { skipRoutePush.current = true; setTab(nextTab); }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [tab]);
  useEffect(() => {
    if (skipRoutePush.current) { skipRoutePush.current = false; return; }
    const nextPath = pathForTab(tab);
    if (window.location.pathname !== nextPath) window.history.pushState({ tab }, "", nextPath);
  }, [tab]);
  useEffect(() => {
    if (authReady && authUser && !isAdmin && ["sessions", "archive", "groups", "reports"].includes(tab)) setTab("wall");
  }, [authReady, authUser?.nationalId, isAdmin, tab]);
  useEffect(() => { const safe=normalizeJalaliMonth(calendarMonth); if(safe!==calendarMonth) setCalendarMonth(safe); }, [calendarMonth]);
  useEffect(() => { const normalized=normalizeJalaliDate(selectedDay); if(normalized!==selectedDay){setSelectedDay(normalized);setCalendarMonth(normalized.slice(0,7)+".01");} }, [selectedDay]);
  useEffect(() => { if (authUser) void load(); }, [authUser?.nationalId]);
  useEffect(() => {
    if (!authUser || !isAdmin || tab !== "reports" || reportMainTab !== "people" || peopleReportLoaded || peopleReportFetchStarted.current) return;
    peopleReportFetchStarted.current = true;
    setReportsLoading(true);
    setReportsError("");
    fetchApi("/api/reports?view=people&page=1&pageSize=5000&status=all", { credentials: "include", cache: "no-store" })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.error || "گزارش فردی دریافت نشد.");
        setReports(current => ({ ...(current ?? { total: 0, completed: 0, delayed: 0, pending: 0, people: [] }), ...data, people: asArray(data.people) }) as Report);
        setPeopleReportLoaded(true);
      })
      .catch(cause => {
        peopleReportFetchStarted.current = false;
        setReportsError(cause instanceof Error ? cause.message : "گزارش فردی دریافت نشد.");
      })
      .finally(() => setReportsLoading(false));
  }, [authUser?.nationalId, isAdmin, tab, reportMainTab, peopleReportLoaded, reportsRetryCount]);
  useEffect(() => {
    if (!authUser || !isAdmin || tab !== "reports" || reportMainTab !== "quality" || dataQualityLoaded || dataQualityFetchStarted.current) return;
    dataQualityFetchStarted.current = true;
    setDataQualityLoading(true);
    setDataQualityError("");
    fetchApi("/api/reports/data-quality", { credentials: "include", cache: "no-store" })
      .then(async response => {
        const data = await response.json();
        if (!response.ok) throw new Error(data?.detail || data?.error || "گزارش کیفیت داده دریافت نشد.");
        setDataQualityReport(data as DataQualityReport);
        setDataQualityLoaded(true);
      })
      .catch(cause => {
        dataQualityFetchStarted.current = false;
        setDataQualityError(cause instanceof Error ? cause.message : "گزارش کیفیت داده دریافت نشد.");
      })
      .finally(() => setDataQualityLoading(false));
  }, [authUser?.nationalId, isAdmin, tab, reportMainTab, dataQualityLoaded, dataQualityRetry]);
  useEffect(() => {
    if (!authUser || !isAdmin || (tab !== "reports" && tab !== "wall" && tab !== "resolutions" && tab !== "special-followups" && tab !== "provincial-trips") || (tab === "reports" && (reportMainTab === "backup" || reportMainTab === "quality"))) return;
    const requestType = tab === "wall" || tab === "resolutions" || tab === "special-followups" || tab === "provincial-trips" ? "submissions" : reportMainTab === "overview" ? "summary" : (reportMainTab === "actions" || reportMainTab === "resolution" || reportMainTab === "special") ? "submissions" : null;
    if (!requestType) { setReportsError(""); setReportsLoading(false); return; }
    const loaded = requestType === "summary" ? reportsLoaded : submissionsLoaded;
    const fetchingRef = requestType === "summary" ? summaryFetchStarted : submissionsFetchStarted;
    if (loaded || fetchingRef.current) return;
    let active = true;
    const endpoint = requestType === "summary" ? "/api/reports?view=summary" : "/api/reports/submissions";
    fetchingRef.current = true;
    setReportsLoading(true);
    setReportsError("");
    fetchApi(endpoint, { credentials: "include", cache: "no-store" }).then(async response => {
      const data = await response.json();
      if (!response.ok) throw new Error(data?.error || (requestType === "submissions" ? "گزارش‌های اقدامات دریافت نشد." : "گزارش مدیریتی دریافت نشد."));
      if (!active) return;
      if (requestType === "summary") {
        setReports(current => ({ ...(current ?? { total: 0, completed: 0, delayed: 0, pending: 0, people: [] }), ...data, people: current?.people ?? [] }) as Report);
        setReportsLoaded(true);
      } else {
        setReportSubmissions(asArray<ResolutionReport>(data));
        setSubmissionsLoaded(true);
      }
    }).catch(cause => {
      if (active) setReportsError(cause instanceof Error ? cause.message : "دریافت گزارش ناموفق بود.");
      fetchingRef.current = false;
    }).finally(() => { if (active) setReportsLoading(false); });
    return () => { active = false; fetchingRef.current = false; setReportsLoading(false); };
  }, [authUser?.nationalId, isAdmin, tab, reportMainTab, reportsLoaded, submissionsLoaded, reportsRetryCount]);
  useEffect(() => {
    if (!authUser || !isAdmin || tab !== "archive" || archiveLoaded || archiveFetchStarted.current) return;
    let active = true;
    archiveFetchStarted.current = true;
    setArchiveLoading(true);
    fetchApi("/api/resolutions", { credentials: "include", cache: "no-store" })
      .then(async response => { const body = await response.json(); if (!response.ok) throw new Error(body?.error || "بایگانی مصوبات دریافت نشد."); return asArray<Resolution>(body); })
      .then(items => { if (active) { setResolutions(items); setArchiveLoaded(true); } })
      .catch(error => { if (active) { setMessage(error instanceof Error ? error.message : "دریافت بایگانی ناموفق بود."); archiveFetchStarted.current = false; } })
      .finally(() => { if (active) setArchiveLoading(false); });
    return () => { active = false; };
  }, [authUser?.nationalId, isAdmin, tab, archiveLoaded]);
  useEffect(() => { document.documentElement.style.setProperty("--ui-scale", String(fontScale / 16)); try { localStorage.setItem("vezarati.fontScale", String(fontScale)); } catch { /* local storage is optional */ } }, [fontScale]);
  useEffect(() => { const userId = authUser?.nationalId; if (!userId) return; let saved: string | null = null; try { saved = localStorage.getItem(`vezarati.theme:${userId}`); } catch { /* local storage is optional */ } setTheme(saved === "blue" || saved === "violet" || saved === "dark" ? saved : "light"); setThemeLoadedFor(userId); }, [authUser?.nationalId]);
  useEffect(() => { const userId = authUser?.nationalId; if (!userId || themeLoadedFor !== userId) return; document.documentElement.dataset.theme = theme; try { localStorage.setItem(`vezarati.theme:${userId}`, theme); } catch { /* local storage is optional */ } }, [authUser?.nationalId, theme, themeLoadedFor]);
  useEffect(() => {
    if (!authUser || !("serviceWorker" in navigator) || !("PushManager" in window)) { setPushEnabled(false); return; }
    let active = true;
    void navigator.serviceWorker.getRegistration("/").then(async registration => {
      const subscription = await registration?.pushManager.getSubscription();
      if (!active) return;
      setPushEnabled(!!subscription);
      if (subscription) {
        await fetchApi("/api/push/subscriptions", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription) });
      }
    }).catch(() => { if (active) setPushEnabled(false); });
    return () => { active = false; };
  }, [authUser?.nationalId]);
  useEffect(() => {
    if (!isAdmin || tab !== "reports") return;
    let active = true;
    const params = new URLSearchParams({ page: String(baleMessagePage), pageSize: "20", status: baleMessageStatus });
    if (baleMessageQuery.trim()) params.set("q", baleMessageQuery.trim());
    if (baleMessageFrom) params.set("from", baleMessageFrom);
    if (baleMessageTo) params.set("to", baleMessageTo);
    setBaleMessageLoading(true);
    setBaleMessageError("");
    fetchApi(`/api/reports/bale-messages?${params.toString()}`, { credentials: "include" })
      .then(async response => {
        const body = await response.json();
        if (!response.ok) throw new Error(body?.error || "گزارش ارسال‌های بله دریافت نشد.");
        return body as BaleMessageReport;
      })
      .then(result => { if (active) setBaleMessageReport(result); })
      .catch(cause => { if (active) setBaleMessageError(cause instanceof Error ? cause.message : "خطا در دریافت گزارش ارسال‌های بله"); })
      .finally(() => { if (active) setBaleMessageLoading(false); });
    return () => { active = false; };
  }, [isAdmin, tab, baleMessagePage, baleMessageStatus, baleMessageQuery, baleMessageFrom, baleMessageTo]);
  useEffect(() => {
    if (!authUser || tab !== "notifications") return;
    let active = true;
    const refreshLiveFeed = async () => {
      try {
        const [dashboardResponse, notificationsResponse] = await Promise.all([
          fetchApi("/api/dashboard", { credentials: "include", cache: "no-store" }),
          fetchApi("/api/notifications", { credentials: "include", cache: "no-store" })
        ]);
        if (!dashboardResponse.ok || !notificationsResponse.ok) return;
        const rawDashboard = await dashboardResponse.json();
        const latestDashboard = rawDashboard && typeof rawDashboard === "object"
          ? { ...rawDashboard, groups: asGroups(rawDashboard.groups), resolutions: asArray<Resolution>(rawDashboard.resolutions) } as Dashboard
          : null;
        const latestNotifications = asArray<UserNotification>(await notificationsResponse.json());
        if (active && latestDashboard) {
          setDashboard(latestDashboard);
          setResolutions(latestDashboard.resolutions);
          setGroups(asGroups(latestDashboard.groups));
          setNotifications(latestNotifications);
        }
      } catch { /* keep the last loaded feed if the connection briefly drops */ }
    };
    const timer = window.setInterval(() => void refreshLiveFeed(), 15000);
    return () => { active = false; window.clearInterval(timer); };
  }, [authUser?.nationalId, tab]);

  useEffect(() => {
    if (calendarTargetId === null) return;
    let attempts = 0;
    let timer: number | undefined;
    let frame = 0;
    const scrollToCard = () => {
      const target = document.getElementById(`resolution-${calendarTargetId}`);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.classList.add("resolution-card-highlight");
        window.setTimeout(() => target.classList.remove("resolution-card-highlight"), 1800);
        setCalendarTargetId(null);
      } else if (attempts++ < 40) {
        timer = window.setTimeout(scrollToCard, 80);
      } else {
        setCalendarTargetId(null);
      }
    };
    frame = window.requestAnimationFrame(scrollToCard);
    return () => {
      window.cancelAnimationFrame(frame);
      if (timer !== undefined) window.clearTimeout(timer);
    };
  }, [calendarTargetId, selectedDay, calendarMonth, tab, wallStatusFilter]);
  useEffect(() => { if(tab!=="wall"||wallStatusFilter!=="all"||calendarTargetId!==null) return; const [year,month,day]=jalaliParts(selectedDay); const monthKey=`${year}.${String(month).padStart(2,"0")}.01`; if(monthKey!==calendarMonth) return; const week=Math.floor((jalaliDayOffset(calendarMonth)+day-1)/7); document.getElementById(`calendar-week-${week}`)?.scrollIntoView({behavior:"smooth",block:"nearest",inline:"center"}); }, [selectedDay,calendarMonth,tab,wallStatusFilter]);


  async function uploadAttachment(resolutionId: number, file: File) {
    if (file.size > 50 * 1024 * 1024) { setMessage("حداکثر حجم هر فایل ۵۰ مگابایت است."); return; }
    const formData = new FormData(); formData.append("file", file);
    setMessage("");
    try {
      const response = await fetchApi(`/api/resolutions/${resolutionId}/attachments`, { method: "POST", body: formData });
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

  async function submitCompletionReport(resolutionId: number, files: File[]) {
    const text = (reportDrafts[resolutionId] ?? "").trim();
    if (!text) { setMessage("متن گزارش را وارد کنید."); return false; }
    setBusy(true); setMessage("");
    try {
      const formData = new FormData();
      formData.append("text", text);
      formData.append("userName", dashboard?.currentUser.displayName ?? viewerId);
      files.forEach(file => formData.append("files", file));
      const response = await fetchApi(`/api/resolutions/${resolutionId}/completion-report`, { method: "POST", body: formData });
      const result = response.status === 204 ? null : await response.json();
      if (!response.ok) throw new Error(result?.error || "ارسال گزارش انجام نشد.");
      setMessage("✅ گزارش اقدام با موفقیت ثبت شد. این وظیفه تا چند لحظهٔ دیگر از فهرست انجام‌نشده‌ها کنار می‌رود.");
      setReportDrafts(current => ({ ...current, [resolutionId]: "" }));
      setFadingReportedResolutionIds(current => current.includes(resolutionId) ? current : [...current, resolutionId]);
      await new Promise(resolve => window.setTimeout(resolve, 1800));
      setHiddenReportedResolutionIds(current => current.includes(resolutionId) ? current : [...current, resolutionId]);
      setFadingReportedResolutionIds(current => current.filter(id => id !== resolutionId));
      await load();
      return true;
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "ارسال گزارش انجام نشد.");
      return false;
    } finally { setBusy(false); }
  }
  function openReportRejection(target: NonNullable<typeof reportRejectionTarget>) {
    setReportRejectionTarget(target);
    setReportRejectionFeedback("");
  }
  async function reviewReportSubmission(report: ResolutionReport, approved: boolean) {
    if (approved) { setMessage("گزارش به‌صورت پیش‌فرض تأیید شده است؛ ادمین فقط می‌تواند آن را رد کند."); return; }
    openReportRejection({ kind: "submission", report });
  }
  async function reviewCompletionReport(resolutionId: number, assigneeNationalId: string) {
    openReportRejection({ kind: "completion", resolutionId, assigneeNationalId });
  }
  async function submitReportRejection() {
    const feedback = reportRejectionFeedback.trim();
    if (!feedback) { setMessage("برای رد گزارش، علت را وارد کنید."); return; }
    if (!reportRejectionTarget) return;
    const success = reportRejectionTarget.kind === "submission"
      ? await request(`/api/reports/submissions/${reportRejectionTarget.report.id}/review`, "PATCH", { approved: false, feedback })
      : await request(`/api/resolutions/${reportRejectionTarget.resolutionId}/completion-review`, "PATCH", { nationalId: viewerId, assigneeNationalId: reportRejectionTarget.assigneeNationalId, approved: false, feedback });
    if (success) { setReportRejectionTarget(null); setReportRejectionFeedback(""); }
  }
  async function deleteResolution(item: Resolution) {
    const hasReports=reportSubmissions.some(report=>report.resolutionId===item.id)||!!item.progress?.some(progress=>!!progress.reportText?.trim());
    if(hasReports){setMessage("برای این مصوبه گزارش ثبت شده است و حذف آن مجاز نیست.");return;}
    if(!window.confirm(`مصوبه شماره ${item.number} با شناسه یکتا ${item.id} حذف شود؟`))return;
    setBusy(true);setMessage("");
    try{
      const response=await fetchApi(`/api/resolutions/${item.id}`,{method:"DELETE",credentials:"include"});
      const result=response.status===204?null:await response.json();
      if(!response.ok)throw new Error(result?.error||"حذف مصوبه انجام نشد.");
      setResolutions(current=>current.filter(entry=>entry.id!==item.id));
      setDashboard(current=>current?{...current,resolutions:current.resolutions.filter(entry=>entry.id!==item.id)}:current);
      setMessage("مصوبه حذف شد.");
    }catch(cause){setMessage(cause instanceof Error?cause.message:"حذف مصوبه انجام نشد.");}
    finally{setBusy(false);}
  }
  async function toggleArchive(item: Resolution, isArchived: boolean) {
    await request(`/api/resolutions/${item.id}/archive`, "PATCH", { nationalId: viewerId, isArchived });
  }
  async function markNotificationRead(id: number) {
    await request(`/api/notifications/${id}/read`, "PATCH", { nationalId: viewerId });
  }
  async function markAllNotificationsRead() {
    if (unreadNotifications === 0) return;
    await request("/api/notifications/read-all", "PATCH");
  }
  function exportPeopleExcel() {
    const escape = (value: unknown) => String(value ?? "").replace(/[&<>"]/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;" }[char]!));
    const rows = [["نام و نام خانوادگی","سمت","کل مصوبات","اجراشده","در حال پیگیری","انجام نشده","درصد اجرا","جلسات","حاضر","غایب"], ...reportPeople.map(person => { const attendance = attendanceByPerson.get(person.nationalId) || { total: 0, present: 0, absent: 0 }; return [person.displayName, person.title ?? "", person.total, person.completed, person.pending, person.delayed, person.total ? Math.round(person.completed * 100 / person.total) + "%" : "0%", attendance.total, attendance.present, attendance.absent]; })];
    const html = "<html><head><meta charset='utf-8'></head><body><table dir='rtl'><thead><tr>" + rows[0].map(cell => "<th>" + escape(cell) + "</th>").join("") + "</tr></thead><tbody>" + rows.slice(1).map(row => "<tr>" + row.map(cell => "<td>" + escape(cell) + "</td>").join("") + "</tr>").join("") + "</tbody></table></body></html>";
    const blob = new Blob(["\ufeff", html], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = "گزارش-فردی-مصوبات.xls"; link.click(); URL.revokeObjectURL(url);
  }
  function printReport() { window.print(); }
  function printQuickStatus() {
    const sheet = document.querySelector<HTMLElement>(".quick-status-print-sheet");
    if (!sheet) return;
    const hiddenSiblings: { element: HTMLElement; display: string }[] = [];
    let node: HTMLElement | null = sheet;
    while (node && node !== document.body) {
      const parentElement: HTMLElement | null = node.parentElement;
      if (parentElement) for (const child of Array.from(parentElement.children)) {
        if (child !== node && child instanceof HTMLElement) {
          hiddenSiblings.push({ element: child, display: child.style.display });
          child.style.display = "none";
        }
      }
      node = parentElement;
    }
    document.body.classList.add("print-quick-status");
    const cleanup = () => {
      document.body.classList.remove("print-quick-status");
      hiddenSiblings.forEach(({ element, display }) => { element.style.display = display; });
    };
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 1500);
  }
  function buildCsv(rows: ReadonlyArray<ReadonlyArray<unknown>>): string {
    const lines: string[] = [];
    for (const row of rows) {
      const cells: string[] = [];
      for (const value of row) {
        const raw = String(value ?? "");
        let escaped = "";
        for (let index = 0; index < raw.length; index++) {
          const character = raw.charAt(index);
          escaped += character === '"' ? '""' : character;
        }
        cells.push('"' + escaped + '"');
      }
      lines.push(cells.join(","));
    }
    return "\uFEFF" + lines.join("\r\n");
  }

  async function changeGroupCategory(group: Group, category: "group" | "unit") {
    if (group.category === category) return;
    setBusy(true); setGroupDeleteError(""); setMessage("");
    try {
      const response = await fetchApi(`/api/groups/${group.id}/category`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ category }) });
      const result = response.status === 204 ? null : await response.json();
      if (!response.ok) throw new Error(result?.error || "تغییر دسته‌بندی انجام نشد.");
      setMessage(category === "group" ? "مورد به گروه‌ها منتقل شد." : "مورد به معاونت‌ها و واحدها منتقل شد.");
      await load();
    } catch (cause) { setGroupDeleteError(cause instanceof Error ? cause.message : "تغییر دسته‌بندی انجام نشد."); }
    finally { setBusy(false); }
  }
  async function sendAssistantMessage(value = assistantInput) {
    const message = value.trim();
    if (!message || assistantSending) return;
    const history = assistantMessages.slice(-8);
    setAssistantMessages(current => [...current, { role: "user", content: message }]);
    setAssistantInput("");
    setAssistantError("");
    setAssistantSending(true);
    try {
      const requestedNumber = !isAdmin ? parsePersonalCompletionCommand(message) : null;
      if (requestedNumber) {
        const number = normalizeResolutionNumber(requestedNumber);
        const matches = mine.filter(item => normalizeResolutionNumber(item.number) === number);
        let reply: string;
        if (matches.length === 0) {
          reply = `مصوبهٔ شمارهٔ ${requestedNumber} در کارتابل شما پیدا نشد؛ تغییری ثبت نشد.`;
        } else if (matches.length > 1) {
          reply = "چند مصوبه با این شماره در کارتابل شما هست؛ برای جلوگیری از ثبت روی مورد اشتباه، ابتدا از بخش «مصوبات» جلسه و تاریخ موردنظر را پیدا کنید. هیچ گزارشی ثبت نشد.\n"
            + matches.map(item => `• ${item.meetingTitle || "جلسه بدون عنوان"} · ${item.meetingDateJalali || formatDate(item.meetingDate)} · شناسه یکتا ${item.id}`).join("\n");
        } else {
          const item = matches[0];
          const personal = item.progress?.find(progress => progress.nationalId === viewerId);
          if (personal?.status === "completed" && personal.approvalStatus === "approved") {
            reply = `مصوبهٔ شمارهٔ ${item.number} از قبل برای شما اجراشده و تأییدشده است.`;
          } else {
            const completionResponse = await fetchApi(`/api/resolutions/${item.id}/completion-report`, {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ nationalId: viewerId, userName: authUser?.displayName ?? "", text: "اقدام انجام شد" })
            });
            const completionResult = await completionResponse.json().catch(() => ({}));
            if (completionResponse.status === 401) throw new Error("نشست شما منقضی شده است؛ دوباره وارد سامانه شوید.");
            if (!completionResponse.ok) throw new Error(completionResult?.error || "ثبت تأیید انجام نشد.");
            reply = `مصوبهٔ شمارهٔ ${item.number} با گزارش «اقدام انجام شد» برای شما تأیید و اجراشده ثبت شد.`;
            setMessage(reply);
            await load();
          }
        }
        setAssistantMessages(current => [...current, { role: "assistant", content: reply }]);
        return;
      }
      const promptKey = normalizeSearchText(message).replace(/[\u200c\s؟?!.,،؛:]+/g, "");
      const promptMatches = (prompt: string) => promptKey.includes(normalizeSearchText(prompt).replace(/[\u200c\s؟?!.,،؛:]+/g, ""));
      const personalStatusOf = (item: Resolution) => item.progress?.find(progress => progress.nationalId === viewerId)?.status || item.status;
      let localReply: string | null = null;
      if (promptKey.includes("کداموظایفمنسررسیدنزدیکدارند") || promptKey.includes("کداموظایفمنمهلتنزدیکدارند")) {
        const todayDate = new Date(`${today()}T00:00:00`);
        const nearDeadlines = mine
          .filter(item => !item.isArchived && item.status !== "cancelled" && item.dueDate && personalStatusOf(item) !== "completed")
          .map(item => {
            const due = new Date(`${item.dueDate}T00:00:00`);
            const days = Math.ceil((due.getTime() - todayDate.getTime()) / 86400000);
            return { item, days, status: personalStatusOf(item) };
          })
          .filter(entry => Number.isFinite(entry.days) && entry.days <= 7)
          .sort((left, right) => left.days - right.days || left.item.id - right.item.id)
          .slice(0, 20);
        localReply = nearDeadlines.length
          ? `مهلت‌های گذشته و سررسیدهای تا ۷ روز آینده: ${nearDeadlines.length} مصوبه.\n` + nearDeadlines.map(({ item, days, status }) => {
              const deadline = days < 0 ? `${Math.abs(days)} روز از مهلت گذشته` : days === 0 ? "سررسید امروز" : `تا ${days} روز دیگر`;
              const subject = item.text.replace(/\s+/g, " ").trim();
              return `• مصوبه ${item.number} · ${subject.slice(0, 100)}${subject.length > 100 ? "…" : ""} · ${deadline} (${formatDate(item.dueDate!, item.dueDateJalali?.replace(/\./g, "/"))}) · ${labels[status] || status}`;
            }).join("\n")
          : "تا ۷ روز آینده سررسیدی برای مصوبه‌های فعال شما ثبت نشده است.";
      } else if (promptKey.includes("مصوبههایدرحالپیگیریراخلاصهکن") || promptKey.includes("مصوبههایدرحالپیگیریراخلاصه")) {
        const ongoing = mine
          .filter(item => !item.isArchived && item.status !== "cancelled" && ["in_progress", "delayed"].includes(personalStatusOf(item)))
          .sort((left, right) => (left.dueDate || "9999-12-31").localeCompare(right.dueDate || "9999-12-31") || left.id - right.id);
        localReply = ongoing.length
          ? `مصوبه‌های در حال پیگیری یا دارای تأخیر: ${ongoing.length} مورد.\n` + ongoing.slice(0, 20).map(item => {
              const status = personalStatusOf(item);
              const subject = item.text.replace(/\s+/g, " ").trim();
              const due = item.dueDate ? formatDate(item.dueDate, item.dueDateJalali?.replace(/\./g, "/")) : "تعیین نشده";
              return `• مصوبه ${item.number} · ${subject.slice(0, 100)}${subject.length > 100 ? "…" : ""} · ${labels[status] || status} · سررسید: ${due}`;
            }).join("\n") + (ongoing.length > 20 ? `\nو ${ongoing.length - 20} مصوبهٔ دیگر.` : "")
          : "در حال حاضر مصوبه‌ای با وضعیت «در حال پیگیری» یا «دارای تأخیر» ندارید.";
      }
      if (localReply === null && promptMatches("مصوبه‌های عقب‌افتادهٔ من کدام‌اند؟")) {
        const overdue = mine
          .filter(item => !item.isArchived && item.dueDate && item.dueDate < today() && !["completed", "cancelled"].includes(personalStatusOf(item)))
          .sort((left, right) => (left.dueDate || "").localeCompare(right.dueDate || "") || left.id - right.id);
        localReply = overdue.length
          ? `مصوبه‌های عقب‌افتادهٔ شما: ${overdue.length} مورد.\n` + overdue.slice(0, 20).map(item => {
              const subject = item.text.replace(/\s+/g, " ").trim();
              const status = personalStatusOf(item);
              return `• مصوبه ${item.number} · ${subject.slice(0, 100)}${subject.length > 100 ? "…" : ""} · مهلت: ${formatDate(item.dueDate!, item.dueDateJalali?.replace(/\./g, "/"))} · ${labels[status] || status}`;
            }).join("\n") + (overdue.length > 20 ? `\nو ${overdue.length - 20} مصوبهٔ دیگر.` : "")
          : "مصوبهٔ عقب‌افتاده‌ای در کارتابل شما نیست.";
      }
      if (localReply === null && promptMatches("کدام گزارش‌های من هنوز تأیید نشده‌اند؟")) {
        const pendingReports = mine.filter(item => {
          const personal = item.progress?.find(progress => progress.nationalId === viewerId);
          return !item.isArchived && personal?.approvalStatus === "pending";
        }).sort((left, right) => left.id - right.id);
        localReply = pendingReports.length
          ? `گزارش‌های در انتظار تأیید شما: ${pendingReports.length} مورد.\n` + pendingReports.slice(0, 20).map(item => {
              const personal = item.progress?.find(progress => progress.nationalId === viewerId);
              const subject = item.text.replace(/\s+/g, " ").trim();
              return `• مصوبه ${item.number} · ${subject.slice(0, 100)}${subject.length > 100 ? "…" : ""}${personal?.reportText?.trim() ? ` · گزارش: ${personal.reportText.replace(/\s+/g, " ").trim().slice(0, 120)}` : ""}`;
            }).join("\n") + (pendingReports.length > 20 ? `\nو ${pendingReports.length - 20} گزارش دیگر.` : "")
          : "گزارشی در انتظار تأیید برای شما ثبت نشده است.";
      }
      if (localReply === null && promptMatches("این هفته چه سررسیدهایی دارم؟")) {
        const todayDate = new Date(`${today()}T00:00:00Z`);
        const endOfWeek = new Date(todayDate);
        endOfWeek.setUTCDate(endOfWeek.getUTCDate() + (5 - todayDate.getUTCDay() + 7) % 7);
        const todayKey = todayDate.toISOString().slice(0, 10);
        const weekEndKey = endOfWeek.toISOString().slice(0, 10);
        const thisWeekDeadlines = mine
          .filter(item => !item.isArchived && item.dueDate && item.dueDate >= todayKey && item.dueDate <= weekEndKey && !["completed", "cancelled"].includes(personalStatusOf(item)))
          .sort((left, right) => (left.dueDate || "").localeCompare(right.dueDate || "") || left.id - right.id);
        localReply = thisWeekDeadlines.length
          ? `سررسیدهای باقی‌ماندهٔ این هفته: ${thisWeekDeadlines.length} مورد (تا ${formatDate(weekEndKey)}).\n` + thisWeekDeadlines.slice(0, 20).map(item => {
              const subject = item.text.replace(/\s+/g, " ").trim();
              const status = personalStatusOf(item);
              return `• مصوبه ${item.number} · ${subject.slice(0, 100)}${subject.length > 100 ? "…" : ""} · سررسید: ${formatDate(item.dueDate!, item.dueDateJalali?.replace(/\./g, "/"))} · ${labels[status] || status}`;
            }).join("\n") + (thisWeekDeadlines.length > 20 ? `\nو ${thisWeekDeadlines.length - 20} مصوبهٔ دیگر.` : "")
          : "تا پایان این هفته سررسیدی برای مصوبه‌های فعال شما ثبت نشده است.";
      }
      if (localReply === null && promptMatches("مصوبه‌های انجام‌شدهٔ من را نشان بده")) {
        const completedItems = mine
          .filter(item => !item.isArchived && personalStatusOf(item) === "completed")
          .sort((left, right) => (right.updatedAt || "").localeCompare(left.updatedAt || "") || left.id - right.id);
        localReply = completedItems.length
          ? `مصوبه‌های انجام‌شدهٔ شما: ${completedItems.length} مورد.\n` + completedItems.slice(0, 20).map(item => {
              const subject = item.text.replace(/\s+/g, " ").trim();
              return `• مصوبه ${item.number} · ${subject.slice(0, 100)}${subject.length > 100 ? "…" : ""} · جلسه: ${item.meetingTitle || formatDate(item.meetingDate, item.meetingDateJalali?.replace(/\./g, "/"))}`;
            }).join("\n") + (completedItems.length > 20 ? `\nو ${completedItems.length - 20} مصوبهٔ دیگر.` : "")
          : "مصوبهٔ انجام‌شده‌ای در کارتابل شما ثبت نشده است.";
      }
      if (localReply !== null) {
        await new Promise(resolve => window.setTimeout(resolve, 700));
        setAssistantMessages(current => [...current, { role: "assistant", content: localReply! }]);
        return;
      }
      const response = await fetchApi("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, history })
      });
      const result = await response.json().catch(() => ({}));
      if (response.status === 401) throw new Error("نشست شما منقضی شده است؛ دوباره وارد سامانه شوید و پرسش را تکرار کنید.");
      if (!response.ok) throw new Error(result?.detail || result?.error || "پاسخ دستیار دریافت نشد.");
      setAssistantMessages(current => [...current, { role: "assistant", content: result.reply || "پاسخی دریافت نشد." }]);
    } catch (cause) {
      setAssistantError(cause instanceof Error ? cause.message : "ارتباط با دستیار برقرار نشد.");
    } finally {
      setAssistantSending(false);
      window.setTimeout(() => assistantEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);
    }
  }
  async function request(url: string, method: string, body?: unknown) {
    setBusy(true); setMessage("");
    try {
      const response = await fetchApi(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      const result = response.status === 204 ? null : await response.json();
      if (!response.ok) throw new Error(result?.error || "عملیات انجام نشد.");
      setMessage("عملیات با موفقیت انجام شد."); await load(); if (tab === "reports" && (reportMainTab === "actions" || reportMainTab === "resolution" || reportMainTab === "special")) { submissionsFetchStarted.current = false; setSubmissionsLoaded(false); setReportsRetryCount(count => count + 1); } else if (tab === "reports" && reportMainTab === "overview") { summaryFetchStarted.current = false; setReportsLoaded(false); setReportsRetryCount(count => count + 1); } return true;
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "خطا در ذخیره اطلاعات"); return false; }
    finally { setBusy(false); }
  }
  async function editUserTitle(user: { nationalId: string; displayName: string; title?: string; organizationUnit?: string }) {
    const title = window.prompt(`عنوان پست ${user.displayName} را وارد کنید:`, user.title ?? "");
    if (title === null) return;
    await request(`/api/users/${encodeURIComponent(user.nationalId)}/profile`, "PATCH", { title, organizationUnit: user.organizationUnit ?? "" });
  }
  async function toggleBrowserPush() {
    if (!authUser) return;
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setMessage("این مرورگر اعلان Push را پشتیبانی نمی‌کند.");
      return;
    }
    setPushBusy(true);
    try {
      const registration = await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
      let subscription = await registration.pushManager.getSubscription();
      if (subscription && pushEnabled) {
        const response = await fetchApi("/api/push/subscriptions?endpoint=" + encodeURIComponent(subscription.endpoint), { method: "DELETE", credentials: "include" });
        if (!response.ok) throw new Error("لغو اشتراک اعلان مرورگر انجام نشد.");
        await subscription.unsubscribe();
        setPushEnabled(false);
        setMessage("اعلان مرورگر غیرفعال شد.");
        return;
      }
      const permission = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission !== "granted") throw new Error("مجوز اعلان مرورگر داده نشد.");
      const keyResponse = await fetchApi("/api/push/public-key", { credentials: "include" });
      const keyResult = await keyResponse.json();
      if (!keyResponse.ok || !keyResult.publicKey) throw new Error(keyResult.detail || keyResult.error || "کلید عمومی Push روی سرور تنظیم نشده است.");
      const base64 = String(keyResult.publicKey).replace(/-/g, "+").replace(/_/g, "/");
      const padded = base64 + "=".repeat((4 - base64.length % 4) % 4);
      const binary = atob(padded);
      const applicationServerKey = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) applicationServerKey[index] = binary.charCodeAt(index);
      subscription = subscription || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey });
      const response = await fetchApi("/api/push/subscriptions", { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(subscription) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "ذخیره اشتراک اعلان مرورگر انجام نشد.");
      setPushEnabled(true);
      setMessage("اعلان مرورگر برای این دستگاه فعال شد.");
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : "";
      if (detail.toLowerCase().includes("push service error") || detail.toLowerCase().includes("push service not available")) {
        setMessage("مرورگر نتوانست به سرویس Push خود متصل شود. با Chrome یا Edge در حالت عادی (نه ناشناس) امتحان کنید و دسترسی مرورگر به اینترنت و سرویس اعلان آن را بررسی کنید.");
      } else {
        setMessage(detail || "فعال‌سازی اعلان مرورگر انجام نشد.");
      }
    } finally {
      setPushBusy(false);
    }
  }

  async function editMyMobile() {
    if (!authUser) return;
    const mobile = window.prompt("شماره موبایل خود را وارد کنید:", authUser.mobile ?? "");
    if (mobile === null) return;
    if (await request(`/api/users/${encodeURIComponent(authUser.nationalId)}/mobile`, "PATCH", { mobile })) {
      const response = await fetch("/api/auth/me", { credentials: "include", cache: "no-store" });
      if (response.ok) setAuthUser(await response.json() as AuthUser);
    }
  }
  function openCreateResolution(meeting?: MeetingOption, isSpecialTracking = false, specialTrackingType: "minister" | "provincial" = "minister") {
    setResolutionFormError(""); setEditingResolutionId(null); setPeopleQuery(""); setResolutionFiles([]); setEditingResolutionHashes([]); setResolutionEventDraft("");
    const meetingDate=meeting?.date??today();const startDate=isSpecialTracking?meetingDate:meeting&&tomorrow()<meetingDate?meetingDate:tomorrow();
    const meetingId=meeting?String(meeting.id):"";
    setMeetingPickerQuery(isSpecialTracking?specialTrackingLabel(specialTrackingType):meeting?.title??"");setMeetingPickerOpen(false);
    setForm({ meetingId, meetingDate, meetingDateJalali: meeting?.dateJalali||gregorianToJalali(meetingDate), number: "", text: "", notes: "", isConfidential: false, isSpecialTracking, specialTrackingType, province: "", ministerCategory: "", groupIds: [], unitIds: [], people: [], publishToAll: false, startDate, startDateJalali: startDate===meetingDate?(meeting?.dateJalali||gregorianToJalali(startDate)):gregorianToJalali(startDate), dueDate: "", dueDateJalali: "", requiresPeriodicReport: false, reportFrequency: "weekly" });
    setModalOpen(true);
  }
  function openEditResolution(item: Resolution) {
    setResolutionFormError(""); setEditingResolutionId(item.id); setPeopleQuery(""); setResolutionFiles([]); setEditingResolutionHashes((item.attachments||[]).map(file=>file.contentHash||"").filter(Boolean)); setResolutionEventDraft("");
    const groupIds=Array.from(new Set([...(item.groupAssignments??[]).map(assignment=>assignment.groupId),...(item.groupId?[item.groupId]:[])].filter(id=>isResolutionGroup(groups.find(group=>group.id===id)?.name??"",groups.find(group=>group.id===id)?.category)).map(String)));
    const unitIds=Array.from(new Set([...(item.groupAssignments??[]).map(assignment=>assignment.groupId),...(item.groupId?[item.groupId]:[])].filter(id=>{const group=groups.find(group=>group.id===id);return !!group&&!isResolutionGroup(group.name,group.category)&&!isIndividualRecipientGroup(group.name);}).map(String)));
    const covered=unitCoveredPersonIds(unitIds);
    const people=Array.from(new Set(item.assignments?.map(assignment=>assignment.nationalId)??[])).filter(id=>!covered.has(id));
    const meeting=meetings.find(entry=>entry.id===item.meetingId);
    setMeetingPickerQuery(meeting?.title??"");setMeetingPickerOpen(false);
    setForm({ meetingId:item.meetingId?String(item.meetingId):"", meetingDate:item.meetingDate, meetingDateJalali:item.meetingDateJalali||gregorianToJalali(item.meetingDate), number:item.number, text:item.text, notes:item.notes, isConfidential:item.isConfidential??false, isSpecialTracking:item.isSpecialTracking??false, specialTrackingType:item.specialTrackingType==="provincial"?"provincial":"minister", province:item.province??"", ministerCategory:item.ministerCategory??"", groupIds, unitIds, people, startDate:item.startDate??item.meetingDate, startDateJalali:item.startDateJalali||gregorianToJalali(item.startDate??item.meetingDate), dueDate:item.dueDate??"", dueDateJalali:item.dueDateJalali??"", requiresPeriodicReport:item.requiresPeriodicReport??false, reportFrequency:item.reportFrequency||"weekly", publishToAll:item.publishToAll??false });
    setModalOpen(true);
  }
  const dateValidationError = form.meetingDate && form.startDate && form.meetingDate > form.startDate ? (form.isSpecialTracking ? (form.specialTrackingType==="provincial"?"تاریخ سفر نباید بعد از زمان شروع باشد.":"تاریخ درخواست نباید بعد از زمان شروع باشد.") : "تاریخ جلسه نباید بعد از زمان شروع باشد.") : form.dueDate && form.startDate && form.dueDate <= form.startDate ? "زمان سررسید باید بعد از زمان شروع باشد." : "";
  async function createResolution() {
    if (!form.isSpecialTracking && !form.meetingId) { setResolutionFormError("جلسه مرتبط را انتخاب کنید."); return; }
    if (form.isSpecialTracking && form.specialTrackingType === "provincial" && !form.province.trim()) { setResolutionFormError("استان سفر را انتخاب کنید."); return; }
    if (form.groupIds.length+form.unitIds.length+form.people.length===0) { setResolutionFormError("حداقل یک گروه، معاونت، اداره‌کل یا فرد را برای ارجاع انتخاب کنید."); return; }
    if (dateValidationError) { setResolutionFormError(dateValidationError); return; }
    setResolutionFormError("");
    setBusy(true); setMessage("");
    const existingId=editingResolutionId;
    const url=existingId?"/api/resolutions/"+existingId:"/api/resolutions";
    try {
      const response=await fetchApi(url,{method:existingId?"PUT":"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({...form,status:"before",cancellationReason:"",meetingId:form.isSpecialTracking?null:Number(form.meetingId),isSpecialTracking:form.isSpecialTracking,meetingDate:form.meetingDate,groupId:form.groupIds.length?Number(form.groupIds[0]):null,groupIds:[...form.groupIds,...form.unitIds].map(Number),people:form.people,publishToAll:form.publishToAll,dueDate:form.dueDate||null,dueDateJalali:form.dueDateJalali,startDate:form.startDate||null,startDateJalali:form.startDateJalali,requiresPeriodicReport:form.requiresPeriodicReport,reportFrequency:form.reportFrequency})});
      const result=response.status===204?null:await response.json();
      if(!response.ok)throw new Error(result?.error||"ذخیره مصوبه انجام نشد.");
      const resolutionId=existingId??result?.id;
      if(!resolutionId)throw new Error("مصوبه ذخیره شد، اما شناسه آن دریافت نشد.");
      setEditingResolutionId(resolutionId);
      for(const file of resolutionFiles){const data=new FormData();data.append("file",file);const attached=await fetchApi(`/api/resolutions/${resolutionId}/attachments`,{method:"POST",credentials:"include",body:data});const attachmentResult=attached.status===204?null:await attached.json();if(!attached.ok)throw new Error(attachmentResult?.error||"بارگذاری یکی از پیوست‌ها انجام نشد.");}
      if(resolutionEventDraft.trim()){const eventResponse=await fetchApi(`/api/resolutions/${resolutionId}/events`,{method:"POST",credentials:"include",headers:{"Content-Type":"application/json"},body:JSON.stringify({text:resolutionEventDraft.trim(),nationalId:viewerId,userName:authUser?.displayName||""})});const eventResult=await eventResponse.json();if(!eventResponse.ok)throw new Error(eventResult?.error||"ثبت رویداد انجام نشد.");}
      setModalOpen(false);setEditingResolutionId(null);setResolutionFiles([]);setEditingResolutionHashes([]);setResolutionEventDraft("");setMessage("مصوبه و موارد پیوست‌شده ذخیره شد.");
      const listResponse=await fetchApi("/api/resolutions",{credentials:"include",cache:"no-store"});if(listResponse.ok){const fresh=asArray<Resolution>(await listResponse.json());setResolutions(fresh);setDashboard(current=>current?{...current,resolutions:fresh}:current);}
    } catch(cause) { const text=cause instanceof Error?cause.message:"ذخیره مصوبه انجام نشد.";setResolutionFormError(text);setMessage(text); }
    finally { setBusy(false); }
  }
  async function updateResolutionStatus(resolutionId: number, status: string, nationalId?: string) {
    if (!isAdmin && !["completed", "in_progress"].includes(status)) { setMessage("فقط می‌توانید وضعیت خودتان را اجرا شده یا در حال پیگیری بگذارید."); return; }
    if (isAdmin && nationalId && !["completed", "rejected", "in_progress"].includes(status)) { setMessage("وضعیت فرد باید اجرا شده، رد شده یا در حال پیگیری باشد."); return; }
    if (isAdmin && !nationalId && status === "cancelled") {
      const reason = window.prompt("توضیح لغو مصوبه را وارد کنید (اجباری):");
      if (!reason?.trim()) { setMessage("برای لغو مصوبه، توضیحات الزامی است."); return; }
      await request("/api/resolutions/" + resolutionId + "/status", "PATCH", { status, notes: reason.trim() });
      return;
    }
    await request("/api/resolutions/" + resolutionId + "/status", "PATCH", { status, ...(nationalId ? { nationalId } : {}) });
  }
  async function submitPeriodicReport(resolutionId: number) {
    const text = periodicDrafts[resolutionId]?.trim();
    if (!text) { setMessage("متن گزارش را بنویسید."); return; }
    if (await request("/api/resolutions/" + resolutionId + "/reports", "POST", { text })) setPeriodicDrafts(current => ({ ...current, [resolutionId]: "" }));
  }
  async function exportBaleMessages() {
    try {
      const params = new URLSearchParams({ page: "1", pageSize: "5000", status: baleMessageStatus });
      if (baleMessageQuery.trim()) params.set("q", baleMessageQuery.trim());
      if (baleMessageFrom) params.set("from", baleMessageFrom);
      if (baleMessageTo) params.set("to", baleMessageTo);
      const response = await fetchApi(`/api/reports/bale-messages?${params.toString()}`, { credentials: "include" });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "گزارش ارسال‌های بله دریافت نشد.");
      const rows = [["نام گیرنده","موبایل","وضعیت ارسال","تعداد تلاش","زمان ثبت","زمان ارسال","متن پیام","آخرین خطا"], ...(result.items ?? []).map((item: BaleMessageReportItem) => [item.displayName,item.mobile,baleMessageStatusLabel(item.status),item.attempts,formatDateTime(item.createdAt),item.sentAt?formatDateTime(item.sentAt):"",item.text,item.lastError])];
      const csv = buildCsv(rows);
      const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
      const link = document.createElement("a"); link.href = url; link.download = "bale-message-report.csv"; link.click(); URL.revokeObjectURL(url);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "خروجی گزارش ارسال‌های بله آماده نشد."); }
  }
  function exportReportSubmissions() {
    const rows = [["نام فرد","شماره مصوبه","شناسه یکتا","نوع گزارش","دوره","تاریخ ارسال","متن گزارش"], ...filteredReportSubmissions.map(report => [report.userName, report.resolutionNumber, report.resolutionId, report.reportType === "periodic" ? "مستمر" : "اقدام/غیرمستمر", formatReportPeriod(report.periodKey), report.submittedAt, report.text])];
    const csv = buildCsv(rows);
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "resolution-reports.csv"; link.click(); URL.revokeObjectURL(url);
  }
  function printReportSubmissions() {
    const sheet = document.querySelector<HTMLElement>(".submitted-reports-print-sheet");
    if (!sheet) return;
    const hiddenSiblings: { element: HTMLElement; display: string }[] = [];
    let node: HTMLElement | null = sheet;
    while (node && node !== document.body) {
      const parentElement: HTMLElement | null = node.parentElement;
      if (parentElement) for (const child of Array.from(parentElement.children)) {
        if (child !== node && child instanceof HTMLElement) {
          hiddenSiblings.push({ element: child, display: child.style.display });
          child.style.display = "none";
        }
      }
      node = parentElement;
    }
    document.body.classList.add("print-submitted-reports");
    const cleanup = () => {
      document.body.classList.remove("print-submitted-reports");
      hiddenSiblings.forEach(({ element, display }) => { element.style.display = display; });
    };
    window.addEventListener("afterprint", cleanup, { once: true });
    window.print();
    window.setTimeout(cleanup, 1500);
  }
  async function createGroup() { if (await request("/api/groups", "POST", { name: groupName })) setGroupName(""); }
  async function addMember() {
    if (!selectedGroup) { setMessage("ابتدا گروه را انتخاب کنید."); return; }
    if (!selectedPerson) { setMessage("ابتدا یک شخص را از فهرست انتخاب کنید."); return; }
    if (await request(`/api/groups/${selectedGroup}/members/lookup`, "POST", { nationalId: selectedPerson.nationalId })) { setNationalId(""); setMemberSearch(""); setSelectedPerson(null); setMemberMatches([]); }
  }
  async function addUnitResponsible() {
    if (!selectedUnit) { setMessage("ابتدا معاونت یا واحد را انتخاب کنید."); return; }
    if (!selectedPerson) { setMessage("ابتدا مسئول را از فهرست انتخاب کنید."); return; }
    if (await request(`/api/groups/${selectedUnit}/members/lookup`, "POST", { nationalId: selectedPerson.nationalId })) {
      setNationalId(""); setMemberSearch(""); setSelectedPerson(null); setMemberMatches([]);
    }
  }
  async function deleteGroup(group: Group) {
    if (!window.confirm(`معاونت/واحد «${group.name}» حذف شود؟`)) return;
    setGroupDeleteError("");
    setBusy(true);
    try {
      const response = await fetchApi(`/api/groups/${group.id}`, { method: "DELETE" });
      const result = response.status === 204 ? null : await response.json();
      if (!response.ok) {
        const references = Array.isArray(result?.resolutions) ? result.resolutions as { id: number; number: string; text: string; meetingDate: string; meetingDateJalali?: string; isArchived: boolean; matchingGroupNames: string[]; groupNames: string[]; legacyReference: boolean; legacyGroupName: string }[] : [];
        const detail = references.length ? ` مصوبه‌های مرتبط: ${references.map(item => { const matched = item.matchingGroupNames?.join("، ") || (item.legacyReference ? item.legacyGroupName + " (ارجاع قدیمی)" : "نامشخص"); const otherGroups = item.groupNames?.filter(name => !item.matchingGroupNames?.includes(name)) ?? []; const text = (item.text || "").replace(/\s+/g, " ").slice(0, 90); return `#${item.number} [شناسه یکتا: ${item.id}]${item.isArchived ? " (بایگانی‌شده)" : ""} · تاریخ ${item.meetingDateJalali || item.meetingDate} · ارجاعِ مانع حذف: ${matched}${otherGroups.length ? " · سایر گروه‌ها: " + otherGroups.join("، ") : ""} · متن: ${text}`; }).join("؛ ")}.` : "";
        setGroupDeleteError((result?.error || "حذف گروه انجام نشد.") + detail);
        return;
      }
      setMessage("معاونت/واحد با موفقیت حذف شد.");
      await load();
    } catch (cause) {
      setGroupDeleteError(cause instanceof Error ? cause.message : "حذف گروه انجام نشد.");
    } finally {
      setBusy(false);
    }
  }
  async function sendResolutionWarnings(resolutionId: number, nationalIds: string[]): Promise<string[]> {
    if (!isAdmin || nationalIds.length === 0) return [];
    setBusy(true); setMessage("");
    try {
      const response = await fetchApi(`/api/resolutions/${resolutionId}/warnings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ nationalIds })
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "ارسال هشدار انجام نشد.");
      const failures = (result.results ?? []).filter((item: { queued: boolean; inApp: boolean }) => !item.queued && !item.inApp);
      const notQueued = (result.results ?? []).filter((item: { queued: boolean; inApp: boolean }) => !item.queued && item.inApp);
      const failureText = [...notQueued, ...failures].length ? ` نیازمند بررسی: ${[...notQueued, ...failures].map((item: { displayName: string; reason: string }) => item.displayName + " (" + item.reason + ")").join("، ")}` : "";
      setMessage(`${result.inAppNotifications} اعلان داخل سامانه ثبت شد و ${result.queued} پیام در صف ارسال بله قرار گرفت.` + failureText);
      const sentIds = (result.results ?? []).filter((item: { nationalId?: string; NationalId?: string; queued?: boolean; inApp?: boolean; Queued?: boolean; InApp?: boolean }) => item.queued || item.inApp || item.Queued || item.InApp).map((item: { nationalId?: string; NationalId?: string }) => item.nationalId ?? item.NationalId).filter((nationalId: string | undefined): nationalId is string => !!nationalId);
      const confirmedIds = sentIds.length ? sentIds : ((result.inAppNotifications ?? result.InAppNotifications ?? 0) > 0 || (result.queued ?? result.Queued ?? 0) > 0 ? nationalIds : []);
      if (confirmedIds.length) setSentWarningKeys(current => Array.from(new Set([...current, ...confirmedIds.map((nationalId: string) => `${resolutionId}:${nationalId}`)])));
      return confirmedIds;
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "ارسال هشدار انجام نشد.");
      return [];
    } finally { setBusy(false); }
  }
  async function sendDelayWarning(person: Report["people"][number]) {
    if (person.delayed === 0 && person.pending === 0) return;
    setBusy(true); setMessage("");
    try {
      const response = await fetchApi(`/api/reports/warnings/${encodeURIComponent(person.nationalId)}`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result?.error || "ارسال هشدار انجام نشد.");
      setMessage(result.queued ? `اعلان برای ${person.displayName} در سامانه ثبت و در صف ارسال بله قرار گرفت.` : result.reason || "اعلان در سامانه ثبت شد.");
      await load();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "ارسال هشدار انجام نشد.");
    } finally { setBusy(false); }
  }
  async function createDirectoryPerson() {
    if (await request("/api/users", "POST", { nationalId: newPerson.nationalId, firstName: newPerson.firstName, lastName: newPerson.lastName, title: newPerson.title, organizationUnit: newPerson.organizationUnit })) { setNewPerson({ nationalId: "", firstName: "", lastName: "", title: "", organizationUnit: "" }); await load(); }
  }
  async function searchMembers(value: string) {
    setMemberSearch(value); setSelectedPerson(null); setMemberSearchMessage("");
    const term = value.trim(); const sequence = ++memberSearchSequence.current;
    if (term.length < 2) { setMemberMatches([]); setMemberSearchMessage("برای جستجو حداقل ۲ حرف یا رقم وارد کنید."); return; }
    setMemberSearching(true);
    try {
      const response = await fetchApi(`/api/users/search?q=${encodeURIComponent(term)}`);
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

  const filtered = useMemo(() => {
    const term=normalizeSearchText(toLatinDigits(query));
    const personTerm=normalizeSearchText(toLatinDigits(resolutionPersonFilter));
    return resolutions.filter(item=>{
      if(item.isArchived)return false;
      if(resolutionDateFrom&&item.meetingDate<resolutionDateFrom)return false;
      if(resolutionDateTo&&item.meetingDate>resolutionDateTo)return false;
      if(resolutionMeetingFilter&&String(item.meetingId||"")!==resolutionMeetingFilter)return false;
      if(resolutionConfidentialFilter==="confidential"&&!item.isConfidential)return false;
      if(resolutionConfidentialFilter==="ordinary"&&item.isConfidential)return false;
      if(resolutionTypeFilter==="special"&&!item.isSpecialTracking)return false;
      if(resolutionTypeFilter==="standard"&&item.isSpecialTracking)return false;
      if(resolutionStatusFilter!=="all"&&item.status!==resolutionStatusFilter)return false;
      const meeting=meetings.find(entry=>entry.id===item.meetingId);
      const groupIds=new Set([...(item.groupAssignments||[]).map(entry=>entry.groupId),...(item.groupId?[item.groupId]:[])]);
      const relatedIds=new Set([...(item.assignments||[]).map(entry=>entry.nationalId),...(item.progress||[]).map(entry=>entry.nationalId),...groups.filter(group=>groupIds.has(group.id)).flatMap(group=>group.members.map(member=>member.nationalId))]);
      const relatedPeople=users.filter(person=>relatedIds.has(person.nationalId));
      const peopleText=relatedPeople.map(person=>person.displayName+" "+(person.title||"")+" "+person.nationalId).join(" ");
      const progressText=(item.progress||[]).map(progress=>progress.reportText+" "+progress.notes+" "+progress.adminFeedback).join(" ");
      const eventsText=(item.events||[]).map(event=>event.userName+" "+event.text).join(" ");
      const attachmentText=(item.attachments||[]).map(file=>file.originalName+" "+file.uploaderName).join(" ");
      const savedReports=reportSubmissions.filter(report=>report.resolutionId===item.id);
      const reportText=savedReports.map(report=>report.text+" "+report.userName+" "+report.userTitle+" "+report.approvalStatus).join(" ");
      const hasReport=!!item.hasSubmittedReport||savedReports.length>0||(item.progress||[]).some(progress=>!!progress.reportText?.trim());
      if(resolutionReportFilter==="has"&&!hasReport)return false;
      if(resolutionReportFilter==="missing"&&hasReport)return false;
      if(personTerm&&!normalizeSearchText(peopleText).includes(personTerm))return false;
      const haystack=normalizeSearchText(toLatinDigits([item.id,item.number,item.text,item.notes,item.status,item.meetingDate,item.meetingDateJalali,meeting?.title,item.meetingTitle,meeting?.guestText,peopleText,progressText,eventsText,attachmentText,reportText].join(" ")));
      return !term||haystack.includes(term);
    });
  },[resolutions,query,resolutionDateFrom,resolutionDateTo,resolutionMeetingFilter,resolutionPersonFilter,resolutionReportFilter,resolutionConfidentialFilter,resolutionTypeFilter,resolutionStatusFilter,meetings,users,groups,reportSubmissions]);
  const sortedFiltered = useMemo(() => {
    const collator = new Intl.Collator("fa", { numeric: true, sensitivity: "base" });
    const valueFor = (item: Resolution) => {
      const meeting = meetings.find(entry => entry.id === item.meetingId);
      switch (resolutionSort.key) {
        case "meetingTitle": return meeting?.title ?? "";
        case "meetingDate": return item.meetingDate ?? "";
        case "number": return item.number ?? "";
        case "text": return item.text ?? "";
        case "assignment": return resolutionRoutingLabel(item, groups, users);
        case "dueDate": return item.dueDate ?? "";
        case "status": return labels[item.status] ?? item.status;
      }
    };
    return [...filtered].sort((left, right) => {
      const comparison = resolutionSort.key === "meetingDate" || resolutionSort.key === "dueDate"
        ? String(valueFor(left) ?? "").localeCompare(String(valueFor(right) ?? ""))
        : collator.compare(String(valueFor(left) ?? ""), String(valueFor(right) ?? ""));
      return (resolutionSort.direction === "desc" ? -1 : 1) * comparison || right.id - left.id;
    });
  }, [filtered, meetings, groups, users, resolutionSort]);
  const toggleResolutionSort = (key: typeof resolutionSort.key) => {
    setResolutionPage(1);
    setResolutionSort(current => current.key === key
      ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
      : { key, direction: key === "meetingDate" ? "desc" : "asc" });
  };
  const sortIndicator = (key: typeof resolutionSort.key) => resolutionSort.key !== key ? " ↕" : resolutionSort.direction === "asc" ? " ▲" : " ▼";
  const pageSize = resolutionPageSize;
  const pageCount = Math.max(1, Math.ceil(sortedFiltered.length / pageSize));
  const pageRows = useMemo(() => sortedFiltered.slice((resolutionPage - 1) * pageSize, resolutionPage * pageSize), [sortedFiltered, resolutionPage, pageSize]);
  const assignmentTerm = normalizeSearchText(peopleQuery);
  const allAssignmentOptions = useMemo<AssignmentOption[]>(() => {
    const options: AssignmentOption[] = [];
    for (const group of asGroups(groups)) {
      if (isIndividualRecipientGroup(group.name)) continue;
      if (isResolutionGroup(group.name, group.category)) {
        options.push({ key: `group:${group.id}`, kind: "group", label: groupDisplayName(group.name), detail: `گروه · ${group.members.length} عضو`, groupId: group.id });
      } else {
        options.push({ key: `unit:${group.id}`, kind: "unit", label: group.name, detail: group.members.length ? `معاونت/اداره‌کل · ${group.members.length} مسئول` : "معاونت/اداره‌کل · مسئول ثبت نشده", groupId: group.id });
      }
    }
    const groupMemberIds = new Set(asGroups(groups).flatMap(group => asArray<Member>(group.members).map(member => member.nationalId)));
    const postOptions = new Map<string, AssignmentOption>();
    for (const user of users) {
      const rawTitle = user.title?.trim() || "";
      if (!rawTitle || /^(عضو|کاربر)(\s|$)/.test(rawTitle)) continue;
      const isManagerOrUnitLead = /مدیر\s*کل|معاون|رئیس|سرپرست/.test(rawTitle);
      if (!groupMemberIds.has(user.nationalId) && !isManagerOrUnitLead) continue;
      const title = rawTitle.replace(/^مدیرکل\s+(?:استان|شهر)\s+/, "مدیرکل ").replace(/^مدیر\s+کل\s+(?:استان|شهر)\s+/, "مدیرکل ");
      const key = `post:${user.nationalId}`;
      const detail = [displayLocation(user.organizationUnit), displayLocation(user.province)].filter(Boolean).join(" · ") || "پست ثبت‌شده در فهرست کاربران";
      postOptions.set(key, { key, kind: "post", label: `${title} (${user.displayName})`, detail: `پست مسئول · ${detail}`, nationalId: user.nationalId });
    }
    options.push(...postOptions.values());
    return options;
  }, [groups, users]);
  const assignmentOptions = useMemo(() => assignmentTerm.length < 2 ? [] : allAssignmentOptions.filter(option => normalizeSearchText(`${option.label} ${option.detail}`).includes(assignmentTerm)), [allAssignmentOptions, assignmentTerm]);
  const unitCoveredPersonIds = (unitIds: string[]) => {
    const selectedUnits = groups.filter(group => unitIds.includes(String(group.id)));
    const ids = selectedUnits.flatMap(group => group.members.map(member => member.nationalId));
    for (const user of users) if (selectedUnits.some(group => normalizeSearchText(group.name) === normalizeSearchText(user.organizationUnit || ""))) ids.push(user.nationalId);
    return new Set(ids);
  };
  const isAssignmentOptionSelected = (option: AssignmentOption) => option.kind === "group" ? form.groupIds.includes(String(option.groupId)) : option.kind === "unit" ? form.unitIds.includes(String(option.groupId)) : form.people.includes(option.nationalId || "") && !unitCoveredPersonIds(form.unitIds).has(option.nationalId || "");
  function toggleAssignmentOption(option: AssignmentOption, checked: boolean) {
    if (option.kind === "post" && checked && unitCoveredPersonIds(form.unitIds).has(option.nationalId || "")) { setResolutionFormError("این فرد در معاونت یا واحد انتخاب‌شده قرار دارد؛ ارجاع به معاونت ملاک است."); return; }
    setForm(current => {
      if (option.kind === "group") return { ...current, groupIds: checked ? Array.from(new Set([...current.groupIds, String(option.groupId)])) : current.groupIds.filter(id => id !== String(option.groupId)) };
      if (option.kind === "unit") {
        const unitIds = checked ? Array.from(new Set([...current.unitIds, String(option.groupId)])) : current.unitIds.filter(id => id !== String(option.groupId));
        const covered = unitCoveredPersonIds(unitIds);
        return { ...current, unitIds, people: current.people.filter(id => !covered.has(id)) };
      }
      return { ...current, people: checked ? Array.from(new Set([...current.people, option.nationalId || ""])) : current.people.filter(id => id !== option.nationalId) };
    });
    setResolutionFormError("");
  }
  const selectedAssignmentOptions = allAssignmentOptions.filter(isAssignmentOptionSelected);
  const filteredRoleUsers = useMemo(() => { const code = adminUserQuery.replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit))).replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit))).replace(/\D/g, ""); return code.length >= 8 ? users.filter(user => user.nationalId === code) : []; }, [users,adminUserQuery]);
  useEffect(() => { setResolutionPage(1); }, [query,resolutionDateFrom,resolutionDateTo,resolutionMeetingFilter,resolutionPersonFilter,resolutionReportFilter,resolutionStatusFilter]);
  useEffect(() => { if (resolutionPage > pageCount) setResolutionPage(pageCount); }, [resolutionPage, pageCount]);
  const reportPeople = useMemo(() => (reports?.people ?? []).map(person => ({
    ...person,
    title: person.title?.trim() || getFallbackPersonTitle(person.nationalId, groups, users)
  })), [reports, groups, users]);
  const filteredReportPeople = useMemo(() => {
    const term = normalizeSearchText(reportQuery);
    return reportPeople.filter(person => {
      const matchesStatus = reportPersonStatusFilter === "all" ||
        reportPersonStatusFilter === "completed" && person.completed > 0 ||
        reportPersonStatusFilter === "pending" && person.pending > 0 ||
        reportPersonStatusFilter === "delayed" && person.delayed > 0;
      const matchesTerm = !term || normalizeSearchText(`${person.displayName} ${person.title} ${person.nationalId}`).includes(term);
      return matchesStatus && matchesTerm;
    });
  }, [reportPeople, reportQuery, reportPersonStatusFilter]);
  const filteredReportSubmissions = useMemo(() => { const term = normalizeSearchText(reportSubmissionQuery); return reportSubmissions.filter(report => !term || normalizeSearchText(`${report.userName} ${report.resolutionId} ${report.resolutionNumber} ${report.resolutionText} ${report.text} ${report.periodKey}`).includes(term)); }, [reportSubmissions, reportSubmissionQuery]);
  const eventReportItems = useMemo(() => {
    const term = normalizeSearchText(eventReportQuery);
    return resolutions.flatMap(item => (item.events ?? []).filter(entry => isAdmin || /گزارش/u.test(entry.text)).map(entry => ({ ...entry, resolutionId: item.id, resolutionNumber: item.number, resolutionText: item.text })))
      .filter(entry => {
        const day = entry.createdAt.slice(0, 10);
        const matchesTerm = !term || normalizeSearchText(`${entry.userName} ${entry.resolutionId} ${entry.resolutionNumber} ${entry.resolutionText} ${entry.text}`).includes(term);
        return matchesTerm && (!eventReportFrom || day >= eventReportFrom) && (!eventReportTo || day <= eventReportTo);
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt) || b.id - a.id);
  }, [resolutions, eventReportQuery, eventReportFrom, eventReportTo]);
  const eventReportPageCount = Math.max(1, Math.ceil(eventReportItems.length / eventReportPageSize));
  const pagedEventReportItems = useMemo(() => eventReportItems.slice((eventReportPage - 1) * eventReportPageSize, eventReportPage * eventReportPageSize), [eventReportItems, eventReportPage, eventReportPageSize]);
  useEffect(() => { setEventReportPage(1); }, [eventReportQuery, eventReportFrom, eventReportTo, eventReportPageSize]);
  useEffect(() => { if (eventReportPage > eventReportPageCount) setEventReportPage(eventReportPageCount); }, [eventReportPage, eventReportPageCount]);
  const reportPageSize = 10;
  const reportPageCount = Math.max(1, Math.ceil(filteredReportPeople.length / reportPageSize));
  const pagedReportPeople = useMemo(() => filteredReportPeople.slice((reportPage - 1) * reportPageSize, reportPage * reportPageSize), [filteredReportPeople, reportPage]);
  useEffect(() => { if (reportPage > reportPageCount) setReportPage(reportPageCount); }, [reportPage, reportPageCount]);
  const reportMax = Math.max(1, ...pagedReportPeople.map(person => person.total));
  const attendanceByPerson = useMemo(() => {
    const totals = new Map<string, { total: number; present: number; absent: number }>();
    for (const meeting of meetings) for (const attendee of meeting.attendees ?? []) {
      const current = totals.get(attendee.nationalId) ?? { total: 0, present: 0, absent: 0 };
      current.total++;
      if (attendee.isPresent) current.present++; else current.absent++;
      totals.set(attendee.nationalId, current);
    }
    return totals;
  }, [meetings]);
  const attendanceStatsFor = (nationalIds: string[]) => Array.from(new Set(nationalIds)).reduce((total, nationalId) => {
    const value = attendanceByPerson.get(nationalId);
    if (value) { total.total += value.total; total.present += value.present; total.absent += value.absent; }
    return total;
  }, { total: 0, present: 0, absent: 0 });
  const mine = dashboard?.resolutions ?? [];
  const userMeetingOptions = resolutions.reduce<{ id: number; title: string }[]>((items, item) => {
    if (typeof item.meetingId === "number" && !items.some(option => option.id === item.meetingId)) items.push({ id: item.meetingId, title: item.meetingTitle || `جلسه ${item.meetingDateJalali || formatDate(item.meetingDate)}` });
    return items;
  }, []);
  const wallStatusOf = (item: Resolution) => isAdmin ? item.status : item.progress?.find(progress=>progress.nationalId===viewerId)?.status ?? item.status;
  const reminderEndDate = (() => { const date=new Date(`${today()}T12:00:00`); date.setDate(date.getDate()+7); return localDateKey(date); })();
  const deadlineReminders = useMemo(() => mine.filter(item => { const status=wallStatusOf(item); const due=item.dueDate?.slice(0,10)||""; return due && due<=reminderEndDate && !["completed","cancelled","rejected"].includes(status); }).sort((left,right)=>(left.dueDate||"").localeCompare(right.dueDate||"")).slice(0,12), [mine,isAdmin,viewerId,reminderEndDate]);
  const userSummaryItems = mine.filter(item => !item.isArchived && wallStatusOf(item) !== "cancelled");
  const userSummary = {
    total: userSummaryItems.length,
    completed: userSummaryItems.filter(item => wallStatusOf(item) === "completed").length,
    delayed: userSummaryItems.filter(item => wallStatusOf(item) === "delayed").length,
    active: userSummaryItems.filter(item => ["before", "in_progress"].includes(wallStatusOf(item))).length,
    reportsToReview: userSummaryItems.filter(item => {
      const progress = item.progress?.find(entry => entry.nationalId === viewerId);
      return !!progress?.reportText?.trim() && ["pending", "rejected"].includes(progress.approvalStatus || "");
    }).length
  };
  const userSummaryPercent = userSummary.total ? Math.round(userSummary.completed * 100 / userSummary.total) : 0;
  const userAttentionItems = useMemo(() => {
    const now = Date.parse(`${today()}T12:00:00`);
    return mine.filter(item => !item.isArchived && wallStatusOf(item) !== "cancelled")
      .map(item => {
        const status = wallStatusOf(item);
        const due = item.dueDate?.slice(0, 10) || "";
        const dueAt = due ? Date.parse(`${due}T12:00:00`) : NaN;
        const days = Number.isFinite(dueAt) ? Math.ceil((dueAt - now) / 86400000) : null;
        const progress = item.progress?.find(entry => entry.nationalId === viewerId);
        const reasons: string[] = [];
        if (status === "delayed" || (days !== null && days < 0 && !["completed", "rejected"].includes(status))) reasons.push("مهلت گذشته");
        else if (days !== null && days <= 7 && !["completed", "rejected"].includes(status)) reasons.push(days === 0 ? "مهلت امروز" : "مهلت نزدیک");
        if (progress?.approvalStatus === "rejected" && progress.reportText?.trim()) reasons.push("گزارش نیازمند اصلاح");
        else if (progress?.approvalStatus === "pending" && progress.reportText?.trim()) reasons.push("گزارش در انتظار بررسی");
        const updatedAt = progress?.updatedAt ? Date.parse(progress.updatedAt) : NaN;
        if (status === "in_progress" && Number.isFinite(updatedAt) && now - updatedAt >= 14 * 86400000) reasons.push("بدون به‌روزرسانی در دو هفتهٔ اخیر");
        return reasons.length ? { item, reasons, days } : null;
      }).filter((entry): entry is { item: Resolution; reasons: string[]; days: number | null } => entry !== null)
      .sort((left, right) => {
        const priority = (entry: typeof left) => entry.reasons.includes("مهلت گذشته") ? 0 : entry.reasons.includes("گزارش نیازمند اصلاح") ? 1 : entry.days !== null && entry.days <= 7 ? 2 : 3;
        return priority(left) - priority(right) || (left.days ?? 9999) - (right.days ?? 9999);
      }).slice(0, 8);
  }, [mine, viewerId, reminderEndDate]);
  const calendarItems = useMemo(() => { const term=normalizeSearchText(toLatinDigits(calendarSearch)); return mine.filter(item => { const status=wallStatusOf(item); const searchable=normalizeSearchText(toLatinDigits(`${item.id} ${item.number} ${item.text} ${item.notes}`)); const meetingDate=jalaliToGregorian(resolutionMeetingDay(item)); return (calendarFilterStatus==="all" || status===calendarFilterStatus) && (!term || searchable.includes(term)) && (!calendarFrom || meetingDate>=calendarFrom) && (!calendarTo || meetingDate<=calendarTo); }); }, [mine, calendarFilterStatus, calendarSearch, isAdmin, viewerId, calendarFrom, calendarTo]);
  const selectedDayItems = calendarItems.filter(item=>resolutionMeetingDay(item)===selectedDay);
  const executionCalendarItems = useMemo(() => mine
    .filter(item => !item.isArchived && item.status !== "cancelled" && !!item.dueDate && item.dueDate >= executionCalendarFrom && item.dueDate <= executionCalendarTo)
    .sort((left, right) => (left.dueDate || "").localeCompare(right.dueDate || "") || left.number.localeCompare(right.number, "fa")),
    [mine, executionCalendarFrom, executionCalendarTo]);
  const executionCalendarByDay = useMemo(() => {
    const byDay = new Map<string, Resolution[]>();
    for (const item of executionCalendarItems) {
      const day = normalizeJalaliDate(item.dueDateJalali || gregorianToJalali(item.dueDate!));
      byDay.set(day, [...(byDay.get(day) || []), item]);
    }
    return byDay;
  }, [executionCalendarItems]);
  const selectedExecutionItems = executionCalendarByDay.get(normalizeJalaliDate(executionCalendarSelectedDay)) || [];
  useEffect(() => {
    if (executionCalendarScrollTaskId === null || tab !== "execution-calendar") return;
    const frame = window.requestAnimationFrame(() => {
      const target = document.getElementById(`execution-calendar-task-${executionCalendarScrollTaskId}`);
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        target.classList.add("execution-calendar-task-highlight");
        window.setTimeout(() => target.classList.remove("execution-calendar-task-highlight"), 1800);
      }
      setExecutionCalendarScrollTaskId(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [executionCalendarScrollTaskId, selectedExecutionItems, tab]);
  const executionCalendarFirstMonth = gregorianToJalali(executionCalendarFrom).slice(0, 7);
  const executionCalendarLastMonth = gregorianToJalali(executionCalendarTo).slice(0, 7);
  useEffect(() => {
    const selected = normalizeJalaliDate(executionCalendarSelectedDay);
    if (selected.slice(0, 7) === executionCalendarMonth.slice(0, 7) && executionCalendarByDay.has(selected)) return;
    const firstDayWithTask = Array.from(executionCalendarByDay.keys()).filter(day => day.slice(0, 7) === executionCalendarMonth.slice(0, 7)).sort()[0];
    setExecutionCalendarSelectedDay(firstDayWithTask || executionCalendarMonth);
  }, [executionCalendarMonth, executionCalendarByDay, executionCalendarFrom, executionCalendarTo]);
  const selectedWeekIndex = jalaliWeekNumber(calendarMonth, selectedDay) - 1;
  const calendarMeetingDates = useMemo(() => Array.from(new Set([...meetings.map(meeting => normalizeJalaliDate(meeting.dateJalali || gregorianToJalali(meeting.date))), ...mine.map(item => resolutionMeetingDay(item))])).filter(date => { const gregorian=jalaliToGregorian(date); return (!calendarFrom || gregorian>=calendarFrom) && (!calendarTo || gregorian<=calendarTo); }), [meetings,mine,calendarFrom,calendarTo]);
  useEffect(() => { if(!calendarFrom&&!calendarTo) return; if(calendarMeetingDates.includes(selectedDay)) return; const first=calendarMeetingDates.slice().sort()[0]; if(first){setSelectedDay(first);setCalendarMonth(first.slice(0,7)+".01");} }, [calendarFrom,calendarTo,calendarMeetingDates,selectedDay]);
  const selectedWeekMeetingDates = useMemo(() => calendarMeetingDates.filter(date => { const [year,month,day]=jalaliParts(date); return `${year}.${String(month).padStart(2,"0")}`===calendarMonth.slice(0,7) && Math.floor((jalaliDayOffset(calendarMonth)+day-1)/7)===selectedWeekIndex; }).sort(), [calendarMeetingDates,calendarMonth,selectedWeekIndex]);
  const selectedDayStatusCounts = selectedDayItems.reduce((counts,item)=>{const status=wallStatusOf(item);if(status==="completed")counts.completed++;else if(status==="delayed")counts.delayed++;else counts.active++;return counts;},{completed:0,delayed:0,active:0});
  const homeFocusItems = useMemo(() => mine
    .filter(item => !["completed", "cancelled", "rejected"].includes(wallStatusOf(item)))
    .sort((left, right) => {
      const leftStatus = wallStatusOf(left), rightStatus = wallStatusOf(right);
      const leftOverdue = left.dueDate && left.dueDate < today() ? 0 : 1;
      const rightOverdue = right.dueDate && right.dueDate < today() ? 0 : 1;
      const statusRank = (status: string) => status === "delayed" ? 0 : status === "in_progress" ? 1 : 2;
      return leftOverdue - rightOverdue || statusRank(leftStatus) - statusRank(rightStatus) ||
        (left.dueDate || "9999-12-31").localeCompare(right.dueDate || "9999-12-31") ||
        resolutionMeetingDay(left).localeCompare(resolutionMeetingDay(right));
    })
    .slice(0, 4), [mine, isAdmin, viewerId]);
  const radarTasks = useMemo(() => {
    const todayAtNoon = Date.parse(`${today()}T12:00:00`);
    const all = mine.flatMap(item => {
      const status = wallStatusOf(item);
      const due = item.dueDate?.slice(0, 10);
      if (!due || ["completed", "cancelled", "rejected"].includes(status)) return [];
      const dueAtNoon = Date.parse(`${due}T12:00:00`);
      if (!Number.isFinite(dueAtNoon)) return [];
      const days = Math.ceil((dueAtNoon - todayAtNoon) / 86400000);
      if (days > 30) return [];
      return [{ item, status, days }];
    }).sort((left, right) => left.days - right.days || left.item.id - right.item.id);
    const matches = (days: number, band: string) =>
      band === "overdue" ? days < 0 :
      band === "soon" ? days >= 0 && days <= 3 :
      band === "week" ? days >= 4 && days <= 7 :
      band === "month" ? days >= 8 && days <= 30 : true;
    const counts = {
      overdue: all.filter(entry => matches(entry.days, "overdue")).length,
      soon: all.filter(entry => matches(entry.days, "soon")).length,
      week: all.filter(entry => matches(entry.days, "week")).length,
      month: all.filter(entry => matches(entry.days, "month")).length
    };
    const items = ["overdue", "soon", "week", "month"].flatMap(band => all.filter(entry => matches(entry.days, band)).slice(0, 6))
      .sort((left, right) => left.days - right.days || left.item.id - right.item.id);
    return { total: all.length, items, counts };
  }, [mine, isAdmin, viewerId]);
  const radarBands = [
    { key: "overdue", label: "مهلت گذشته", count: radarTasks.counts.overdue },
    { key: "soon", label: "تا ۳ روز", count: radarTasks.counts.soon },
    { key: "week", label: "۴ تا ۷ روز", count: radarTasks.counts.week },
    { key: "month", label: "۸ تا ۳۰ روز", count: radarTasks.counts.month }
  ];
  const radarVisibleItems = radarFilter === "all" ? radarTasks.items : radarTasks.items.filter(entry =>
    radarFilter === "overdue" ? entry.days < 0 :
    radarFilter === "soon" ? entry.days >= 0 && entry.days <= 3 :
    radarFilter === "week" ? entry.days >= 4 && entry.days <= 7 :
    entry.days >= 8 && entry.days <= 30
  );
  const radarFilterTitle = radarFilter === "all" ? "نزدیک‌ترین وظایف" : radarBands.find(band => band.key === radarFilter)?.label ?? "نزدیک‌ترین وظایف";
  const personalCounts = mine.reduce((counts, item) => {
    const status = isAdmin ? item.status : item.progress?.find(progress => progress.nationalId === viewerId)?.status ?? item.status;
    if (status === "completed") counts.completed++;
    else if (status === "delayed") counts.delayed++;
    else if (status === "before" || status === "in_progress") counts.pending++;
    return counts;
  }, { completed: 0, delayed: 0, pending: 0 });
  // Dashboard metrics must use the already loaded dashboard data; reports are lazy-loaded and may still be null.
  const completed = personalCounts.completed;
  const delayed = personalCounts.delayed;
  const pending = personalCounts.pending;
  const reportDenominator = Math.max(1, completed + delayed + pending);
  const personalCompletionPercent = mine.length ? Math.round(personalCounts.completed * 100 / mine.length) : 0;
  const personalRemainingPercent = mine.length ? 100 - personalCompletionPercent : 0;
  const reportShares = { completed: completed * 100 / reportDenominator, delayed: delayed * 100 / reportDenominator, pending: pending * 100 / reportDenominator };
  const completedEnd = reportShares.completed;
  const delayedEnd = completedEnd + reportShares.delayed;
  const reportDonut = `conic-gradient(#4c9a70 0% ${completedEnd}%, #ce7068 ${completedEnd}% ${delayedEnd}%, #d7a33f ${delayedEnd}% 100%)`;
  const activeResolutions = resolutions.filter(item => !item.isArchived);
  const currentSpecialTrackingType = tab === "provincial-trips" ? "provincial" : "minister";
  const specialFollowupSource = (isAdmin ? activeResolutions : mine).filter(item => item.isSpecialTracking && !item.isArchived && (item.specialTrackingType || "minister") === currentSpecialTrackingType);
  const specialFollowupStatusOf = (item: Resolution) => isAdmin ? item.status : item.progress?.find(progress => progress.nationalId === viewerId)?.status || item.status;
  const filteredSpecialFollowups = useMemo(() => {
    const term = normalizeSearchText(toLatinDigits(specialFollowupQuery));
    return specialFollowupSource.filter(item => {
      if (specialFollowupStatusFilter !== "all" && specialFollowupStatusOf(item) !== specialFollowupStatusFilter) return false;
      if (currentSpecialTrackingType === "provincial" && specialFollowupProvinceFilter !== "all" && normalizeSearchText(item.province || "") !== normalizeSearchText(specialFollowupProvinceFilter)) return false;
      const relatedText = (item.assignments || []).map(assignment => users.find(user => user.nationalId === assignment.nationalId)?.displayName || assignment.nationalId).join(" ");
      const text = normalizeSearchText(toLatinDigits(`${item.id} ${item.number} ${item.province || ""} ${item.text} ${item.notes} ${item.status} ${relatedText}`));
      return !term || text.includes(term);
    });
  }, [specialFollowupSource, specialFollowupQuery, specialFollowupStatusFilter, specialFollowupProvinceFilter, currentSpecialTrackingType, users, isAdmin, viewerId, specialFollowupStatusOf]);
  const provinceFilteredSpecialFollowups = specialFollowupSource.filter(item => currentSpecialTrackingType !== "provincial" || specialFollowupProvinceFilter === "all" || normalizeSearchText(item.province || "") === normalizeSearchText(specialFollowupProvinceFilter));
  const specialFollowupStats = { total: provinceFilteredSpecialFollowups.length, completed: provinceFilteredSpecialFollowups.filter(item => specialFollowupStatusOf(item) === "completed").length, delayed: provinceFilteredSpecialFollowups.filter(item => specialFollowupStatusOf(item) === "delayed").length, pending: provinceFilteredSpecialFollowups.filter(item => ["before","in_progress"].includes(specialFollowupStatusOf(item))).length };
  const specialFollowupReports = useMemo(() => {
    const term = normalizeSearchText(toLatinDigits(specialReportSearch));
    return activeResolutions.filter(item => {
      if (!item.isSpecialTracking) return false;
      if (specialReportStatus !== "all" && item.status !== specialReportStatus) return false;
      if (specialReportProvinceFilter !== "all" && (item.specialTrackingType !== "provincial" || normalizeSearchText(item.province || "") !== normalizeSearchText(specialReportProvinceFilter))) return false;
      if (specialReportCategory !== "all" && (item.specialTrackingType !== "minister" || normalizeSearchText(item.ministerCategory || "") !== normalizeSearchText(specialReportCategory))) return false;
      const submissions = reportSubmissions.filter(report => report.resolutionId === item.id);
      const progressReports = (item.progress || []).filter(progress => !!progress.reportText?.trim());
      const hasReports = submissions.length + progressReports.length > 0;
      if (specialReportPresence === "has" && !hasReports) return false;
      if (specialReportPresence === "missing" && hasReports) return false;
      const peopleText = resolutionRoutingLabel(item, groups, users);
      const reportText = [...submissions.map(report => `${report.userName} ${report.userTitle || ""} ${report.text}`), ...progressReports.map(progress => `${users.find(user => user.nationalId === progress.nationalId)?.displayName || progress.nationalId} ${progress.reportText || ""}`)].join(" ");
      const haystack = normalizeSearchText(toLatinDigits(`${item.number} ${item.id} ${item.province || ""} ${item.ministerCategory || ""} ${item.text} ${item.notes} ${item.status} ${item.meetingDate} ${peopleText} ${reportText}`));
      return !term || haystack.includes(term);
    });
  }, [activeResolutions, specialReportSearch, specialReportStatus, specialReportPresence, specialReportProvinceFilter, specialReportCategory, reportSubmissions, groups, users]);
  const overviewResolutions = activeResolutions.filter(item => (!overviewFrom || item.meetingDate >= overviewFrom) && (!overviewTo || item.meetingDate <= overviewTo));
  const overviewSummary = { total: overviewResolutions.length, completed: overviewResolutions.filter(item=>item.status==="completed").length, delayed: overviewResolutions.filter(item=>item.status==="delayed").length, pending: overviewResolutions.filter(item=>item.status==="before"||item.status==="in_progress").length };
  const overviewDenominator = Math.max(1,overviewSummary.completed+overviewSummary.delayed+overviewSummary.pending);
  const overviewCompletedEnd = overviewSummary.completed*100/overviewDenominator;
  const overviewDelayedEnd = overviewCompletedEnd+overviewSummary.delayed*100/overviewDenominator;
  const overviewDonut = `conic-gradient(#4c9a70 0% ${overviewCompletedEnd}%, #ce7068 ${overviewCompletedEnd}% ${overviewDelayedEnd}%, #d7a33f ${overviewDelayedEnd}% 100%)`;

  const resolutionReportOptions = useMemo(() => { const term=normalizeSearchText(toLatinDigits(resolutionReportLookupQuery)); return activeResolutions.filter(item=>!term||normalizeSearchText(toLatinDigits(`${item.id} ${item.number} ${item.text} ${item.notes}`)).includes(term)).sort((left,right)=>(right.meetingDate||"").localeCompare(left.meetingDate||"")||right.id-left.id).slice(0,10); },[activeResolutions,resolutionReportLookupQuery]);
  const selectedResolutionReport = activeResolutions.find(item=>item.id===selectedResolutionReportId);
  const resolutionReportEntries = useMemo(() => {
    if(!selectedResolutionReport)return [] as {nationalId:string;displayName:string;title:string;hasReport:boolean;reportText:string;submittedAt:string;approvalStatus:string;reports:NonNullable<ResolutionReport["attachments"]>}[];
    const item=selectedResolutionReport;
    const assignedGroupIds=new Set([...(item.groupAssignments||[]).map(entry=>entry.groupId),...(item.groupId?[item.groupId]:[])]);
    const participantMap=new Map<string,{nationalId:string;displayName:string;title:string}>();
    for(const group of groups)if(assignedGroupIds.has(group.id))for(const member of group.members||[])participantMap.set(member.nationalId,{nationalId:member.nationalId,displayName:member.displayName,title:member.title||""});
    const directIds=new Set((item.assignments||[]).map(entry=>entry.nationalId));
    for(const user of users)if(directIds.has(user.nationalId)||item.publishToAll)participantMap.set(user.nationalId,{nationalId:user.nationalId,displayName:user.displayName,title:user.title||""});
    for(const progress of item.progress||[]){if(!participantMap.has(progress.nationalId)){const user=users.find(entry=>entry.nationalId===progress.nationalId)||groups.flatMap(group=>group.members||[]).find(entry=>entry.nationalId===progress.nationalId);participantMap.set(progress.nationalId,{nationalId:progress.nationalId,displayName:user?.displayName||"کاربر",title:user?.title||""});}}
    const reports=reportSubmissions.filter(report=>report.resolutionId===item.id);
    return Array.from(participantMap.values()).map(person=>{
      const personReports=reports.filter(report=>report.nationalId===person.nationalId&&!!report.text?.trim()).sort((left,right)=>right.submittedAt.localeCompare(left.submittedAt));
      const progress=item.progress?.find(entry=>entry.nationalId===person.nationalId);
      const hasReport=personReports.length>0||!!progress?.reportText?.trim();
      const latest=personReports[0];
      return { ...person,hasReport,reportText:latest?.text||progress?.reportText||"",submittedAt:latest?.submittedAt||progress?.updatedAt||"",approvalStatus:latest?.approvalStatus||progress?.approvalStatus||"",reports:latest?.attachments||[] };
    }).sort((left,right)=>Number(right.hasReport)-Number(left.hasReport)||left.displayName.localeCompare(right.displayName,"fa"));
  },[selectedResolutionReport,groups,users,reportSubmissions]);
  const filteredResolutionReportEntries = resolutionReportEntries.filter(entry=>{const term=normalizeSearchText(toLatinDigits(resolutionReportPeopleQuery));return (resolutionReportPersonFilter==="all"||(resolutionReportPersonFilter==="submitted"?entry.hasReport:!entry.hasReport))&&(!term||normalizeSearchText(toLatinDigits(`${entry.displayName} ${entry.title} ${entry.nationalId}`)).includes(term));});
  const resolutionReportSubmitted=resolutionReportEntries.filter(entry=>entry.hasReport).length;
  const resolutionReportMissing=resolutionReportEntries.length-resolutionReportSubmitted;
  const resolutionReportPercent=resolutionReportEntries.length?Math.round(resolutionReportSubmitted*100/resolutionReportEntries.length):0;
  const currentJalaliMonth = normalizeJalaliMonth(jalaliToday());
  const reportMonths = Array.from({ length: 6 }, (_, index) => {
    const jalaliMonth = shiftJalaliMonth(currentJalaliMonth, index - 5);
    const [year, monthNumber] = jalaliParts(jalaliMonth);
    const key = `${year}.${String(monthNumber).padStart(2, "0")}`;
    const monthDate = new Date(`${jalaliToGregorian(jalaliMonth)}T12:00:00`);
    const monthItems = overviewResolutions.filter(item => resolutionJalaliMonth(item) === key);
    return { key, title: new Intl.DateTimeFormat("fa-IR", { month: "long" }).format(monthDate), total: monthItems.length, completed: monthItems.filter(item => item.status === "completed").length, delayed: monthItems.filter(item => item.status === "delayed").length, pending: monthItems.filter(item => item.status === "before" || item.status === "in_progress").length };
  });
  const monthMax = Math.max(1, ...reportMonths.map(month => month.total));
  const topicDefinitions = [
    { key: "registration", label: "ثبت‌نام و پذیرش", color: "#3977a6", terms: ["ثبت نام", "ثبت‌نام", "نام نویسی", "نام‌نویسی", "پذیرش"] },
    { key: "educational", label: "آموزش و کیفیت آموزشی", color: "#6c67b2", terms: ["آموزش", "آموزشی", "درسی", "یادگیری", "امتحان", "کیفیت آموزشی"] },
    { key: "educational_upbringing", label: "پرورشی و فرهنگی", color: "#b45183", terms: ["پرورشی", "تربیتی", "فرهنگی", "اردو", "تشکل دانش آموزی", "تشکل دانش‌آموزی"] },
    { key: "health", label: "سلامت و بهداشت", color: "#32917e", terms: ["سلامت", "بهداشت", "درمان", "تغذیه", "پزشکی", "ایمنی"] },
    { key: "prayer", label: "نماز و امور دینی", color: "#c38b2e", terms: ["نماز", "قرآن", "مسجد", "دینی", "اقامه نماز"] },
    { key: "technology", label: "فناوری و هوشمندسازی", color: "#4388aa", terms: ["فناوری", "هوشمند سازی", "هوشمندسازی", "دیجیتال", "هوش مصنوعی", "زیرساخت فناوری"] },
    { key: "human_resources", label: "نیروی انسانی", color: "#6f8e4e", terms: ["نیروی انسانی", "معلم", "فرهنگیان", "کارکنان", "استخدام", "جذب نیرو"] },
    { key: "infrastructure", label: "بودجه و زیرساخت", color: "#9a7047", terms: ["بودجه", "اعتبار", "مالی", "عمرانی", "تجهیز مدارس", "ساخت و ساز", "ساخت‌وساز"] },
    { key: "other", label: "سایر موضوعات", color: "#87949a", terms: [] }
  ];
  const compactTopicText = (value: string) => normalizeSearchText(value).replace(/[\s\u200c\u200f\u200e]/g, "");
  const categorizedOverview = overviewResolutions.map(item => {
    const text = compactTopicText(`${item.number} ${item.text} ${item.notes}`);
    const topic = topicDefinitions.find(candidate => candidate.key !== "other" && candidate.terms.some(term => text.includes(compactTopicText(term)))) ?? topicDefinitions[topicDefinitions.length - 1];
    return { item, topic };
  });
  const topicDistribution = topicDefinitions.map(topic => {
    const items = categorizedOverview.filter(row => row.topic.key === topic.key).map(row => row.item);
    return { ...topic, items, count: items.length, percent: overviewResolutions.length ? Math.round(items.length * 100 / overviewResolutions.length) : 0 };
  }).filter(topic => topic.count > 0).sort((left, right) => right.count - left.count);
  let topicRunningPercent = 0;
  const topicDonutStops = topicDistribution.map((topic, index) => {
    const start = topicRunningPercent;
    topicRunningPercent += topic.count * 100 / Math.max(1, overviewResolutions.length);
    return `${topic.color} ${start}% ${index === topicDistribution.length - 1 ? 100 : topicRunningPercent}%`;
  });
  const topicDonut = overviewResolutions.length ? `conic-gradient(${topicDonutStops.join(", ")})` : "#e7ece9";
  const selectedTopicItems = topicDistribution.find(topic => topic.key === selectedTopic)?.items ?? [];
  const overviewStatusTooltip = (status: "completed" | "pending" | "delayed") => {
    const items = overviewResolutions.filter(item => status === "pending" ? item.status === "before" || item.status === "in_progress" : item.status === status);
    const rows = items.slice(0, 5).map(item => `مصوبه ${item.number} · ${resolutionRoutingLabel(item, groups, users)}`);
    return [`${items.length} مصوبه · ${status === "completed" ? "اجراشده" : status === "pending" ? "در حال پیگیری" : "انجام‌نشده"}`, ...rows, items.length > rows.length ? `و ${items.length - rows.length} مورد دیگر؛ برای فهرست کامل کلیک کنید.` : ""].filter(Boolean).join("\n");
  };
  const monthTooltip = (monthKey: string) => {
    const items = overviewResolutions.filter(item => resolutionJalaliMonth(item) === monthKey);
    const counts = `${items.length} مصوبه · اجراشده ${items.filter(item=>item.status==="completed").length} · در حال پیگیری ${items.filter(item=>item.status==="before"||item.status==="in_progress").length} · انجام‌نشده ${items.filter(item=>item.status==="delayed").length}`;
    const labels = items.slice(0, 4).map(item => `مصوبه ${item.number} · ${resolutionRoutingLabel(item, groups, users)}`);
    return [counts, ...labels, items.length > labels.length ? `و ${items.length - labels.length} مصوبه دیگر؛ برای دیدن فهرست کلیک کنید.` : ""].filter(Boolean).join("\n");
  };

  const selectedOverviewItems = !overviewDrilldown ? [] : "monthKey" in overviewDrilldown
    ? overviewResolutions.filter(item => resolutionJalaliMonth(item) === overviewDrilldown.monthKey)
    : overviewResolutions.filter(item => overviewDrilldown.status === "pending" ? item.status === "before" || item.status === "in_progress" : item.status === overviewDrilldown.status);
  const selectedOverviewTitle = !overviewDrilldown ? "" : "monthKey" in overviewDrilldown
    ? reportMonths.find(month => month.key === overviewDrilldown.monthKey)?.title ?? "مصوبات ماه"
    : overviewDrilldown.status === "completed" ? "مصوبات اجراشده" : overviewDrilldown.status === "pending" ? "مصوبات در حال پیگیری" : "مصوبات انجام‌نشده";
  const reportableGroups = groups.filter(group => !isIndividualRecipientGroup(group.name));
  const reportGroupKind = (group: Group) => isRegionalGroup(group.name) ? "region" : isResolutionGroup(group.name, group.category) ? "group" : "unit";
  const visibleReportGroups = reportableGroups.filter(group =>
    (!normalizeSearchText(reportGroupQuery) || normalizeSearchText(group.name).includes(normalizeSearchText(reportGroupQuery)))
    && (reportViewTab === "units" ? reportGroupKind(group) === "unit" : reportViewTab === "groups" ? reportGroupKind(group) !== "unit" : false)
  );
  const groupReport = reportableGroups.filter(group => selectedReportGroupIds.length === 0 || selectedReportGroupIds.includes(String(group.id))).map(group => {
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
  const visibleGroupReport = groupReport.filter(group => reportViewTab === "units" ? reportGroupKind(reportableGroups.find(item => item.id === group.id) ?? { id: group.id, name: group.name, members: [] }) === "unit" : reportViewTab === "groups" && reportGroupKind(reportableGroups.find(item => item.id === group.id) ?? { id: group.id, name: group.name, members: [] }) !== "unit");
  const quickReportAllOptions = useMemo(() => {
    const peopleMap = new Map<string, { key:string; kind:"person"; nationalId:string; label:string; detail:string }>();
    for(const user of users) if(user.nationalId) peopleMap.set(user.nationalId,{key:"person:"+user.nationalId,kind:"person",nationalId:user.nationalId,label:user.displayName,detail:[user.title,displayLocation(user.organizationUnit)||displayLocation(user.province)].filter(Boolean).join(" · ")});
    for(const group of groups) for(const member of group.members||[]) if(member.nationalId&&!peopleMap.has(member.nationalId)) peopleMap.set(member.nationalId,{key:"person:"+member.nationalId,kind:"person",nationalId:member.nationalId,label:member.displayName,detail:[member.title,displayLocation(member.organizationUnit)].filter(Boolean).join(" · ")});
    const people=Array.from(peopleMap.values());
    const scopes=reportableGroups.map(group=>({key:"scope:"+group.id,kind:"scope" as const,groupId:group.id,label:group.name,detail:reportGroupKind(group)==="unit"?"معاونت / اداره‌کل / واحد":"گروه"}));
    return [...people,...scopes].sort((left,right)=>left.label.localeCompare(right.label,"fa"));
  },[users,groups,reportableGroups]);
  const quickReportOptions = useMemo(() => { const term=normalizeSearchText(toLatinDigits(quickReportQuery)); return quickReportAllOptions.filter(option=>!term||normalizeSearchText(toLatinDigits(`${option.label} ${option.detail} ${option.kind==="person"?option.nationalId:""}`)).includes(term)).slice(0,12); },[quickReportAllOptions,quickReportQuery]);
  const quickReportSelected = quickReportAllOptions.find(option=>option.key===quickReportSelection);
  const quickReportSavedViews = useMemo(() => {
    if (!authUser?.nationalId) return [] as SavedQuickReportView[];
    try {
      const raw = localStorage.getItem(`vezarati.quick-report-views:${authUser.nationalId}`);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.slice(0, 12) as SavedQuickReportView[] : [];
    } catch { return [] as SavedQuickReportView[]; }
  }, [authUser?.nationalId, savedQuickViewRevision]);
  function saveQuickReportView() {
    if (!authUser?.nationalId || !quickReportSelected) { setMessage("ابتدا یک فرد یا واحد را انتخاب کنید."); return; }
    const name = quickSavedViewName.trim();
    if (!name) { setMessage("برای نمای ذخیره‌شده یک نام وارد کنید."); return; }
    const key = `vezarati.quick-report-views:${authUser.nationalId}`;
    const next = [{ id: Date.now().toString(), name, query: quickReportQuery, selection: quickReportSelection, taskFilter: quickReportTaskFilter }, ...quickReportSavedViews.filter(view => view.name !== name)].slice(0, 12);
    try { localStorage.setItem(key, JSON.stringify(next)); setSavedQuickViewRevision(value => value + 1); setQuickSavedViewName(""); setMessage("نمای گزارش در همین مرورگر ذخیره شد."); }
    catch { setMessage("ذخیرهٔ نما در مرورگر انجام نشد."); }
  }
  function applyQuickReportView(view: SavedQuickReportView) {
    setQuickReportQuery(view.query); setQuickReportSelection(view.selection); setQuickReportTaskFilter(view.taskFilter); setReportMainTab("lookup");
  }
  function deleteQuickReportView(id: string) {
    if (!authUser?.nationalId) return;
    const key = `vezarati.quick-report-views:${authUser.nationalId}`;
    const next = quickReportSavedViews.filter(view => view.id !== id);
    try { localStorage.setItem(key, JSON.stringify(next)); setSavedQuickViewRevision(value => value + 1); }
    catch { setMessage("حذف نمای ذخیره‌شده انجام نشد."); }
  }
  const getQuickReportStatuses = (selected: typeof quickReportAllOptions[number] | undefined) => {
    if(!selected) return [] as {item:Resolution;status:string;personName?:string}[];
    return activeResolutions.filter(item=>item.status!=="cancelled").flatMap(item=>{
      const assignedIds=new Set([...(item.groupAssignments||[]).map(entry=>entry.groupId),...(item.groupId?[item.groupId]:[])]);
      if(selected.kind==="person"){
        const personGroups=groups.filter(group=>group.members.some(member=>member.nationalId===selected.nationalId));
        const assignedDirectly=(item.assignments||[]).some(entry=>entry.nationalId===selected.nationalId);
        const assignedByGroup=personGroups.some(group=>assignedIds.has(group.id));
        if(!assignedDirectly&&!assignedByGroup)return [];
        return [{item,status:item.progress?.find(progress=>progress.nationalId===selected.nationalId)?.status||item.status,personName:selected.label}];
      }
      if(!assignedIds.has(selected.groupId!))return [];
      const group=groups.find(entry=>entry.id===selected.groupId);
      if(!group?.members.length)return [{item,status:item.status,personName:selected.label}];
      return group.members.map(member=>({item,status:item.progress?.find(progress=>progress.nationalId===member.nationalId)?.status||item.status,personName:member.displayName}));
    });
  };
  const quickReportStatuses = useMemo(() => getQuickReportStatuses(quickReportSelected),[quickReportSelected,activeResolutions,groups]);
  const quickReportActiveStatuses=quickReportStatuses.filter(entry=>entry.status!=="cancelled");
  const quickReportTotal=quickReportActiveStatuses.length;
  const quickReportCompleted=quickReportActiveStatuses.filter(entry=>entry.status==="completed").length;
  const quickReportUndone=quickReportActiveStatuses.filter(entry=>entry.status==="delayed").length;
  const quickReportDelayed=quickReportUndone;
  const quickReportOverdue=quickReportActiveStatuses.filter(entry=>!["completed","delayed","rejected"].includes(entry.status)&&!!entry.item.dueDate&&entry.item.dueDate<today()).length;
  const quickReportPending=quickReportActiveStatuses.filter(entry=>entry.status==="before"||entry.status==="in_progress").length;
  const quickReportRejected=quickReportActiveStatuses.filter(entry=>entry.status==="rejected").length;
  const quickReportAttendanceIds = quickReportSelected?.kind==="person" ? [quickReportSelected.nationalId] : quickReportSelected?.kind==="scope" ? groups.find(group=>group.id===quickReportSelected.groupId)?.members.map(member=>member.nationalId) ?? [] : [];
  const quickReportAttendance = attendanceStatsFor(quickReportAttendanceIds);
  const quickReportAttendancePercent = quickReportAttendance.total ? Math.round(quickReportAttendance.present*100/quickReportAttendance.total) : 0;
  const quickReportAttendanceDonut = quickReportAttendance.total ? `conic-gradient(#36845c 0% ${quickReportAttendancePercent}%, #c94f48 ${quickReportAttendancePercent}% 100%)` : "#e7ece9";
  const quickReportChartBuckets = [
    {key:"completed",label:"انجام‌شده",count:quickReportCompleted,color:"#36845c",matches:(entry:{item:Resolution;status:string})=>entry.status==="completed"},
    {key:"overdue",label:"با تأخیر",count:quickReportOverdue,color:"#c94f48",matches:(entry:{item:Resolution;status:string})=>!["completed","delayed","rejected","cancelled"].includes(entry.status)&&!!entry.item.dueDate&&entry.item.dueDate<today()},
    {key:"in_progress",label:"در حال پیگیری",count:quickReportPending,color:"#428bb4",matches:(entry:{item:Resolution;status:string})=>entry.status==="in_progress"&&!(entry.item.dueDate&&entry.item.dueDate<today())},
    {key:"before",label:"قبل از اجرا",count:quickReportActiveStatuses.filter(entry=>entry.status==="before"&&!(entry.item.dueDate&&entry.item.dueDate<today())).length,color:"#d49a32",matches:(entry:{item:Resolution;status:string})=>entry.status==="before"&&!(entry.item.dueDate&&entry.item.dueDate<today())},
    {key:"delayed",label:"انجام‌نشده",count:quickReportUndone,color:"#d58632",matches:(entry:{item:Resolution;status:string})=>entry.status==="delayed"},
    {key:"rejected",label:"ردشده",count:quickReportRejected,color:"#8061a8",matches:(entry:{item:Resolution;status:string})=>entry.status==="rejected"}
  ];
  const quickReportDonutBackground = quickReportTotal ? `conic-gradient(${quickReportChartBuckets.map((bucket,index)=>{const start=quickReportChartBuckets.slice(0,index).reduce((sum,item)=>sum+item.count,0)*100/quickReportTotal;const end=start+bucket.count*100/quickReportTotal;return `${bucket.color} ${start}% ${end}%`;}).join(", ")})` : "#e7ece9";
  const quickReportFilteredTasks = quickReportTaskFilter==="all" ? quickReportStatuses : quickReportStatuses.filter(entry=>quickReportTaskFilter==="undone" ? entry.status!=="completed" : quickReportTaskFilter==="overdue" ? entry.status!=="completed"&&!!entry.item.dueDate&&entry.item.dueDate<today() : entry.status===quickReportTaskFilter || (quickReportTaskFilter==="before"&&entry.status==="delayed"));
  const quickReportPrintItems = Array.from(new Map(quickReportStatuses.map(entry=>[entry.item.id,entry.item] as const)).values()).map(item => {
    const entries = quickReportStatuses.filter(entry => entry.item.id === item.id);
    const completedCount = entries.filter(entry => entry.status === "completed").length;
    const lateCount = entries.filter(entry => entry.status !== "completed" && !!item.dueDate && item.dueDate < today()).length;
    const category = completedCount === entries.length ? "completed" : lateCount > 0 ? "delayed" : "pending";
    return { item, entries, completedCount, lateCount, category };
  });
  const wallItems = wallStatusFilter === "all" ? [] : mine.filter(item => { if (wallStatusFilter === "pending" && !isAdmin && hiddenReportedResolutionIds.includes(item.id)) return false; const status = isAdmin ? item.status : item.progress?.find(progress => progress.nationalId === viewerId)?.status ?? item.status; return wallStatusFilter === "pending" ? status === "before" || status === "in_progress" : status === wallStatusFilter; });
  const unreadNotifications = notifications.filter(item => !item.isRead).length;
  const topbarNotificationItems = useMemo(() => notifications.filter(item=>!item.isRead).slice().sort((left,right)=>{const l=new Date(left.createdAt).getTime(),r=new Date(right.createdAt).getTime();return (Number.isFinite(r)?r:0)-(Number.isFinite(l)?l:0)||right.id-left.id;}).slice(0,8),[notifications]);
  const notificationFeed = useMemo(() => [
    ...notifications.map(item => ({ feedKey: "notification-" + item.id, kind: "notification" as const, id: item.id, resolutionId: item.resolutionId, resolutionNumber: item.resolutionNumber, text: item.text, createdAt: item.createdAt, userName: "", isRead: item.isRead, type: item.type })),
    ...resolutions.filter(item => !item.isArchived).flatMap(item => (item.events ?? []).map(entry => ({
      feedKey: "event-" + item.id + "-" + entry.id, kind: "event" as const, id: entry.id, resolutionId: item.id, resolutionNumber: item.number, text: entry.text, createdAt: entry.createdAt, userName: entry.userName, isRead: true, type: "event"
    })))
  ].sort((left, right) => {
    if (left.kind !== right.kind) return left.kind === "event" ? -1 : 1;
    const leftTime = new Date(left.createdAt).getTime(), rightTime = new Date(right.createdAt).getTime();
    return (Number.isFinite(rightTime) ? rightTime : 0) - (Number.isFinite(leftTime) ? leftTime : 0) || right.id - left.id;
  }).slice(0, 200), [notifications, resolutions, isAdmin]);
  const notificationTabItems = useMemo(() => notificationFeed.filter(item => notificationTab === "events" ? item.kind === "event" : item.kind === "notification"), [notificationFeed, notificationTab]);
  const eventFeedCount = notificationFeed.filter(item => item.kind === "event").length;
  const notificationFeedCount = notificationFeed.filter(item => item.kind === "notification").length;
  const notificationPageCount = Math.max(1, Math.ceil(notificationTabItems.length / notificationPageSize));
  const pagedNotificationFeed = useMemo(() => notificationTabItems.slice((notificationPage - 1) * notificationPageSize, notificationPage * notificationPageSize), [notificationTabItems, notificationPage]);
  useEffect(() => { setNotificationPage(1); }, [notificationTab]);
  useEffect(() => { if (!message) return; const timer = window.setTimeout(() => setMessage(""), 6000); return () => window.clearTimeout(timer); }, [message]);
  useEffect(() => { if (notificationPage > notificationPageCount) setNotificationPage(notificationPageCount); }, [notificationPage, notificationPageCount]);

  const archivedResolutions = resolutions.filter(item => item.isArchived && (!normalizeSearchText(archiveQuery) || normalizeSearchText(`${item.id} ${item.number} ${item.text} ${item.notes}`).includes(normalizeSearchText(archiveQuery))));
  const awaitingReview = activeResolutions.flatMap(item => (item.progress ?? []).filter(progress => progress.approvalStatus === "pending" && progress.reportText).map(progress => ({ item, progress })));


  if (!authReady) return <div className="auth-screen"><div className="auth-card"><ShieldCheck size={36}/><h1>ورود به سامانه پیگیری مصوبات</h1><p>در حال بررسی نشست ورود…</p></div></div>;
  if (!authUser) return <div className="auth-screen"><div className="auth-card"><ShieldCheck size={36}/><h1>ورود به سامانه پیگیری مصوبات</h1><p>{error || (new URLSearchParams(window.location.search).has("code") ? "ورود انجام نشد. لطفاً از درگاه سازمانی دوباره وارد شوید." : "برای ورود، از درگاه یکپارچه آموزش‌وپرورش به این صفحه بازگردید.")}</p></div></div>;
  if (!dashboardLoaded) return <div className="auth-screen app-loading-screen" role="status" aria-live="polite"><div className="auth-card"><div className="app-loading-spinner" aria-hidden="true"/><h1>دفتر وزارتی</h1>{error ? <><p>{error}</p><button type="button" className="primary" onClick={()=>void load()}>تلاش دوباره</button></> : <p>در حال بارگذاری مصوبات و اطلاعات سامانه…</p>}</div></div>;
  if (!isAdmin && mine.length === 0) return <div className="auth-screen"><div className="auth-card access-denied-card"><ShieldCheck size={36}/><h1>شما دسترسی به این سامانه ندارید</h1><p>برای حساب کاربری «{authUser.displayName}» هیچ وظیفه‌ای ثبت یا ارجاع نشده است. در صورت نیاز، با دفتر وزارتی تماس بگیرید.</p><button type="button" className="primary" onClick={()=>void logout()}>خروج از حساب</button></div></div>;
  return <div className="shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-icon"><ShieldCheck /></span><div><b>دفتر وزارتی</b><small>پیگیری مصوبات</small></div></div>
      <nav>{[["wall", LayoutDashboard, "پیگیری"], ["execution-calendar", CalendarDays, "تقویم اجرایی"], ["assistant", MessageCircle, "دستیار وظایف"], ["notifications", Bell, `اعلان‌ها ${notifications.filter(item=>!item.isRead).length ? "(" + notifications.filter(item=>!item.isRead).length + ")" : ""}`], ["resolutions", ClipboardList, "مصوبات شورای معاونین"], ["special-followups", MapPin, "دستورات وزیر"], ["provincial-trips", MapPin, "سفرهای استانی وزیر"], ...(isAdmin ? [["sessions", CalendarDays, "جلسات و حضور و غیاب"], ["archive", Archive, "بایگانی"], ["groups", Users, "گروه‌ها و اعضا"], ["reports", FileText, "گزارش‌ها"]] : [])].map(([key, Icon, title]: any) => <a key={key} href={pathForTab(key)} className={"nav " + (tab === key ? "active" : "")} aria-current={tab === key ? "page" : undefined} onClick={event => { event.preventDefault(); if (tab !== key) setTab(key); }}><Icon size={18} />{title}</a>)}</nav>
      <div className="sidebar-foot">محیط پیگیری اجرایی<br /><span>دفتر وزارتی</span></div>
    </aside>

    <main className="main">
      <div className="account-bar">
        <span className="account-bar-label">حساب کاربری</span>
        {deadlineReminders.length>0&&<div className="deadline-news" role="region" aria-label="یادآوری سررسیدها"><span className="deadline-news-label"><Bell size={14}/>یادآوری سررسید</span><div className="deadline-news-window" aria-live="polite"><div className="deadline-news-track">{[...deadlineReminders,...deadlineReminders].map((item,index)=>{const days=Math.ceil((Date.parse(`${item.dueDate}T00:00:00Z`)-Date.parse(`${today()}T00:00:00Z`))/86400000);return <button type="button" key={`${item.id}-${index}`} onClick={()=>openWallTask(item)}><b>مصوبه {item.number} · شناسه {item.id}</b><span>{days<0?`${new Intl.NumberFormat("fa-IR").format(Math.abs(days))} روز از سررسید گذشته`:`${days===0?"امروز":`تا ${new Intl.NumberFormat("fa-IR").format(days)} روز دیگر`} سررسید`}</span><small>{item.text}</small></button>;})}</div></div></div>}
        {!isAdmin&&topbarNotificationItems.length>0&&<div className="account-notification-news" role="region" aria-label="اعلان‌های خوانده‌نشده"><span className="account-notification-label"><Bell size={14}/>اعلان جدید <b>{unreadNotifications}</b></span><div className="account-notification-window" aria-live="polite"><div className="account-notification-track">{[...topbarNotificationItems,...topbarNotificationItems].map((item,index)=><button type="button" key={`${item.id}-${index}`} onClick={()=>{setTab("notifications");setNotificationTab("notifications");setNotificationPage(1);setAccountMenuOpen(false);}}><b>{item.resolutionNumber?`مصوبه ${item.resolutionNumber}`:"اعلان جدید"}</b><span>{item.text}</span><small>{formatDateTime(item.createdAt)}</small></button>)}</div></div></div>}
        <div className="account-menu-wrap">
          <button type="button" className="account-menu-trigger" aria-expanded={accountMenuOpen} onClick={()=>setAccountMenuOpen(open=>!open)}>
            <span className="avatar">{authUser.displayName?.[0] || "م"}</span>
            <span className="account-menu-summary"><b>{authUser.displayName || dashboard?.currentUser.displayName || "کاربر"}</b><small>{authUser.title || "پست ثبت نشده"}</small></span>
            <ChevronDown size={16}/>
          </button>
          {accountMenuOpen && <><button type="button" className="account-menu-overlay" aria-label="بستن منوی کاربر" onClick={()=>setAccountMenuOpen(false)}/><div className="account-menu">
            <div className="account-menu-identity"><b>{authUser.displayName || "کاربر"}</b><small>نقش: {authUser.role}</small><small>پست: {authUser.title || "ثبت نشده"}</small></div>
            <button type="button" onClick={()=>{setAccountMenuOpen(false);void editMyMobile();}}>ویرایش موبایل</button>
            <button type="button" disabled={pushBusy} onClick={()=>{setAccountMenuOpen(false);void toggleBrowserPush();}}>{pushBusy ? "در حال تنظیم اعلان…" : pushEnabled ? "غیرفعال‌سازی اعلان مرورگر" : "فعال‌سازی اعلان مرورگر"}</button>
            <button type="button" className="account-menu-logout" onClick={()=>{setAccountMenuOpen(false);void logout();}}>خروج از حساب</button>
          </div></>}
        </div>
      </div>
      <header className="top"><div><div className="eyebrow">پیگیری مصوبات</div><h1>{tab === "wall" ? "پیگیری" : tab === "execution-calendar" ? "تقویم اجرایی" : tab === "assistant" ? "دستیار وظایف" : tab === "resolutions" ? "مصوبات شورای معاونین" : tab === "special-followups" ? "دستورات وزیر" : tab === "provincial-trips" ? "سفرهای استانی وزیر" : tab === "groups" ? "گروه‌های اصلی و مسئولان معاونت‌ها" : tab === "sessions" ? "مدیریت جلسات و حضور و غیاب" : tab === "archive" ? "بایگانی مصوبات" : tab === "notifications" ? "اعلان‌های من" : "گزارش‌های اجرایی"}</h1><p>مصوبات، مسئولیت‌ها و روند اجرای اقدامات</p></div><div className="top-actions"><label className="theme-picker"><Palette size={15}/><span>تم</span><select aria-label="انتخاب تم سامانه" value={theme} onChange={event=>setTheme(event.target.value as "light" | "blue" | "violet" | "dark")}><option value="light">روشن</option><option value="blue">آبی</option><option value="violet">بنفش</option><option value="dark">تیره</option></select></label><div className="font-size-control" aria-label="اندازه نوشته‌ها"><button type="button" className="secondary" aria-label="کوچک کردن نوشته‌ها" disabled={fontScale<=14} onClick={()=>setFontScale(size=>Math.max(14,size-1))}>A−</button><button type="button" className="secondary" aria-label="بزرگ کردن نوشته‌ها" disabled={fontScale>=20} onClick={()=>setFontScale(size=>Math.min(20,size+1))}>A+</button></div><span className="today"><CalendarDays size={16} />{formatDate(today(), gregorianToJalali(today()).replace(/\./g, "/"))}</span>{isAdmin && tab === "special-followups" && <button className="primary" onClick={() => openCreateResolution(undefined,true,"minister")}><Plus size={17}/>ثبت دستور وزیر</button>}{isAdmin && tab === "provincial-trips" && <button className="primary" onClick={() => openCreateResolution(undefined,true,"provincial")}><Plus size={17}/>ثبت سفر استانی وزیر</button>}{isAdmin && tab !== "special-followups" && tab !== "provincial-trips" && tab !== "groups" && tab !== "sessions" && tab !== "archive" && tab !== "notifications" && tab !== "reports" && <><button className="primary" onClick={() => openCreateResolution()}><Plus size={17} />افزودن مصوبه شورای معاونین</button><button className="secondary" onClick={() => openCreateResolution(undefined,true)}><Plus size={17} />پیگیری‌های ویژه</button></>}</div></header>
      {tab === "assistant" && <section className="panel assistant-chat-panel">
        <div className="assistant-chat-heading"><span className="assistant-chat-icon"><MessageCircle size={20}/></span><div><h2>دستیار پیگیری وظایف</h2><p>پرسش دربارهٔ مصوبه‌ها، سررسیدها و وضعیت پیگیری‌های در دسترس شما</p></div></div>
        <div className="assistant-chat-notice">دستیار فقط اطلاعاتی را می‌بیند که در کارتابل شما مجاز است. برای ثبت مستقیم گزارش و تأیید یک مصوبهٔ خودتان، بنویسید «مصوبه شماره ۱۲ را تایید کن»؛ گزارش «اقدام انجام شد» ثبت می‌شود. برای پیش‌نویس و پرسش‌های دیگر از دستیار استفاده کنید.</div>
        <div className="assistant-chat-prompts">{["کدام وظایف من سررسید نزدیک دارند؟","مصوبه‌های در حال پیگیری را خلاصه کن","مصوبه‌های عقب‌افتادهٔ من کدام‌اند؟","کدام گزارش‌های من هنوز تأیید نشده‌اند؟","این هفته چه سررسیدهایی دارم؟","مصوبه‌های انجام‌شدهٔ من را نشان بده","برای گزارش وضعیت این وظیفه یک پیش‌نویس بنویس"].map(prompt=><button key={prompt} type="button" className="assistant-prompt" disabled={assistantSending} onClick={()=>void sendAssistantMessage(prompt)}>{prompt}</button>)}</div>
        <div className="assistant-chat-messages" aria-live="polite">{assistantMessages.length===0&&<div className="assistant-chat-empty">سؤالتان را دربارهٔ وظایف و مصوبات بنویسید.</div>}{assistantMessages.map((turn,index)=><article key={index} className={"assistant-chat-bubble "+turn.role}><b>{turn.role==="user"?"شما":"دستیار"}</b><p>{turn.content}</p></article>)}{assistantSending&&<div className="assistant-chat-thinking">در حال بررسی وظایف شما…</div>}<div ref={assistantEndRef}/></div>
        {assistantError&&<div className="assistant-chat-error" role="alert">{assistantError}</div>}
        <form className="assistant-chat-form" onSubmit={event=>{event.preventDefault();void sendAssistantMessage();}}><textarea value={assistantInput} onChange={event=>setAssistantInput(event.target.value)} onKeyDown={event=>{if(event.key==="Enter"&&!event.shiftKey){event.preventDefault();void sendAssistantMessage();}}} placeholder="مثلاً: برای مصوبه ۱۲ چه اقدامی از من مانده؟" maxLength={2000} rows={2}/><button className="primary" type="submit" disabled={!assistantInput.trim()||assistantSending}><Send size={16}/>{assistantSending?"در حال پاسخ":"ارسال"}</button></form>
      </section>}
      {(error || message) && <div className="api-toast-stack" aria-live="polite">{error && <div className="api-toast api-toast-error" role="alert"><span>{error}</span><div><button type="button" className="secondary" onClick={() => void load()}>تلاش دوباره</button><button type="button" className="api-toast-close" aria-label="بستن پیام" onClick={() => setError("")}>×</button></div></div>}{message && <div className="api-toast api-toast-message" role="status"><span>{message}</span><button type="button" className="api-toast-close" aria-label="بستن پیام" onClick={() => setMessage("")}>×</button></div>}</div>}
      <section className="metrics"><Metric icon={<ClipboardList />} label="کل مصوبات" value={isAdmin ? reports?.total ?? resolutions.length : mine.length} color="blue" active={wallStatusFilter === "all" && tab === "wall"} onClick={() => { setTab("wall"); setWallStatusFilter("all"); }} /><Metric icon={<CheckCheck />} label="اجراشده" value={completed} color="green" active={tab === "wall" && wallStatusFilter === "completed"} onClick={() => { setTab("wall"); setWallStatusFilter("completed"); }} /><Metric icon={<CircleAlert />} label="نیازمند پیگیری" value={pending} color="amber" active={tab === "wall" && wallStatusFilter === "pending"} onClick={() => { setTab("wall"); setWallStatusFilter("pending"); }} />{isAdmin && <Metric icon={<CalendarDays />} label="انجام نشده" value={delayed} color="red" active={tab === "wall" && wallStatusFilter === "delayed"} onClick={() => { setTab("wall"); setWallStatusFilter("delayed"); }} />}</section>
      {tab === "wall" && !isAdmin && <section className="panel personal-completion-report"><div className="section-head"><div><span className="report-kicker">گزارش فردی</span><h2>درصد انجام مصوبه‌های شما</h2><p>محاسبه بر اساس مصوبه‌های فعالِ ارجاع‌شده به شما</p></div><span className="counter">{mine.length} مصوبه</span></div><div className="personal-report-stats"><div><span>انجام‌شده</span><b>{personalCompletionPercent}٪</b><small>{personalCounts.completed} از {mine.length}</small></div><div><span>انجام‌نشده</span><b>{personalRemainingPercent}٪</b><small>{Math.max(0, mine.length - personalCounts.completed)} از {mine.length}</small></div></div><div className="personal-report-track" role="progressbar" aria-label="درصد انجام مصوبه‌های شما" aria-valuemin={0} aria-valuemax={100} aria-valuenow={personalCompletionPercent}><span style={{ width: `${personalCompletionPercent}%` }} /></div></section>}

      {tab === "wall" && wallStatusFilter === "all" && <section className="home-focus">
        <div className="home-focus-top">
          <div><span className="home-focus-kicker">{isAdmin ? "نمای مدیر" : "کارتابل شما"}</span><h2>{isAdmin ? "اولویت‌های پیگیری" : "کارهای پیش‌روی شما"}</h2><p>{isAdmin ? "موارد نیازمند توجه و میانبرهای مدیریتی" : "کارهای باز را مستقیم باز کنید یا سراغ اعلان‌ها بروید."}</p></div>
          <div className="home-shortcuts">
            {isAdmin ? <>
              <button type="button" className="primary" onClick={() => openCreateResolution()}><Plus size={15}/>افزودن مصوبه شورای معاونین</button><button type="button" className="secondary" onClick={() => openCreateResolution(undefined,true,"minister")}><Plus size={15}/>دستورات وزیر</button>
              <button type="button" className="secondary" onClick={requestNewMeeting}><Plus size={15}/>جلسه جدید</button>
              <button type="button" className="secondary" onClick={() => setTab("sessions")}><CalendarDays size={15}/>جلسات و حضور و غیاب</button>
              <button type="button" className="secondary" onClick={() => setTab("reports")}><ClipboardList size={15}/>گزارش‌ها</button>
              <button type="button" className="secondary" onClick={()=>{setTab("reports");setReportMainTab("lookup");}}><Search size={15}/>وضعیت سریع</button>
            </> : <>
              <button type="button" className="primary" onClick={() => { setTab("wall"); setWallStatusFilter("pending"); }}>وظایف نیازمند پیگیری</button>
              <button type="button" className="secondary" onClick={() => setTab("notifications")}><Bell size={15}/>اعلان‌های من</button>
            </>}
          </div>
        </div>
        {homeFocusItems.length > 0 ? <div className="home-focus-list">{homeFocusItems.map(item => { const status=wallStatusOf(item); return <button type="button" className="home-focus-item" key={item.id} onClick={() => openWallTask(item)}><span className="home-focus-item-top"><b>مصوبه {item.number} · شناسه {item.id}</b><span className={`status ${status}`}>{labels[status]||status}</span></span><strong>{item.text}</strong><small>{item.dueDateJalali ? "سررسید: "+item.dueDateJalali : "بدون سررسید"}</small></button>;})}</div> : <div className="home-focus-empty">{isAdmin ? "در حال حاضر وظیفهٔ باز و نیازمند پیگیری ندارید." : "وظیفهٔ بازی برای پیگیری ندارید."}</div>}
        <section className="deadline-radar" aria-labelledby="deadline-radar-title">
          <div className="deadline-radar-heading"><div><span className="home-focus-kicker">اولویت اقدام</span><h3 id="deadline-radar-title">رادار پیگیری</h3><p>روی هر حلقه یا بازه بزنید تا فقط همان وظایف را ببینید؛ حلقهٔ نزدیک‌تر یعنی مهلت فوری‌تر.</p></div><span className="deadline-radar-count">{new Intl.NumberFormat("fa-IR").format(radarTasks.total)} وظیفه در ۳۰ روز</span></div>
          {radarTasks.total ? <div className="deadline-radar-content">
            <div className="deadline-radar-plot">
              <svg viewBox="0 0 320 320" role="img" aria-label="بازه‌های سررسید؛ برای فیلتر وظایف هر حلقه را انتخاب کنید">
                <g className={`radar-zone radar-zone-month ${radarFilter==="month"?"active":""}`} role="button" tabIndex={0} aria-pressed={radarFilter==="month"} aria-label={`مهلت ۸ تا ۳۰ روز، ${radarTasks.counts.month} وظیفه`} onClick={event=>{event.stopPropagation();setRadarFilter("month");}} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();setRadarFilter("month");}}}><circle cx="160" cy="160" r="132"/><text x="160" y="38">۸ تا ۳۰ روز · {new Intl.NumberFormat("fa-IR").format(radarTasks.counts.month)}</text></g>
                <g className={`radar-zone radar-zone-week ${radarFilter==="week"?"active":""}`} role="button" tabIndex={0} aria-pressed={radarFilter==="week"} aria-label={`مهلت ۴ تا ۷ روز، ${radarTasks.counts.week} وظیفه`} onClick={event=>{event.stopPropagation();setRadarFilter("week");}} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();setRadarFilter("week");}}}><circle cx="160" cy="160" r="96"/><text x="160" y="72">۴ تا ۷ روز · {new Intl.NumberFormat("fa-IR").format(radarTasks.counts.week)}</text></g>
                <g className={`radar-zone radar-zone-soon ${radarFilter==="soon"?"active":""}`} role="button" tabIndex={0} aria-pressed={radarFilter==="soon"} aria-label={`مهلت تا ۳ روز، ${radarTasks.counts.soon} وظیفه`} onClick={event=>{event.stopPropagation();setRadarFilter("soon");}} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();setRadarFilter("soon");}}}><circle cx="160" cy="160" r="62"/><text x="160" y="106">تا ۳ روز · {new Intl.NumberFormat("fa-IR").format(radarTasks.counts.soon)}</text></g>
                <g className={`radar-zone radar-zone-overdue ${radarFilter==="overdue"?"active":""}`} role="button" tabIndex={0} aria-pressed={radarFilter==="overdue"} aria-label={`مهلت گذشته، ${radarTasks.counts.overdue} وظیفه`} onClick={event=>{event.stopPropagation();setRadarFilter("overdue");}} onKeyDown={event=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();setRadarFilter("overdue");}}}><circle cx="160" cy="160" r="32"/><text x="160" y="156">گذشته</text><text className="radar-zone-count" x="160" y="170">{new Intl.NumberFormat("fa-IR").format(radarTasks.counts.overdue)}</text></g>
              </svg>
            </div>
            <div className="deadline-radar-results">
              <div className="radar-filter-bar"><button type="button" className={radarFilter==="all"?"active":""} onClick={()=>setRadarFilter("all")}>همه <span>{new Intl.NumberFormat("fa-IR").format(radarTasks.total)}</span></button>{radarBands.map(band=><button type="button" key={band.key} className={radarFilter===band.key?"active":""} onClick={()=>setRadarFilter(band.key)}>{band.label}<span>{new Intl.NumberFormat("fa-IR").format(band.count)}</span></button>)}</div>
              <div className="radar-results-heading"><b>{radarFilterTitle}</b><small>{new Intl.NumberFormat("fa-IR").format(radarVisibleItems.length)} مورد نمایش داده شده</small></div>
              {radarVisibleItems.length ? <div className="deadline-radar-list">{radarVisibleItems.map((entry,index)=><button type="button" className={`deadline-radar-item ${entry.days<0?"overdue":entry.days<=3?"urgent":entry.days<=7?"soon":"upcoming"}`} key={entry.item.id} onClick={()=>openWallTask(entry.item)} title={entry.item.text}><span className="radar-item-index">{new Intl.NumberFormat("fa-IR").format(index+1)}</span><span className="radar-item-copy"><b>مصوبه {entry.item.number} · شناسه یکتا: {entry.item.id}</b><small>{entry.days<0?`${new Intl.NumberFormat("fa-IR").format(Math.abs(entry.days))} روز از سررسید گذشته`:entry.days===0?"سررسید امروز":`سررسید تا ${new Intl.NumberFormat("fa-IR").format(entry.days)} روز دیگر`}</small><em>{entry.item.text}</em></span><span className={`status ${entry.status}`}>{labels[entry.status]||entry.status}</span></button>)}</div> : <div className="deadline-radar-empty"><CircleAlert size={18}/><span>در این بازه وظیفه‌ای با سررسید نزدیک وجود ندارد.</span></div>}
              {radarTasks.total>radarTasks.items.length&&<small className="deadline-radar-more">در هر بازه ۶ وظیفهٔ نزدیک‌تر نمایش داده می‌شود؛ عدد حلقه تعداد کامل وظایف را نشان می‌دهد.</small>}
            </div>
          </div> : <div className="deadline-radar-empty"><CircleAlert size={18}/><span>در ۳۰ روز آینده وظیفهٔ بازی با سررسید ثبت نشده است.</span></div>}
        </section>
      </section>}

      {tab === "wall" && (wallStatusFilter === "all" ? <><div className="section-head"><div><h2>جلسه‌ها و پیگیری‌ها</h2><p>روزهای بدون جلسه از نمای تقویم کنار گذاشته شده‌اند؛ یک جلسه را انتخاب کنید تا مصوبات و وظایفش را ببینید.</p></div><div className="home-shortcuts"><span className="counter">{calendarItems.length} از {mine.length} وظیفه</span>{isAdmin&&<button type="button" className="primary" onClick={requestNewMeeting}><Plus size={15}/>افزودن جلسه</button>}</div></div><div className="calendar-filters"><div className="search"><Search size={16}/><input value={calendarSearch} onChange={event=>setCalendarSearch(event.target.value)} placeholder="جستجوی شماره، شناسه یکتا یا متن مصوبه"/></div><label>فیلتر وضعیت<select value={calendarFilterStatus} onChange={event=>setCalendarFilterStatus(event.target.value)}><option value="all">همه وضعیت‌ها</option>{statusEntries.map(([key,title])=><option key={key} value={key}>{title}</option>)}</select></label><label>از تاریخ جلسه<DatePicker ref={calendarFromPickerRef} calendar={persian} locale={persian_fa} format="YYYY/MM/DD" value={calendarFrom?gregorianToJalali(calendarFrom).replace(/\./g,"/"):""} onChange={date=>{setCalendarFrom(date?localDateKey(date.toDate()):"");window.setTimeout(()=>calendarFromPickerRef.current?.closeCalendar(),50);}}/></label><label>تا تاریخ جلسه<DatePicker ref={calendarToPickerRef} calendar={persian} locale={persian_fa} format="YYYY/MM/DD" value={calendarTo?gregorianToJalali(calendarTo).replace(/\./g,"/"):""} onChange={date=>{setCalendarTo(date?localDateKey(date.toDate()):"");window.setTimeout(()=>calendarToPickerRef.current?.closeCalendar(),50);}}/></label>{(calendarFrom||calendarTo)&&<button type="button" className="secondary clear-calendar-dates" onClick={()=>{setCalendarFrom("");setCalendarTo("");}}>پاک‌کردن بازه</button>}</div>{calendarFrom&&calendarTo&&calendarFrom>calendarTo&&<div className="notice">تاریخ شروع بازه باید قبل از تاریخ پایان باشد.</div>}{calendarSearch.trim()&&<section className="wall-search-results"><div className="wall-search-results-head"><b>نتایج جستجو در همه مصوبه‌های قابل‌مشاهده</b><span>{new Intl.NumberFormat("fa-IR").format(calendarItems.length)} مورد</span></div>{calendarItems.length?<div className="wall-search-result-list">{calendarItems.map(item=>{const date=resolutionMeetingDay(item);const status=wallStatusOf(item);return <button type="button" key={item.id} className={`wall-search-result ${status}`} onClick={()=>{setSelectedDay(date);setCalendarMonth(date.slice(0,7)+".01");setCalendarTargetId(item.id);}}><span className="wall-search-result-date">{formatDate(item.meetingDate,item.meetingDateJalali?.replace(/\./g,"/"))}</span><span className="wall-search-result-body"><b>مصوبه {item.number} · شناسه یکتا: {item.id}</b><span>{item.text}</span></span><span className={`status ${status}`}>{labels[status]||status}</span></button>;})}</div>:<p className="wall-search-empty">مصوبه‌ای با این شماره یا متن پیدا نشد.</p>}</section>}<section className="calendar-panel"><div className="calendar-heading"><button className="secondary" onClick={() => moveCalendarWeek(-1)}>هفته قبل</button><div className="calendar-period"><h3>{jalaliMonthTitle(calendarMonth)} · هفته {jalaliWeekNumber(calendarMonth,selectedDay)} از {jalaliWeekCount(calendarMonth)}</h3><div className="week-jump"><span>رفتن به هفته</span><DatePicker ref={weekDatePickerRef} calendar={persian} locale={persian_fa} format="YYYY/MM/DD" value={selectedDay.replace(/\./g,"/")} onChange={date=>{if(date){const jalali=normalizeJalaliDate(date.format("YYYY.MM.DD"));setSelectedDay(jalali);setCalendarMonth(jalali.slice(0,7)+".01");window.setTimeout(() => weekDatePickerRef.current?.closeCalendar(), 50);}}}/></div></div><button className="secondary" onClick={() => moveCalendarWeek(1)}>هفته بعد</button></div><div className="calendar-day-glance"><b>{selectedDay.replace(/\./g,"/")}</b><span>{meetings.find(meeting=>normalizeJalaliDate(meeting.dateJalali||gregorianToJalali(meeting.date))===selectedDay)?.title||(selectedDayItems.some(item=>item.isSpecialTracking)?"پیگیری ویژه":"روز جلسه")}</span><span>{selectedDayItems.length} وظیفه</span><span className="completed-glance">{selectedDayStatusCounts.completed} اجراشده</span><span className="active-glance">{selectedDayStatusCounts.active} در حال پیگیری</span><span className="delayed-glance">{selectedDayStatusCounts.delayed} انجام نشده</span></div><div className="calendar-wall"><div className="calendar-wall-weeks">{Array.from({length:jalaliWeekCount(calendarMonth)},(_,week)=><section id={`calendar-week-${week}`} className={`calendar-week ${week===jalaliWeekNumber(calendarMonth,selectedDay)-1?"selected-week":""}`} key={week}><header>هفته {new Intl.NumberFormat("fa-IR").format(week+1)}</header><div className="calendar-week-days" style={{gridTemplateColumns:`repeat(${Math.max(1,selectedWeekMeetingDates.length)},minmax(0,1fr))`}}>{["شنبه","یکشنبه","دوشنبه","سه‌شنبه","چهارشنبه","پنجشنبه","جمعه"].map((weekday,weekdayIndex)=>{const day=week*7+weekdayIndex-jalaliDayOffset(calendarMonth)+1;const valid=day>=1&&day<=jalaliMonthDays(calendarMonth);const date=valid?jalaliDateAt(calendarMonth,day):"";if(!valid||!selectedWeekMeetingDates.includes(date))return null;const tasks=valid?calendarItems.filter(item=>resolutionMeetingDay(item)===date):[];return <div key={weekday} className={`calendar-wall-day ${valid?"":"outside"} ${selectedDay===date?"active":""}`} onClick={()=>valid&&setSelectedDay(date)}><div className="calendar-wall-date"><b>{weekday}</b>{valid&&<span>{new Intl.NumberFormat("fa-IR").format(day)}</span>}</div><div className="calendar-wall-tasks">{tasks.slice(0,2).map(task=><button type="button" key={task.id} className={`calendar-wall-task ${wallStatusOf(task)}`} onClick={()=>{setTab("wall");setWallStatusFilter("all");setSelectedDay(date);setCalendarTargetId(task.id);}}><b>مصوبه {task.number}</b><span title={task.text}>{task.text}</span></button>)}{tasks.length>2&&<span className="calendar-wall-more">+ {tasks.length-2} وظیفهٔ دیگر</span>}{valid&&!tasks.length&&<span className="calendar-wall-empty">جلسهٔ بدون مصوبه</span>}</div></div>;})}</div></section>)}</div>{selectedWeekMeetingDates.length===0&&<div className="calendar-no-meetings"><b>در این هفته جلسه‌ای ثبت نشده</b><span>تاریخ را انتخاب کنید یا به هفتهٔ قبل و بعد بروید.</span>{isAdmin&&<button type="button" className="primary" onClick={requestNewMeeting}><Plus size={15}/>ثبت جلسه برای این هفته</button>}</div>}</div></section><div className="section-head day-head"><div><h2>کارهای {selectedDay.replace(/\./g,"/")}</h2><p>مصوبات و وظایف ثبت‌شده برای این روز</p></div><span className="counter">{selectedDayItems.length} مورد</span></div><div className="cards">{selectedDayItems.map(item=><ResolutionCard key={item.id} busy={busy} sentWarningIds={sentWarningKeys} onSendWarning={nationalIds=>sendResolutionWarnings(item.id,nationalIds)} anchorId={`resolution-${item.id}`} item={item} submittedReports={reportSubmissions} reportsLoading={reportsLoading} reportsError={reportsError} groups={groups} users={users} viewerId={viewerId} isAdmin={isAdmin} onStatus={(status,nationalId)=>void updateResolutionStatus(item.id,status,nationalId)} onUpload={file=>uploadAttachment(item.id,file)} eventDraft={eventDrafts[item.id] ?? ""} onEventChange={text=>setEventDrafts(current=>({...current,[item.id]:text}))} onEventSubmit={()=>void addResolutionEvent(item.id)} onReportDraftChange={text=>setReportDrafts(current=>({...current,[item.id]:text}))} reportDraft={reportDrafts[item.id] ?? (isAdmin ? "" : "مصوبه به طور صحیح و در موعد مقرر انجام شد")} submittedFading={fadingReportedResolutionIds.includes(item.id)} onReportSubmit={files=>submitCompletionReport(item.id,files)} periodicDraft={periodicDrafts[item.id] ?? ""} onPeriodicDraftChange={text=>setPeriodicDrafts(current=>({...current,[item.id]:text}))} onPeriodicSubmit={()=>void submitPeriodicReport(item.id)} onApproveAttachment={(attachmentId,approved)=>void request(`/api/attachments/${attachmentId}/approval`,"PATCH",{nationalId:viewerId,approvedForAll:approved})}/>)}</div>{!calendarItems.some(item=>item.meetingDateJalali?.replace(/\./g,".")===selectedDay)&&<Empty />}</> : <><div className="section-head"><div><h2>{wallStatusFilter === "completed" ? "مصوبات اجراشده" : wallStatusFilter === "delayed" ? "مصوبات انجام نشده" : "مصوبات نیازمند پیگیری"}</h2><p>موارد بر اساس وضعیت پیگیری شما فیلتر شده‌اند.</p></div><button className="secondary" onClick={() => setWallStatusFilter("all")}>بازگشت به تقویم</button></div><div className="cards">{wallItems.map(item=><ResolutionCard key={item.id} busy={busy} sentWarningIds={sentWarningKeys} onSendWarning={nationalIds=>sendResolutionWarnings(item.id,nationalIds)} item={item} submittedReports={reportSubmissions} reportsLoading={reportsLoading} reportsError={reportsError} groups={groups} users={users} viewerId={viewerId} isAdmin={isAdmin} onStatus={(status,nationalId)=>void updateResolutionStatus(item.id,status,nationalId)} onUpload={file=>uploadAttachment(item.id,file)} eventDraft={eventDrafts[item.id] ?? ""} onEventChange={text=>setEventDrafts(current=>({...current,[item.id]:text}))} onEventSubmit={()=>void addResolutionEvent(item.id)} onReportDraftChange={text=>setReportDrafts(current=>({...current,[item.id]:text}))} reportDraft={reportDrafts[item.id] ?? (isAdmin ? "" : "مصوبه به طور صحیح و در موعد مقرر انجام شد")} onReportSubmit={files=>submitCompletionReport(item.id,files)} periodicDraft={periodicDrafts[item.id] ?? ""} onPeriodicDraftChange={text=>setPeriodicDrafts(current=>({...current,[item.id]:text}))} onPeriodicSubmit={()=>void submitPeriodicReport(item.id)} onApproveAttachment={(attachmentId,approved)=>void request(`/api/attachments/${attachmentId}/approval`,"PATCH",{nationalId:viewerId,approvedForAll:approved})} />)}</div>{!wallItems.length && <Empty />}</>)}{tab === "notifications" && <section className="panel notification-panel">
        <div className="section-head"><div><h2>{notificationTab === "notifications" ? "اعلان‌های من" : "رویدادها"}</h2><p>جدیدترین موارد ابتدا نمایش داده می‌شوند؛ فهرست هر ۱۵ ثانیه به‌روز می‌شود.</p></div><div className="notification-heading-actions">{notificationTab === "notifications" && <button type="button" className="secondary mark-all-read" disabled={busy || unreadNotifications === 0} onClick={()=>void markAllNotificationsRead()}>خواندن همه</button>}<span className="counter">{notificationTabItems.length} مورد{notificationTab === "notifications" ? ` · ${unreadNotifications} خوانده‌نشده` : ""}</span></div></div>
        <div className="notification-tabs" role="tablist" aria-label="بخش اعلان‌ها"><button type="button" role="tab" aria-selected={notificationTab === "notifications"} className={notificationTab === "notifications" ? "active" : ""} onClick={() => setNotificationTab("notifications")}><Bell size={15}/>اعلان‌های من<span>{notificationFeedCount}</span></button><button type="button" role="tab" aria-selected={notificationTab === "events"} className={notificationTab === "events" ? "active" : ""} onClick={() => setNotificationTab("events")}><ClipboardList size={15}/>رویدادها<span>{eventFeedCount}</span></button></div>
        {notificationTabItems.length ? <><div className="notification-feed">{pagedNotificationFeed.map(item => <article className={`notification-feed-item ${item.kind} feed-${item.kind === "event" ? "event" : item.type} ${item.kind === "notification" && !item.isRead ? "unread" : "read"}`} key={item.feedKey}>
          <span className="notification-feed-icon"><Bell size={17}/></span>
          <div className="notification-feed-content"><div className="notification-feed-heading"><b>{item.kind === "event" ? item.userName || "رویداد سامانه" : item.type === "deadline" ? "یادآوری سررسید" : item.type === "overdue" ? "هشدار تأخیر" : item.type === "bale-warning" ? "هشدار ادمین" : item.type === "assigned" ? "وظیفه جدید" : item.type === "report-confirmed" ? "ثبت و تأیید گزارش شما" : "اعلان"}</b><time dateTime={item.createdAt}>{formatDateTime(item.createdAt)}</time></div>
            <p>{item.text}</p><small>{item.resolutionNumber ? `مصوبه ${item.resolutionNumber} · شناسه یکتا: ${item.resolutionId}` : item.kind === "event" ? "رویداد پیگیری" : "اعلان سامانه"}</small>
          </div>
          {item.kind === "notification" && !item.isRead && <button type="button" className="secondary mark-read" onClick={()=>void markNotificationRead(item.id)}>خواندم</button>}
        </article>)}</div><div className="notification-pagination"><span>{notificationTabItems.length} مورد · صفحه {notificationPage} از {notificationPageCount}</span><div><button type="button" className="secondary" disabled={notificationPage <= 1} onClick={() => setNotificationPage(page => Math.max(1, page - 1))}>قبلی</button><button type="button" className="secondary" disabled={notificationPage >= notificationPageCount} onClick={() => setNotificationPage(page => Math.min(notificationPageCount, page + 1))}>بعدی</button></div></div></> : <div className="empty"><Bell size={32}/><b>{notificationTab === "notifications" ? "اعلانی برای نمایش نیست" : "رویدادی برای نمایش نیست"}</b><span>موارد جدید در این بخش نمایش داده می‌شوند.</span></div>}
      </section>}

      {(tab === "special-followups" || tab === "provincial-trips") && <section className="panel special-followups-page">
        <div className="section-head"><div><span className="report-kicker">{isAdmin ? "مدیریت دستورات" : "کارتابل من"}</span><h2>{specialTrackingLabel(currentSpecialTrackingType)}</h2><p>{isAdmin ? "ثبت مورد جدید و مشاهدهٔ گزارش وضعیت کاربران" : "موارد ارجاع‌شده به شما و آخرین وضعیت گزارش‌ها"}</p></div><span className="counter">{filteredSpecialFollowups.length} مورد</span></div>
        <div className="special-followup-summary"><article><small>کل موارد</small><b>{specialFollowupStats.total}</b></article><article><small>در حال پیگیری</small><b>{specialFollowupStats.pending}</b></article><article><small>با تأخیر</small><b>{specialFollowupStats.delayed}</b></article><article><small>تکمیل‌شده</small><b>{specialFollowupStats.completed}</b></article></div>
        <div className="special-followup-page-filters"><div className="search"><Search size={16}/><input value={specialFollowupQuery} onChange={event=>setSpecialFollowupQuery(event.target.value)} placeholder="جستجو در شماره، استان، موضوع یا شرح پیگیری"/></div>{isAdmin&&currentSpecialTrackingType==="provincial"&&<label>استان<select value={specialFollowupProvinceFilter} onChange={event=>setSpecialFollowupProvinceFilter(event.target.value)}><option value="all">همه استان‌ها</option>{iranProvinceOptions.map(province=><option key={province} value={province}>{province}</option>)}</select></label>}<label>وضعیت<select value={specialFollowupStatusFilter} onChange={event=>setSpecialFollowupStatusFilter(event.target.value)}><option value="all">همه وضعیت‌ها</option>{statusEntries.map(([key,title])=><option key={key} value={key}>{title}</option>)}</select></label><button type="button" className="secondary" onClick={()=>{setSpecialFollowupQuery("");setSpecialFollowupStatusFilter("all");setSpecialFollowupProvinceFilter("all");}}>پاک‌کردن فیلترها</button></div>
        {isAdmin && reportsLoading && <div className="report-empty">در حال دریافت گزارش‌های کاربران…</div>}{isAdmin && reportsError && <div className="notice" role="alert">{reportsError}<button type="button" className="secondary" onClick={()=>{submissionsFetchStarted.current=false;setSubmissionsLoaded(false);setReportsRetryCount(count=>count+1);}}>تلاش دوباره</button></div>}
        {filteredSpecialFollowups.length ? isAdmin ? <div className="table-wrap"><table><thead><tr><th>{currentSpecialTrackingType==="provincial"?"تاریخ سفر":"تاریخ درخواست"}</th>{currentSpecialTrackingType==="provincial"&&<th>استان</th>}<th>شماره</th><th>موضوع / شرح</th><th>ارجاع به</th><th>وضعیت</th><th>گزارش کاربران</th></tr></thead><tbody>{filteredSpecialFollowups.map(item=>{const submitted=reportSubmissions.filter(report=>report.resolutionId===item.id);const legacy=(item.progress||[]).filter(progress=>!!progress.reportText?.trim()&&!submitted.some(report=>report.nationalId===progress.nationalId));const count=submitted.length+legacy.length;return <tr key={item.id}><td>{specialTrackingLabel(item.specialTrackingType)}<small>{item.specialTrackingType==="provincial"?"تاریخ سفر: ":"تاریخ درخواست: "}{formatDate(item.meetingDate,item.meetingDateJalali?.replace(/\./g,"/"))}</small></td>{currentSpecialTrackingType==="provincial"&&<td>{item.province||"—"}</td>}<td><b>{item.number}</b><small>شناسه یکتا: {item.id}</small></td><td>{item.text}{item.notes&&<small>{item.notes}</small>}</td><td>{resolutionRoutingLabel(item,groups,users)}</td><td><span className={`status ${item.status}`}>{labels[item.status]||item.status}</span></td><td><details className="special-followup-report-details"><summary>مشاهده ({count})</summary>{submitted.map(report=><article className="submitted-report-entry" key={"report-"+report.id}><b>{report.reportType==="periodic"?"گزارش مستمر":"گزارش اقدام"} · {report.userName}</b><small>{formatDateTime(report.submittedAt)}{report.userTitle?" · "+report.userTitle:""}</small><p>{report.text}</p>{report.adminFeedback&&<small>نظر مدیر: {report.adminFeedback}</small>}{report.attachments?.map(file=><a className="special-followup-report-file" key={file.id} href={"/api/attachments/"+file.id} target="_blank" rel="noreferrer"><Paperclip size={13}/>{file.originalName}</a>)}</article>)}{legacy.map(progress=><article className="submitted-report-entry" key={"progress-"+progress.nationalId}><b>گزارش اقدام · {users.find(user=>user.nationalId===progress.nationalId)?.displayName||progress.nationalId}</b><small>{formatDateTime(progress.updatedAt)}</small><p>{progress.reportText}</p>{progress.adminFeedback&&<small>نظر مدیر: {progress.adminFeedback}</small>}</article>)}{count===0&&<small>هنوز گزارشی ثبت نشده است.</small>}</details></td></tr>})}</tbody></table></div> : <div className="special-followup-user-list">{filteredSpecialFollowups.map(item=>{const progress=item.progress?.find(entry=>entry.nationalId===viewerId);const status=progress?.status||item.status;const ownReport=progress?.reportText?.trim();return <article className="special-followup-user-card" key={item.id}><div className="special-followup-user-card-head"><div><b>پیگیری {item.number} · شناسه یکتا: {item.id}</b><small>{item.specialTrackingType==="provincial"?"تاریخ سفر: ":"تاریخ درخواست: "}{formatDate(item.meetingDate,item.meetingDateJalali?.replace(/\./g,"/"))}</small>{item.specialTrackingType==="provincial"&&item.province&&<small>استان: {item.province}</small>}</div><span className={`status ${status}`}>{labels[status]||status}</span></div><h3>{item.text}</h3>{item.notes&&<p>{item.notes}</p>}<div className="special-followup-user-meta"><span>{item.isConfidential?"🔒 محرمانه":specialTrackingLabel(item.specialTrackingType)}</span><span>{ownReport?"گزارش ثبت شده":"گزارشی ثبت نشده"}</span></div>{ownReport&&<details><summary>مشاهدهٔ آخرین گزارش</summary><p>{ownReport}</p>{progress?.adminFeedback&&<small>نظر مدیر: {progress.adminFeedback}</small>}</details>}<button type="button" className="secondary" onClick={()=>openWallTask(item)}>مشاهده جزئیات و گزارش وضعیت</button></article>})}</div> : <div className="empty"><ClipboardList size={28}/><b>{specialFollowupSource.length?"موردی با این جستجو و فیلتر پیدا نشد":currentSpecialTrackingType==="provincial"?"سفر استانی برای نمایش وجود ندارد":"دستوری برای نمایش وجود ندارد"}</b><span>{isAdmin?currentSpecialTrackingType==="provincial"?"برای ثبت، از دکمهٔ ثبت سفر استانی استفاده کنید.":"برای ثبت، از دکمهٔ ثبت دستور وزیر استفاده کنید.":"در حال حاضر موردی به شما ارجاع نشده است."}</span></div>}
      </section>}
      {tab === "resolutions" && !isAdmin && <div className="user-resolution-page"><section className="panel"><div className="section-head"><div><span className="report-kicker">کارتابل مصوبات شورای معاونین</span><h2>جستجو در مصوبات شورای معاونین</h2><p>بر اساس موضوع، شماره، جلسه، تاریخ، وضعیت محرمانگی و ارسال گزارش فیلتر کنید.</p></div><span className="counter">{filtered.length} مصوبه</span></div><div className="toolbar"><div className="search"><Search size={17}/><input value={query} onChange={event=>{setQuery(event.target.value);setResolutionPage(1);}} placeholder="جستجو در موضوع، شماره، شناسه یا عنوان جلسه"/></div></div><div className="resolution-filters user-resolution-filters"><label>جلسه<select value={resolutionMeetingFilter} onChange={event=>setResolutionMeetingFilter(event.target.value)}><option value="">همه جلسه‌ها</option>{userMeetingOptions.map(option=><option key={option.id} value={String(option.id)}>{option.title}</option>)}</select></label><label>از تاریخ جلسه/درخواست<DatePicker ref={resolutionDateFromPickerRef} calendar={persian} locale={persian_fa} format="YYYY/MM/DD" value={resolutionDateFrom?gregorianToJalali(resolutionDateFrom).replace(/\./g,"/"):""} onChange={date=>{setResolutionDateFrom(date?localDateKey(date.toDate()):"");window.setTimeout(()=>resolutionDateFromPickerRef.current?.closeCalendar(),50);}}/></label><label>تا تاریخ جلسه/درخواست<DatePicker ref={resolutionDateToPickerRef} calendar={persian} locale={persian_fa} format="YYYY/MM/DD" value={resolutionDateTo?gregorianToJalali(resolutionDateTo).replace(/\./g,"/"):""} onChange={date=>{setResolutionDateTo(date?localDateKey(date.toDate()):"");window.setTimeout(()=>resolutionDateToPickerRef.current?.closeCalendar(),50);}}/></label><label>وضعیت<select value={resolutionStatusFilter} onChange={event=>setResolutionStatusFilter(event.target.value)}><option value="all">همه وضعیت‌ها</option>{statusEntries.map(([key,title])=><option key={key} value={key}>{title}</option>)}</select></label><label>محرمانگی<select value={resolutionConfidentialFilter} onChange={event=>setResolutionConfidentialFilter(event.target.value)}><option value="all">همه</option><option value="confidential">محرمانه</option><option value="ordinary">عادی</option></select></label><label>نوع پیگیری<select value={resolutionTypeFilter} onChange={event=>{setResolutionTypeFilter(event.target.value);setResolutionPage(1);}}><option value="all">همهٔ مصوبات</option><option value="standard">مصوبات جلسات</option><option value="special">پیگیری‌های ویژه</option></select></label><label>گزارش اقدام<select value={resolutionReportFilter} onChange={event=>setResolutionReportFilter(event.target.value)}><option value="all">همه</option><option value="has">گزارش ارسال شده</option><option value="missing">گزارش ارسال نشده</option></select></label><button type="button" className="secondary" onClick={()=>{setQuery("");setResolutionDateFrom("");setResolutionDateTo("");setResolutionMeetingFilter("");setResolutionStatusFilter("all");setResolutionConfidentialFilter("all");setResolutionTypeFilter("all");setResolutionReportFilter("all");setResolutionPage(1);}}>پاک‌کردن فیلترها</button></div>{filtered.length ? <div className="user-resolution-results">{filtered.map(item=>{const meeting=meetings.find(entry=>entry.id===item.meetingId);const hasReport=!!item.hasSubmittedReport||(item.progress||[]).some(progress=>progress.nationalId===viewerId&&!!progress.reportText?.trim());const personalStatus=item.progress?.find(progress=>progress.nationalId===viewerId)?.status||item.status;return <button type="button" className="user-resolution-result" key={item.id} onClick={()=>openWallTask(item)}><span className="user-resolution-result-top"><b>مصوبه {item.number} · شناسه یکتا: {item.id}</b><span className={`status ${personalStatus}`}>{labels[personalStatus]||personalStatus}</span></span><strong>{item.text}</strong><small>{item.isSpecialTracking?"پیگیری ویژه":`جلسه: ${meeting?.title||item.meetingTitle||"—"}`} · {item.isSpecialTracking?"تاریخ درخواست":"تاریخ جلسه"}: {formatDate(item.meetingDate,item.meetingDateJalali?.replace(/\./g,"/"))}</small><span className="user-resolution-result-meta"><small>{item.isConfidential?"🔒 محرمانه":"عادی"}</small><small>{hasReport?"گزارش ارسال شده":"گزارش ارسال نشده"}</small></span></button>;})}</div> : <div className="empty"><Search size={30}/><b>مصوبه‌ای با این فیلترها پیدا نشد</b><span>فیلترها را تغییر دهید یا پاک کنید.</span></div>}</section></div>}
      {tab === "execution-calendar" && <>{!isAdmin && <div className="execution-calendar-tabs" role="tablist" aria-label="بخش‌های تقویم اجرایی"><button type="button" role="tab" aria-selected={executionCalendarView==="summary"} className={executionCalendarView==="summary"?"active":""} onClick={()=>setExecutionCalendarView("summary")}>خلاصه مدیریتی</button><button type="button" role="tab" aria-selected={executionCalendarView==="calendar"} className={executionCalendarView==="calendar"?"active":""} onClick={()=>setExecutionCalendarView("calendar")}>تقویم</button><button type="button" role="tab" aria-selected={executionCalendarView==="attention"} className={executionCalendarView==="attention"?"active":""} onClick={()=>setExecutionCalendarView("attention")}>نیازمند توجه</button></div>}{!isAdmin && executionCalendarView === "summary" && <>
        <section className="user-management-summary panel">
          <div className="section-head"><div><span className="home-focus-kicker">نمای شخصی</span><h2>خلاصهٔ مدیریتی من</h2><p>نمای کلی از وضعیت مصوبه‌های ارجاع‌شده به شما</p></div><span className="user-summary-percent">{new Intl.NumberFormat("fa-IR").format(userSummaryPercent)}٪ اجرا شده</span></div>
          <div className="user-summary-progress" role="progressbar" aria-label="درصد اجرای مصوبه‌های من" aria-valuemin={0} aria-valuemax={100} aria-valuenow={userSummaryPercent}><span style={{width:`${userSummaryPercent}%`}}/></div>
          <div className="user-summary-metrics">
            <div><small>کل مصوبه‌ها</small><b>{new Intl.NumberFormat("fa-IR").format(userSummary.total)}</b></div>
            <div className="completed"><small>اجرا شده</small><b>{new Intl.NumberFormat("fa-IR").format(userSummary.completed)}</b></div>
            <div className="active"><small>باز و در پیگیری</small><b>{new Intl.NumberFormat("fa-IR").format(userSummary.active)}</b></div>
            <div className="delayed"><small>عقب‌افتاده</small><b>{new Intl.NumberFormat("fa-IR").format(userSummary.delayed)}</b></div>
            <div className="review"><small>گزارش‌های نیازمند توجه</small><b>{new Intl.NumberFormat("fa-IR").format(userSummary.reportsToReview)}</b></div>
          </div>
        </section>
      </>}{!isAdmin && executionCalendarView === "attention" && <>
        <section className="user-attention panel">
          <div className="section-head"><div><span className="home-focus-kicker">اولویت اقدام</span><h2>نیازمند توجه</h2><p>موعدهای نزدیک یا گذشته، گزارش‌های نیازمند اصلاح و وظایف بدون به‌روزرسانی</p></div><span className="counter">{new Intl.NumberFormat("fa-IR").format(userAttentionItems.length)} مورد</span></div>
          {userAttentionItems.length ? <div className="user-attention-list">{userAttentionItems.map(({item,reasons})=><button type="button" className="user-attention-item" key={item.id} onClick={()=>openWallTask(item)}><span className="user-attention-item-title"><b>مصوبه {item.number}</b><small>{item.dueDate ? "مهلت: "+formatDate(item.dueDate,item.dueDateJalali?.replace(/\./g,"/")) : "بدون مهلت ثبت‌شده"}</small></span><span className="user-attention-text">{item.text}</span><span className="user-attention-reasons">{reasons.map(reason=><small key={reason}>{reason}</small>)}</span></button>)}</div> : <div className="user-attention-empty"><CheckCheck size={21}/><span>مورد فوری یا گزارش نیازمند توجهی ندارید.</span></div>}
        </section>
      </>}{(isAdmin || executionCalendarView === "calendar") && <>
      <section className="panel execution-calendar-panel"><div className="section-head"><div><h2>تقویم اجرایی</h2><p>فقط روزهایی که برای مصوبه‌ای مهلت اجرا ثبت شده، یادداشت دارند.</p></div><span className="counter">{executionCalendarItems.length} وظیفه در بازه</span></div><div className="calendar-filters"><label>از تاریخ<DatePicker ref={executionCalendarFromPickerRef} calendar={persian} locale={persian_fa} format="YYYY/MM/DD" value={gregorianToJalali(executionCalendarFrom).replace(/\./g,"/")} onChange={date=>{if(date){setExecutionCalendarFrom(localDateKey(date.toDate()));window.setTimeout(()=>executionCalendarFromPickerRef.current?.closeCalendar(),50);}}}/></label><label>تا تاریخ<DatePicker ref={executionCalendarToPickerRef} calendar={persian} locale={persian_fa} format="YYYY/MM/DD" value={gregorianToJalali(executionCalendarTo).replace(/\./g,"/")} onChange={date=>{if(date){setExecutionCalendarTo(localDateKey(date.toDate()));window.setTimeout(()=>executionCalendarToPickerRef.current?.closeCalendar(),50);}}}/></label><button type="button" className="secondary" onClick={()=>{setExecutionCalendarFrom(addMonthsToDateKey(today(),-3));setExecutionCalendarTo(addMonthsToDateKey(today(),3));setExecutionCalendarMonth(jalaliToday().slice(0,7)+".01");setExecutionCalendarSelectedDay(jalaliToday());}}>بازگشت به بازهٔ سه‌ماهه</button><span className="execution-calendar-range">بازهٔ پیش‌فرض: سه ماه قبل تا سه ماه بعد</span></div><section className="calendar-panel execution-calendar-month"><div className="calendar-heading"><button type="button" className="secondary" disabled={executionCalendarMonth.slice(0,7)<=executionCalendarFirstMonth} onClick={()=>moveExecutionCalendarMonth(-1)}>ماه قبل</button><h3>{jalaliMonthTitle(executionCalendarMonth)}</h3><button type="button" className="secondary" disabled={executionCalendarMonth.slice(0,7)>=executionCalendarLastMonth} onClick={()=>moveExecutionCalendarMonth(1)}>ماه بعد</button></div><div className="calendar-grid"><div className="calendar-weekday">شنبه</div><div className="calendar-weekday">یکشنبه</div><div className="calendar-weekday">دوشنبه</div><div className="calendar-weekday">سه‌شنبه</div><div className="calendar-weekday">چهارشنبه</div><div className="calendar-weekday">پنجشنبه</div><div className="calendar-weekday">جمعه</div>{Array.from({length:jalaliWeekCount(executionCalendarMonth)*7},(_,index)=>{const dayNumber=index-jalaliDayOffset(executionCalendarMonth)+1;const valid=dayNumber>=1&&dayNumber<=jalaliMonthDays(executionCalendarMonth);const day=valid?jalaliDateAt(executionCalendarMonth,dayNumber):"";const tasks=day?executionCalendarByDay.get(day)||[]:[];if(!valid)return <div key={"blank-"+index} className="calendar-blank"/>;if(tasks.length===0)return <div key={day} className="calendar-day execution-calendar-day"><b>{new Intl.NumberFormat("fa-IR").format(dayNumber)}</b></div>;return <button type="button" key={day} className={"calendar-day has-tasks execution-calendar-day"+(normalizeJalaliDate(executionCalendarSelectedDay)===day?" active":"")} onClick={()=>{setExecutionCalendarSelectedDay(day);setExecutionCalendarScrollTaskId(tasks[0].id);}}><b>{new Intl.NumberFormat("fa-IR").format(dayNumber)}</b><small>{tasks.length} وظیفه</small><span>{tasks[0].text}</span>{tasks.length>1&&<span className="execution-calendar-more">+ {tasks.length-1} مورد دیگر</span>}</button>;})}</div></section></section><div className="section-head day-head"><div><h2>مهلت‌های {normalizeJalaliDate(executionCalendarSelectedDay).replace(/\./g,"/")}</h2><p>با انتخاب یک روز، مصوبه‌های دارای مهلت همان روز را ببینید.</p></div><span className="counter">{selectedExecutionItems.length} مورد</span></div>{selectedExecutionItems.length>0?<div className="execution-calendar-task-list">{selectedExecutionItems.map(item=><button type="button" id={"execution-calendar-task-"+item.id} className="execution-calendar-task" key={item.id} onClick={()=>openWallTask(item)}><span><b>مصوبه {item.number}</b><small>شناسه یکتا: {item.id}</small></span><span className="execution-calendar-task-text">{item.text}</span><span className={"status "+wallStatusOf(item)}>{labels[wallStatusOf(item)]||wallStatusOf(item)}</span></button>)}</div>:<div className="empty"><CalendarDays size={30}/><b>برای این روز مهلتی ثبت نشده است</b><span>روزهای بدون وظیفه در تقویم یادداشتی ندارند.</span></div>}</>}</>}
      {tab === "resolutions" && isAdmin && <><div className="toolbar"><div className="search"><Search size={17} /><input value={query} onChange={event => setQuery(event.target.value)} placeholder="جستجو در شماره، شناسه یکتا، متن، توضیحات یا وضعیت" /></div><span>{filtered.length} مصوبه</span></div><div className="resolution-filters"><label>از تاریخ جلسه<DatePicker ref={resolutionDateFromPickerRef} calendar={persian} locale={persian_fa} format="YYYY/MM/DD" value={resolutionDateFrom?gregorianToJalali(resolutionDateFrom).replace(/\./g,"/"):""} onChange={date=>{setResolutionDateFrom(date?localDateKey(date.toDate()):"");window.setTimeout(() => resolutionDateFromPickerRef.current?.closeCalendar(), 50);}}/></label><label>تا تاریخ جلسه<DatePicker ref={resolutionDateToPickerRef} calendar={persian} locale={persian_fa} format="YYYY/MM/DD" value={resolutionDateTo?gregorianToJalali(resolutionDateTo).replace(/\./g,"/"):""} onChange={date=>{setResolutionDateTo(date?localDateKey(date.toDate()):"");window.setTimeout(() => resolutionDateToPickerRef.current?.closeCalendar(), 50);}}/></label><label>جلسه<select value={resolutionMeetingFilter} onChange={event=>setResolutionMeetingFilter(event.target.value)}><option value="">همه جلسات</option>{meetings.map(meeting=><option key={meeting.id} value={meeting.id}>{meeting.title} · {formatDate(meeting.date,meeting.dateJalali?.replace(/\./g,"/"))}</option>)}</select></label><label>فرد<input value={resolutionPersonFilter} onChange={event=>setResolutionPersonFilter(event.target.value)} placeholder="نام، سمت یا کد ملی"/></label><label>وضعیت گزارش<select value={resolutionReportFilter} onChange={event=>setResolutionReportFilter(event.target.value)}><option value="all">همه</option><option value="has">دارای گزارش</option><option value="missing">بدون گزارش</option></select></label><label>نوع پیگیری<select value={resolutionTypeFilter} onChange={event=>{setResolutionTypeFilter(event.target.value);setResolutionPage(1);}}><option value="all">همهٔ مصوبات</option><option value="standard">مصوبات جلسات</option><option value="special">پیگیری‌های ویژه</option></select></label><label>وضعیت مصوبه<select value={resolutionStatusFilter} onChange={event=>setResolutionStatusFilter(event.target.value)}><option value="all">همه وضعیت‌ها</option>{statusEntries.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><button type="button" className="secondary" onClick={()=>{setResolutionDateFrom("");setResolutionDateTo("");setResolutionMeetingFilter("");setResolutionPersonFilter("");setResolutionReportFilter("all");setResolutionTypeFilter("all");setResolutionStatusFilter("all");setQuery("");}}>پاک‌کردن فیلترها</button></div><div className="table-wrap"><table><thead><tr><th><button type="button" className="sortable-header" onClick={()=>toggleResolutionSort("meetingTitle")}>عنوان جلسه{sortIndicator("meetingTitle")}</button></th><th><button type="button" className="sortable-header" onClick={()=>toggleResolutionSort("meetingDate")}>تاریخ جلسه / درخواست{sortIndicator("meetingDate")}</button></th><th><button type="button" className="sortable-header" onClick={()=>toggleResolutionSort("number")}>شماره{sortIndicator("number")}</button></th><th><button type="button" className="sortable-header" onClick={()=>toggleResolutionSort("text")}>متن مصوبه{sortIndicator("text")}</button></th><th><button type="button" className="sortable-header" onClick={()=>toggleResolutionSort("assignment")}>ارجاع{sortIndicator("assignment")}</button></th><th><button type="button" className="sortable-header" onClick={()=>toggleResolutionSort("dueDate")}>مهلت اجرا{sortIndicator("dueDate")}</button></th><th><button type="button" className="sortable-header" onClick={()=>toggleResolutionSort("status")}>وضعیت اجرا{sortIndicator("status")}</button></th><th>عملیات</th></tr></thead><tbody>{pageRows.map(item => { const itemReports=reportSubmissions.filter(report=>report.resolutionId===item.id); const legacyReports=(item.progress||[]).filter(progress=>!!progress.reportText?.trim()&&!itemReports.some(report=>report.nationalId===progress.nationalId)); const reportCount=itemReports.length+legacyReports.length; return <Fragment key={item.id}><tr><td>{item.isSpecialTracking?"پیگیری ویژه":meetings.find(meeting=>meeting.id===item.meetingId)?.title||"—"}</td><td>{formatDate(item.meetingDate, item.meetingDateJalali?.replace(/\./g, "/"))}</td><td><b>{item.number}</b><small>شناسه یکتا: {item.id}</small></td><td>{item.text}<small>{item.notes}</small></td><td>{resolutionRoutingLabel(item, groups, users)}</td><td>{item.dueDate ? formatDate(item.dueDate,item.dueDateJalali?.replace(/\./g,"/")) : "—"}</td><td><div className={`status-cell ${item.status}`}><span className={`status ${item.status}`}>{labels[item.status] || item.status}</span><select className={`status-select ${item.status}`} aria-label="تغییر وضعیت اجرا" disabled={item.status==="cancelled"} value={["completed","cancelled"].includes(item.status)?item.status:""} onChange={event => event.target.value&&void updateResolutionStatus(item.id,event.target.value)}><option value="">تغییر وضعیت کلی</option><option value="completed">اجرا شده</option><option value="cancelled">لغو شده</option></select></div></td><td><div className="resolution-actions"><button type="button" className="action-reports" aria-expanded={openResolutionReportsId===item.id} onClick={()=>setOpenResolutionReportsId(current=>current===item.id?null:item.id)}>{openResolutionReportsId===item.id?"بستن گزارش‌ها":"گزارش‌ها"} ({reportCount})</button><button className="action-edit" onClick={() => openEditResolution(item)}>ویرایش</button>{!reportSubmissions.some(report=>report.resolutionId===item.id)&&!(item.progress||[]).some(progress=>!!progress.reportText?.trim())?<button className="action-delete" onClick={() => void deleteResolution(item)}>حذف</button>:null}<button className="action-delete" onClick={() => void toggleArchive(item,true)}>بایگانی</button></div></td></tr>{openResolutionReportsId===item.id&&<tr className="resolution-reports-row"><td colSpan={8}><div className="resolution-reports-panel">{reportsLoading?<small>در حال دریافت گزارش‌ها…</small>:reportsError?<small role="alert">{reportsError}</small>:reportCount?<>{itemReports.map(report=><article className="submitted-report-entry" key={"report-"+report.id}><div className="report-status-line"><b>{report.reportType==="periodic"?"گزارش مستمر":"گزارش اقدام"} · {report.userName}</b><span className={"report-approval "+report.approvalStatus}>{report.approvalStatus==="pending"?"در انتظار بررسی":report.approvalStatus==="rejected"?"نیازمند اصلاح":"تأیید شده"}</span></div><small>{formatDateTime(report.submittedAt)}{report.userTitle?" · "+report.userTitle:""}</small><p>{report.text}</p>{report.adminFeedback&&<small>نظر مدیر: {report.adminFeedback}</small>}{report.attachments && report.attachments.length > 0 &&<div className="submitted-report-files">{report.attachments.map(file=><a key={file.id} href={"/api/attachments/"+file.id} target="_blank" rel="noreferrer"><Paperclip size={13}/>{file.originalName}</a>)}</div>}</article>)}{legacyReports.map(progress=>{const person=users.find(user=>user.nationalId===progress.nationalId)||groups.flatMap(group=>group.members||[]).find(member=>member.nationalId===progress.nationalId);const legacyFiles=(item.attachments||[]).filter(file=>file.uploadedBy===progress.nationalId&&!file.resolutionReportId);return <article className="submitted-report-entry" key={"progress-report-"+progress.nationalId}><div className="report-status-line"><b>گزارش اقدام · {person?.displayName||"کاربر"}</b><span className={"report-approval "+(progress.approvalStatus||"approved")}>{progress.approvalStatus==="pending"?"در انتظار بررسی":progress.approvalStatus==="rejected"?"نیازمند اصلاح":progress.approvalStatus==="approved"?"تأیید شده":"ثبت‌شده"}</span></div><small>{formatDateTime(progress.updatedAt)}{person?.title?" · "+person.title:""}</small><p>{progress.reportText}</p>{progress.adminFeedback&&<small>نظر مدیر: {progress.adminFeedback}</small>}{legacyFiles.length>0&&<div className="submitted-report-files">{legacyFiles.map(file=><a key={file.id} href={"/api/attachments/"+file.id} target="_blank" rel="noreferrer"><Paperclip size={13}/>{file.originalName}</a>)}</div>}</article>;})}</>:<small>برای این مصوبه گزارشی ثبت نشده است.</small>}</div></td></tr>}</Fragment>; })}</tbody></table></div><div className="event-report-pagination resolution-pagination"><span>{filtered.length? `نمایش ${(resolutionPage-1)*pageSize+1} تا ${Math.min(resolutionPage*pageSize,filtered.length)} از ${filtered.length} مصوبه`:"مصوبه‌ای برای نمایش نیست"}</span><label>تعداد در صفحه<select value={resolutionPageSize} onChange={event=>{setResolutionPage(1);setResolutionPageSize(Number(event.target.value));}}><option value={10}>۱۰</option><option value={25}>۲۵</option><option value={50}>۵۰</option><option value={100}>۱۰۰</option></select></label><div><button type="button" className="secondary" disabled={resolutionPage<=1} onClick={()=>setResolutionPage(page=>Math.max(1,page-1))}>قبلی</button><span>صفحه {resolutionPage} از {pageCount}</span><button type="button" className="secondary" disabled={resolutionPage>=pageCount} onClick={()=>setResolutionPage(page=>Math.min(pageCount,page+1))}>بعدی</button></div></div></>}

      {tab === "archive" && isAdmin && <div className="panel archive-panel"><div className="section-head"><div><h2>مصوبات بایگانی‌شده</h2><p>موارد بسته‌شده را می‌توان از بایگانی بازگرداند.</p></div><span className="counter">{archivedResolutions.length} مصوبه</span></div><div className="search archive-search"><Search size={17}/><input value={archiveQuery} onChange={event=>setArchiveQuery(event.target.value)} placeholder="جستجو در شماره، متن یا توضیحات مصوبه‌های قدیمی"/></div>{archivedResolutions.length ? <div className="table-wrap"><table><thead><tr><th>تاریخ جلسه/درخواست</th><th>شماره</th><th>متن مصوبه</th><th>تاریخ بایگانی/آخرین تغییر</th><th>عملیات</th></tr></thead><tbody>{archivedResolutions.map(item=><Fragment key={item.id}><tr><td>{formatDate(item.meetingDate,item.meetingDateJalali?.replace(/\./g,"/"))}{item.startDate&&<small>شروع: {formatDate(item.startDate,item.startDateJalali?.replace(/\./g,"/"))}</small>}</td><td>{item.number}<small>شناسه یکتا: {item.id}</small></td><td>{item.text}</td><td>{item.updatedAt ? formatDate(item.updatedAt.slice(0,10)) : "—"}</td><td><button className="secondary" onClick={()=>setArchiveOpenId(current=>current===item.id?null:item.id)}>{archiveOpenId===item.id?"بستن سوابق":"سوابق و پیوست‌ها"}</button> <button className="secondary" onClick={()=>void toggleArchive(item,false)}>بازگردانی</button></td></tr>{archiveOpenId===item.id && <tr className="archive-detail-row"><td colSpan={5}><p>{item.text}</p>{item.notes&&<div className="note">توضیحات: {item.notes}</div>}<div className="event-list">{(item.events??[]).filter(entry=>isAdmin||/گزارش/u.test(entry.text)).slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(entry=><div className="event-row" key={entry.id}><span><b>{entry.userName}</b><small>{formatDate(entry.createdAt.slice(0,10))}</small></span><p>{entry.text}</p></div>)}</div><div className="archive-files">{(item.attachments??[]).map(file=><a key={file.id} href={`/api/attachments/${file.id}`}><FileText size={14}/>{file.originalName} · فرستنده: {file.uploaderName||"کاربر"}</a>)}</div></td></tr>}</Fragment>)}</tbody></table></div> : <Empty />}</div>}
      {tab === "sessions" && isAdmin && <MeetingsPage users={users} groups={groups} resolutions={resolutions} openCreateRequest={openMeetingRequest} onCreateResolution={meeting=>openCreateResolution(meeting)} onRefresh={()=>void load()} />}
      {tab === "groups" && isAdmin && <div className="group-layout"><section className="panel"><h2>مدیریت گروه‌ها</h2><p>گروه‌ها را بسازید، اعضا را مدیریت کنید و گروه خالیِ بدون ارجاع را حذف کنید.</p>{groupDeleteError && <div className="notice" role="alert">{groupDeleteError}</div>}<label>افزودن گروه جدید<div className="inline-form"><input value={groupName} onChange={event=>setGroupName(event.target.value)} placeholder="نام گروه"/><button className="primary" disabled={busy||!groupName.trim()} onClick={async()=>{const name=groupName.trim();if(await request("/api/groups","POST",{name,category:"group"})){setGroupName("");}}}>افزودن گروه</button></div></label><label>گروه<select value={selectedGroup} onChange={event=>{setSelectedGroup(event.target.value);setSelectedPerson(null);}}><option value="">انتخاب گروه</option>{groups.filter(group=>!isIndividualRecipientGroup(group.name)).map(group=><option key={group.id} value={group.id}>{group.name} ({group.members.length} عضو)</option>)}</select></label>{selectedGroup&&<><label>دسته‌بندی<select disabled={busy} value={groups.find(group=>String(group.id)===selectedGroup)?.category || (isResolutionGroup(groups.find(group=>String(group.id)===selectedGroup)?.name || "") ? "group" : "unit")} onChange={event=>{const group=groups.find(item=>String(item.id)===selectedGroup);if(group)void changeGroupCategory(group,event.target.value as "group"|"unit");}}><option value="group">گروه</option><option value="unit">معاونت/واحد</option></select></label><div className="members">{(groups.find(group=>String(group.id)===selectedGroup)?.members??[]).map(member=><div className="member" key={member.id}><span className="avatar small">{member.displayName[0]}</span><div><b>{member.displayName}</b><small>{member.title||"سمت ثبت نشده"}</small>{displayLocation(member.organizationUnit)&&<small>{displayLocation(member.organizationUnit)}</small>}<small className="member-mobile">{member.mobile||"موبایل ثبت نشده"}</small></div><button className="icon-btn" title="حذف عضو از گروه" onClick={()=>void request(`/api/groups/${selectedGroup}/members/${member.nationalId}`,"DELETE")}><X size={17}/></button></div>)}</div><button type="button" className="secondary wide" disabled={busy} onClick={()=>{const group=groups.find(item=>String(item.id)===selectedGroup);if(group)void deleteGroup(group);}}>حذف گروه انتخاب‌شده</button></>}</section><section className="panel"><h2>افزودن عضو با کد ملی یا نام</h2><p>با کد ملی یا نام و نام خانوادگی جستجو کنید؛ سمت از اطلاعات پست کاربر به‌روز می‌شود.</p><label>گروه<select value={selectedGroup} onChange={event => setSelectedGroup(event.target.value)}><option value="">انتخاب گروه</option>{groups.filter(group=>isResolutionGroup(group.name,group.category)).map(group => <option key={group.id} value={group.id}>{groupDisplayName(group.name)}</option>)}</select></label><label>جستجوی شخص<input value={memberSearch} onChange={event => void searchMembers(event.target.value)} placeholder="کد ملی یا نام و نام خانوادگی" /></label>{memberSearching && <div className="selected-person">در حال جستجو…</div>}{memberSearchMessage && <div className="member-search-message">{memberSearchMessage}</div>}{memberMatches.length > 0 && <div className="member-search-results">{memberMatches.map(person => <button type="button" key={person.nationalId} className={selectedPerson?.nationalId === person.nationalId ? "selected" : ""} onClick={() => { setSelectedPerson(person); setMemberSearch(person.displayName); setNationalId(person.nationalId); setMemberMatches([]); }}><span>{person.displayName}</span>{isAdmin && /[0-9۰-۹٠-٩]/.test(memberSearch) && <small>{person.nationalId}</small>}</button>)}</div>}{selectedPerson && <div className="selected-person profile-editor"><b>انتخاب‌شده: {selectedPerson.displayName}</b><div className="person-name-fields"><label>پست / سمت<input value={selectedPerson.title||""} onChange={event=>setSelectedPerson({...selectedPerson,title:event.target.value})}/></label><label>معاونت / مرکز / استان<input value={selectedPerson.organizationUnit||""} onChange={event=>setSelectedPerson({...selectedPerson,organizationUnit:event.target.value})}/></label></div><button type="button" className="secondary" disabled={busy} onClick={async()=>{if(await request(`/api/users/${encodeURIComponent(selectedPerson.nationalId)}/profile`,"PATCH",{title:selectedPerson.title||"",organizationUnit:selectedPerson.organizationUnit||""})) { setSelectedPerson({...selectedPerson}); }}}>ذخیره اطلاعات پست و محل مسئولیت</button></div>}<button className="primary wide" disabled={busy || !selectedGroup || !selectedPerson} onClick={() => void addMember()}>افزودن عضو به گروه</button><div className="members">{(groups.find(group => String(group.id) === selectedGroup)?.members ?? []).map(member => <div className="member" key={member.id}><span className="avatar small">{member.displayName[0]}</span><div><b>{member.displayName}</b><small>{member.title || "سمت ثبت نشده"}</small><small className="member-mobile">{member.mobile||"موبایل ثبت نشده"}</small></div><button className="icon-btn" title="حذف عضو" onClick={() => void request(`/api/groups/${selectedGroup}/members/${member.nationalId}`, "DELETE")}><X size={17} /></button></div>)}</div></section><section className="panel"><div className="section-head"><div><h2>معاونت‌ها و مسئولان</h2><p>معاونت‌ها در این فهرست جدا از گروه‌های اصلی هستند؛ واحدهای بدون مسئول مشخص علامت‌گذاری می‌شوند.</p></div></div>{groupDeleteError && <div className="notice" role="alert">{groupDeleteError}</div>}<label>افزودن معاونت یا واحد جدید<div className="inline-form"><input value={newUnitName} onChange={event=>setNewUnitName(event.target.value)} placeholder="نام معاونت یا واحد"/><button className="primary" disabled={busy||!newUnitName.trim()} onClick={async()=>{const name=newUnitName.trim();if(await request("/api/groups","POST",{name,category:"unit"})){setNewUnitName("");setSelectedUnit("");}}}>افزودن</button></div></label><label>معاونت یا واحد<select value={selectedUnit} onChange={event=>{setSelectedUnit(event.target.value);setSelectedPerson(null);}}><option value="">انتخاب معاونت/واحد</option>{groups.filter(unit=>!isResolutionGroup(unit.name, unit.category)&&!isIndividualRecipientGroup(unit.name)).map(unit=><option key={unit.id} value={unit.id}>{unit.name} — {unit.members.length ? "مسئول مشخص شده" : "⚠ مسئول مشخص نشده"}</option>)}</select></label>{selectedUnit && (()=>{const unit=groups.find(group=>String(group.id)===selectedUnit);return <><label>دسته‌بندی<select disabled={busy} value={unit?.category || "unit"} onChange={event=>{if(unit)void changeGroupCategory(unit,event.target.value as "group"|"unit");}}><option value="unit">معاونت/واحد</option><option value="group">گروه</option></select></label>{unit?.members.length ? <div className="selected-person">مسئول مشخص شده: <b>{unit.members.map(member=>member.displayName).join("، ")}</b></div> : <div className="notice" role="status">برای این معاونت/واحد هنوز مسئولی مشخص نشده است.</div>}</>;})()}<label>جستجوی مسئول<input value={memberSearch} onChange={event=>void searchMembers(event.target.value)} placeholder="کد ملی یا نام و نام خانوادگی"/></label>{memberSearching&&<div className="selected-person">در حال جستجو…</div>}{memberSearchMessage&&<div className="member-search-message">{memberSearchMessage}</div>}{memberMatches.length>0&&<div className="member-search-results">{memberMatches.map(person=><button type="button" key={person.nationalId} className={selectedPerson?.nationalId===person.nationalId?"selected":""} onClick={()=>{setSelectedPerson(person);setMemberSearch(person.displayName);setNationalId(person.nationalId);setMemberMatches([]);}}><span>{person.displayName}</span><small>{person.title||"سمت ثبت نشده"}{displayLocation(person.organizationUnit) ? " · "+displayLocation(person.organizationUnit) : ""}</small></button>)}</div>}{selectedPerson&&<div className="selected-person">مسئول انتخاب‌شده: <b>{selectedPerson.displayName}</b><small>{selectedPerson.title||"سمت ثبت نشده"}{displayLocation(selectedPerson.organizationUnit) ? " · "+displayLocation(selectedPerson.organizationUnit) : ""}</small></div>}<button className="primary wide" disabled={busy||!selectedUnit||!selectedPerson} onClick={()=>void addUnitResponsible()}>افزودن مسئول به معاونت/واحد</button><div className="members">{(groups.find(group=>String(group.id)===selectedUnit)?.members??[]).map(member=><div className="member" key={member.id}><span className="avatar small">{member.displayName[0]}</span><div><b>{member.displayName}</b><small>{member.title||"سمت ثبت نشده"}</small>{displayLocation(member.organizationUnit)&&<small>{displayLocation(member.organizationUnit)}</small>}<small className="member-mobile">{member.mobile||"موبایل ثبت نشده"}</small></div><button className="icon-btn" title="حذف مسئول از معاونت/واحد" onClick={()=>void request(`/api/groups/${selectedUnit}/members/${member.nationalId}`,"DELETE")}><X size={17}/></button></div>)}</div><button type="button" className="secondary wide" disabled={busy||!selectedUnit} onClick={()=>{const unit=groups.find(group=>String(group.id)===selectedUnit);if(unit)void deleteGroup(unit);}}>حذف معاونت/واحد انتخاب‌شده</button></section><section className="panel add-directory-person"><h2>افزودن کاربر جدید</h2><p>پست و معاونت، مرکز یا استانِ محل مسئولیت را برای هر فرد ثبت کنید.</p><label>کد ملی<input value={newPerson.nationalId} onChange={event => setNewPerson({ ...newPerson, nationalId: event.target.value })} inputMode="numeric" maxLength={11} /></label><div className="person-name-fields"><label>نام<input value={newPerson.firstName} onChange={event => setNewPerson({ ...newPerson, firstName: event.target.value })} /></label><label>نام خانوادگی<input value={newPerson.lastName} onChange={event => setNewPerson({ ...newPerson, lastName: event.target.value })} /></label></div><label>پست / سمت<input value={newPerson.title} onChange={event=>setNewPerson({...newPerson,title:event.target.value})} placeholder="مثلاً مدیرکل، رئیس مرکز"/></label><label>معاونت / مرکز / استان<input value={newPerson.organizationUnit} onChange={event=>setNewPerson({...newPerson,organizationUnit:event.target.value})} placeholder="واحدی که مسئول آن است"/></label><button className="primary wide" disabled={busy || newPerson.nationalId.trim().length < 8 || !newPerson.firstName.trim() || !newPerson.lastName.trim()} onClick={() => void createDirectoryPerson()}>ثبت کاربر</button></section><section className="panel role-management-panel"><div className="section-head"><div><h2>مدیریت کاربران و دسترسی ادمین</h2><p>با کد ملی کاربر را پیدا کنید، عنوان پست و موبایل را ویرایش کنید یا دسترسی ادمین را مدیریت کنید. دسترسی ادمین اصلی قابل لغو نیست.</p></div><span className="counter">{users.filter(user=>user.role==="ادمین").length} ادمین</span></div><div className="search"><Search size={16}/><input inputMode="numeric" dir="ltr" value={adminUserQuery} onChange={event=>setAdminUserQuery(event.target.value)} placeholder="جستجو با کد ملی"/></div><div className="role-user-list">{filteredRoleUsers.map(user=><div className="role-user-row" key={user.nationalId}><div className="role-user-identity"><b>{user.displayName}</b><small>{user.title||"سمت ثبت نشده"}</small><small className="role-national-id" dir="ltr">{user.nationalId}</small><small className="member-mobile">{user.mobile||"موبایل ثبت نشده"}</small></div><span className={`role-badge ${user.role==="ادمین"?"admin":""}`}>{user.role==="ادمین"?"دسترسی ادمین فعال":"دسترسی ادمین ندارد"}</span><div className="role-user-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>void editUserTitle(user)}>ویرایش پست</button>{user.nationalId==="0534921973"?<span className="primary-admin-label">ادمین اصلی</span>:<button type="button" className={user.role==="ادمین"?"secondary":"primary"} disabled={busy||user.canChangeRole===false} title={user.canChangeRole===false?"نمی‌توانید دسترسی ادمین حساب فعلی خودتان را لغو کنید":""} onClick={()=>void request(`/api/users/${encodeURIComponent(user.nationalId)}/role`,"PATCH",{isAdmin:user.role!=="ادمین"})}>{user.role==="ادمین"?"لغو دسترسی ادمین":"اعطای دسترسی ادمین"}</button>}</div></div>)}{filteredRoleUsers.length===0&&<div className="report-empty">{adminUserQuery.trim().length<8?"برای جستجو، کد ملی را وارد کنید.":"کاربری با این کد ملی پیدا نشد."}</div>}</div></section></div>}

      {tab === "reports" && isAdmin && <div className={`reports-page reports-tab-${reportMainTab} ${reportsError ? "has-load-error" : ""}`} aria-busy={reportsLoading}>{reportsLoading && <div className="panel reports-loading-notice" role="status"><span className="app-loading-spinner" aria-hidden="true"/><div><b>در حال بارگذاری گزارش‌ها</b><small>صفحه‌های دیگر مستقل از دریافت این گزارش‌ها در دسترس هستند.</small></div></div>}{reportsError && <div className="panel reports-error-notice" role="alert"><span>{reportsError}</span><button className="secondary" type="button" onClick={()=>{if(reportMainTab==="actions"||reportMainTab==="resolution"||reportMainTab==="special"){submissionsFetchStarted.current=false;setSubmissionsLoaded(false);}else{summaryFetchStarted.current=false;setReportsLoaded(false);}setReportsError("");setReportsRetryCount(count=>count+1);}}>تلاش دوباره</button></div>}<div className="reports-main-tabs" role="tablist" aria-label="بخش‌های گزارش‌ها"><button type="button" role="tab" aria-selected={reportMainTab==="overview"} className={reportMainTab==="overview"?"active":""} onClick={()=>setReportMainTab("overview")}><LayoutDashboard size={16}/>نمای کلی</button><button type="button" role="tab" aria-selected={reportMainTab==="lookup"} className={reportMainTab==="lookup"?"active":""} onClick={()=>setReportMainTab("lookup")}><Search size={16}/>وضعیت سریع</button><button type="button" role="tab" aria-selected={reportMainTab==="resolution"} className={reportMainTab==="resolution"?"active":""} onClick={()=>setReportMainTab("resolution")}><ClipboardList size={16}/>وضعیت مصوبه</button><button type="button" role="tab" aria-selected={reportMainTab==="bale"} className={reportMainTab==="bale"?"active":""} onClick={()=>setReportMainTab("bale")}><Bell size={16}/>گزارش اطلاعیه‌ها</button><button type="button" role="tab" aria-selected={reportMainTab==="actions"} className={reportMainTab==="actions"?"active":""} onClick={()=>setReportMainTab("actions")}><FileText size={16}/>گزارش اقدامات</button><button type="button" role="tab" aria-selected={reportMainTab==="special"} className={reportMainTab==="special"?"active":""} onClick={()=>setReportMainTab("special")}><ClipboardList size={16}/>گزارش پیگیری‌های ویژه</button><button type="button" role="tab" aria-selected={reportMainTab==="people"} className={reportMainTab==="people"?"active":""} onClick={()=>{setReportMainTab("people");setReportViewTab("people");}}><Users size={16}/>گزارش فردی</button><button type="button" role="tab" aria-selected={reportMainTab==="events"} className={reportMainTab==="events"?"active":""} onClick={()=>setReportMainTab("events")}><ClipboardList size={16}/>گزارش رویدادها</button><button type="button" role="tab" aria-selected={reportMainTab==="backup"} className={reportMainTab==="backup"?"active":""} onClick={()=>setReportMainTab("backup")}><Archive size={16}/>پشتیبان‌گیری</button><button type="button" role="tab" aria-selected={reportMainTab==="quality"} className={reportMainTab==="quality"?"active":""} onClick={()=>setReportMainTab("quality")}><ShieldCheck size={16}/>کیفیت داده</button></div>
        <section className="panel special-followups-report" aria-busy={reportsLoading}>
          <div className="section-head"><div><span className="report-kicker">پیگیری‌های بدون جلسه</span><h2>گزارش دستورات وزیر و سفرهای استانی وزیر</h2><p>درخواست‌ها، وضعیت اجرا و گزارش‌های ثبت‌شده</p></div><span className="counter">{specialFollowupReports.length} مورد</span></div>
          <div className="toolbar special-followup-toolbar"><div className="search"><Search size={17}/><input value={specialReportSearch} onChange={event=>setSpecialReportSearch(event.target.value)} placeholder="جستجو در شماره، استان، شرح، ارجاع یا متن گزارش"/></div><label>استان<select value={specialReportProvinceFilter} onChange={event=>setSpecialReportProvinceFilter(event.target.value)}><option value="all">همه استان‌ها</option>{iranProvinceOptions.map(province=><option key={province} value={province}>{province}</option>)}</select></label><label>دسته دستور<select value={specialReportCategory} onChange={event=>setSpecialReportCategory(event.target.value)}><option value="all">همه دسته‌ها</option>{ministerDirectiveCategories.map(category=><option key={category} value={category}>{category}</option>)}</select></label><label>وضعیت اجرا<select value={specialReportStatus} onChange={event=>setSpecialReportStatus(event.target.value)}><option value="all">همه وضعیت‌ها</option>{statusEntries.map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label>گزارش<select value={specialReportPresence} onChange={event=>setSpecialReportPresence(event.target.value)}><option value="all">همه</option><option value="has">گزارش دارد</option><option value="missing">بدون گزارش</option></select></label><button type="button" className="secondary" onClick={()=>{setSpecialReportSearch("");setSpecialReportStatus("all");setSpecialReportPresence("all");setSpecialReportProvinceFilter("all");setSpecialReportCategory("all");}}>پاک‌کردن فیلترها</button></div>
          <details className="minister-category-settings"><summary>مدیریت دسته‌بندی دستورات وزیر</summary><p>هر دسته را در یک خط وارد کنید؛ تغییرات در فرم ثبت دستور و فیلتر گزارش اعمال می‌شود.</p><textarea rows={8} value={ministerDirectiveCategoriesDraft} onChange={event=>setMinisterDirectiveCategoriesDraft(event.target.value)} aria-label="دسته‌بندی‌های دستورات وزیر"/><button type="button" className="secondary" onClick={()=>void saveMinisterDirectiveCategories()}>ذخیره دسته‌بندی‌ها</button></details>
          {specialFollowupReports.length ? <div className="table-wrap"><table><thead><tr><th>نوع و تاریخ</th><th>استان</th><th>دسته‌بندی</th><th>شماره</th><th>شرح دستور</th><th>ارجاع به</th><th>وضعیت</th><th>گزارش‌ها</th></tr></thead><tbody>{specialFollowupReports.map(item=>{const submissions=reportSubmissions.filter(report=>report.resolutionId===item.id);const progressReports=(item.progress||[]).filter(progress=>!!progress.reportText?.trim());const count=submissions.length+progressReports.length;return <tr key={item.id}><td>{formatDate(item.meetingDate,item.meetingDateJalali?.replace(/\./g,"/"))}</td><td>{item.specialTrackingType==="provincial"?item.province||"—":"—"}</td><td>{item.specialTrackingType==="provincial"?"—":item.ministerCategory||"—"}</td><td><b>{item.number}</b><small>شناسه یکتا: {item.id}</small></td><td>{item.text}{item.notes&&<small>{item.notes}</small>}</td><td>{resolutionRoutingLabel(item,groups,users)}</td><td><span className={`status ${item.status}`}>{labels[item.status]||item.status}</span></td><td><details className="special-followup-report-details"><summary>مشاهده ({count})</summary>{progressReports.map((progress,index)=>{const user=users.find(person=>person.nationalId===progress.nationalId);return <article className="submitted-report-entry" key={"progress-"+index}><b>گزارش اقدام · {user?.displayName||progress.nationalId}</b><small>{user?.title||""}{progress.updatedAt?" · "+formatDateTime(progress.updatedAt):""}</small><p>{progress.reportText}</p>{progress.adminFeedback&&<small>نظر مدیر: {progress.adminFeedback}</small>}</article>})}{submissions.map(report=><article className="submitted-report-entry" key={"submission-"+report.id}><b>{report.reportType==="periodic"?"گزارش مستمر":"گزارش اقدام"} · {report.userName}</b><small>{formatDateTime(report.submittedAt)}{report.userTitle?" · "+report.userTitle:""}</small><p>{report.text}</p>{report.adminFeedback&&<small>نظر مدیر: {report.adminFeedback}</small>}{report.attachments?.map(file=><a className="special-followup-report-file" key={file.id} href={"/api/attachments/"+file.id} target="_blank" rel="noreferrer"><Paperclip size={13}/>{file.originalName}</a>)}</article>)}{count===0&&<small>هنوز گزارشی ثبت نشده است.</small>}</details></td></tr>;})}</tbody></table></div> : <div className="empty"><ClipboardList size={30}/><b>{activeResolutions.some(item=>item.isSpecialTracking)?"پیگیری ویژه‌ای با این فیلترها پیدا نشد":"پیگیری ویژه‌ای ثبت نشده است"}</b><span>{activeResolutions.some(item=>item.isSpecialTracking)?"فیلترها را تغییر دهید یا پاک کنید.":"برای شروع، از دکمهٔ «پیگیری‌های ویژه» استفاده کنید."}</span></div>}
        </section>
        <section className="panel data-quality-panel" aria-busy={dataQualityLoading}>
          <div className="section-head"><div><span className="report-kicker">پایش اطلاعات</span><h2>کیفیت داده‌های سامانه</h2><p>مواردی که می‌توانند ارجاع، یادآوری بله یا گزارش مدیریتی را ناقص کنند.</p></div><button type="button" className="secondary" disabled={dataQualityLoading} onClick={()=>{dataQualityFetchStarted.current=false;setDataQualityLoaded(false);setDataQualityRetry(value=>value+1);}}>به‌روزرسانی</button></div>
          {dataQualityLoading&&<div className="data-quality-loading"><span className="app-loading-spinner"/>در حال بررسی اطلاعات...</div>}
          {dataQualityError&&<div className="notice data-quality-error" role="alert">{dataQualityError}<button type="button" className="secondary" onClick={()=>{dataQualityFetchStarted.current=false;setDataQualityRetry(value=>value+1);}}>تلاش دوباره</button></div>}
          {dataQualityReport&&<><div className="data-quality-kpis"><article><small>کاربران بدون موبایل</small><b>{dataQualityReport.usersWithoutMobileCount}</b></article><article><small>کاربران بدون وظیفه</small><b>{dataQualityReport.usersWithoutTasksCount}</b></article><article><small>مصوبات بدون سررسید</small><b>{dataQualityReport.resolutionsWithoutDueDateCount}</b></article><article><small>مصوبات بدون ارجاع مشخص</small><b>{dataQualityReport.resolutionsWithoutSpecificAssigneesCount}</b></article></div>
          <div className="data-quality-grid">
            <section><h3>کاربران بدون موبایل <span>{dataQualityReport.usersWithoutMobileCount}</span></h3><p>برای این کاربران پیام بله ارسال نمی‌شود.</p>{dataQualityReport.usersWithoutMobile.length?<ul>{dataQualityReport.usersWithoutMobile.map((person,index)=><li key={person.displayName+index}><b>{person.displayName}</b><small>{person.title||person.organizationUnit||"سمت ثبت نشده"}</small></li>)}</ul>:<div className="quality-clean">همهٔ کاربران موبایل ثبت‌شده دارند.</div>}</section>
            <section><h3>کاربران بدون وظیفهٔ ارجاع‌شده <span>{dataQualityReport.usersWithoutTasksCount}</span></h3><p>این کاربران در مصوبهٔ فعال، ارجاع مستقیم یا عضویت گروهی ندارند.</p>{dataQualityReport.usersWithoutTasks.length?<ul>{dataQualityReport.usersWithoutTasks.map((person,index)=><li key={person.displayName+index}><b>{person.displayName}</b><small>{person.title||person.organizationUnit||"سمت ثبت نشده"}</small></li>)}</ul>:<div className="quality-clean">همهٔ کاربران دست‌کم یک وظیفه دارند.</div>}</section>
            <section><h3>مصوبات بدون زمان سررسید <span>{dataQualityReport.resolutionsWithoutDueDateCount}</span></h3><p>با تعیین مهلت، پیگیری و هشدار سررسید دقیق‌تر می‌شود.</p>{dataQualityReport.resolutionsWithoutDueDate.length?<ul>{dataQualityReport.resolutionsWithoutDueDate.map(item=><li key={item.id}><button type="button" className="quality-resolution-link" onClick={()=>{setQuery(item.number);setTab("resolutions");}}><b>مصوبه {item.number} · شناسه {item.id}</b><small>{item.text}</small></button></li>)}</ul>:<div className="quality-clean">همهٔ مصوبات فعال سررسید دارند.</div>}</section>
            <section><h3>مصوبات بدون ارجاع مشخص <span>{dataQualityReport.resolutionsWithoutSpecificAssigneesCount}</span></h3><p>این مصوبات فرد یا گروه مشخصی برای پیگیری ندارند.</p>{dataQualityReport.resolutionsWithoutSpecificAssignees.length?<ul>{dataQualityReport.resolutionsWithoutSpecificAssignees.map(item=><li key={item.id}><button type="button" className="quality-resolution-link" onClick={()=>{setQuery(item.number);setTab("resolutions");}}><b>مصوبه {item.number} · شناسه {item.id}</b><small>{item.text}</small></button></li>)}</ul>:<div className="quality-clean">همهٔ مصوبات فعال ارجاع مشخص دارند.</div>}</section>
          </div><small className="data-quality-footnote">مبنای شمارش: {dataQualityReport.usersTotal} کاربر و {dataQualityReport.resolutionsTotal} مصوبهٔ فعال · آخرین بررسی: {formatDateTime(dataQualityReport.checkedAt)}</small></>}
        </section>
        <section className="panel backup-management-panel"><div className="section-head"><div><h2>ذخیره و بازیابی اطلاعات</h2><p>نسخهٔ پشتیبان روزانه به‌طور خودکار تهیه می‌شود؛ از همین بخش می‌توانید نسخهٔ دستی بسازید یا اطلاعات را بازیابی کنید.</p></div><button type="button" className="secondary" disabled={backupsLoading||backupBusy} onClick={()=>void loadDatabaseBackups()}>{backupsLoading?"در حال دریافت…":"به‌روزرسانی فهرست"}</button></div><div className="backup-action-grid"><article><div className="backup-action-icon"><Archive size={20}/></div><div><h3>تهیه نسخهٔ پشتیبان</h3><p>نسخهٔ پشتیبان روی سرور ذخیره می‌شود و در فهرست پایین نمایش داده خواهد شد.</p><button type="button" className="primary" disabled={backupBusy} onClick={()=>void createDatabaseBackup()}>{backupBusy?"در حال آماده‌سازی…":"تهیه نسخهٔ پشتیبان"}</button></div></article><article><div className="backup-action-icon restore"><Upload size={20}/></div><div><h3>بازیابی نسخهٔ پشتیبان</h3><p>از فهرست نسخه‌های موجود، مورد دلخواه را انتخاب کنید.</p><small>بازیابی، اطلاعات فعلی را جایگزین می‌کند و پس از آن صفحه تازه‌سازی می‌شود.</small></div></article></div><div className="notice backup-warning"><b>نکته:</b> نسخه‌های روزانه ساعت ۲ بامداد تهیه و تا ۳۰ روز نگهداری می‌شوند. فایل‌های پیوست در نسخهٔ پشتیبان نیستند. کاربر سرویس پایگاه داده باید به پوشهٔ پشتیبان دسترسی داشته باشد.</div><div className="backup-list-head"><h3>نسخه‌های ذخیره‌شده</h3><span className="counter">{databaseBackups.length} نسخه</span></div>{backupsLoading?<div className="report-empty">در حال دریافت فهرست نسخه‌های پشتیبان…</div>:databaseBackups.length?<div className="backup-list">{databaseBackups.map(file=><article className="backup-list-item" key={file.fileName}><div><b>{file.source==="روزانه"?"پشتیبان روزانه":"پشتیبان دستی"}</b><small>{formatDateTime(file.createdAt)}</small><small>{new Intl.NumberFormat("fa-IR",{maximumFractionDigits:1}).format(file.sizeBytes/1024/1024)} مگابایت</small></div><button type="button" className="danger" disabled={backupBusy} onClick={()=>void restoreDatabaseBackup(file.fileName)}>{backupBusy?"در حال بازیابی…":"بازگردانی این نسخه"}</button></article>)}</div>:<div className="report-empty">هنوز نسخهٔ پشتیبانی ذخیره نشده است.</div>}</section><section className="panel resolution-report-dashboard"><div className="individual-report-head"><div><h2>گزارش وضعیت یک مصوبه</h2><p>مصوبه را انتخاب کنید تا مشخص شود چه کسانی گزارش داده‌اند و چه کسانی هنوز گزارشی ثبت نکرده‌اند.</p></div></div><div className="search resolution-report-search"><Search size={16}/><input value={resolutionReportLookupQuery} onChange={event=>setResolutionReportLookupQuery(event.target.value)} placeholder="جستجو با شماره، شناسه یکتا یا متن مصوبه"/></div><div className="resolution-report-options">{resolutionReportOptions.map(item=>{const submittedIds=new Set([...reportSubmissions.filter(report=>report.resolutionId===item.id&&!!report.text?.trim()).map(report=>report.nationalId),...(item.progress||[]).filter(progress=>!!progress.reportText?.trim()).map(progress=>progress.nationalId)]);const submitted=submittedIds.size;return <button type="button" key={item.id} className={selectedResolutionReportId===item.id?"selected":""} onClick={()=>setSelectedResolutionReportId(item.id)}><span><b>مصوبه {item.number}</b><small>شناسه یکتا: {item.id}</small><small>{item.text}</small></span><strong>{submitted} گزارش ثبت‌شده</strong></button>;})}{resolutionReportOptions.length===0&&<div className="report-empty">مصوبه‌ای با این جستجو پیدا نشد.</div>}</div>{selectedResolutionReport&&<><div className="resolution-report-title"><div><b>مصوبه {selectedResolutionReport.number} · شناسه یکتا: {selectedResolutionReport.id}</b><p>{selectedResolutionReport.text}</p><small>جلسه: {formatDate(selectedResolutionReport.meetingDate,selectedResolutionReport.meetingDateJalali?.replace(/\./g,"/"))} · {resolutionReportEntries.length} ذی‌نفع</small></div><span className={`status ${selectedResolutionReport.status}`}>{labels[selectedResolutionReport.status]||selectedResolutionReport.status}</span></div><div className="resolution-report-overview"><div className="resolution-report-donut" style={{background:`conic-gradient(#31936b 0% ${resolutionReportPercent}%,#e4a13d ${resolutionReportPercent}% 100%)`}}><span><b>{resolutionReportPercent}٪</b><small>گزارش داده‌اند</small></span></div><div className="resolution-report-stats"><button type="button" className={"reported "+(resolutionReportPersonFilter==="submitted"?"active":"")} onClick={()=>setResolutionReportPersonFilter("submitted")}><span>گزارش داده‌اند</span><b>{resolutionReportSubmitted}</b></button><button type="button" className={"missing "+(resolutionReportPersonFilter==="missing"?"active":"")} onClick={()=>setResolutionReportPersonFilter("missing")}><span>گزارش نداده‌اند</span><b>{resolutionReportMissing}</b></button><button type="button" className={"all "+(resolutionReportPersonFilter==="all"?"active":"")} onClick={()=>setResolutionReportPersonFilter("all")}><span>کل ذی‌نفعان</span><b>{resolutionReportEntries.length}</b></button></div><div className="resolution-report-bars"><div><span>گزارش ثبت‌شده</span><i><b style={{width:`${resolutionReportPercent}%`}}/></i><strong>{resolutionReportSubmitted}</strong></div><div><span>بدون گزارش</span><i><b className="missing-bar" style={{width:`${resolutionReportEntries.length?resolutionReportMissing*100/resolutionReportEntries.length:0}%`}}/></i><strong>{resolutionReportMissing}</strong></div></div></div><div className="resolution-report-people"><div className="section-head"><div><h3>وضعیت افراد</h3><p>متن آخرین گزارش هر فرد و افرادِ بدون گزارش</p></div><span className="counter">{filteredResolutionReportEntries.length} نفر</span></div><div className="resolution-report-tools"><div className="search"><Search size={15}/><input value={resolutionReportPeopleQuery} onChange={event=>setResolutionReportPeopleQuery(event.target.value)} placeholder="جستجوی نام یا سمت"/></div><div className="resolution-report-filter"><button type="button" className={resolutionReportPersonFilter==="all"?"active":""} onClick={()=>setResolutionReportPersonFilter("all")}>همه ({resolutionReportEntries.length})</button><button type="button" className={resolutionReportPersonFilter==="submitted"?"active":""} onClick={()=>setResolutionReportPersonFilter("submitted")}>گزارش داده‌اند ({resolutionReportSubmitted})</button><button type="button" className={resolutionReportPersonFilter==="missing"?"active":""} onClick={()=>setResolutionReportPersonFilter("missing")}>گزارش نداده‌اند ({resolutionReportMissing})</button></div></div><div className="resolution-report-list">{filteredResolutionReportEntries.map(entry=><article className={`resolution-report-person ${entry.hasReport?"has-report":"missing-report"}`} key={entry.nationalId}><div className="resolution-report-person-head"><div><b>{entry.displayName}</b><small>{entry.title||"سمت ثبت نشده"}</small></div><span className={`status ${entry.hasReport?"completed":"before"}`}>{entry.hasReport?"گزارش داده":"بدون گزارش"}</span></div>{entry.hasReport?<><p>{entry.reportText||"گزارش ثبت شده است."}</p><div className="resolution-report-person-meta"><small>{entry.submittedAt?`آخرین ارسال: ${formatDateTime(entry.submittedAt)}`:"زمان ارسال ثبت نشده"}</small>{entry.approvalStatus&&<small>بررسی: {entry.approvalStatus==="approved"?"تأیید شده":entry.approvalStatus==="rejected"?"نیازمند اصلاح":"در انتظار بررسی"}</small>}</div>{entry.reports?.length>0&&<div className="report-attachment-list">{entry.reports.map(file=><a key={file.id} href={`/api/attachments/${file.id}`} target="_blank" rel="noreferrer"><Paperclip size={13}/>{file.originalName}</a>)}</div>}</>:<small>هنوز گزارشی برای این مصوبه ثبت نکرده است.</small>}</article>)}{filteredResolutionReportEntries.length===0&&<div className="report-empty">فردی با این فیلتر پیدا نشد.</div>}</div></div></>}</section><section className="panel quick-status-report"><div className="individual-report-head"><div><h2>وضعیت سریع فرد یا واحد</h2><p>نام فرد، معاونت، اداره‌کل یا گروه را جستجو کنید تا وظایف انجام‌شده، باز و انجام‌نشده را ببینید.</p></div></div><div className="saved-quick-view-tools"><div><input aria-label="نام نمای ذخیره‌شده" value={quickSavedViewName} onChange={event=>setQuickSavedViewName(event.target.value)} placeholder="نام برای ذخیره این جستجو"/><button type="button" className="secondary" disabled={!quickReportSelected} onClick={saveQuickReportView}><Bookmark size={15}/>ذخیره نما</button></div>{quickReportSavedViews.length>0&&<div className="saved-quick-view-list" aria-label="نماهای ذخیره‌شده">{quickReportSavedViews.map(view=><span key={view.id}><button type="button" onClick={()=>applyQuickReportView(view)}>{view.name}</button><button type="button" className="saved-view-delete" aria-label={"حذف نمای "+view.name} onClick={()=>deleteQuickReportView(view.id)}><Trash2 size={13}/></button></span>)}</div>}</div><div className="search quick-status-search"><Search size={16}/><input value={quickReportQuery} onChange={event=>setQuickReportQuery(event.target.value)} placeholder="جستجوی نام، سمت، معاونت، اداره‌کل یا کد ملی"/></div>{quickReportQuery.trim()&&<div className="quick-status-options">{quickReportOptions.map(option=><div className={quickReportSelection===option.key?"selected":""} key={option.key}><button type="button" className="quick-status-option-main" onClick={()=>{setQuickReportSelection(option.key);setQuickReportTaskFilter("all");}}><b>{option.label}</b><small>{option.detail|| (option.kind==="person"?"فرد":"واحد")} {option.kind==="person"?" · فرد":""}</small></button></div>)}{quickReportOptions.length===0&&<div className="report-empty">موردی با این جستجو پیدا نشد.</div>}</div>}{quickReportSelected&&<><div className="quick-status-selected"><div><b>{quickReportSelected.label}</b><small>{quickReportSelected.detail|| (quickReportSelected.kind==="person"?"فرد":"واحد")}</small></div><div className="quick-status-print-actions"><button type="button" className="secondary" onClick={printQuickStatus}><FileText size={15}/>چاپ گزارش A4</button><button type="button" className="secondary" onClick={()=>{setQuickReportSelection("");setQuickReportTaskFilter("all");}}>پاک‌کردن</button></div></div><section className="quick-status-print-sheet" dir="rtl"><header className="quick-print-header"><div><span>دفتر وزارتی · پیگیری مصوبات</span><h1>گزارش مدیریتی وضعیت اجرایی</h1><p>{quickReportSelected.kind==="person"?"گزارش فردی":"گزارش معاونت / واحد"}</p></div><div className="quick-print-date"><small>تاریخ تهیه گزارش</small><b>{formatDate(today(),gregorianToJalali(today()).replace(/\./g,"/"))}</b></div></header><div className="quick-print-subject"><small>گزارش مربوط به</small><h2>{quickReportSelected.label}</h2><p>{quickReportSelected.detail|| (quickReportSelected.kind==="person"?"فرد":"واحد")}</p></div><div className="quick-print-kpis"><article><small>کل وظایف</small><b>{quickReportTotal}</b></article><article className="done"><small>انجام‌شده</small><b>{quickReportCompleted}</b></article><article className="follow"><small>در حال پیگیری</small><b>{quickReportChartBuckets.find(bucket=>bucket.key==="in_progress")?.count??0}</b></article><article className="late"><small>انجام‌نشده</small><b>{quickReportUndone}</b></article></div><div className="quick-print-visuals"><section className="quick-print-chart"><h3>ترکیب وضعیت وظایف</h3><div className="quick-print-chart-grid"><div className="quick-print-donut" style={{background:quickReportDonutBackground}}><span><b>{quickReportTotal}</b><small>وظیفه</small></span></div><div className="quick-print-bars">{quickReportChartBuckets.map(bucket=><div key={bucket.key}><span><i style={{background:bucket.color}}/>{bucket.label}</span><b>{bucket.count}</b><div><em style={{width:quickReportTotal?Math.max(bucket.count?3:0,bucket.count*100/quickReportTotal)+"%":"0%",background:bucket.color}}/></div></div>)}</div></div></section><section className="quick-print-attendance"><h3>حضور در جلسات</h3><b className="quick-print-attendance-rate">{quickReportAttendance.total?quickReportAttendancePercent+"٪":"—"}</b><p>{quickReportAttendance.total} حضور ثبت‌شده</p><div><span>حاضر <b>{quickReportAttendance.present}</b></span><span>غایب <b>{quickReportAttendance.absent}</b></span></div></section></div><section className="quick-print-task-section"><h3>مصوبات و وظایف شاخص</h3>{quickReportTotal===0?<p className="quick-print-empty">برای این فرد یا واحد وظیفه‌ای ثبت نشده است.</p>:<table><thead><tr><th>شماره / شناسه</th><th>عنوان و شرح مصوبه</th><th>وضعیت پیگیری</th><th>سررسید</th></tr></thead><tbody>{Array.from(new Map(quickReportStatuses.slice().sort((a,b)=>String(a.item.dueDate||"").localeCompare(String(b.item.dueDate||""))).map(entry=>[entry.item.id,entry.item] as const)).values()).slice(0,7).map(item=>{const entries=quickReportStatuses.filter(entry=>entry.item.id===item.id);const done=entries.filter(entry=>entry.status==="completed").length;const late=entries.filter(entry=>entry.status!=="completed"&&!!entry.item.dueDate&&entry.item.dueDate<today()).length;const state=done===entries.length?"انجام‌شده":late?"دارای تأخیر":entries.some(entry=>entry.status==="in_progress")?"در حال پیگیری":"انجام‌نشده";return <tr key={item.id}><td><b>{item.number}</b><small>شناسه یکتا: {item.id}</small></td><td>{item.text}</td><td><b>{state}</b><small>{quickReportSelected.kind==="scope"?entries.length+" ذی‌نفع":labels[entries[0]?.status]||entries[0]?.status}</small></td><td>{item.dueDate?formatDate(item.dueDate,item.dueDateJalali):"—"}</td></tr>;})}</tbody></table>}{quickReportTotal>7&&<small className="quick-print-more">این گزارش ۷ مورد نخست را برای حفظ قالب یک‌صفحه‌ای نمایش می‌دهد؛ جمع کل وظایف در نمودار بالا آمده است.</small>}</section><footer className="quick-print-footer"><span>این گزارش در سامانه پیگیری مصوبات تهیه شده است.</span><span>محرمانه · جهت ارائه مدیریتی</span></footer>{([
  {key:"pending",title:"مصوبات انجام‌نشده",description:"مواردی که هنوز به نتیجه نرسیده و در سررسید تأخیری ندارند."},
  {key:"completed",title:"مصوبات انجام‌شده",description:"مواردی که اجرای آن‌ها برای تمام ذی‌نفعان ثبت شده است."},
  {key:"delayed",title:"مصوبات با تأخیر",description:"مواردی که سررسید آن‌ها گذشته و هنوز اجرای کامل ثبت نشده است."}
] as const).map(page=>{const pageItems=quickReportPrintItems.filter(entry=>entry.category===page.key);return <section className={"quick-print-status-page "+page.key} key={page.key}><header><span>دفتر وزارتی · پیگیری مصوبات</span><b>{quickReportSelected.label}</b><h2>{page.title}</h2><p>{page.description} · {pageItems.length} مصوبه</p></header>{pageItems.length?<table><thead><tr><th>شماره / شناسه یکتا</th><th>متن مصوبه</th><th>وضعیت ذی‌نفعان</th><th>سررسید</th></tr></thead><tbody>{pageItems.map(({item,entries,completedCount,lateCount})=><tr key={item.id}><td><b>{item.number}</b><small>شناسه یکتا: {item.id}</small></td><td>{item.text}</td><td>{quickReportSelected.kind==="person"?labels[entries[0]?.status]||entries[0]?.status:<><b>{completedCount} از {entries.length} انجام‌شده</b><small>{entries.length-completedCount} باقی‌مانده{lateCount? " · "+lateCount+" با تأخیر":""}</small></>}</td><td>{item.dueDate?formatDate(item.dueDate,item.dueDateJalali):"بدون سررسید"}</td></tr>)}</tbody></table>:<div className="quick-print-empty-page">در این وضعیت مصوبه‌ای ثبت نشده است.</div>}<footer><span>گزارش مدیریتی وضعیت اجرایی</span><span>{formatDate(today(),gregorianToJalali(today()).replace(/\./g,"/"))}</span></footer></section>})}</section><div className="quick-attendance-summary"><div className="quick-attendance-heading"><b>حضور و غیاب در جلسات</b><small>{quickReportSelected.kind==="person"?"سوابق این فرد":"مجموع سوابق اعضای این واحد"}</small></div><div className="quick-attendance-donut" style={{background:quickReportAttendanceDonut}}><span><b>{quickReportAttendance.total}</b><small>حضور ثبت‌شده</small></span></div><div className="quick-attendance-counts"><div><i className="present"/><span>حاضر</span><b>{quickReportAttendance.present}</b></div><div><i className="absent"/><span>غایب</span><b>{quickReportAttendance.absent}</b></div><small>{quickReportAttendance.total?quickReportAttendancePercent+"٪ حضور":"برای این فرد یا واحد سابقهٔ حضور و غیاب ثبت نشده است."}</small></div></div><div className="quick-status-kpis"><button type="button" className="undone" onClick={()=>setQuickReportTaskFilter("delayed")}><span>انجام‌نشده</span><b>{quickReportUndone}</b></button><button type="button" className="overdue" onClick={()=>setQuickReportTaskFilter("overdue")}><span>با تأخیر</span><b>{quickReportOverdue}</b></button><button type="button" className="done" onClick={()=>setQuickReportTaskFilter("completed")}><span>انجام‌شده</span><b>{quickReportCompleted}</b></button><button type="button" onClick={()=>setQuickReportTaskFilter("all")}><span>کل وظایف</span><b>{quickReportTotal}</b></button></div><div className="quick-report-visuals"><div className="quick-report-donut-panel"><b>ترکیب وضعیت وظایف</b><div className="quick-report-donut-wrap"><div className="quick-report-donut" style={{background:quickReportDonutBackground}}><span><b>{quickReportTotal}</b><small>وظیفه</small></span></div></div><div className="quick-report-legend">{quickReportChartBuckets.filter(bucket=>bucket.count>0).map(bucket=><button type="button" key={bucket.key} onClick={()=>setQuickReportTaskFilter(bucket.key)}><i style={{background:bucket.color}}/><span>{bucket.label}</span><b>{bucket.count}</b></button>)}</div><button type="button" className="quick-report-show-all" onClick={()=>setQuickReportTaskFilter("all")}>نمایش همه وظایف</button></div><div className="quick-report-task-panel"><div className="quick-report-task-head"><b>فهرست وظایف</b><span>{quickReportTaskFilter==="all"?"همه وضعیت‌ها":quickReportTaskFilter==="undone"?"انجام‌نشده‌ها":quickReportChartBuckets.find(bucket=>bucket.key===quickReportTaskFilter)?.label||"وظایف"} · {quickReportFilteredTasks.length}</span></div>{quickReportFilteredTasks.length?<div className="quick-report-task-list">{quickReportFilteredTasks.map((entry,index)=><article key={entry.item.id+"-"+index}><div><b>مصوبه {entry.item.number} · شناسه یکتا: {entry.item.id}</b><span className={"status "+entry.status}>{labels[entry.status]||entry.status}</span></div><p>{entry.item.text}</p>{quickReportSelected.kind!=="person"&&entry.personName&&<small>{entry.personName}</small>}</article>)}</div>:<div className="report-empty">وظیفه‌ای در این وضعیت وجود ندارد.</div>}</div></div>{quickReportTotal===0&&<div className="report-empty">برای این فرد یا واحد وظیفه‌ای پیدا نشد.</div>}</>}</section><section className="panel bale-settings-panel"><div><h2>ارسال اعلان با بله</h2><p>در صورت فعال بودن، اعلان‌های جدید سامانه برای موبایل ثبت‌شدهٔ گیرنده نیز ارسال می‌شود.</p><small>{baleNotificationsConfigured ? "اتصال بله در تنظیمات سرور موجود است." : "نام کاربری و گذرواژهٔ بله در تنظیمات برنامهٔ سرور وارد نشده است."}</small></div><label className="bale-toggle"><input type="checkbox" checked={baleNotificationsEnabled} disabled={busy || !baleNotificationsConfigured} onChange={event => void request("/api/settings/bale-notifications", "PUT", { enabled: event.target.checked })}/><span>{baleNotificationsEnabled ? "فعال" : "غیرفعال"}</span></label></section><div className="section-head report-actions-head"><div><h2>گزارش مدیریتی</h2><p>عملکرد مصوبات، گزارش اقدامات و روند اجرا</p></div><div className="report-export-actions"><button className="secondary" onClick={exportPeopleExcel}>دریافت Excel صفحه جاری</button><button className="secondary" onClick={printReport}>چاپ / ذخیره PDF</button></div></div><div className="report-kpis"><div><span>کل مصوبات</span><b>{reports?.total ?? 0}</b></div><div><span>نرخ اجرا</span><b>{reports?.total ? Math.round(completed * 100 / reports.total) : 0}٪</b></div><div><span>موارد انجام نشده</span><b className="red-text">{delayed}</b></div><div><span>مهلت گذشته</span><b className="red-text">{activeResolutions.filter(item=>item.dueDate&&item.dueDate<today()&&item.status!=="completed").length}</b></div><div><span>سررسید تا ۷ روز</span><b>{activeResolutions.filter(item=>item.dueDate&&item.dueDate>=today()&&item.dueDate<=localDateKey(new Date(Date.parse(today()+"T12:00:00")+7*86400000))&&item.status!=="completed"&&item.status!=="cancelled").length}</b></div></div><section className="panel bale-message-report"><div className="section-head"><div><h2>گزارش اطلاعیه‌ها</h2><p>وضعیت صف، تلاش‌های ارسال و خطاهای احتمالی پیام‌ها</p></div><button type="button" className="secondary" disabled={baleMessageLoading||baleMessageReport.total===0} onClick={()=>void exportBaleMessages()}>دریافت CSV</button></div><div className="bale-report-filters"><div className="search"><Search size={15}/><input value={baleMessageQuery} onChange={event=>{setBaleMessagePage(1);setBaleMessageQuery(event.target.value);}} placeholder="جستجو در نام، موبایل یا متن پیام"/></div><select aria-label="فیلتر وضعیت ارسال" value={baleMessageStatus} onChange={event=>{setBaleMessagePage(1);setBaleMessageStatus(event.target.value);}}><option value="all">همه وضعیت‌ها</option><option value="pending">در صف ارسال</option><option value="processing">در حال ارسال</option><option value="sent">ارسال‌شده</option><option value="failed">ناموفق</option></select><label>از تاریخ<DatePicker ref={baleMessageFromPickerRef} calendar={persian} locale={persian_fa} format="YYYY/MM/DD" value={baleMessageFrom ? gregorianToJalali(baleMessageFrom).replace(/\./g,"/") : ""} onChange={date=>{setBaleMessagePage(1);setBaleMessageFrom(date ? localDateKey(date.toDate()) : "");window.setTimeout(() => baleMessageFromPickerRef.current?.closeCalendar(), 50);}}/></label><label>تا تاریخ<DatePicker ref={baleMessageToPickerRef} calendar={persian} locale={persian_fa} format="YYYY/MM/DD" value={baleMessageTo ? gregorianToJalali(baleMessageTo).replace(/\./g,"/") : ""} onChange={date=>{setBaleMessagePage(1);setBaleMessageTo(date ? localDateKey(date.toDate()) : "");window.setTimeout(() => baleMessageToPickerRef.current?.closeCalendar(), 50);}}/></label></div>{baleMessageError&&<div className="notice">{baleMessageError}</div>}{baleMessageLoading?<div className="report-empty">در حال دریافت گزارش ارسال‌ها…</div>:baleMessageReport.items.length?<div className="table-wrap"><table><thead><tr><th>زمان ایجاد</th><th>گیرنده</th><th>موبایل</th><th>وضعیت</th><th>تلاش</th><th>متن پیام / خطا</th></tr></thead><tbody>{baleMessageReport.items.map(item=><tr key={item.id}><td>{formatDateTime(item.createdAt)}{item.sentAt&&<small>ارسال: {formatDateTime(item.sentAt)}</small>}</td><td>{item.displayName||"—"}</td><td dir="ltr">{item.mobile}</td><td><span className={`bale-delivery-status ${item.status}`}>{baleMessageStatusLabel(item.status)}</span></td><td>{item.attempts}</td><td className="bale-message-text">{item.text}{item.lastError&&<small className="bale-delivery-error">{item.lastError}</small>}</td></tr>)}</tbody></table></div>:<div className="report-empty">ارسالی با این فیلترها پیدا نشد.</div>}<div className="bale-report-pagination"><span>{new Intl.NumberFormat("fa-IR").format(baleMessageReport.total)} ارسال · صفحه {baleMessageReport.page} از {Math.max(1,Math.ceil(baleMessageReport.total/Math.max(1,baleMessageReport.pageSize)))}</span><div><button className="secondary" disabled={baleMessagePage<=1||baleMessageLoading} onClick={()=>setBaleMessagePage(page=>Math.max(1,page-1))}>قبلی</button><button className="secondary" disabled={baleMessagePage>=Math.max(1,Math.ceil(baleMessageReport.total/Math.max(1,baleMessageReport.pageSize)))||baleMessageLoading} onClick={()=>setBaleMessagePage(page=>page+1)}>بعدی</button></div></div></section><section className="panel submitted-reports-panel"><div className="section-head"><div><h2>گزارش‌های ارسالی</h2><p>گزارش‌های مستمر و گزارش‌های اقدام ثبت‌شده توسط افراد</p></div><div className="report-export-actions"><button type="button" className="secondary" onClick={printReportSubmissions}>دریافت PDF</button><button className="secondary" onClick={exportReportSubmissions}>دریافت گزارش‌ها CSV</button></div></div><div className="submitted-reports-print-sheet" dir="rtl"><header><span>دفتر وزارتی · سامانه پیگیری مصوبات</span><h1>گزارش‌های ارسالی کاربران</h1><p>تعداد گزارش‌ها: {filteredReportSubmissions.length} · تاریخ تهیه: {formatDate(today(),gregorianToJalali(today()).replace(/\\./g,"/"))}</p>{reportSubmissionQuery.trim()&&<small>عبارت جستجو: {reportSubmissionQuery}</small>}</header>{filteredReportSubmissions.length?<table><thead><tr><th>زمان ارسال</th><th>فرد و سمت</th><th>مصوبه</th><th>نوع / دوره</th><th>متن کامل گزارش</th><th>وضعیت</th></tr></thead><tbody>{filteredReportSubmissions.map(report=><tr key={report.id}><td>{formatDateTime(report.submittedAt)}</td><td><b>{report.userName}</b><small>{report.userTitle||"سمت ثبت نشده"}</small></td><td><b>{report.resolutionNumber}</b><small>شناسه یکتا: {report.resolutionId}</small><span>{report.resolutionText}</span></td><td>{report.reportType==="periodic"?"گزارش مستمر":"گزارش اقدام"}<small>{report.reportType==="periodic"?formatReportPeriod(report.periodKey):"—"}</small></td><td><p>{report.text}</p>{report.adminFeedback&&<small>توضیح مدیر: {report.adminFeedback}</small>}{(report.attachments?.length??0)>0&&<small>پیوست‌ها: {(report.attachments??[]).map(file=>file.originalName).join("، ")}</small>}</td><td>{report.approvalStatus==="approved"?"تأییدشده":report.approvalStatus==="rejected"?"ردشده":"در انتظار بررسی"}</td></tr>)}</tbody></table>:<p>گزارشی برای نمایش ثبت نشده است.</p>}</div><div className="search report-submission-search"><Search size={16}/><input value={reportSubmissionQuery} onChange={event=>setReportSubmissionQuery(event.target.value)} placeholder="جستجو در نام، شماره یا شناسه یکتای مصوبه و متن گزارش"/></div>{filteredReportSubmissions.length ? <div className="table-wrap"><table><thead><tr><th>زمان ارسال</th><th>فرد</th><th>سمت</th><th>مصوبه</th><th>نوع</th><th>دوره</th><th>متن کامل گزارش</th><th>پیوست‌ها</th><th>وضعیت بررسی</th><th>اقدام</th></tr></thead><tbody>{filteredReportSubmissions.map(report=><tr key={report.id}><td>{formatDate(report.submittedAt.slice(0,10))}</td><td>{report.userName}</td><td>{report.userTitle || "—"}</td><td><b>{report.resolutionNumber}</b><small>شناسه یکتا: {report.resolutionId}</small><small>{report.resolutionText}</small></td><td><span className={`status ${report.reportType === "periodic" ? "in_progress" : "before"}`}>{report.reportType === "periodic" ? "مستمر" : "اقدام/غیرمستمر"}</span></td><td>{report.reportType === "periodic" ? formatReportPeriod(report.periodKey) : "—"}</td><td className="report-submission-text"><p>{report.text.length>180?report.text.slice(0,180)+"…":report.text}</p>{report.adminFeedback&&<small>توضیح ادمین: {report.adminFeedback.length>100?report.adminFeedback.slice(0,100)+"…":report.adminFeedback}</small>}{(report.text.length>180||(report.adminFeedback?.length??0)>100)&&<button type="button" className="report-text-more" onClick={()=>setExpandedReport(report)}>ادامهٔ متن</button>}</td><td>{report.attachments?.length ? <div className="report-attachment-list">{report.attachments.map(file=><a key={file.id} href={`/api/attachments/${file.id}`} target="_blank" rel="noreferrer"><Paperclip size={14}/>{file.originalName}</a>)}</div> : "—"}</td><td><span className={`status ${report.approvalStatus === "approved" ? "completed" : report.approvalStatus === "rejected" ? "delayed" : "before"}`}>{report.approvalStatus === "approved" ? "تأییدشده" : report.approvalStatus === "rejected" ? "ردشده" : "در انتظار بررسی"}</span></td><td>{report.approvalStatus === "rejected" ? <span className="muted">این گزارش با ذکر علت رد شده است.</span> : <div className="review-actions"><button className="secondary" onClick={()=>void reviewReportSubmission(report,false)}>رد گزارش و ثبت علت</button></div>}</td></tr>)}</tbody></table></div> : <div className="report-empty">گزارشی برای نمایش ثبت نشده است.</div>}</section>{awaitingReview.length > 0 && <div className="panel review-queue"><div className="section-head"><div><h2>گزارش‌های اقدام در انتظار تأیید</h2><p>پس از تأیید، وضعیت پیگیری فرد اجراشده می‌شود.</p></div><span className="counter">{awaitingReview.length} گزارش</span></div><div className="review-list">{awaitingReview.map(({item,progress})=>{const person=users.find(user=>user.nationalId===progress.nationalId);return <article className="review-item" key={item.id + "-" + progress.nationalId}><div className="review-item-head"><b>مصوبه {item.number} · شناسه یکتا: {item.id} · {person?.displayName ?? "کاربر"}</b><small>{person?.title || "سمت ثبت نشده"} · {formatDate(progress.updatedAt.slice(0,10))}</small></div><p>{progress.reportText}</p><div className="review-actions"><button className="primary" onClick={()=>void reviewCompletionReport(item.id,progress.nationalId)}>رد گزارش و ثبت علت</button></div></article>;})}</div></div>}<div className="manager-report-grid">
        <section className="panel executive-panel"><div className="report-panel-heading"><div><span className="report-kicker">نمای کلی</span><h2>وضعیت اجرای مصوبات</h2><p>جمع‌بندی وضعیت ثبت‌شده برای مدیر</p></div><span className="report-period">به‌روزرسانی لحظه‌ای</span></div><div className="overview-date-filters"><label>از تاریخ جلسه/درخواست<DatePicker ref={overviewFromPickerRef} calendar={persian} locale={persian_fa} format="YYYY/MM/DD" value={overviewFrom?gregorianToJalali(overviewFrom).replace(/\./g,"/"):""} onChange={date=>{setOverviewFrom(date?localDateKey(date.toDate()):"");window.setTimeout(()=>overviewFromPickerRef.current?.closeCalendar(),50);}}/></label><label>تا تاریخ جلسه/درخواست<DatePicker ref={overviewToPickerRef} calendar={persian} locale={persian_fa} format="YYYY/MM/DD" value={overviewTo?gregorianToJalali(overviewTo).replace(/\./g,"/"):""} onChange={date=>{setOverviewTo(date?localDateKey(date.toDate()):"");window.setTimeout(()=>overviewToPickerRef.current?.closeCalendar(),50);}}/></label>{(overviewFrom||overviewTo)&&<button type="button" className="secondary" onClick={()=>{setOverviewFrom("");setOverviewTo("");}}>پاک‌کردن بازه</button>}</div>{overviewFrom&&overviewTo&&overviewFrom>overviewTo&&<div className="notice">تاریخ شروع بازه باید قبل از تاریخ پایان باشد.</div>}<div className="status-overview"><div className="report-donut" style={{background:overviewDonut}}><div><b>{overviewSummary.total}</b><small>مصوبه</small></div></div><div className="status-breakdown"><button type="button" title={overviewStatusTooltip("completed")} onClick={()=>setOverviewDrilldown({status:"completed"})}><i className="legend-completed"/><span>اجرا شده</span><b>{overviewSummary.completed}</b></button><button type="button" title={overviewStatusTooltip("pending")} onClick={()=>setOverviewDrilldown({status:"pending"})}><i className="legend-pending"/><span>در حال پیگیری</span><b>{overviewSummary.pending}</b></button><button type="button" title={overviewStatusTooltip("delayed")} onClick={()=>setOverviewDrilldown({status:"delayed"})}><i className="legend-delayed"/><span>انجام نشده</span><b>{overviewSummary.delayed}</b></button></div></div></section>
        <section className="panel trend-panel"><div className="report-panel-heading"><div><span className="report-kicker">روند زمانی</span><h2>مصوبات بر اساس ماه جلسه</h2><p>شش ماه اخیر، تفکیک‌شده با وضعیت فعلی</p></div></div><div className="monthly-chart">{reportMonths.map(month=><button type="button" className={"month-column "+(overviewDrilldown&&"monthKey" in overviewDrilldown&&overviewDrilldown.monthKey===month.key?"selected":"")} key={month.key} aria-pressed={!!overviewDrilldown&&"monthKey" in overviewDrilldown&&overviewDrilldown.monthKey===month.key} onClick={()=>setOverviewDrilldown({monthKey:month.key})}><div className="month-total">{month.total || ""}</div><div className="month-bars" title={monthTooltip(month.key)}><i className="completed-segment" style={{height:`${month.completed*100/monthMax}%`}}/><i className="delayed-segment" style={{height:`${month.delayed*100/monthMax}%`}}/><i className="pending-segment" style={{height:`${month.pending*100/monthMax}%`}}/></div><small>{month.title}</small></button>)}</div><div className="mini-legend"><span><i className="legend-completed"/>اجراشده</span><span><i className="legend-pending"/>در حال پیگیری</span><span><i className="legend-delayed"/>انجام نشده</span></div>{overviewDrilldown&&<div className="overview-drilldown"><div className="overview-drilldown-head"><b>{selectedOverviewTitle}</b><span>{selectedOverviewItems.length} مصوبه</span><button type="button" className="secondary" onClick={()=>setOverviewDrilldown(null)}>پاک‌کردن انتخاب</button></div>{selectedOverviewItems.length?<div className="overview-drilldown-list">{selectedOverviewItems.map(item=><article key={item.id}><div className="overview-drilldown-meta"><b>مصوبه {item.number} · شناسه یکتا: {item.id}</b><span className={"status "+item.status}>{labels[item.status]||item.status}</span></div><p>{item.text}</p>{item.notes&&<small>{item.notes}</small>}<div><span>{meetings.find(meeting=>meeting.id===item.meetingId)?.title||"جلسه"} · {formatDate(item.meetingDate,item.meetingDateJalali?.replace(/\./g,"/"))}</span><span>مهلت: {item.dueDate?formatDate(item.dueDate,item.dueDateJalali?.replace(/\./g,"/")):"بدون سررسید"}</span></div><small>{resolutionRoutingLabel(item,groups,users)}</small></article>)}</div>:<p className="report-empty">مصوبه‌ای در این بخش پیدا نشد.</p>}</div>}</section>
        <section className="panel topic-report-panel"><div className="report-panel-heading"><div><span className="report-kicker">رویکرد مصوبات</span><h2>موضوعات پرتکرار در مصوبات جلسات</h2><p>هر مصوبه بر اساس واژه‌های متن و توضیحات در یک موضوع اصلی قرار گرفته است؛ برای دیدن مصوبات هر موضوع روی ردیف آن کلیک کنید.</p></div></div><div className="topic-report-layout"><div className="topic-donut" style={{background:topicDonut}} title={topicDistribution.map(topic=>`${topic.label}: ${topic.count} مصوبه، ${topic.percent}٪`).join("\n")}><div><b>{overviewResolutions.length}</b><small>مصوبه</small></div></div><div className="topic-distribution">{topicDistribution.map(topic=><button type="button" key={topic.key} className={selectedTopic===topic.key?"selected":""} title={`${topic.label}: ${topic.count} از ${overviewResolutions.length} مصوبه · ${topic.percent}٪\n${topic.items.slice(0,4).map(item=>`مصوبه ${item.number}: ${item.text.slice(0,100)}`).join("\n")}`} onClick={()=>setSelectedTopic(current=>current===topic.key?null:topic.key)}><span className="topic-name"><i style={{background:topic.color}}/><b>{topic.label}</b></span><span className="topic-track"><i style={{width:`${topic.percent}%`,background:topic.color}}/></span><strong>{topic.count} <small>· {topic.percent}٪</small></strong></button>)}{topicDistribution.length===0&&<div className="report-empty">در بازه انتخاب‌شده مصوبه‌ای برای تحلیل موضوعی نیست.</div>}</div></div>{selectedTopic&&<div className="topic-drilldown"><div className="overview-drilldown-head"><b>مصوبات «{topicDefinitions.find(topic=>topic.key===selectedTopic)?.label}»</b><span>{selectedTopicItems.length} مصوبه</span><button type="button" className="secondary" onClick={()=>setSelectedTopic(null)}>بستن</button></div><div className="overview-drilldown-list">{selectedTopicItems.map(item=><article key={item.id}><div className="overview-drilldown-meta"><b>مصوبه {item.number} · شناسه یکتا: {item.id}</b><span className={`status ${item.status}`}>{labels[item.status]||item.status}</span></div><p>{item.text}</p>{item.notes&&<small>{item.notes}</small>}<div><span>{meetings.find(meeting=>meeting.id===item.meetingId)?.title||"جلسه"} · {formatDate(item.meetingDate,item.meetingDateJalali?.replace(/\\./g,"/"))}</span><span>ارجاع: {resolutionRoutingLabel(item,groups,users)}</span><span>مهلت: {item.dueDate?formatDate(item.dueDate,item.dueDateJalali?.replace(/\\./g,"/")):"بدون سررسید"}</span></div></article>)}</div></div>}</section>
        <section className="panel group-report-panel"><div className="report-panel-heading"><div><span className="report-kicker">مقایسه و پیگیری</span><h2>{reportViewTab==="groups"?"گزارش گروه‌ها":reportViewTab==="units"?"گزارش معاونت‌ها":"گزارش فردی"}</h2><p>{reportViewTab==="groups"?"وضعیت اجرای مصوبه‌ها در گروه‌ها و استان‌ها را مقایسه کنید.":reportViewTab==="units"?"وضعیت اجرای مصوبه‌ها در معاونت‌ها و واحدها را مقایسه کنید.":"وضعیت مصوبه‌های افراد را جستجو و بررسی کنید."}</p></div></div>{reportViewTab==="people" ? <><div className="individual-report-filters"><div className="search report-search"><Search size={16}/><input value={reportQuery} onChange={event=>{setReportPage(1);setReportQuery(event.target.value);}} placeholder="جستجوی نام یا کد ملی"/></div><select aria-label="فیلتر وضعیت افراد" value={reportPersonStatusFilter} onChange={event=>{setReportPage(1);setReportPersonStatusFilter(event.target.value);}}><option value="all">همه وضعیت‌ها</option><option value="completed">دارای مصوبه اجراشده</option><option value="pending">دارای مصوبه در حال پیگیری</option><option value="delayed">انجام نشده</option></select></div>{filteredReportPeople.length ? <><div className="group-report-list people-summary-list">{pagedReportPeople.map(person=>{const attendance=attendanceByPerson.get(person.nationalId)||{total:0,present:0,absent:0};const attendancePercent=attendance.total?Math.round(attendance.present*100/attendance.total):0;return <div className="group-report-row person-summary-row" key={person.nationalId}><div className="group-report-label"><b>{person.displayName}</b><small>{person.title||"سمت ثبت نشده"} · {person.total} مصوبه · {person.completed} اجراشده · {person.pending} در حال پیگیری · {person.delayed} انجام نشده</small><div className="person-attendance-summary"><span>جلسات: {attendance.total} · حاضر: {attendance.present} · غایب: {attendance.absent}</span>{attendance.total>0?<div className="person-attendance-chart" title={`حضور ${attendance.present} · غیبت ${attendance.absent}`}><i className="present" style={{width:attendancePercent+"%"}}/><i className="absent" style={{width:(100-attendancePercent)+"%"}}/></div>:<span className="no-attendance-data">سابقهٔ حضور و غیاب ثبت نشده</span>}</div></div><div className="group-report-track"><i style={{width:`${person.total?Math.round(person.completed*100/person.total):0}%`}}/></div><strong>{person.total?Math.round(person.completed*100/person.total):0}٪</strong></div>;})}</div><div className="event-report-pagination"><span>{filteredReportPeople.length} نفر · صفحه {reportPage} از {reportPageCount}</span><div><button className="secondary" disabled={reportPage<=1} onClick={()=>setReportPage(page=>Math.max(1,page-1))}>قبلی</button><button className="secondary" disabled={reportPage>=reportPageCount} onClick={()=>setReportPage(page=>Math.min(reportPageCount,page+1))}>بعدی</button></div></div></> : <div className="report-empty">فردی با این فیلتر پیدا نشد.</div>}</> : <><div className="group-report-actions"><button type="button" className="secondary" onClick={()=>setSelectedReportGroupIds([])}>نمایش همه</button>{reportViewTab==="units"&&<button type="button" className="secondary" onClick={()=>setSelectedReportGroupIds(["__none__"])}>عدم انتخاب همه</button>}<button type="button" className="secondary" onClick={()=>setSelectedReportGroupIds(visibleReportGroups.map(group=>String(group.id)))}>انتخاب همه موارد این فهرست</button></div><div className="report-group-filter"><div className="report-group-filter-tools"><div className="search"><Search size={16}/><input value={reportGroupQuery} onChange={event=>setReportGroupQuery(event.target.value)} placeholder={reportViewTab==="groups"?"جستجوی نام گروه یا استان":"جستجوی نام معاونت یا واحد"}/></div></div><div className="report-group-options">{visibleReportGroups.map(group=><label key={group.id}><input type="checkbox" checked={selectedReportGroupIds.length===0 || selectedReportGroupIds.includes(String(group.id))} onChange={event=>{const id=String(group.id);setSelectedReportGroupIds(current=>{const selected=current.length===0?reportableGroups.map(item=>String(item.id)):current.includes("__none__")?[]:current;if(event.target.checked)return Array.from(new Set([...selected,id]));const remaining=selected.filter(item=>item!==id);return remaining.length?remaining:["__none__"];});}}/><span>{group.name}</span><small>{reportGroupKind(group)==="unit"?"معاونت/واحد":reportGroupKind(group)==="region"?"استان/منطقه":"گروه"}</small></label>)}</div><small className="report-selection-hint">{selectedReportGroupIds.length===0?"همه موارد این بخش انتخاب شده‌اند":selectedReportGroupIds.includes("__none__")?"هیچ موردی انتخاب نشده است":`${selectedReportGroupIds.length} مورد برای مقایسه انتخاب شده`}</small></div>{visibleGroupReport.length ? <div className="group-report-list">{visibleGroupReport.map(group=><div className="group-report-row" key={group.id}><div className="group-report-label"><b>{group.name}</b><small>{group.resolutions} مصوبه · {group.completed} اجراشده · {group.pending} در حال پیگیری · {group.delayed} انجام نشده</small></div><div className="group-report-track"><i style={{width:`${group.percent}%`}}/></div><strong>{group.percent}٪</strong></div>)}</div> : <div className="report-empty">برای این بخش و فیلتر انتخاب‌شده گزارشی وجود ندارد.</div>}</>}</section>
      </div><div className="panel event-report"><div className="individual-report-head"><div><h2>گزارش رویدادهای وظایف</h2><p>رویدادهای ثبت‌شده توسط کاربران برای مصوبه‌ها و پیگیری‌ها</p></div><div className="event-report-filters"><div className="search report-search"><Search size={16}/><input value={eventReportQuery} onChange={event=>setEventReportQuery(event.target.value)} placeholder="جستجو در نام، مصوبه یا متن رویداد"/></div><label>از تاریخ<DatePicker ref={eventReportFromPickerRef} calendar={persian} locale={persian_fa} format="YYYY/MM/DD" value={eventReportFrom ? gregorianToJalali(eventReportFrom).replace(/\\./g, "/") : ""} onChange={date=>{setEventReportFrom(date ? jalaliToGregorian(normalizeJalaliDate(date.format("YYYY.MM.DD"))) : "");window.setTimeout(() => eventReportFromPickerRef.current?.closeCalendar(), 50);}} /></label><label>تا تاریخ<DatePicker ref={eventReportToPickerRef} calendar={persian} locale={persian_fa} format="YYYY/MM/DD" value={eventReportTo ? gregorianToJalali(eventReportTo).replace(/\\./g, "/") : ""} onChange={date=>{setEventReportTo(date ? jalaliToGregorian(normalizeJalaliDate(date.format("YYYY.MM.DD"))) : "");window.setTimeout(() => eventReportToPickerRef.current?.closeCalendar(), 50);}} /></label></div></div>{eventReportItems.length ? <><div className="table-wrap report-table"><table><thead><tr><th>زمان</th><th>مصوبه</th><th>ثبت‌کننده</th><th>رویداد</th></tr></thead><tbody>{pagedEventReportItems.map(entry=><tr key={entry.id}><td>{formatEventDateTime(entry.createdAt)}</td><td><b>{entry.resolutionNumber}</b><small>شناسه یکتا: {entry.resolutionId}</small><small>{entry.resolutionText}</small></td><td>{entry.userName}</td><td>{entry.text}</td></tr>)}</tbody></table></div><div className="event-report-pagination"><span>{eventReportItems.length} رویداد · صفحه {eventReportPage} از {eventReportPageCount}</span><label>تعداد در صفحه<select value={eventReportPageSize} onChange={event=>setEventReportPageSize(Number(event.target.value))}><option value={10}>۱۰</option><option value={20}>۲۰</option><option value={50}>۵۰</option></select></label><div><button className="secondary" disabled={eventReportPage<=1} onClick={()=>setEventReportPage(page=>Math.max(1,page-1))}>قبلی</button><button className="secondary" disabled={eventReportPage>=eventReportPageCount} onClick={()=>setEventReportPage(page=>Math.min(eventReportPageCount,page+1))}>بعدی</button></div></div></> : <div className="report-empty">رویدادی با این فیلترها پیدا نشد.</div>}</div><div className="panel individual-report"><div className="individual-report-head"><div><h2>جزئیات گزارش به تفکیک فرد</h2><p>تعداد مصوبه‌ها و وضعیت اجرای هر فرد</p></div><div className="individual-report-filters"><button className="secondary" type="button" disabled={!reportPeople.length} onClick={exportPeopleExcel}>دریافت Excel</button><div className="search report-search"><Search size={15}/><input value={reportQuery} onChange={event=>setReportQuery(event.target.value)} placeholder="جستجوی نام، سمت یا کد ملی فرد"/></div><select aria-label="فیلتر وضعیت افراد" value={reportPersonStatusFilter} onChange={event=>setReportPersonStatusFilter(event.target.value)}><option value="all">همه وضعیت‌ها</option><option value="completed">دارای مصوبه اجراشده</option><option value="pending">دارای مصوبه در حال پیگیری</option><option value="delayed">انجام نشده</option></select></div></div><div className="chart-legend"><span><i className="legend-completed" />اجراشده</span><span><i className="legend-pending" />در حال پیگیری</span><span><i className="legend-delayed" />انجام نشده</span></div><div className="people-chart">{pagedReportPeople.map(person => { const completedWidth = person.total ? person.completed * 100 / reportMax : 0; const delayedWidth = person.total ? person.delayed * 100 / reportMax : 0; const pendingWidth = person.total ? Math.max(0, person.total - person.completed - person.delayed) * 100 / reportMax : 0; return <div className="chart-row" key={person.nationalId}><div className="chart-person"><b>{person.title || "سمت ثبت نشده"}</b><small>{person.displayName}</small></div><div className="chart-bar-track" title={`اجراشده: ${person.completed} · در حال پیگیری: ${person.pending} · انجام نشده: ${person.delayed}`} aria-label={`اجراشده ${person.completed}، در حال پیگیری ${person.pending}، انجام نشده ${person.delayed}`}><span className="chart-segment completed-segment" style={{width: `${completedWidth}%`}}/><span className="chart-segment delayed-segment" style={{width: `${delayedWidth}%`}}/><span className="chart-segment pending-segment" style={{width: `${pendingWidth}%`}}/></div><b className="chart-total">{person.total}</b></div>;})}{filteredReportPeople.length === 0 && <div className="report-empty">فردی با این نام یا کد ملی پیدا نشد.</div>}</div><div className="table-wrap report-table"><table><thead><tr><th>فرد</th><th>سمت</th><th>کل</th><th>اجراشده</th><th>در حال پیگیری</th><th>انجام نشده</th><th>درصد اجرا</th>{isAdmin&&<th>یادآوری</th>}</tr></thead><tbody>{pagedReportPeople.map(person => <tr key={person.nationalId}><td>{person.displayName}</td><td>{person.title || "—"}</td><td><button className="report-number" onClick={()=>void openReportPersonTasks(person,"all")}>{person.total}</button></td><td><button className="report-number completed" onClick={()=>void openReportPersonTasks(person,"completed")}>{person.completed}</button></td><td><button className="report-number pending" onClick={()=>void openReportPersonTasks(person,"pending")}>{person.pending}</button></td><td><button className="report-number delayed" onClick={()=>void openReportPersonTasks(person,"delayed")}>{person.delayed}</button></td><td><button className="report-number" onClick={()=>setReportTaskSelection({person,status:"completed"})}>{person.total ? Math.round(person.completed * 100 / person.total) : 0}٪</button></td>{isAdmin&&<td><button className="secondary report-warning" disabled={busy||person.delayed===0&&person.pending===0} onClick={()=>void sendDelayWarning(person)}><Bell size={14}/>ارسال هشدار</button></td>}</tr>)}</tbody></table></div>{reportTaskSelection && <div className="report-task-details"><div className="report-task-head"><div><h3>{reportTaskSelection.person.displayName} · {reportTaskSelection.status==="all"?"همه وظایف":reportTaskSelection.status==="completed"?"اجراشده":reportTaskSelection.status==="delayed"?"انجام نشده":"در حال پیگیری"}</h3><p>{reportTaskSelection.person.title||"سمت ثبت نشده"}</p></div><button className="icon-btn" onClick={()=>{reportTaskRequestId.current++;setReportTaskSelection(null);setReportTaskDetails([]);setReportTaskDetailsError("");}}><X size={18}/></button></div><div className="report-task-list">{reportTaskDetailsLoading?<div className="report-empty">در حال دریافت مصوبه‌ها…</div>:reportTaskDetailsError?<div className="notice" role="alert">{reportTaskDetailsError}</div>:reportTaskDetails.filter(full=>{const status=full.progress?.find(progress=>progress.nationalId===reportTaskSelection.person.nationalId)?.status||full.status;return reportTaskSelection.status==="all"||(reportTaskSelection.status==="completed"?status==="completed":reportTaskSelection.status==="delayed"?status==="delayed":status==="before"||status==="in_progress");}).map(full=>{const personal=full.progress?.find(progress=>progress.nationalId===reportTaskSelection.person.nationalId);const task={resolutionId:full.id,number:full.number,text:full.text,status:personal?.status||full.status,dueDateJalali:full.dueDateJalali};const meeting=meetings.find(item=>item.id===full.meetingId);return <article className={`report-task-item report-task-item-expanded ${task.status}`} key={task.resolutionId}><div className="report-task-resolution-heading"><div><b>مصوبه {task.number} · شناسه یکتا: {task.resolutionId}</b><span className="report-task-session">{meeting?meeting.title:"جلسه ثبت نشده"}{meeting?" · "+formatDate(meeting.date,meeting.dateJalali?.replace(/\\./g,"/")):""}</span></div><span className={"status "+(personal?.status||task.status)}>{labels[personal?.status||task.status]||personal?.status||task.status}</span></div><div className="report-task-full-text">{full?.text||task.text}</div><div className="report-task-meta-grid"><span><b>وضعیت کلی مصوبه</b>{labels[full?.status||task.status]||full?.status||task.status}</span><span><b>{full?.isSpecialTracking?"تاریخ درخواست":"تاریخ جلسه"}</b>{full?formatDate(full.meetingDate,full.meetingDateJalali):meeting?formatDate(meeting.date,meeting.dateJalali?.replace(/\\./g,"/")):"—"}</span><span><b>زمان شروع</b>{full?.startDate?formatDate(full.startDate,full.startDateJalali):"—"}</span><span><b>زمان سررسید</b>{full?.dueDate?formatDate(full.dueDate,full.dueDateJalali):"بدون سررسید"}</span>{full?.requiresPeriodicReport&&<span><b>گزارش مستمر</b>{frequencyLabels[full.reportFrequency||""]||full.reportFrequency}</span>}<span className="report-task-referral"><b>ارجاع به</b>{full?resolutionRoutingLabel(full,groups,users):"—"}</span></div>{full?.notes&&<div className="report-task-note"><b>توضیحات مصوبه</b><p>{full.notes}</p></div>}{full?.cancellationReason&&<div className="report-task-note cancellation"><b>دلیل لغو</b><p>{full.cancellationReason}</p></div>}{personal&&<div className="report-task-person-state"><b>وضعیت پیگیری این فرد</b><span className={"status "+personal.status}>{labels[personal.status]||personal.status}</span>{personal.updatedAt&&<small>آخرین به‌روزرسانی: {formatDateTime(personal.updatedAt)}</small>}</div>}{personal?.reportText&&<div className="report-task-note"><b>گزارش اقدام این فرد</b><p>{personal.reportText}</p></div>}{personal?.adminFeedback&&<div className="report-task-note report-admin-feedback"><b>بازخورد ادمین</b><p>{personal.adminFeedback}</p></div>}{(full?.attachments||[]).length>0&&<div className="report-task-files"><b>پیوست‌های مصوبه</b>{full!.attachments!.map(file=><a key={file.id} href={`/api/attachments/${file.id}`} target="_blank" rel="noreferrer"><Paperclip size={13}/>{file.originalName}</a>)}</div>}{(full?.meetingAttachments||[]).length>0&&<div className="report-task-files"><b>فایل‌های جلسه</b>{full!.meetingAttachments!.map(file=><a key={file.id} href={`/api/meeting-attachments/${file.id}`} target="_blank" rel="noreferrer"><FileText size={13}/>{file.originalName}</a>)}</div>}{reportSubmissions.filter(report=>report.resolutionId===task.resolutionId&&report.nationalId===reportTaskSelection.person.nationalId).map(report=><div className="report-task-submission" key={report.id}><div><b>{report.reportType==="periodic"?"گزارش مستمر":"گزارش اقدام"} · {formatDateTime(report.submittedAt)}</b><span className={"status "+(report.approvalStatus==="rejected"?"delayed":"completed")}>{report.approvalStatus==="rejected"?"ردشده":"ثبت‌شده"}</span></div><p>{report.text}</p>{report.adminFeedback&&<small>علت رد: {report.adminFeedback}</small>}{report.attachments?.map(file=><a key={file.id} href={`/api/attachments/${file.id}`} target="_blank" rel="noreferrer"><Paperclip size={13}/>{file.originalName}</a>)}</div>)}{(full?.events||[]).length>0&&<details className="report-task-events"><summary>رویدادهای مصوبه ({full!.events!.length})</summary>{full!.events!.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(event=><div key={event.id}><b>{event.userName}</b><small>{formatDateTime(event.createdAt)}</small><p>{event.text}</p></div>)}</details>}</article>})}{!reportTaskDetailsLoading&&!reportTaskDetailsError&&reportTaskDetails.length===0&&<p className="report-empty">مصوبه‌ای برای این وضعیت وجود ندارد.</p>}</div></div>}<div className="pagination"><span>{filteredReportPeople.length ? `نمایش ${(reportPage - 1) * reportPageSize + 1} تا ${Math.min(reportPage * reportPageSize, filteredReportPeople.length)} از ${filteredReportPeople.length} نفر` : "فردی یافت نشد"}</span><div><button disabled={reportPage <= 1} onClick={() => setReportPage(page => Math.max(1, page - 1))}>قبلی</button><span>صفحه {reportPage} از {reportPageCount}</span><button disabled={reportPage >= reportPageCount} onClick={() => setReportPage(page => Math.min(reportPageCount, page + 1))}>بعدی</button></div></div></div></div>}
    </main>

    {expandedReport && <div className="modal-backdrop report-text-backdrop" onClick={()=>setExpandedReport(null)}><section className="modal report-text-modal" role="dialog" aria-modal="true" aria-labelledby="report-text-modal-title" onClick={event=>event.stopPropagation()}><div className="modal-head"><div><h2 id="report-text-modal-title">متن کامل گزارش</h2><p>{expandedReport.userName} · مصوبه {expandedReport.resolutionNumber} · شناسه یکتا: {expandedReport.resolutionId}</p></div><button type="button" className="icon-btn" aria-label="بستن" onClick={()=>setExpandedReport(null)}><X/></button></div><div className="report-text-modal-body"><h3>گزارش کاربر</h3><p>{expandedReport.text}</p>{expandedReport.adminFeedback&&<><h3>توضیح مدیر</h3><p>{expandedReport.adminFeedback}</p></>}</div><div className="modal-actions"><button type="button" className="secondary" onClick={()=>setExpandedReport(null)}>بستن</button></div></section></div>}
    {reportRejectionTarget && <div className="modal-backdrop report-rejection-backdrop" onClick={() => { if (!busy) setReportRejectionTarget(null); }}><section className="modal report-rejection-modal" role="dialog" aria-modal="true" aria-labelledby="report-rejection-title" onClick={event => event.stopPropagation()}><div className="modal-head"><div><h2 id="report-rejection-title">رد گزارش و ثبت علت</h2><p>{reportRejectionTarget.kind === "submission" ? "مصوبه " + reportRejectionTarget.report.resolutionNumber + " · شناسه یکتا: " + reportRejectionTarget.report.resolutionId + " · " + reportRejectionTarget.report.userName : "مصوبه " + (resolutions.find(item => item.id === reportRejectionTarget.resolutionId)?.number ?? "") + " · شناسه یکتا: " + reportRejectionTarget.resolutionId}</p></div><button type="button" className="icon-btn" disabled={busy} aria-label="بستن" onClick={() => setReportRejectionTarget(null)}><X/></button></div><label className="report-rejection-label">علت رد گزارش<textarea autoFocus rows={5} required value={reportRejectionFeedback} onChange={event => setReportRejectionFeedback(event.target.value)} placeholder="علت رد گزارش را برای کاربر توضیح دهید…"/></label><div className="modal-actions"><button type="button" className="secondary" disabled={busy} onClick={() => setReportRejectionTarget(null)}>انصراف</button><button type="button" className="primary" disabled={busy || !reportRejectionFeedback.trim()} onClick={() => void submitReportRejection()}>{busy ? "در حال ثبت…" : "ثبت رد گزارش"}</button></div></section></div>}
    {modalOpen && <div className="modal-backdrop" onClick={() => setModalOpen(false)}><section className="modal" onClick={event => event.stopPropagation()}><div className="modal-head"><div><h2>{editingResolutionId ? (form.isSpecialTracking ? "ویرایش "+specialTrackingLabel(form.specialTrackingType) : "ویرایش مصوبه شورای معاونین") : form.isSpecialTracking ? "ثبت "+specialTrackingLabel(form.specialTrackingType) : "ثبت مصوبه شورای معاونین جلسه"}</h2><p>{form.isSpecialTracking ? "مشخصات درخواست، متن دستور و گیرندگان مسئول را وارد کنید." : "مشخصات جلسه، متن مصوبه و گیرندگان پیگیری را وارد کنید."}</p></div><button className="icon-btn" onClick={() => {setModalOpen(false);setResolutionFormError("");}}><X /></button></div>{(resolutionFormError || dateValidationError) && <div className="notice" role="alert">{resolutionFormError || dateValidationError}</div>}<div className="form-grid">{form.isSpecialTracking ? <div className="special-followup-meeting-label"><label>نوع دستور<select value={form.specialTrackingType} onChange={event=>setForm({...form,specialTrackingType:event.target.value==="provincial"?"provincial":"minister"})}><option value="minister">دستورات وزیر</option><option value="provincial">سفرهای استانی وزیر</option></select></label>{form.specialTrackingType==="minister"&&<label>دسته‌بندی دستور<select required value={form.ministerCategory} onChange={event=>setForm({...form,ministerCategory:event.target.value})}><option value="">انتخاب دسته‌بندی</option>{ministerDirectiveCategories.map(category=><option key={category} value={category}>{category}</option>)}</select></label>}</div> : <div className="meeting-search-picker"><label className="required-field" htmlFor="resolution-meeting-search">جلسه مرتبط</label><div className="search"><Search size={15}/><input id="resolution-meeting-search" required value={meetingPickerOpen?meetingPickerQuery:(meetings.find(item=>String(item.id)===form.meetingId)?.title||meetingPickerQuery)} onFocus={()=>{setMeetingPickerQuery("");setMeetingPickerOpen(true);}} onChange={event=>{setMeetingPickerQuery(event.target.value);setMeetingPickerOpen(true);}} placeholder="جستجو در عنوان یا تاریخ جلسه"/></div>{meetingPickerOpen&&<div className="meeting-search-options">{meetings.filter(meeting=>!meetingPickerQuery||normalizeSearchText(meeting.title+" "+meeting.dateJalali).includes(normalizeSearchText(meetingPickerQuery))).slice(0,20).map(meeting=><button type="button" key={meeting.id} onClick={()=>{const meetingDate=meeting.date;const meetingDateJalali=meeting.dateJalali||gregorianToJalali(meetingDate);const startDate=form.startDate<meetingDate?meetingDate:form.startDate;const dueDate=form.dueDate&&form.dueDate<=startDate?"":form.dueDate;setForm({...form,meetingId:String(meeting.id),meetingDate,meetingDateJalali,startDate,startDateJalali:startDate===meetingDate?meetingDateJalali:(form.startDateJalali||gregorianToJalali(startDate)),dueDate,dueDateJalali:dueDate?form.dueDateJalali:""});setMeetingPickerQuery(meeting.title);setMeetingPickerOpen(false);setResolutionFormError("");}}><b>{meeting.title}</b><small>{formatDate(meeting.date,meeting.dateJalali?.replace(/\./g,"/"))}</small></button>)}{meetings.length===0&&<small>برای ثبت مصوبه، ابتدا از بخش جلسات یک جلسه ثبت کنید.</small>}</div>}</div>}{form.isSpecialTracking&&form.specialTrackingType==="provincial"&&<label className="required-field province-select-field">استان سفر<select required value={form.province} onChange={event=>setForm({...form,province:event.target.value})}><option value="">انتخاب استان</option>{iranProvinceOptions.map(province=><option key={province} value={province}>{province}</option>)}</select></label>}<div className="date-field"><span>{form.isSpecialTracking ? (form.specialTrackingType==="provincial"?"تاریخ سفر":"تاریخ درخواست") : "تاریخ جلسه"}</span><DatePicker disabled={!form.isSpecialTracking} ref={meetingDatePickerRef} calendar={persian} locale={persian_fa} format="YYYY/MM/DD" value={form.meetingDateJalali.replace(/\./g,"/")} onChange={date=>{if(form.isSpecialTracking&&date){const jalali=normalizeJalaliDate(date.format("YYYY.MM.DD"));setForm({...form,meetingDate:jalaliToGregorian(jalali),meetingDateJalali:jalali});}window.setTimeout(()=>meetingDatePickerRef.current?.closeCalendar(),50);}} /></div><div className="date-field required-field"><span>زمان شروع</span><DatePicker ref={startDatePickerRef} calendar={persian} locale={persian_fa} format="YYYY/MM/DD" value={form.startDateJalali.replace(/\./g, "/")} onChange={date => { if(date) { const jalali=normalizeJalaliDate(date.format("YYYY.MM.DD")); setForm({ ...form, startDate: jalaliToGregorian(jalali), startDateJalali: jalali }); } window.setTimeout(() => startDatePickerRef.current?.closeCalendar(), 50); }} /></div><div className="date-field"><span>زمان سررسید</span><DatePicker ref={dueDatePickerRef} calendar={persian} locale={persian_fa} format="YYYY/MM/DD" value={form.dueDateJalali.replace(/\./g, "/")} onChange={date => { if(date) { const jalali=normalizeJalaliDate(date.format("YYYY.MM.DD")); setForm({ ...form, dueDate: jalaliToGregorian(jalali), dueDateJalali: jalali }); } else setForm({ ...form, dueDate: "", dueDateJalali: "" }); window.setTimeout(() => dueDatePickerRef.current?.closeCalendar(), 50); }} /></div>{dateValidationError && <div className="date-validation-error span2" role="alert">{dateValidationError}</div>}<label className="required-field">{form.isSpecialTracking?(form.specialTrackingType==="provincial"?"شماره سفر":"شماره دستور"):"شماره مصوبه شورای معاونین"}<input required value={form.number} onChange={event => setForm({ ...form, number: event.target.value })} placeholder="مثلاً ۱۴۰۵/۱۲" /></label><label className="span2 required-field">{form.isSpecialTracking?"شرح دستور":"متن مصوبه شورای معاونین"}<textarea required rows={4} value={form.text} onChange={event => setForm({ ...form, text: event.target.value })} /></label><label className="span2">پیوست‌های مصوبه<input type="file" multiple onChange={async event=>{const input=event.currentTarget;const selected=Array.from(input.files||[]);input.value="";const priorFiles=resolutions.find(item=>item.id===editingResolutionId)?.attachments||[];const known=new Set([...editingResolutionHashes,...await Promise.all(resolutionFiles.map(sha256File))]);const knownNames=new Set([...priorFiles.map(file=>file.originalName.toLowerCase()+"|"+file.size),...resolutionFiles.map(file=>file.name.toLowerCase()+"|"+file.size)]);const additions:File[]=[];for(const file of selected){const hash=await sha256File(file);const fileKey=file.name.toLowerCase()+"|"+file.size;if(known.has(hash)||knownNames.has(fileKey)){setMessage("این فایل قبلاً به مصوبه پیوست شده یا در همین فرم انتخاب شده است: "+file.name);continue;}known.add(hash);knownNames.add(fileKey);additions.push(file);}if(additions.length)setResolutionFiles(current=>[...current,...additions]);}}/><small>فایل تکراری برای همین مصوبه پذیرفته نمی‌شود؛ فایل‌های تازه پس از ذخیره بارگذاری می‌شوند.</small>{resolutionFiles.length>0&&<div className="draft-file-list">{resolutionFiles.map((file,index)=><div key={index}><span>{file.name}</span><button type="button" className="icon-btn" onClick={()=>setResolutionFiles(current=>current.filter((_,i)=>i!==index))}><X size={14}/></button></div>)}</div>}</label><label className="publish-toggle span2"><input type="checkbox" checked={form.isConfidential} onChange={event => setForm({ ...form, isConfidential: event.target.checked })} /><span><b>مصوبه محرمانه است</b><small>در پیام‌های بله، متن و توضیحات مصوبه نمایش داده نمی‌شود و فقط «محرمانه» درج می‌شود.</small></span></label><label className="span2">رویداد اولیه مصوبه<textarea rows={2} value={resolutionEventDraft} onChange={event=>setResolutionEventDraft(event.target.value)} placeholder="رویداد یا یادداشت اولیه (اختیاری)"/></label><label className="required-field">ارجاع به حداقل یک مورد</label><div className="direct-people-field span2">{selectedAssignmentOptions.length>0&&<><label>ارجاع‌های انتخاب‌شده</label><div className="people-results selected-assignment-results">{selectedAssignmentOptions.map(option=><label className="person-option" key={option.key}><input type="checkbox" checked onChange={event=>toggleAssignmentOption(option,event.target.checked)}/><span>{option.label}<small className="person-title">{option.detail}</small></span><small>{option.kind==="group"?"گروه":option.kind==="unit"?"معاونت/واحد":"پست"}</small></label>)}</div></>}<label htmlFor="direct-people-search">جستجوی گروه، معاونت، اداره‌کل یا پست مسئول</label><div className="search"><Search size={16}/><input id="direct-people-search" value={peopleQuery} onChange={event=>setPeopleQuery(event.target.value)} placeholder="مثلاً مدیرکل تهران، مدیرکل یا نام معاونت"/></div><div className="people-results">{assignmentOptions.map(option=><label className="person-option" key={option.key}><input type="checkbox" checked={isAssignmentOptionSelected(option)} onChange={event=>toggleAssignmentOption(option,event.target.checked)}/><span>{option.label}<small className="person-title">{option.detail}</small></span><small>{option.kind==="group"?"گروه":option.kind==="unit"?"معاونت/واحد":"پست"}</small></label>)}{assignmentTerm.length<2?<div className="people-empty">برای جستجو حداقل دو حرف وارد کنید.</div>:assignmentOptions.length===0&&<div className="people-empty">موردی با این عنوان یا پست پیدا نشد.</div>}</div><small className="selection-count">{form.groupIds.length+form.unitIds.length+form.people.length} مورد انتخاب شده</small></div><label className="publish-toggle span2"><input type="checkbox" checked={form.requiresPeriodicReport} onChange={event => setForm({ ...form, requiresPeriodicReport: event.target.checked })} /><span><b>ارسال گزارش مستمر</b><small>برای این مصوبه گزارش دوره‌ای از افراد ارجاع‌شده دریافت شود.</small></span></label>{form.requiresPeriodicReport && <label>دوره دریافت گزارش<select value={form.reportFrequency} onChange={event => setForm({ ...form, reportFrequency: event.target.value })}><option value="daily">روزانه</option><option value="weekly">هفتگی</option><option value="monthly">ماهانه</option></select></label>}<label className="publish-toggle span2"><input type="checkbox" checked={form.publishToAll} onChange={event => setForm({ ...form, publishToAll: event.target.checked })} /><span><b>انتشار برای همه کاربران</b><small>مصوبه و پیوست‌های آن برای همه در دیواره نمایش داده می‌شود.</small></span></label><label className="span2">توضیحات<textarea rows={2} value={form.notes} onChange={event => setForm({ ...form, notes: event.target.value })} /></label></div><div className="modal-actions"><button className="secondary" onClick={() => setModalOpen(false)}>انصراف</button><button className="primary" disabled={busy || !form.number.trim() || !form.text.trim() || !form.startDate || !!dateValidationError || form.groupIds.length+form.unitIds.length+form.people.length===0} onClick={() => void createResolution()}>{busy ? "در حال ذخیره…" : editingResolutionId ? "ذخیره تغییرات" : "ثبت و ارجاع مصوبه"}</button></div></section></div>}
  </div>;
}

function Metric({ icon, label, value, color, active, onClick }: { icon: React.ReactNode; label: string; value: number; color: string; active: boolean; onClick: () => void }) { return <button type="button" className={`metric ${active ? "active" : ""}`} onClick={onClick}><div className={`metric-icon ${color}`}>{icon}</div><div><span>{label}</span><b>{value}</b></div></button>; }
function ResolutionCard({ item, groups, users, viewerId, isAdmin, busy, onStatus, onUpload, eventDraft, onEventChange, onEventSubmit, onApproveAttachment, reportDraft, onReportDraftChange, onReportSubmit, submittedFading, sentWarningIds, onSendWarning, periodicDraft, onPeriodicDraftChange, onPeriodicSubmit, anchorId, submittedReports = [], reportsLoading, reportsError }: { anchorId?: string; submittedReports?: ResolutionReport[]; reportsLoading: boolean; reportsError: string; item: Resolution; groups: Group[]; users: DirectoryUser[]; viewerId: string; isAdmin: boolean; busy: boolean; onStatus: (status: string, nationalId?: string) => void; onUpload: (file: File) => Promise<void>; eventDraft: string; onEventChange: (text: string) => void; onEventSubmit: () => void; onApproveAttachment: (attachmentId: number, approved: boolean) => void; reportDraft: string; onReportDraftChange: (text: string) => void; onReportSubmit: (files: File[]) => Promise<boolean>; submittedFading?: boolean; sentWarningIds: string[]; onSendWarning: (nationalIds: string[]) => Promise<string[]>; periodicDraft: string; onPeriodicDraftChange: (text: string) => void; onPeriodicSubmit: () => void }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [progressFilter, setProgressFilter] = useState<"pending" | "completed">("pending");
  const [warningSelection, setWarningSelection] = useState<string[]>([]);
  const [warningTooltipIds, setWarningTooltipIds] = useState<string[]>([]);
  const [bulkWarningTooltip, setBulkWarningTooltip] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reportFiles, setReportFiles] = useState<File[]>([]);
  const visibleAttachments = (item.attachments ?? []).filter(attachment => attachment.resolutionReportId ? isAdmin : isAdmin || attachment.approvedForAll);
  const visibleEvents = (item.events ?? []).filter(entry => isAdmin || /گزارش/u.test(entry.text));
  const itemSubmittedReports = submittedReports.filter(report => report.resolutionId === item.id).sort((left, right) => right.submittedAt.localeCompare(left.submittedAt));
  const groupIds = new Set([...(item.groupId ? [item.groupId] : []), ...(item.groupAssignments ?? []).map(a => a.groupId)]);
  const memberMap = new Map<string, Member>();
  groups.filter(group => groupIds.has(group.id)).flatMap(group => group.members).forEach(member => memberMap.set(member.nationalId, member));
  const directAssigneeIds=new Set((item.assignments??[]).map(assignment=>assignment.nationalId));
  groups.flatMap(group=>group.members).filter(member=>directAssigneeIds.has(member.nationalId)).forEach(member=>memberMap.set(member.nationalId,member));
  users.filter(user=>directAssigneeIds.has(user.nationalId)).forEach(user=>memberMap.set(user.nationalId,{id:0,nationalId:user.nationalId,displayName:user.displayName,title:user.title||""}));
  if(isAdmin && item.publishToAll) users.forEach(user=>memberMap.set(user.nationalId,{id:0,nationalId:user.nationalId,displayName:user.displayName,title:user.title||""}));
  const members = Array.from(memberMap.values());
  const personalProgress = item.progress?.find(progress => progress.nationalId === viewerId);
  const effectiveMemberStatus = (nationalId: string) => { const saved=item.progress?.find(progress=>progress.nationalId===nationalId)?.status; return ["completed","rejected","in_progress","delayed","before"].includes(saved ?? "") ? saved! : item.status; };
  const personalStatus = isAdmin ? item.status : effectiveMemberStatus(viewerId);
  const isRejected = !isAdmin && personalStatus === "rejected";
  const statusFor = (nationalId: string) => effectiveMemberStatus(nationalId);
  const completedCount = members.filter(member => statusFor(member.nationalId) === "completed").length;
  const completionPercent = members.length ? Math.round(completedCount * 100 / members.length) : 0;
  const statusCounts = ["completed", "rejected", "in_progress", "before", "delayed"].map(status => ({ status, count: members.filter(member => statusFor(member.nationalId) === status).length }));
  const warningMembers = members.filter(member => ["delayed", "in_progress"].includes(statusFor(member.nationalId)));
  const sentWarningIdSet = new Set(sentWarningIds.filter(key=>key.startsWith(item.id+":")).map(key=>key.slice(String(item.id).length+1)));
  const selectedWarningIds = warningSelection.filter(nationalId => warningMembers.some(member => member.nationalId === nationalId));
  const pendingSelectedWarningIds = selectedWarningIds.filter(nationalId => !sentWarningIdSet.has(nationalId));
  const sendWarning = async (nationalIds: string[]) => {
    const pendingIds = nationalIds.filter(nationalId => !sentWarningIdSet.has(nationalId));
    if (!pendingIds.length) return [] as string[];
    const sentIds = await onSendWarning(pendingIds);
    if (sentIds.length) {
      setWarningTooltipIds(current => Array.from(new Set([...current, ...sentIds])));
      window.setTimeout(() => setWarningTooltipIds(current => current.filter(id => !sentIds.includes(id))), 5000);
    }
    return sentIds;
  };
  return <article id={anchorId} className={"resolution-card" + (submittedFading ? " resolution-card-fade-out" : "")}>
    <details className="resolution-card-details">
      <summary style={{ cursor: "pointer", listStyle: "none", padding: "4px 0" }}>
        <div className="card-top"><span className="resolution-no">مصوبه {item.number} · شناسه یکتا: {item.id}</span><span className={`status ${item.status}`}>{labels[item.status] || item.status}</span></div>
        <p style={{ margin: "8px 0 4px", fontWeight: 700, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{item.text}</p>
        <small style={{ color: "var(--muted, #667085)" }}>{item.isSpecialTracking ? specialTrackingLabel(item.specialTrackingType)+" · "+(item.specialTrackingType==="provincial"?"تاریخ سفر: ":"تاریخ درخواست: ") : item.meetingTitle ? `جلسه: ${item.meetingTitle} · تاریخ جلسه: ` : ""}{formatDate(item.meetingDate, item.meetingDateJalali?.replace(/\\./g, "/"))} · برای مشاهدهٔ جزئیات کلیک کنید</small>
      </summary>
    {!isAdmin && item.status !== "cancelled" && (isRejected ? <div className="rejected-lock notice" role="status">وضعیت پیگیری شما رد شده است؛ امکان ارسال گزارش یا پیوست ندارید.</div> : <div className="personal-status-control"><span>وضعیت فعالیت شما</span><span className={`status ${personalStatus}`}>{labels[personalStatus] || labels[item.status] || item.status}</span></div>)}
    <div className="card-meta"><span><CalendarDays size={14} />{formatDate(item.meetingDate, item.meetingDateJalali?.replace(/\\./g, "/"))}</span>{item.startDate && <span><CalendarDays size={14}/>شروع: {formatDate(item.startDate, item.startDateJalali?.replace(/\\./g,"/"))}</span>}<span><Users size={14} />{resolutionRoutingLabel(item, groups)}</span></div>
    <p>{item.text}</p>{item.notes && <div className="note">توضیحات: {item.notes}</div>}{isAdmin && members.length===1 && warningMembers.length===1 && <div className="single-member-warning"><span><b>{warningMembers[0].displayName}</b><small>{labels[statusFor(warningMembers[0].nationalId)]}</small></span><span className="warning-tooltip-wrap" title={sentWarningIdSet.has(warningMembers[0].nationalId)?"✅ هشدار ارسال شد؛ برای ارسال دوباره صفحه را تازه‌سازی کنید.":"ارسال هشدار از طریق بله"}><button type="button" className="warning-send-button warning-send-button-single" disabled={busy||sentWarningIdSet.has(warningMembers[0].nationalId)} onClick={()=>void sendWarning([warningMembers[0].nationalId])}><Bell size={15}/><span>{busy ? "در حال ارسال..." : sentWarningIdSet.has(warningMembers[0].nationalId) ? "ارسال شد" : "ارسال هشدار در بله"}</span></button>{warningTooltipIds.includes(warningMembers[0].nationalId)&&<span className="warning-sent-tooltip" role="status">✅ هشدار ارسال شد؛ برای ارسال دوباره صفحه را تازه‌سازی کنید.</span>}</span></div>}{item.status === "cancelled" && item.cancellationReason && <div className="note cancellation-note">توضیح لغو: {item.cancellationReason}</div>}{item.dueDate && <div className={`deadline-chip ${item.dueDate < today() && personalStatus !== "completed" ? "overdue" : ""}`}><CalendarDays size={14}/><span>زمان سررسید: {formatDate(item.dueDate, item.dueDateJalali?.replace(/\./g,"/"))}</span>{item.dueDate < today() && item.status !== "completed" && <b>گذشته</b>}</div>}
    {item.requiresPeriodicReport && !isAdmin && !isRejected && item.status !== "cancelled" && personalStatus !== "completed" && <div className="completion-report periodic-report-box"><div className="report-status-line"><b>گزارش مستمر</b><span className="report-approval pending">{frequencyLabels[item.reportFrequency || ""] || item.reportFrequency}</span></div><small>ارسال طبق دورهٔ مصوبه انجام می‌شود. موعدهای رسیده را می‌توانید ثبت کنید.</small><textarea rows={3} value={periodicDraft} onChange={event=>onPeriodicDraftChange(event.target.value)} placeholder="گزارش این دوره را وارد کنید…" /><button type="button" className="primary" disabled={!periodicDraft.trim()} onClick={onPeriodicSubmit}>ارسال گزارش دوره‌ای</button></div>}{!isAdmin && !isRejected && <div className="completion-report"><div className="report-status-line"><b>گزارش اقدام و درخواست تأیید</b>{personalProgress?.approvalStatus && personalProgress.approvalStatus !== "none" && <span className={`report-approval ${personalProgress.approvalStatus}`}>{personalProgress.approvalStatus === "pending" ? "در انتظار بررسی" : personalProgress.approvalStatus === "approved" ? "تأیید شده" : "نیازمند اصلاح"}</span>}</div>{personalProgress?.reportText && <div className="submitted-report"><p>{personalProgress.reportText}</p>{personalProgress.adminFeedback && <small>نظر ادمین: {personalProgress.adminFeedback}</small>}</div>}<textarea rows={3} value={reportDraft} onChange={event=>onReportDraftChange(event.target.value)} placeholder="اقدام انجام‌شده و نتیجه را شرح دهید…" /><label className="report-file-picker"><Paperclip size={15}/><span>پیوست فایل گزارش (اختیاری)</span><input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.rtf,.odt,.ods,.odp,.jpg,.jpeg,.png,.gif,.webp,.bmp,.tif,.tiff,.zip,.rar,.7z,.tar,.gz,.mp3,.wav,.ogg,.m4a,.aac,.flac,.mp4,.mov,.avi,.mkv,.webm" onChange={event=>{setReportFiles(Array.from(event.target.files ?? []));event.target.value="";}} /></label>{reportFiles.length>0&&<div className="report-selected-files">{reportFiles.map((file,index)=><span key={file.name+index}><FileText size={13}/>{file.name}<button type="button" aria-label={"حذف "+file.name} onClick={()=>setReportFiles(current=>current.filter((_,i)=>i!==index))}>×</button></span>)}</div>}<button type="button" className="secondary" disabled={busy} onClick={()=>void onReportSubmit(reportFiles).then(ok=>{if(ok)setReportFiles([]);})}>ثبت و ارسال گزارش</button></div>}
    
    {isAdmin && <details className="admin-submitted-reports"><summary>گزارش‌های ارسالی کاربران ({itemSubmittedReports.length})</summary>{reportsLoading ? <small>در حال دریافت گزارش‌ها…</small> : reportsError ? <small role="alert">{reportsError}</small> : itemSubmittedReports.length ? <div className="submitted-report-list">{itemSubmittedReports.map(report=><article className="submitted-report-entry" key={report.id}><div className="report-status-line"><b>{report.reportType === "periodic" ? "گزارش مستمر" : "گزارش اقدام"} · {report.userName}</b><span className={`report-approval ${report.approvalStatus}`}>{report.approvalStatus === "pending" ? "در انتظار بررسی" : report.approvalStatus === "rejected" ? "نیازمند اصلاح" : "تأیید شده"}</span></div><small>{formatDateTime(report.submittedAt)}{report.userTitle ? ` · ${report.userTitle}` : ""}</small><p>{report.text}</p>{report.adminFeedback && <small>نظر مدیر: {report.adminFeedback}</small>}{report.attachments?.length ? <div className="submitted-report-files">{report.attachments.map(file=><a key={file.id} href={`/api/attachments/${file.id}`} target="_blank" rel="noreferrer"><Paperclip size={13}/>{file.originalName}</a>)}</div> : null}</article>)}</div> : <small>برای این مصوبه هنوز گزارشی از کاربران ثبت نشده است.</small>}</details>}
    {(members.length > 1 || groupIds.size > 1) && <div className="group-progress">
      <button className="progress-summary" type="button" aria-expanded={detailsOpen} onClick={() => setDetailsOpen(open => { if(!open) setProgressFilter("pending"); return !open; })}>
        <span className="progress-summary-top"><b>پیشرفت افراد ارجاع‌شده</b><strong>{completionPercent}٪ اجرا شده</strong></span>
        <span className="progress-track">{statusCounts.map(({status,count}) => count > 0 && <i key={status} className={`progress-segment ${status}`} style={{width:`${count*100/members.length}%`}} title={`${labels[status]}: ${count}`} />)}</span>
        <span className="progress-summary-bottom"><small>افراد: {members.length}</small>{statusCounts.filter(item=>item.count>0).map(item=><small key={item.status}>{labels[item.status]}: {item.count}</small>)}</span>
      </button>
      {detailsOpen && <div className="member-progress-details"><div className="member-progress-filters" role="tablist" aria-label="فیلتر وضعیت افراد"><button type="button" role="tab" aria-selected={progressFilter==="pending"} className={progressFilter==="pending"?"active":""} onClick={()=>setProgressFilter("pending")}>اجرا نشده‌ها <span>{members.length-completedCount}</span></button><button type="button" role="tab" aria-selected={progressFilter==="completed"} className={progressFilter==="completed"?"active":""} onClick={()=>setProgressFilter("completed")}>اجرا شده‌ها <span>{completedCount}</span></button></div>{members.length===0 && <div className="event-empty">برای گروه‌های ارجاع‌شده عضوی ثبت نشده است؛ اعضای معاونت/واحد را در بخش گروه‌ها تعریف کنید.</div>}{members.filter(member=>progressFilter==="completed"?statusFor(member.nationalId)==="completed":statusFor(member.nationalId)!=="completed").map(member => { const status=statusFor(member.nationalId); const isWarningEligible=isAdmin&&["delayed","in_progress"].includes(status); const update=item.progress?.find(progress=>progress.nationalId===member.nationalId); return <div className="member-progress-row" key={member.nationalId}><div className="member-progress-identity">{members.length>1&&isWarningEligible&&<input type="checkbox" aria-label={"انتخاب "+member.displayName+" برای هشدار"} checked={selectedWarningIds.includes(member.nationalId)} disabled={sentWarningIdSet.has(member.nationalId)} onChange={event=>setWarningSelection(current=>event.target.checked?[...new Set([...current,member.nationalId])]:current.filter(id=>id!==member.nationalId))}/>}<span><b>{member.displayName}</b><small>{member.title || "سمت ثبت نشده"}</small></span></div><div><span className={`status ${status}`}>{labels[status] || status}</span>{members.length>1&&isWarningEligible&&<span className="warning-tooltip-wrap" title={sentWarningIdSet.has(member.nationalId)?"✅ هشدار ارسال شد؛ برای ارسال دوباره صفحه را تازه‌سازی کنید.":`ارسال هشدار بله برای ${member.displayName}`}><button type="button" className="warning-send-button warning-send-button-person" disabled={busy||sentWarningIdSet.has(member.nationalId)} onClick={()=>void sendWarning([member.nationalId])}><Bell size={13}/><span>{busy ? "در حال ارسال..." : sentWarningIdSet.has(member.nationalId) ? "ارسال شد" : "ارسال هشدار"}</span></button>{warningTooltipIds.includes(member.nationalId)&&<span className="warning-sent-tooltip" role="status">✅ هشدار ارسال شد؛ برای ارسال دوباره صفحه را تازه‌سازی کنید.</span>}</span>}{isAdmin && update?.approvalStatus === "pending" && <small className="review-pending-tag">گزارش در انتظار تأیید</small>}{update?.updatedAt && <small className="progress-updated">به‌روزرسانی: {formatDate(update.updatedAt.slice(0,10))}</small>}</div></div>;})}{isAdmin&&members.length>1&&warningMembers.length>0&&<div className="member-warning-actions"><button type="button" className="warning-select-all" onClick={()=>setWarningSelection(warningMembers.filter(member=>!sentWarningIdSet.has(member.nationalId)).map(member=>member.nationalId))}>انتخاب همه افراد با تأخیر یا در حال پیگیری</button><span>{selectedWarningIds.length} نفر انتخاب شده</span><span className="warning-tooltip-wrap" title={pendingSelectedWarningIds.length===0&&selectedWarningIds.length>0?"✅ هشدار برای افراد انتخاب‌شده ارسال شد؛ برای ارسال دوباره صفحه را تازه‌سازی کنید.":`ارسال هشدار بله برای ${pendingSelectedWarningIds.length} نفر`}><button type="button" className="warning-send-button warning-send-button-bulk" disabled={busy||pendingSelectedWarningIds.length===0} onClick={()=>void sendWarning(selectedWarningIds).then(sent=>{if(sent.length){setBulkWarningTooltip(true);window.setTimeout(()=>setBulkWarningTooltip(false),5000);}})}><Bell size={15}/><span>{busy ? "در حال ارسال هشدار..." : pendingSelectedWarningIds.length===0&&selectedWarningIds.length>0 ? "ارسال شد" : `ارسال هشدار برای ${pendingSelectedWarningIds.length} نفر`}</span></button>{bulkWarningTooltip&&<span className="warning-sent-tooltip" role="status">✅ هشدار ارسال شد؛ دکمه تا تازه‌سازی غیرفعال است.</span>}</span></div>}</div>}
    </div>}
    {(item.meetingAttachments||[]).length>0 && <div className="attachment-list meeting-attachments"><b>فایل صورت‌جلسه مرتبط</b>{item.meetingAttachments!.map(file=><div className="attachment-item" key={file.id}><FileText size={15}/><a className="attachment-download" href={`/api/meeting-attachments/${file.id}`} target="_blank" rel="noreferrer"><span>{file.originalName}<small>{formatFileSize(file.size)}</small></span></a></div>)}</div>}
    {visibleAttachments.length > 0 && <div className="attachment-list"><b>فایل‌های پیوست</b>{visibleAttachments.map(attachment=><div className="attachment-item" key={attachment.id}><FileText size={15} /><a className="attachment-download" href={`/api/attachments/${attachment.id}`} download={attachment.originalName}><span>{attachment.originalName}<small>{formatFileSize(attachment.size)} · فرستنده: {attachment.uploaderName || "کاربر"}</small></span></a>{isAdmin && !attachment.resolutionReportId && <button type="button" className={`attachment-approval ${attachment.approvedForAll ? "approved" : ""}`} onClick={event=>{event.preventDefault();event.stopPropagation();onApproveAttachment(attachment.id,!attachment.approvedForAll);}}>{attachment.approvedForAll ? "نمایش برای همه فعال است · لغو" : "تأیید و نمایش برای همه"}</button>}</div>)}</div>}
    {isAdmin && !isRejected && <div className="attachment-actions"><label className={`attachment-upload ${uploading ? "disabled" : ""}`}><Paperclip size={15} />{uploading ? "در حال بارگذاری…" : "پیوست فایل"}<input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.rtf,.odt,.ods,.odp,.jpg,.jpeg,.png,.gif,.webp,.bmp,.tif,.tiff,.zip,.rar,.7z,.tar,.gz,.mp3,.wav,.ogg,.m4a,.aac,.flac,.mp4,.mov,.avi,.mkv,.webm" disabled={uploading} onChange={event=>{const file=event.target.files?.[0];event.target.value="";if(file){setUploading(true);void onUpload(file).finally(()=>setUploading(false));}}} /></label><small>سند، تصویر، فشرده، صوت یا فیلم؛ حداکثر ۵۰ مگابایت</small></div>}

    <div className="event-log"><b>رویدادهای پیگیری</b>{visibleEvents.length > 0 ? <div className="event-list">{visibleEvents.slice().sort((a,b)=>b.createdAt.localeCompare(a.createdAt)).map(entry=><div className="event-row" key={entry.id}><span><b>{entry.userName}</b><small>{formatDate(entry.createdAt.slice(0,10))}</small></span><p>{entry.text}</p></div>)}</div> : <small className="event-empty">هنوز رویدادی ثبت نشده است.</small>}{isAdmin && !isRejected && <div className="event-compose"><textarea rows={2} value={eventDraft} onChange={event=>onEventChange(event.target.value)} placeholder="شرح رویداد مدیریتی…" /><button type="button" className="secondary" onClick={onEventSubmit}>ثبت رویداد مدیریتی</button></div>}</div>
    {item.status === "cancelled" ? <div className="card-bottom"><small>این مصوبه لغو شده است.</small></div> : <div className="card-bottom">{isAdmin ? <><small>تغییر وضعیت پایهٔ مصوبه</small><select value={["completed","cancelled"].includes(item.status)?item.status:""} onChange={event => event.target.value&&onStatus(event.target.value)}><option value="">تغییر وضعیت کلی</option><option value="completed">اجرا شده</option><option value="cancelled">لغو شده</option></select></> : <small>وضعیت پیش از اجرا، در حال پیگیری یا تأخیر براساس تاریخ تعیین می‌شود.</small>}</div>}
    </details>
  </article>;
}
function formatFileSize(size: number) { return size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} کیلوبایت` : `${(size / (1024 * 1024)).toFixed(1)} مگابایت`; }
function Empty() { return <div className="empty"><ClipboardList size={34} /><b>مصوبه‌ای برای نمایش نیست</b><span>مصوبه‌های ارجاع‌شده در این بخش نمایش داده می‌شوند.</span></div>; }

