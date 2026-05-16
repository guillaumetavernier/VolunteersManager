import { useEffect, useMemo, useState } from "react";

import { putEvent } from "@/features/event/api";
import { useEvent } from "@/features/event/hooks";
import { toast } from "@/lib/toast";

interface BackupBlock {
  daily: boolean;
}

function readBackup(settings: string | undefined): BackupBlock {
  if (!settings) return { daily: false };
  try {
    const top = JSON.parse(settings) as Record<string, unknown>;
    const raw = top["backup"];
    if (raw && typeof raw === "object") {
      const b = raw as { daily?: boolean };
      return { daily: Boolean(b.daily) };
    }
  } catch {
    /* ignore */
  }
  return { daily: false };
}

function writeBackup(settings: string | undefined, block: BackupBlock): string {
  let top: Record<string, unknown> = {};
  if (settings) {
    try {
      top = JSON.parse(settings) as Record<string, unknown>;
    } catch {
      top = {};
    }
  }
  top["backup"] = { daily: block.daily };
  return JSON.stringify(top);
}

export function BackupSettingsPage() {
  const ev = useEvent();
  const initial = useMemo(() => readBackup(ev.data?.settings), [ev.data?.settings]);
  const [daily, setDaily] = useState(initial.daily);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDaily(initial.daily);
  }, [initial.daily]);

  if (ev.isLoading) return <main className="p-6">Chargement…</main>;
  if (!ev.data) return <main className="p-6">Aucun événement initialisé.</main>;

  async function save() {
    if (!ev.data) return;
    setBusy(true);
    try {
      const settings = writeBackup(ev.data.settings, { daily });
      await putEvent({
        name: ev.data.name,
        start_date: ev.data.start_date,
        end_date: ev.data.end_date,
        timezone: ev.data.timezone,
        country_code: ev.data.country_code,
        settings,
        coordinator_name: ev.data.coordinator_name ?? null,
        coordinator_phone: ev.data.coordinator_phone ?? null,
      });
      toast("Préférences enregistrées.", "info");
      await ev.refetch();
    } catch (err) {
      toast(`Erreur : ${String(err)}`, "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-3xl space-y-6 p-6" data-testid="backup-settings">
      <header>
        <h1 className="text-2xl font-semibold">Sauvegarde automatique</h1>
        <p className="mt-1 text-sm text-slate-600">
          Si activée, le serveur copie <code>event.db</code> vers{" "}
          <code>backups/event.db.AAAA-MM-JJ</code> au premier démarrage de chaque journée. Différent
          de <code>event.db.bak</code>, qui est créé avant chaque migration.
        </p>
      </header>

      <label className="flex items-center gap-2" data-testid="daily-backup-toggle">
        <input type="checkbox" checked={daily} onChange={(e) => setDaily(e.target.checked)} />
        <span>Sauvegarde quotidienne</span>
      </label>

      <button
        onClick={save}
        disabled={busy}
        className="rounded bg-slate-900 px-4 py-2 text-white"
        data-testid="save-backup"
      >
        Enregistrer
      </button>
    </main>
  );
}
