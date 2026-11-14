import { useEffect, useState } from "react";
import DatePicker from "react-multi-date-picker";
import persian from "react-date-object/calendars/persian";
import persian_fa from "react-date-object/locales/persian_fa";

type Attendance = { tripType: "internal" | "external"; ministerPresent: boolean | null; representative: string };
export type Pole = Attendance & { id: number; name: string; responsibleId: string; provinces: { province: string }[] };
export type Trip = Attendance & { id: number; title: string; province: string; startDate: string; endDate: string };
type Person = { nationalId: string; displayName: string; title?: string };
type Api = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
const defaultAttendance: Attendance = { tripType: "internal", ministerPresent: null, representative: "" };
const blankPole: Pole = { id: 0, name: "", responsibleId: "", provinces: [], ...defaultAttendance };
const blankTrip: Trip = { id: 0, title: "", province: "", startDate: "", endDate: "", ...defaultAttendance };

function AttendanceFields<T extends Attendance>({ value, onChange }: { value: T; onChange: (value: T) => void }) {
  return <>
    <label>نوع سفر<select value={value.tripType} onChange={event => onChange({
      ...value, tripType: event.target.value === "external" ? "external" : "internal", ministerPresent: null, representative: "",
    })}>
      <option value="internal">درون‌سازمانی</option><option value="external">برون‌سازمانی</option>
    </select></label>
    {value.tripType === "external" && <label>حضور وزیر<select required
      value={value.ministerPresent === null ? "" : String(value.ministerPresent)}
      onChange={event => onChange({ ...value, ministerPresent: event.target.value === "" ? null : event.target.value === "true", representative: "" })}>
      <option value="">انتخاب کنید</option><option value="true">وزیر حضور دارد</option><option value="false">وزیر حضور ندارد</option>
    </select></label>}
    {value.tripType === "external" && value.ministerPresent === false &&
      <label>نام نمایندهٔ وزیر<input required maxLength={300} value={value.representative}
        onChange={event => onChange({ ...value, representative: event.target.value })}/></label>}
  </>;
}

async function read<T>(api: Api, path: string, init?: RequestInit): Promise<T> {
  const response = await api(path, { cache: "no-store", ...init });
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(data?.error || "دریافت یا ذخیرهٔ اطلاعات انجام نشد.");
  return data as T;
}

function save<T>(api: Api, path: string, data: unknown) {
  return read<T>(api, path, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
}

export function ProvincialPoles({ api, provinces, users }: { api: Api; provinces: string[]; users: Person[] }) {
  const [poles, setPoles] = useState<Pole[]>([]);
  const [form, setForm] = useState<Pole>(blankPole);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [personQuery, setPersonQuery] = useState("");
  useEffect(() => {
    let active = true;
    read<Pole[]>(api, "/api/provincial-poles").then(data => { if (active) setPoles(data); })
      .catch(cause => { if (active) setError(cause.message); });
    return () => { active = false; };
  }, [api]);

  const unavailable = new Set(poles.filter(pole => pole.id !== form.id).flatMap(pole => pole.provinces.map(item => item.province)));
  const candidates = users.filter(user => user.nationalId === form.responsibleId ||
    `${user.displayName} ${user.title ?? ""} ${user.nationalId}`.includes(personQuery.trim()));
  return <section className="panel provincial-poles">
    <h2>قطب‌بندی استانی</h2>
    {error && <p className="notice" role="alert">{error}</p>}
    <label>قطب<select value={form.id} onChange={event => {
      setForm(poles.find(pole => pole.id === Number(event.target.value)) ?? blankPole);
      setPersonQuery("");
      setError("");
    }}><option value={0}>قطب جدید</option>{poles.map(pole => <option key={pole.id} value={pole.id}>{pole.name}</option>)}</select></label>
    <form onSubmit={async event => {
      event.preventDefault();
      setError(""); setBusy(true);
      try {
        const pole = await save<Pole>(api, `/api/provincial-poles/${form.id}`, { ...form, provinces: form.provinces.map(item => item.province) });
        setPoles(current => [...current.filter(item => item.id !== pole.id), pole].sort((a, b) => a.name.localeCompare(b.name, "fa")));
        setForm(pole);
      } catch (cause) { setError((cause as Error).message); }
      finally { setBusy(false); }
    }}>
      <fieldset disabled={busy} className="provincial-fields">
        <label>نام قطب<input required maxLength={200} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })}/></label>
        <label>جستجوی مسئول<input value={personQuery} onChange={event => setPersonQuery(event.target.value)} placeholder="نام، سمت یا کد ملی"/></label>
        <label>مسئول قطب<select required value={form.responsibleId} onChange={event => setForm({ ...form, responsibleId: event.target.value })}>
          <option value="">انتخاب کاربر</option>{candidates.map(user => <option key={user.nationalId} value={user.nationalId}>{user.displayName}{user.title ? ` – ${user.title}` : ""}</option>)}
        </select></label>
        <AttendanceFields value={form} onChange={setForm}/>
        <fieldset className="provincial-province-options">
          <legend>استان‌های قطب</legend>
          {provinces.map(province => <label key={province}>
            <input type="checkbox" disabled={unavailable.has(province)} checked={form.provinces.some(item => item.province === province)}
              onChange={event => setForm({ ...form, provinces: event.target.checked ? [...form.provinces, { province }] : form.provinces.filter(item => item.province !== province) })}/>
            {province}
          </label>)}
        </fieldset>
        <button type="submit" className="primary" disabled={!form.provinces.length}>{busy ? "در حال ذخیره…" : "ذخیره قطب"}</button>
      </fieldset>
    </form>
  </section>;
}

