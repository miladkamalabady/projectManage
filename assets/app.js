const appState = {
    view: "dashboard",
    data: { tasks: [], issues: [], meetings: [], users: [], logs: [] },
    taskPage: 1,
    taskQuery: "",
    taskStatus: "all",
    taskDomain: "all",
};

const boot = window.APP_BOOT || {};
const viewRoot = document.getElementById("viewRoot");
const pageTitle = document.getElementById("pageTitle");
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
const toast = document.getElementById("toast");

const labels = {
    role: {
        manager: "مدیر پروژه",
        contractor: "پیمانکار",
        supervisor: "ناظر",
        operator: "بهره‌بردار",
        viewer: "مشاهده‌گر",
    },
    taskStatus: {
        todo: "انجام‌نشده",
        in_progress: "در حال انجام",
        review: "آماده بررسی",
        done: "تکمیل‌شده",
        blocked: "متوقف",
    },
    approval: {
        pending: "در انتظار",
        approved: "تأییدشده",
        rejected: "ردشده",
    },
    issueStatus: {
        open: "باز",
        in_progress: "در حال رفع",
        resolved: "رفع‌شده",
        closed: "بسته",
    },
    severity: {
        low: "کم",
        medium: "متوسط",
        high: "زیاد",
        critical: "بحرانی",
    },
};

document.getElementById("roleLabel").textContent = labels.role[boot.user.role] || boot.user.role;

function esc(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

function fa(value) {
    return String(value).replace(/\d/g, digit => "۰۱۲۳۴۵۶۷۸۹"[Number(digit)]);
}

function en(value) {
    return String(value)
        .replace(/[۰-۹]/g, digit => String("۰۱۲۳۴۵۶۷۸۹".indexOf(digit)))
        .replace(/[٠-٩]/g, digit => String("٠١٢٣٤٥٦٧٨٩".indexOf(digit)));
}

function pad2(value) {
    return String(value).padStart(2, "0");
}

function jalaliToGregorian(jy, jm, jd) {
    jy += 1595;
    let days = -355668 + (365 * jy) + (Math.floor(jy / 33) * 8)
        + Math.floor(((jy % 33) + 3) / 4) + jd
        + (jm < 7 ? (jm - 1) * 31 : ((jm - 7) * 30) + 186);
    let gy = 400 * Math.floor(days / 146097);
    days %= 146097;
    if (days > 36524) {
        gy += 100 * Math.floor(--days / 36524);
        days %= 36524;
        if (days >= 365) days++;
    }
    gy += 4 * Math.floor(days / 1461);
    days %= 1461;
    if (days > 365) {
        gy += Math.floor((days - 1) / 365);
        days = (days - 1) % 365;
    }
    let gd = days + 1;
    const monthDays = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let gm = 1;
    while (gm <= 12 && gd > monthDays[gm]) {
        gd -= monthDays[gm];
        gm++;
    }
    return [gy, gm, gd];
}

function parseJalaliDate(value) {
    const normalized = en(value).trim().replaceAll("-", "/");
    const match = normalized.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (!match) return null;
    const jy = Number(match[1]);
    const jm = Number(match[2]);
    const jd = Number(match[3]);
    const maxDay = jm <= 6 ? 31 : jm <= 11 ? 30 : 30;
    if (jy < 1300 || jy > 1600 || jm < 1 || jm > 12 || jd < 1 || jd > maxDay) return null;
    return jalaliToGregorian(jy, jm, jd);
}

function currentJalaliDate() {
    const parts = new Intl.DateTimeFormat("en-US-u-ca-persian", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date());
    const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
    return `${values.year}/${values.month}/${values.day}`;
}

function currentTime() {
    const now = new Date();
    return `${pad2(now.getHours())}:${pad2(now.getMinutes())}`;
}

function formatDate(value, includeTime = false) {
    if (!value) return "تعیین نشده";
    const normalized = String(value).includes("T") ? value : String(value).replace(" ", "T");
    const date = new Date(normalized);
    if (Number.isNaN(date.getTime())) return esc(value);
    return includeTime
        ? date.toLocaleString("fa-IR", { dateStyle: "medium", timeStyle: "short" })
        : date.toLocaleDateString("fa-IR", { dateStyle: "medium" });
}

function showToast(message, error = false) {
    toast.textContent = message;
    toast.style.background = error ? "#8f3030" : "#082a48";
    toast.classList.add("show");
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => toast.classList.remove("show"), 3000);
}

