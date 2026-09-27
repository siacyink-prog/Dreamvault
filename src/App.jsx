import DreamJournal from "./components/DreamJournal.jsx";

export default function App() {
  return (
    <main className="app-shell">
      <div className="ambient ambient-one" aria-hidden="true" />
      <div className="ambient ambient-two" aria-hidden="true" />
      <header className="app-header">
        <p className="eyebrow">A PRIVATE WEATHER SYSTEM</p>
        <h1>Dream</h1>
        <p>Pages appear when there is something worth keeping.</p>
      </header>
      <DreamJournal />
    </main>
  );
}