export function ProvincialTrips({ api, admin, onCreate, renderItems, renderPrint, formatDate, today, focusedTripId }: {
  api: Api; admin: boolean; focusedTripId?: number | null; onCreate: (trip: Trip, draft: boolean) => void;
  renderItems: (tripId: number | null, title: string) => React.ReactNode;
  renderPrint: (trip: Trip) => React.ReactNode;
  formatDate: (date: string) => string; today: () => string;
}) {
  const [trips, setTrips] = useState<Trip[]>([]);
  const [poles, setPoles] = useState<Pole[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [editing, setEditing] = useState<Trip | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    Promise.all([read<Trip[]>(api, "/api/provincial-trips"), admin ? read<Pole[]>(api, "/api/provincial-poles") : Promise.resolve([])])
      .then(([availableTrips, availablePoles]) => {
        if (!active) return;
        setTrips(availableTrips); setPoles(availablePoles); setSelectedId(availableTrips[0]?.id ?? null);
      }).catch(cause => { if (active) setError(cause.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [api, admin]);

  useEffect(() => {
    if (focusedTripId !== undefined && !loading) setSelectedId(focusedTripId);
  }, [focusedTripId, loading]);

  const selected = trips.find(trip => trip.id === selectedId);
  const provincePoles = new Map(poles.flatMap(pole => pole.provinces.map(item => [item.province, pole] as const)));
  return <section className="panel provincial-trips">
    <div className="section-head"><h2>سفرهای استانی</h2>
      {admin && !editing && <button type="button" className="primary" onClick={() => { setError(""); setEditing(blankTrip); }}>تعریف سفر</button>}
    </div>
    {error && <p className="notice" role="alert">{error}</p>}
    {loading && <p role="status">در حال دریافت سفرها…</p>}
    <label>سفر<select value={selectedId ?? ""} onChange={event => { setSelectedId(Number(event.target.value) || null); setEditing(null); setError(""); }}>
      <option value="">سوابق سفرهای پیشین</option>
      {trips.map(trip => <option key={trip.id} value={trip.id}>{trip.title} · {trip.province} · {formatDate(trip.startDate)}</option>)}
    </select></label>
    {editing && <form onSubmit={async event => {
      event.preventDefault();
      setBusy(true); setError("");
      try {
        const trip = await save<Trip>(api, `/api/provincial-trips/${editing.id}`, editing);
        setTrips(current => [...current.filter(item => item.id !== trip.id), trip].sort((a, b) => b.startDate.localeCompare(a.startDate) || b.id - a.id));
        setSelectedId(trip.id); setEditing(null);
      } catch (cause) { setError((cause as Error).message); }
      finally { setBusy(false); }
    }}>
      <fieldset disabled={busy} className="provincial-fields">
        <label>عنوان سفر<input required maxLength={300} value={editing.title} onChange={event => setEditing({ ...editing, title: event.target.value })}/></label>
        <label>استان<select required value={editing.province} onChange={event => {
          const province = event.target.value;
          const pole = provincePoles.get(province);
          setEditing({ ...editing, ...defaultAttendance, tripType: pole?.tripType ?? "internal",
            ministerPresent: pole?.ministerPresent ?? null, representative: pole?.representative ?? "", province });
        }}><option value="">انتخاب استان</option>
          {Array.from(new Set([...provincePoles.keys(), ...(editing.province ? [editing.province] : [])])).sort((a,b) => a.localeCompare(b, "fa"))
            .map(province => <option key={province} value={province}>{province}{provincePoles.has(province) ? ` – ${provincePoles.get(province)!.name}` : ""}</option>)}
        </select></label>
        {!provincePoles.size && <p>برای تعریف سفر، ابتدا در بخش کاربران قطب‌بندی استانی را ثبت کنید.</p>}
        {(["startDate", "endDate"] as const).map(field => <label key={field}>{field === "startDate" ? "تاریخ شروع" : "تاریخ پایان"}
          <DatePicker calendar={persian} locale={persian_fa} format="YYYY/MM/DD"
            value={editing[field] ? new Date(editing[field] + "T12:00:00") : undefined}
            onChange={date => {
              const local = date?.toDate();
              const iso = local ? [local.getFullYear(), String(local.getMonth() + 1).padStart(2, "0"), String(local.getDate()).padStart(2, "0")].join("-") : "";
              setEditing({ ...editing, [field]: iso });
            }}/>
        </label>)}
        <AttendanceFields value={editing} onChange={setEditing}/>
        <div className="provincial-actions">
          <button className="primary" disabled={!editing.startDate || !editing.endDate || editing.endDate < editing.startDate}>ذخیره سفر</button>
          <button className="secondary" type="button" onClick={() => setEditing(null)}>انصراف</button>
        </div>
      </fieldset>
    </form>}
    {selected && <div className="provincial-trip-summary">
      <h3>{selected.title}</h3>
      <p>{selected.province} · {formatDate(selected.startDate)} تا {formatDate(selected.endDate)} · {selected.tripType === "internal"
        ? "درون‌سازمانی" : selected.ministerPresent ? "برون‌سازمانی، با حضور وزیر" : `برون‌سازمانی، نمایندهٔ وزیر ${selected.representative}`}</p>
      {admin && <div className="provincial-actions">
        <button className="primary" onClick={() => onCreate(selected, false)}>ثبت مصوبه سفر</button>
        {selected.endDate >= today() && <button className="secondary" onClick={() => onCreate(selected, true)}>ثبت پیش‌نویس مصوبه کمیته</button>}
        <button className="secondary" onClick={() => { setError(""); setEditing(selected); }}>ویرایش سفر</button>
        {renderPrint(selected)}
      </div>}
    </div>}
    {!loading && renderItems(selectedId, selected?.title ?? "")}
  </section>;
}
