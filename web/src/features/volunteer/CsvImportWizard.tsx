import { useState } from "react";

import { Button } from "@/components/ui/button";
import { navigate } from "@/lib/router";
import {
  csvCommit,
  csvMapping,
  csvResolve,
  csvUpload,
  type Counts,
  type MappingResponse,
  type RowDecision,
  type UploadResponse,
} from "./csvApi";

type Step = "upload" | "map" | "preview" | "commit" | "done";

interface CsvImportWizardProps {
  onClose?: () => void;
}

export function CsvImportWizard({ onClose }: CsvImportWizardProps = {}) {
  const [step, setStep] = useState<Step>("upload");
  const [upload, setUpload] = useState<UploadResponse | null>(null);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [upsertKey, setUpsertKey] = useState<"name" | "email">("name");
  const [decisions, setDecisions] = useState<RowDecision[]>([]);
  const [counts, setCounts] = useState<Counts>({ new: 0, update: 0, ambiguous: 0, error: 0, skip: 0 });
  const [committed, setCommitted] = useState<{ inserted: number; updated: number; skipped: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onFile(f: File) {
    setError(null);
    setBusy(true);
    try {
      const r = await csvUpload(f);
      setUpload(r);
      const init: Record<string, string> = {};
      for (const [col, field] of Object.entries(r.auto_mapping)) init[String(col)] = field;
      setMapping(init);
      setStep("map");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function submitMapping() {
    if (!upload) return;
    setBusy(true);
    setError(null);
    try {
      const r: MappingResponse = await csvMapping(upload.session_id, mapping, upsertKey);
      setDecisions(r.decisions);
      setCounts(r.counts);
      setStep("preview");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function resolveRow(rowIdx: number, choice: string) {
    if (!upload) return;
    setBusy(true);
    try {
      const r = await csvResolve(upload.session_id, rowIdx, choice);
      setDecisions(r.decisions);
      setCounts(r.counts);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!upload) return;
    setBusy(true);
    setError(null);
    try {
      const r = await csvCommit(upload.session_id);
      setCommitted(r.result);
      setStep("done");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const handleCancel = () => {
    if (onClose) onClose();
    else navigate("/ressources/benevoles");
  };

  const body = (
    <>
      {!onClose && (
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Import CSV bénévoles</h1>
          <Button variant="link" size="sm" onClick={handleCancel}>
            Annuler
          </Button>
        </header>
      )}
      {onClose && (
        <div className="flex justify-end">
          <Button variant="link" size="sm" onClick={handleCancel}>
            Annuler
          </Button>
        </div>
      )}
      {error && <p role="alert" className="mb-3 text-sm text-red-600">{error}</p>}

      {step === "upload" && (
        <section className="grid gap-3 rounded-md border border-slate-200 p-4">
          <p className="text-sm text-slate-700">
            Sélectionne un fichier <code>.csv</code> exporté depuis Google Sheets (UTF-8, point-virgule ou virgule).
          </p>
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="Fichier CSV"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
            }}
          />
          <a className="text-sm text-slate-700 underline" href="/api/volunteers/template.csv">
            Télécharger un modèle vide
          </a>
        </section>
      )}

      {step === "map" && upload && (
        <section className="grid gap-3 rounded-md border border-slate-200 p-4">
          <p className="text-sm text-slate-700">
            Associe les colonnes du CSV aux champs internes ({upload.row_count} lignes détectées).
          </p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="py-2 text-left">Colonne CSV</th>
                <th className="py-2 text-left">Aperçu</th>
                <th className="py-2 text-left">Champ</th>
              </tr>
            </thead>
            <tbody>
              {upload.headers.map((h, i) => (
                <tr key={i} className="border-b border-slate-100">
                  <td className="py-2 font-medium">{h}</td>
                  <td className="py-2 text-slate-500">
                    {(upload.preview[0]?.[i] ?? "—").slice(0, 40)}
                  </td>
                  <td className="py-2">
                    <select
                      className="input w-full"
                      value={mapping[String(i)] ?? ""}
                      onChange={(e) =>
                        setMapping((m) => ({ ...m, [String(i)]: e.target.value }))
                      }
                      aria-label={`Champ pour colonne ${h}`}
                    >
                      <option value="">— (ignorer)</option>
                      {upload.field_keys.map((k) => (
                        <option key={k} value={k}>
                          {upload.header_hints[k] ?? k}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="flex items-center gap-3">
            <label className="text-sm">
              Clé de rapprochement&nbsp;
              <select
                className="input w-full"
                value={upsertKey}
                onChange={(e) => setUpsertKey(e.target.value as "name" | "email")}
              >
                <option value="name">Nom + Prénom</option>
                <option value="email">Email</option>
              </select>
            </label>
            <Button size="sm" onClick={submitMapping} disabled={busy}>
              Calculer l'aperçu
            </Button>
          </div>
        </section>
      )}

      {step === "preview" && (
        <section className="grid gap-4">
          <div className="grid grid-cols-5 gap-2 rounded-md border border-slate-200 p-4 text-center text-sm">
            <Stat label="Nouveaux" value={counts.new} />
            <Stat label="Mises à jour" value={counts.update} />
            <Stat label="Ambigus" value={counts.ambiguous} />
            <Stat label="Erreurs" value={counts.error} />
            <Stat label="Ignorés" value={counts.skip} />
          </div>
          <ul className="grid gap-2">
            {decisions.map((d) => (
              <li
                key={d.row.index}
                className="rounded-md border border-slate-200 p-3 text-sm"
                data-row={d.row.index}
                data-class={d.class}
              >
                <div className="flex items-center justify-between">
                  <span>
                    #{d.row.index + 1} — {(d.row.input as { first_name?: string }).first_name}{" "}
                    {(d.row.input as { last_name?: string }).last_name}
                  </span>
                  <span className="text-xs uppercase text-slate-500">{d.class}</span>
                </div>
                {d.class === "error" && (
                  <p className="text-xs text-red-600">{d.row.errors?.join(", ")}</p>
                )}
                {d.class === "ambiguous" && (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                    <span>Choix&nbsp;:</span>
                    {d.candidates?.map((cid) => (
                      <Button
                        key={cid}
                        variant="secondary"
                        size="sm"
                        onClick={() => resolveRow(d.row.index, `update:${cid}`)}
                        data-resolve-update={cid}
                      >
                        Mettre à jour #{cid}
                      </Button>
                    ))}
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => resolveRow(d.row.index, "new")}
                      data-resolve="new"
                    >
                      Créer nouveau
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => resolveRow(d.row.index, "skip")}
                      data-resolve="skip"
                    >
                      Ignorer
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              onClick={commit}
              disabled={busy || counts.ambiguous > 0}
              data-action="commit"
            >
              Confirmer et importer
            </Button>
            <Button variant="link" size="sm" onClick={() => setStep("map")}>
              Modifier le mapping
            </Button>
          </div>
        </section>
      )}

      {step === "done" && committed && (
        <section className="grid gap-2 rounded-md border border-green-200 bg-green-50 p-4 text-sm">
          <p>Import terminé&nbsp;: {committed.inserted} créés, {committed.updated} mis à jour, {committed.skipped} ignorés.</p>
          <div>
            {onClose ? (
              <Button variant="link" size="sm" onClick={onClose}>
                Fermer
              </Button>
            ) : (
              <Button variant="link" size="sm" onClick={() => navigate("/ressources/benevoles")}>
                Retour aux bénévoles
              </Button>
            )}
          </div>
        </section>
      )}
    </>
  );

  if (onClose) {
    return <div className="grid gap-4">{body}</div>;
  }
  return <main className="mx-auto max-w-4xl p-6">{body}</main>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="text-2xl font-semibold" data-stat={label}>{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}