function openModal(title, html) {
    modalTitle.textContent = title;
    modalBody.innerHTML = html;
    modal.hidden = false;
    document.body.style.overflow = "hidden";
}

function closeModal() {
    modal.hidden = true;
    document.body.style.overflow = "";
}

async function request(payload) {
    const response = await fetch("api.php", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-CSRF-Token": boot.csrf,
        },
        body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({ ok: false, error: "پاسخ سرور معتبر نیست." }));
    if (!response.ok || !result.ok) throw new Error(result.error || "عملیات انجام نشد.");
    return result;
}

async function loadData(withNotice = false) {
    try {
        const response = await fetch("api.php", { headers: { Accept: "application/json" }, cache: "no-store" });
        const result = await response.json();
        if (!response.ok || !result.ok) throw new Error(result.error || "خطا در دریافت اطلاعات");
        appState.data = result.data;
        render();
        if (withNotice) showToast("اطلاعات پروژه به‌روز شد.");
    } catch (error) {
        viewRoot.innerHTML = `<div class="alert error">${esc(error.message)} <button class="action-link" id="retryLoad">تلاش دوباره</button></div>`;
    }
}

function statusBadge(status, type = "task") {
    const source = type === "approval" ? labels.approval : type === "issue" ? labels.issueStatus : labels.taskStatus;
    return `<span class="status ${esc(status)}">${esc(source[status] || status)}</span>`;
}

function dashboard() {
    const tasks = appState.data.tasks;
    const total = tasks.length;
    const done = tasks.filter(item => item.status === "done").length;
    const inProgress = tasks.filter(item => item.status === "in_progress" || item.status === "review").length;
    const overdue = tasks.filter(item => item.contractor_deadline && new Date(item.contractor_deadline + "T23:59:59") < new Date() && item.status !== "done").length;
    const progress = total ? Math.round(tasks.reduce((sum, item) => sum + Number(item.progress), 0) / total) : 0;
    const openIssues = appState.data.issues.filter(item => !["resolved", "closed"].includes(item.status));
    return `
        <section class="hero">
            <div><span class="eyebrow">نمای کلان پروژه</span><h2>کنترل اجرای ۱۵۹ تعهد سامانه جامع سمپاد</h2><p>وضعیت پیمانکار، ددلاین‌ها، تأیید ناظر و بهره‌بردار و اشکالات پروژه در یک نمای مشترک.</p></div>
            <div class="hero-score"><div><strong>${fa(progress)}٪</strong><span>پیشرفت کل</span></div></div>
        </section>
        <div class="metrics">
            ${metric(total, "کل فعالیت‌ها", "▤")}
            ${metric(done, "تکمیل‌شده", "✓")}
            ${metric(inProgress, "در جریان بررسی", "◷")}
            ${metric(overdue, "فعالیت معوق", "!")}
        </div>
        <div class="grid-2">
            <section class="panel">
                <div class="panel-head"><div><h3>فعالیت‌های نیازمند توجه</h3><p>معوق، متوقف یا آماده تأیید</p></div><button class="button ghost" data-view="tasks">مشاهده همه</button></div>
                <div class="activity-list">
                    ${attentionTasks(tasks).map(task => `
                        <article class="activity-item"><span class="activity-dot"></span><div><strong>${esc(task.title)}</strong><p><span class="code">${esc(task.id)}</span> · ${esc(task.domain)} · پیشرفت ${fa(task.progress)}٪</p></div><button class="action-link task-open" data-task="${esc(task.id)}">بررسی</button></article>
                    `).join("") || empty("هنوز فعالیت نیازمند توجهی وجود ندارد.")}
                </div>
            </section>
            <section class="panel">
                <div class="panel-head"><div><h3>اشکالات باز</h3><p>${fa(openIssues.length)} مورد نیازمند پیگیری</p></div><button class="button ghost" data-view="issues">کارتابل اشکالات</button></div>
                <div class="issue-list">
                    ${openIssues.slice(0, 5).map(issueCard).join("") || empty("اشکال بازی ثبت نشده است.")}
                </div>
            </section>
        </div>
        <section class="panel" style="margin-top:18px">
            <div class="panel-head"><div><h3>آخرین تغییرات</h3><p>ردپای فعالیت کاربران</p></div></div>
            <div class="activity-list">
                ${appState.data.logs.slice(0, 8).map(log => `<div class="activity-item"><span class="activity-dot"></span><div><strong>${esc(log.display_name || "سامانه")} — ${esc(log.action)}</strong><p>${esc(log.entity_type)} / <span class="code">${esc(log.entity_id)}</span></p></div><time>${formatDate(log.created_at, true)}</time></div>`).join("") || empty("تغییری ثبت نشده است.")}
            </div>
        </section>`;
}

