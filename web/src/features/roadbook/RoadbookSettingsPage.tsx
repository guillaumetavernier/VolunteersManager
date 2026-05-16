import { useEffect, useMemo, useRef, useState } from "react";

import { putEvent } from "@/features/event/api";
import { useEvent } from "@/features/event/hooks";
import { useVolunteers } from "@/features/volunteer/hooks";
import { navigate } from "@/lib/router";

import {
  previewRoadbook,
  readRoadbookSettings,
  uploadLogo,
  uploadSponsor,
  writeRoadbookSettings,
} from "./api";
import {
  SECTION_LABELS,
  type RoadbookSettings,
  type SectionKind,
} from "./types";

export function RoadbookSettingsPage() {
  const ev = useEvent();
  const volunteers = useVolunteers("false");
  const initial = useMemo(() => readRoadbookSettings(ev.data?.settings), [ev.data?.settings]);
  const [settings, setSettings] = useState<RoadbookSettings>(initial);
  const [coordinatorName, setCoordinatorName] = useState<string>("");
  const [coordinatorPhone, setCoordinatorPhone] = useState<string>("");
  const [previewFilename, setPreviewFilename] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSettings(initial);
  }, [initial]);
  useEffect(() => {
    setCoordinatorName(ev.data?.coordinator_name ?? "");
    setCoordinatorPhone(ev.data?.coordinator_phone ?? "");
  }, [ev.data?.coordinator_name, ev.data?.coordinator_phone]);

  const firstVolunteerId = volunteers.data?.[0]?.id;

  useEffect(() => {
    if (!firstVolunteerId) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      try {
        const resp = await previewRoadbook(firstVolunteerId, settings);
        setPreviewFilename(resp.filename);
      } catch (e) {
        setError(String(e));
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [firstVolunteerId, settings]);

  if (ev.isLoading) return <main className="p-6">Chargement…</main>;
  if (!ev.data) return <main className="p-6">Aucun événement initialisé.</main>;

  async function save() {
    if (!ev.data) return;
    setBusy(true);
    setError(null);
    try {
      const newSettings = writeRoadbookSettings(ev.data.settings, settings);
      await putEvent({
        name: ev.data.name,
        start_date: ev.data.start_date,
        end_date: ev.data.end_date,
        timezone: ev.data.timezone,
        country_code: ev.data.country_code,
        settings: newSettings,
        coordinator_name: coordinatorName || null,
        coordinator_phone: coordinatorPhone || null,
      });
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  }

  function setVisible(k: SectionKind, v: boolean) {
    setSettings((s) => ({ ...s, section_visible: { ...s.section_visible, [k]: v } }));
  }

  function moveSection(k: SectionKind, dir: -1 | 1) {
    setSettings((s) => {
      const order = [...s.section_order];
      const i = order.indexOf(k);
      if (i < 0) return s;
      const j = i + dir;
      if (j < 0 || j >= order.length) return s;
      [order[i], order[j]] = [order[j], order[i]];
      return { ...s, section_order: order };
    });
  }

  async function onLogoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      await uploadLogo(f);
      await ev.refetch();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  async function onSponsorChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setBusy(true);
    try {
      await uploadSponsor(f);
      await ev.refetch();
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto grid max-w-6xl gap-6 p-6 lg:grid-cols-2" data-testid="roadbook-settings">
      <section className="space-y-4">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Roadbook — paramètres</h1>
          <nav className="flex gap-3 text-sm text-slate-600">
            <button onClick={() => navigate("/roadbooks")} className="underline">
              Génération
            </button>
            <button onClick={() => navigate("/")} className="underline">
              Carte
            </button>
          </nav>
        </header>

        <label className="block">
          <span className="text-sm font-medium">Couleur principale</span>
          <input
            type="color"
            data-testid="primary-color"
            value={settings.primary_color}
            onChange={(e) => setSettings({ ...settings, primary_color: e.target.value })}
            className="mt-1 h-10 w-20 border"
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Texte d'en-tête</span>
          <textarea
            className="input mt-1 w-full"
            rows={3}
            value={settings.header_text}
            onChange={(e) => setSettings({ ...settings, header_text: e.target.value })}
          />
        </label>

        <label className="block">
          <span className="text-sm font-medium">Texte de pied de page</span>
          <textarea
            className="input mt-1 w-full"
            rows={2}
            value={settings.footer_text}
            onChange={(e) => setSettings({ ...settings, footer_text: e.target.value })}
          />
        </label>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium">Nom du coordinateur</span>
            <input
              className="input mt-1 w-full"
              value={coordinatorName}
              onChange={(e) => setCoordinatorName(e.target.value)}
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium">Téléphone</span>
            <input
              className="input mt-1 w-full"
              value={coordinatorPhone}
              onChange={(e) => setCoordinatorPhone(e.target.value)}
              placeholder="+33…"
            />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm font-medium">Logo (PNG/JPEG, &lt; 5 Mo)</span>
            <input type="file" accept="image/png,image/jpeg" onChange={onLogoChange} className="mt-1" />
            {ev.data.logo_path && <p className="mt-1 text-xs text-slate-500">{ev.data.logo_path}</p>}
          </label>
          <label className="block">
            <span className="text-sm font-medium">Sponsor (PNG/JPEG, &lt; 5 Mo)</span>
            <input type="file" accept="image/png,image/jpeg" onChange={onSponsorChange} className="mt-1" />
            {ev.data.sponsor_path && <p className="mt-1 text-xs text-slate-500">{ev.data.sponsor_path}</p>}
          </label>
        </div>

        <fieldset className="rounded border p-3">
          <legend className="text-sm font-medium">Sections</legend>
          <ul className="divide-y">
            {settings.section_order.map((k) => (
              <li key={k} className="flex items-center justify-between gap-2 py-2" data-section-key={k}>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={settings.section_visible[k] ?? false}
                    onChange={(e) => setVisible(k, e.target.checked)}
                  />
                  <span>{SECTION_LABELS[k]}</span>
                </label>
                <span className="flex gap-1">
                  <button
                    type="button"
                    aria-label={`Monter ${k}`}
                    className="rounded border px-2 text-xs"
                    onClick={() => moveSection(k, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    aria-label={`Descendre ${k}`}
                    className="rounded border px-2 text-xs"
                    onClick={() => moveSection(k, 1)}
                  >
                    ↓
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </fieldset>

        <label className="flex items-center gap-2 text-sm" title="Mini-cartes désactivées en v1">
          <input type="checkbox" disabled checked={settings.mini_map} />
          <span className="text-slate-500">Mini-cartes (désactivées en v1)</span>
        </label>

        <div className="flex items-center gap-3">
          <button
            onClick={save}
            disabled={busy}
            className="rounded bg-slate-900 px-4 py-2 text-white"
            data-testid="save-settings"
          >
            Enregistrer
          </button>
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Aperçu</h2>
        {previewFilename ? (
          <iframe
            data-testid="preview-iframe"
            title="Aperçu du roadbook"
            src={`/api/roadbooks/files/${previewFilename}`}
            className="h-[80vh] w-full rounded border"
          />
        ) : (
          <p className="text-sm text-slate-500">Aucun bénévole pour l'aperçu. Ajoutez-en un.</p>
        )}
      </section>
    </main>
  );
}
