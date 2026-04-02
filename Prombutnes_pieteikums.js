const [users, setUsers] = useState([]);
const [selectedUserId, setSelectedUserId] = useState("");
useEffect(() => {
    async function loadUsers() {
      if (isLocalMode()) {
        setUsers([
          {
            id: "1",
            full_name: localDisplayName(),
            email: "demo@local",
            role: "employee",
            created_at: new Date().toISOString(),
          },
        ]);
        return;
      }
  
      const { data, error } = await supabase.from("users").select("*").order("full_name", { ascending: true });
  
      if (error) {
        console.error(error);
        return;
      }
  
      setUsers(data || []);
    }
  
    loadUsers();
  }, []);

// --- Papildu loģika Cits (ar vadītāja saskaņojumu) periodam ---
// Mērķis: sagatavot etiķeti, ko var parādīt kalendārā (piem., ieliekot to `Komentārs` laukā)
// vai izmantojot atsevišķi UI.
function pad2(n) {
  const x = Number(n);
  return Number.isFinite(x) ? String(x).padStart(2, "0") : "";
}

// Pieņem vai nu "HH:MM", vai arī objektu { hour, minute }.
function normalizeTimeLv(t) {
  if (!t) return "";
  if (typeof t === "string") {
    const s = String(t).trim();
    // HTML input[type="time"] tipiski dod "HH:MM".
    const m = /^(\d{1,2}):(\d{2})$/.exec(s);
    if (m) return `${pad2(m[1])}:${pad2(m[2])}`;
    return s;
  }
  if (typeof t === "object") {
    const hh = pad2(t.hour ?? t.h ?? t.stundas);
    const mm = pad2(t.minute ?? t.m ?? t.minūtes);
    if (hh && mm) return `${hh}:${mm}`;
  }
  return String(t);
}

function buildCitsPeriodLabelLv({ allDay, fromTime, toTime }) {
  if (allDay === true) return "Visa diena";
  const fromLv = normalizeTimeLv(fromTime);
  const toLv = normalizeTimeLv(toTime);
  if (fromLv && toLv) return `Laikā no ${fromLv} līdz ${toLv}`;
  if (fromLv && !toLv) return `Laikā no ${fromLv}`;
  if (!fromLv && toLv) return `Laikā līdz ${toLv}`;
  return "";
}

function buildCitsCommentWithPeriodLv({ allDay, fromTime, toTime, comment }) {
  const label = buildCitsPeriodLabelLv({ allDay, fromTime, toTime });
  const c = String(comment ?? "").trim();
  if (label && c) return `${label} · ${c}`;
  if (label) return label;
  return c || null;
}

// Globāls “helper” (ja kāda lapa grib lietot šīs funkcijas).
window.PDD_CITS_PERIOD_HELPERS = {
  buildCitsPeriodLabelLv,
  buildCitsCommentWithPeriodLv,
};