function metric(value, title, icon) {
    return `<article class="metric"><div class="metric-icon">${icon}</div><div><strong>${fa(value)}</strong><span>${title}</span></div></article>`;
}

function attentionTasks(tasks) {
    return tasks.filter(item => {
        const overdue = item.contractor_deadline && new Date(item.contractor_deadline + "T23:59:59") < new Date() && item.status !== "done";
        return overdue || item.status === "blocked" || item.status === "review";
    }).slice(0, 7);
}

function filteredTasks() {
    const query = appState.taskQuery.trim().toLowerCase();
    return appState.data.tasks.filter(task => {
        const queryMatch = !query || `${task.id} ${task.wbs} ${task.title} ${task.domain}`.toLowerCase().includes(query);
        return queryMatch
            && (appState.taskStatus === "all" || task.status === appState.taskStatus)
            && (appState.taskDomain === "all" || task.domain === appState.taskDomain);
    });
}

function tasksView() {
    const tasks = filteredTasks();
    const pageSize = 15;
    const pages = Math.max(1, Math.ceil(tasks.length / pageSize));
    appState.taskPage = Math.min(appState.taskPage, pages);
    const rows = tasks.slice((appState.taskPage - 1) * pageSize, appState.taskPage * pageSize);
    const domains = [...new Set(appState.data.tasks.map(task => task.domain))].sort((a,b) => a.localeCompare(b, "fa"));
    return `
        <div class="section-head"><div><h2>فعالیت‌های پروژه</h2><p>${fa(tasks.length)} مورد از ۱۵۹ فعالیت استخراج‌شده از RFP</p></div>
            <div class="toolbar">
                <input id="taskSearch" value="${esc(appState.taskQuery)}" placeholder="جست‌وجوی شناسه، عنوان یا حوزه…">
                <select id="taskStatus"><option value="all">همه وضعیت‌ها</option>${Object.entries(labels.taskStatus).map(([key,value]) => `<option value="${key}" ${appState.taskStatus === key ? "selected" : ""}>${value}</option>`).join("")}</select>
                <select id="taskDomain"><option value="all">همه حوزه‌ها</option>${domains.map(domain => `<option ${appState.taskDomain === domain ? "selected" : ""}>${esc(domain)}</option>`).join("")}</select>
            </div>
        </div>
        <section class="panel">
            <div class="table-wrap"><table class="data-table"><thead><tr><th>شناسه</th><th>فعالیت</th><th>وضعیت</th><th>پیشرفت</th><th>ددلاین</th><th>ناظر</th><th>بهره‌بردار</th><th>عملیات</th></tr></thead>
            <tbody>${rows.map(task => `<tr>
                <td><span class="code">${esc(task.id)}</span><br><small>${esc(task.wbs)}</small></td>
                <td class="title-cell"><strong>${esc(task.title)}</strong><small>${esc(task.domain)} · اولویت ${esc(task.priority)}</small></td>
                <td>${statusBadge(task.status)}</td>
                <td><div class="progress-label"><span>${fa(task.progress)}٪</span><div class="progress"><span style="width:${Number(task.progress)}%"></span></div></div></td>
                <td>${task.contractor_deadline ? formatDate(task.contractor_deadline) : "—"}</td>
                <td>${statusBadge(task.supervisor_approval, "approval")}</td>
                <td>${statusBadge(task.operator_approval, "approval")}</td>
                <td><button class="action-link task-open" data-task="${esc(task.id)}">جزئیات</button></td>
            </tr>`).join("") || `<tr><td colspan="8">${empty("فعالیتی مطابق فیلتر پیدا نشد.")}</td></tr>`}</tbody></table></div>
            ${pagination(pages, appState.taskPage)}
        </section>`;
}

