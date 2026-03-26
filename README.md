# ♠ All In Poker Tracker

React-Projekt mit Supabase-Backend und GitHub Pages Hosting.

---

## 📁 Projektstruktur

```
src/
├── lib/
│   ├── supabase.js       — Datenbankverbindung
│   ├── helpers.js        — Hilfsfunktionen (formatEuro etc.)
│   ├── achievements.js   — Alle 23 Achievements
│   └── settlement.js     — Schuldenausgleich-Algorithmus
├── components/
│   ├── Toast.jsx         — Toast-Benachrichtigungen
│   ├── TabBar.jsx        — Navigation unten
│   ├── PasswordGate.jsx  — Passwortschutz
│   └── ConfirmDialog.jsx — Bestätigungs-Dialog
├── pages/
│   ├── Eintrag.jsx       — Neue Session eintragen
│   ├── Sessions.jsx      — Sessions-Übersicht + Schuldenausgleich
│   ├── Rangliste.jsx     — Rangliste + Head-to-Head
│   ├── Grafik.jsx        — Charts (Profit, Winrate, Rebuys)
│   ├── Awards.jsx        — Achievement-System
│   └── Turnier.jsx       — Turnier Hub + Blind Clock
└── App.jsx               — Hauptkomponente
```

---

## 🚀 Einrichtung (Schritt für Schritt)

### 1. Repository auf GitHub erstellen
- Gehe zu github.com → "New repository"
- Name: `poker-tracker`
- Public oder Private (beide funktionieren)
- Ohne README erstellen

### 2. Projekt hochladen
Öffne Terminal (Mac: `Cmd+Space` → Terminal):
```bash
cd Downloads/poker-tracker
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/DEIN-USERNAME/poker-tracker.git
git push -u origin main
```

### 3. GitHub Secrets setzen
Gehe zu: GitHub Repo → Settings → Secrets and variables → Actions → New repository secret

Füge diese 3 Secrets hinzu:
- `VITE_SUPABASE_URL` → deine Supabase URL
- `VITE_SUPABASE_KEY` → dein Supabase Anon Key
- `VITE_APP_PASSWORD` → dein gewünschtes Gruppenpasswort (z.B. `poker2024`)

### 4. GitHub Pages aktivieren
GitHub Repo → Settings → Pages → Source: **GitHub Actions**

### 5. Deployment starten
Nach dem ersten Push startet das Deployment automatisch.
URL: `https://DEIN-USERNAME.github.io/poker-tracker`

---

## 🔒 Sicherheit

- **Passwortschutz**: Alle Besucher müssen das Gruppenpasswort eingeben
- **Supabase RLS**: In Supabase → Authentication → Policies kannst du zusätzlich Row Level Security aktivieren
- **Secrets**: API-Keys sind nie im Code, nur in GitHub Secrets

---

## 🛠 Lokale Entwicklung

```bash
# .env.local erstellen (von .env.example kopieren)
cp .env.example .env.local
# Dann .env.local mit deinen echten Werten befüllen

npm install
npm run dev
```

---

## ➕ Neue Seite hinzufügen

1. Datei in `src/pages/MeineSeite.jsx` erstellen
2. In `src/components/TabBar.jsx` Tab hinzufügen
3. In `src/App.jsx` importieren und in `pages`-Objekt eintragen

---

## 🗄 Supabase Tabellen

```sql
-- poker_sessions
create table poker_sessions (
  id uuid default gen_random_uuid() primary key,
  date date not null,
  player_name text not null,
  buy_in numeric not null,
  cash_out numeric not null,
  rebuys numeric default 0,
  rebuy_count integer default 0,
  created_at timestamptz default now()
);

-- poker_tournaments
create table poker_tournaments (
  id uuid default gen_random_uuid() primary key,
  name text,
  date date,
  buyin numeric,
  players jsonb,
  results jsonb,
  payouts jsonb,
  created_at timestamptz default now()
);
```
