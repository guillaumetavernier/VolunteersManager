import { useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { navigate } from "@/lib/router";
import { useArchiveVolunteer, useVolunteers } from "./hooks";
import { VolunteerForm } from "./VolunteerForm";
import type { ArchivedFilter, Volunteer } from "./api";

interface VolunteerListProps {
  onSelect?: (id: number) => void;
}

export function VolunteerList({ onSelect }: VolunteerListProps = {}) {
  const [showArchived, setShowArchived] = useState(false);
  const filter: ArchivedFilter = showArchived ? "all" : "false";
  const query = useVolunteers(filter);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [creating, setCreating] = useState(false);
  const archive = useArchiveVolunteer();

  const filtered = useMemo(() => {
    const lo = search.toLowerCase();
    const role = roleFilter.toLowerCase();
    return (query.data ?? []).filter((v) => {
      const matchesSearch =
        !lo ||
        v.first_name.toLowerCase().includes(lo) ||
        v.last_name.toLowerCase().includes(lo) ||
        (v.email ?? "").toLowerCase().includes(lo);
      const matchesRole = !role || v.role_types.some((r) => r.toLowerCase().includes(role));
      return matchesSearch && matchesRole;
    });
  }, [query.data, search, roleFilter]);

  return (
    <main className="mx-auto max-w-5xl p-6">
      <header className="mb-6 flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Bénévoles</h1>
        <nav className="flex items-center gap-1">
          <Button variant="link" size="sm" onClick={() => navigate("/volunteers/import")}>
            Importer un CSV
          </Button>
          <Button variant="link" size="sm" asChild>
            <a href="/api/volunteers/template.csv">Modèle</a>
          </Button>
          <Button variant="link" size="sm" asChild>
            <a href="/api/volunteers/export.csv">Exporter</a>
          </Button>
        </nav>
      </header>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Input
          className="flex-1"
          placeholder="Rechercher (nom, prénom, email)"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Rechercher"
        />
        <Input
          className="w-48"
          placeholder="Filtrer par rôle"
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value)}
          aria-label="Filtrer par rôle"
        />
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={showArchived}
            onChange={(e) => setShowArchived(e.target.checked)}
          />
          Afficher les archivés
        </label>
        <Button size="sm" onClick={() => setCreating(true)}>
          Nouveau bénévole
        </Button>
      </div>
      {creating && (
        <section className="mb-6 rounded-md border border-slate-200 p-4">
          <h2 className="mb-3 text-lg font-semibold">Nouveau bénévole</h2>
          <VolunteerForm onCancel={() => setCreating(false)} onSaved={() => setCreating(false)} />
        </section>
      )}
      {query.isLoading && <p>Chargement…</p>}
      {!query.isLoading && filtered.length === 0 && (
        <p className="text-sm text-slate-600">Aucun bénévole pour le moment.</p>
      )}
      <ul className="divide-y divide-slate-200" data-testid="volunteer-list">
        {filtered.map((v) => (
          <Row
            key={v.id}
            v={v}
            onArchive={() => archive.mutate(v.id)}
            onSelect={onSelect}
          />
        ))}
      </ul>
    </main>
  );
}

function Row({
  v,
  onArchive,
  onSelect,
}: {
  v: Volunteer;
  onArchive: () => void;
  onSelect?: (id: number) => void;
}) {
  const open = () => {
    if (onSelect) onSelect(v.id);
    else navigate(`/volunteers/${v.id}`);
  };
  return (
    <li className="flex items-center justify-between gap-3 py-3" data-volunteer-id={v.id}>
      <button onClick={open} className="flex flex-col items-start text-left">
        <span className="font-medium">
          {v.first_name} {v.last_name}{v.archived ? " (archivé)" : ""}
        </span>
        <span className="text-xs text-slate-500">
          {v.phone}
          {v.email ? ` · ${v.email}` : ""}
          {v.role_types.length > 0 ? ` · ${v.role_types.join(", ")}` : ""}
          {v.can_drive ? " · permis" : ""}
        </span>
      </button>
      {!v.archived && (
        <Button variant="link" size="sm" onClick={onArchive} className="text-destructive">
          Archiver
        </Button>
      )}
    </li>
  );
}