function pagination(pages, current) {
    const start = Math.max(1, Math.min(current - 2, pages - 4));
    const shown = Array.from({ length: Math.min(5, pages) }, (_, i) => start + i);
    return `<div class="pagination">${shown.map(page => `<button class="${page === current ? "active" : ""}" data-page="${page}">${fa(page)}</button>`).join("")}</div>`;
}

function taskModal(taskId) {
    const task = appState.data.tasks.find(item => item.id === taskId);
    if (!task) return;
    const canEdit = ["manager", "contractor"].includes(boot.user.role);
    const canSupervisor = ["manager", "supervisor"].includes(boot.user.role);
    const canOperator = ["manager", "operator"].includes(boot.user.role);
    openModal("فعالیت " + task.id, `
        <div class="detail-grid">
            <div class="detail-box"><small>حوزه</small><strong>${esc(task.domain)}</strong></div>
            <div class="detail-box"><small>WBS</small><strong>${esc(task.wbs)}</strong></div>
            <div class="detail-box"><small>صفحه منبع</small><strong>${esc(task.source_page)}</strong></div>
            <div class="detail-box"><small>اولویت</small><strong>${esc(task.priority)}</strong></div>
            <div class="detail-box"><small>مسئول اصلی</small><strong>${esc(task.owner_type)}</strong></div>
            <div class="detail-box"><small>آخرین تغییر</small><strong>${formatDate(task.updated_at, true)}</strong></div>
        </div>
        <h3 style="font-size:16px;line-height:1.8">${esc(task.title)}</h3>
        <div class="alert info"><strong>معیار پذیرش:</strong> ${esc(task.acceptance_criteria)}</div>
        <form id="taskForm" class="form-grid">
            <input type="hidden" name="id" value="${esc(task.id)}">
            <label class="field">وضعیت<select name="status" ${canEdit ? "" : "disabled"}>${Object.entries(labels.taskStatus).map(([key,value]) => `<option value="${key}" ${task.status === key ? "selected" : ""}>${value}</option>`).join("")}</select></label>
            <label class="field">درصد پیشرفت<input name="progress" type="number" min="0" max="100" value="${Number(task.progress)}" ${canEdit ? "" : "disabled"}></label>
            <label class="field">ددلاین پیمانکار<input name="contractor_deadline" type="date" value="${esc(task.contractor_deadline || "")}" ${canEdit ? "" : "disabled"}></label>
            <label class="field full">یادداشت و توضیحات<textarea name="notes" ${canEdit ? "" : "disabled"}>${esc(task.notes || "")}</textarea></label>
            ${canEdit ? '<div class="button-row full"><button class="button primary" type="submit">ذخیره تغییرات</button></div>' : ""}
        </form>
        <div class="approval-grid" style="margin-top:18px">
            ${approvalCard("تأیید ناظر", "supervisor", task.supervisor_approval, canSupervisor)}
            ${approvalCard("تأیید بهره‌بردار", "operator", task.operator_approval, canOperator)}
        </div>`);
}

function approvalCard(title, kind, current, allowed) {
    return `<section class="approval-card"><h4>${title}</h4><p style="font-size:11px;color:var(--muted)">وضعیت فعلی: ${labels.approval[current]}</p>
        ${allowed ? `<div class="button-row"><button class="button ghost approval-action" data-kind="${kind}" data-decision="approved">تأیید</button><button class="button danger approval-action" data-kind="${kind}" data-decision="rejected">ثبت اشکال</button></div>` : '<small>این عملیات برای نقش شما فعال نیست.</small>'}
    </section>`;
}

function issueCard(issue) {
    return `<article class="issue-card"><div><h4>${esc(issue.title)}</h4><p>${esc(issue.description)}</p><div class="issue-meta"><span class="status ${esc(issue.severity)}">${labels.severity[issue.severity] || esc(issue.severity)}</span>${statusBadge(issue.status, "issue")}<span class="code">${esc(issue.task_id || "بدون فعالیت")}</span></div></div><button class="action-link issue-open" data-issue="${issue.id}">مدیریت</button></article>`;
}

function issuesView() {
    const canCreate = ["manager","contractor","supervisor","operator"].includes(boot.user.role);
    return `<div class="section-head"><div><h2>اشکالات و اقدامات اصلاحی</h2><p>ثبت، ارجاع و پیگیری اشکالات تا رفع کامل</p></div>${canCreate ? '<button class="button primary" id="newIssue">+ ثبت اشکال</button>' : ""}</div>
        <section class="panel"><div class="issue-list">${appState.data.issues.map(issueCard).join("") || empty("هنوز اشکالی ثبت نشده است.")}</div></section>`;
}

function issueModal(issue) {
    const canEdit = ["manager","contractor","supervisor","operator"].includes(boot.user.role);
    openModal("اشکال شماره " + issue.id, `
        <div class="detail-grid"><div class="detail-box"><small>شدت</small><strong>${labels.severity[issue.severity]}</strong></div><div class="detail-box"><small>گزارش‌دهنده</small><strong>${esc(issue.reporter_name)}</strong></div><div class="detail-box"><small>ددلاین رفع</small><strong>${formatDate(issue.due_date)}</strong></div></div>
        <h3>${esc(issue.title)}</h3><p style="line-height:1.9;color:var(--muted)">${esc(issue.description)}</p>
        ${canEdit ? `<form id="issueStatusForm"><input type="hidden" name="id" value="${issue.id}"><label class="field">وضعیت<select name="status">${Object.entries(labels.issueStatus).map(([key,value]) => `<option value="${key}" ${issue.status === key ? "selected" : ""}>${value}</option>`).join("")}</select></label><button class="button primary">ثبت وضعیت</button></form>` : ""}
    `);
}

function newIssueModal() {
    openModal("ثبت اشکال جدید", `<form id="issueForm" class="form-grid">
        <label class="field full">عنوان اشکال<input name="title" required></label>
        <label class="field">فعالیت مرتبط<select name="task_id"><option value="">بدون فعالیت مشخص</option>${appState.data.tasks.map(task => `<option value="${esc(task.id)}">${esc(task.id)} — ${esc(task.title.slice(0,55))}</option>`).join("")}</select></label>
        <label class="field">شدت<select name="severity"><option value="low">کم</option><option value="medium" selected>متوسط</option><option value="high">زیاد</option><option value="critical">بحرانی</option></select></label>
        <label class="field">مهلت رفع<input name="due_date" type="date"></label>
        <label class="field full">شرح کامل<textarea name="description" required></textarea></label>
        <div class="button-row full"><button class="button primary">ثبت اشکال</button><button class="button secondary" type="button" data-close>انصراف</button></div>
    </form>`);
}

function meetingsView() {
    const canCreate = ["manager","supervisor","operator"].includes(boot.user.role);
    return `<div class="section-head"><div><h2>جلسات، مصوبات و اقدامات</h2><p>صورت‌جلسه‌ها و تعهدات پیگیری‌شونده پروژه</p></div>${canCreate ? '<button class="button primary" id="newMeeting">+ ثبت صورت‌جلسه</button>' : ""}</div>
        <section class="panel"><div class="meeting-list">${appState.data.meetings.map(meeting => `<article class="meeting-card"><div><h4>${esc(meeting.title)}</h4><p><strong>مصوبات:</strong> ${esc(meeting.decisions)}</p><p><strong>اقدامات:</strong> ${esc(meeting.actions || "ثبت نشده")}</p><div class="issue-meta"><span>${formatDate(meeting.meeting_date, true)}</span><span>ثبت‌کننده: ${esc(meeting.creator_name)}</span></div></div><button class="action-link meeting-open" data-meeting="${meeting.id}">جزئیات</button></article>`).join("") || empty("هنوز صورت‌جلسه‌ای ثبت نشده است.")}</div></section>`;
}

function newMeetingModal() {
    openModal("ثبت صورت‌جلسه", `<form id="meetingForm" class="form-grid">
        <label class="field full">عنوان جلسه<input name="title" required></label>
        <label class="field">تاریخ جلسه (شمسی)<input name="meeting_date_jalali" value="${fa(currentJalaliDate())}" inputmode="numeric" placeholder="۱۴۰۵/۰۶/۱۲" required><small>با قالب سال/ماه/روز وارد کنید.</small></label>
        <label class="field">ساعت جلسه<input name="meeting_time" type="time" value="${currentTime()}" required></label>
        <label class="field">حاضران<input name="participants" placeholder="پیمانکار، ناظر، بهره‌بردار…" required></label>
        <label class="field full">مصوبات<textarea name="decisions" required></textarea></label>
        <label class="field full">اقدامات، مسئول و مهلت<textarea name="actions"></textarea></label>
        <div class="button-row full"><button class="button primary">ثبت صورت‌جلسه</button><button class="button secondary" type="button" data-close>انصراف</button></div>
    </form>`);
}

function usersView() {
    return `<div class="section-head"><div><h2>کاربران و نقش‌ها</h2><p>مدیریت دسترسی پیمانکار، ناظر، بهره‌بردار و مشاهده‌گر</p></div><button class="button primary" id="newUser">+ کاربر جدید</button></div>
        <section class="panel"><div class="table-wrap"><table class="data-table"><thead><tr><th>نام</th><th>ایمیل</th><th>نقش</th><th>وضعیت</th><th>تاریخ ایجاد</th></tr></thead><tbody>
        ${appState.data.users.map(user => `<tr><td><strong>${esc(user.display_name)}</strong></td><td><span class="code">${esc(user.email)}</span></td><td>${esc(labels.role[user.role] || user.role)}</td><td>${Number(user.active) ? '<span class="status approved">فعال</span>' : '<span class="status rejected">غیرفعال</span>'}</td><td>${formatDate(user.created_at)}</td></tr>`).join("")}
        </tbody></table></div></section>`;
}

function newUserModal() {
    openModal("ایجاد کاربر", `<form id="userForm" class="form-grid">
        <label class="field">نام و نام خانوادگی<input name="display_name" required></label>
        <label class="field">ایمیل<input name="email" type="email" required></label>
        <label class="field">نقش<select name="role">${Object.entries(labels.role).map(([key,value]) => `<option value="${key}">${value}</option>`).join("")}</select></label>
        <label class="field">رمز عبور اولیه<input name="password" type="password" minlength="10" required></label>
        <div class="alert info full">رمز عبور حداقل ۱۰ نویسه باشد و از مسیر امن برای کاربر ارسال شود.</div>
        <div class="button-row full"><button class="button primary">ایجاد کاربر</button><button class="button secondary" type="button" data-close>انصراف</button></div>
    </form>`);
}

function empty(message) {
    return `<div class="empty"><strong>اطلاعاتی موجود نیست</strong><span>${esc(message)}</span></div>`;
}

function render() {
    const views = { dashboard, tasks: tasksView, issues: issuesView, meetings: meetingsView, users: usersView };
    const titles = { dashboard: "داشبورد", tasks: "فعالیت‌ها", issues: "اشکالات", meetings: "جلسات و مصوبات", users: "کاربران و نقش‌ها" };
    pageTitle.textContent = titles[appState.view] || "سامانه";
    viewRoot.innerHTML = (views[appState.view] || dashboard)();
    document.querySelectorAll(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.view === appState.view));
    window.scrollTo({ top: 0, behavior: "smooth" });
}

async function submitAndReload(payload, successMessage) {
    try {
        const result = await request(payload);
        closeModal();
        await loadData();
        showToast(result.message || successMessage);
    } catch (error) {
        showToast(error.message, true);
    }
}

document.addEventListener("click", event => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.view) {
        appState.view = button.dataset.view;
        render();
        document.getElementById("sidebar").classList.remove("open");
        return;
    }
    if (button.classList.contains("task-open")) return taskModal(button.dataset.task);
    if (button.classList.contains("issue-open")) {
        const issue = appState.data.issues.find(item => String(item.id) === String(button.dataset.issue));
        if (issue) issueModal(issue);
        return;
    }
    if (button.classList.contains("meeting-open")) {
        const meeting = appState.data.meetings.find(item => String(item.id) === String(button.dataset.meeting));
        if (meeting) openModal(meeting.title, `<div class="detail-grid"><div class="detail-box"><small>زمان</small><strong>${formatDate(meeting.meeting_date,true)}</strong></div><div class="detail-box"><small>ثبت‌کننده</small><strong>${esc(meeting.creator_name)}</strong></div></div><div class="alert info"><strong>حاضران:</strong> ${esc(meeting.participants)}</div><h4>مصوبات</h4><p style="line-height:1.9">${esc(meeting.decisions)}</p><h4>اقدامات</h4><p style="line-height:1.9">${esc(meeting.actions || "ثبت نشده")}</p>`);
        return;
    }
    if (button.id === "newIssue") return newIssueModal();
    if (button.id === "newMeeting") return newMeetingModal();
    if (button.id === "newUser") return newUserModal();
    if (button.id === "modalClose" || button.hasAttribute("data-close")) return closeModal();
    if (button.id === "menuButton") return document.getElementById("sidebar").classList.toggle("open");
    if (button.id === "retryLoad") return loadData();
    if (button.dataset.page) { appState.taskPage = Number(button.dataset.page); render(); return; }
    if (button.classList.contains("approval-action")) {
        const id = document.querySelector("#taskForm [name=id]").value;
        return submitAndReload({ action:"approve_task", id, kind:button.dataset.kind, decision:button.dataset.decision }, "نظر تأیید ثبت شد.");
    }
});

document.addEventListener("input", event => {
    if (event.target.id === "taskSearch") {
        appState.taskQuery = event.target.value;
        appState.taskPage = 1;
        clearTimeout(appState.searchTimer);
        appState.searchTimer = setTimeout(render, 180);
    }
});

document.addEventListener("change", event => {
    if (event.target.id === "taskStatus") {
        appState.taskStatus = event.target.value;
        appState.taskPage = 1;
        render();
    }
    if (event.target.id === "taskDomain") {
        appState.taskDomain = event.target.value;
        appState.taskPage = 1;
        render();
    }
});

document.addEventListener("submit", event => {
    const form = event.target;
    if (!["taskForm","issueForm","issueStatusForm","meetingForm","userForm"].includes(form.id)) return;
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form).entries());
    if (form.id === "taskForm") return submitAndReload({ action:"update_task", ...values }, "فعالیت ذخیره شد.");
    if (form.id === "issueForm") return submitAndReload({ action:"create_issue", ...values }, "اشکال ثبت شد.");
    if (form.id === "issueStatusForm") return submitAndReload({ action:"update_issue", ...values }, "وضعیت اشکال ثبت شد.");
    if (form.id === "meetingForm") {
        const gregorian = parseJalaliDate(values.meeting_date_jalali);
        if (!gregorian || !/^\d{2}:\d{2}$/.test(values.meeting_time)) {
            return showToast("تاریخ شمسی یا ساعت معتبر نیست. نمونه صحیح: ۱۴۰۵/۰۶/۱۲", true);
        }
        const [year, month, day] = gregorian;
        values.meeting_date = `${year}-${pad2(month)}-${pad2(day)}T${values.meeting_time}`;
        delete values.meeting_date_jalali;
        delete values.meeting_time;
        return submitAndReload({ action:"create_meeting", ...values }, "صورت‌جلسه ثبت شد.");
    }
    if (form.id === "userForm") return submitAndReload({ action:"create_user", ...values }, "کاربر ایجاد شد.");
});

modal.addEventListener("click", event => { if (event.target === modal) closeModal(); });
document.addEventListener("keydown", event => { if (event.key === "Escape") closeModal(); });

loadData();
