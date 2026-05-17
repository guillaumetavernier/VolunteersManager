export type SectionKind =
  | "header"
  | "day"
  | "footer"
  | "sponsor"
  | "emergency_contact"
  | "customizable_message"
  | "general_info"
  | "vs_reference";

export const ALL_SECTIONS: SectionKind[] = [
  "header",
  "day",
  "general_info",
  "customizable_message",
  "emergency_contact",
  "vs_reference",
  "sponsor",
  "footer",
];

export const SECTION_LABELS: Record<SectionKind, string> = {
  header: "En-tête",
  day: "Jours",
  general_info: "Informations générales",
  customizable_message: "Message personnalisé",
  emergency_contact: "Contact d'urgence",
  vs_reference: "Points PB",
  sponsor: "Sponsor",
  footer: "Pied de page",
};

export interface RoadbookSettings {
  primary_color: string;
  header_text: string;
  footer_text: string;
  section_order: SectionKind[];
  section_visible: Record<SectionKind, boolean>;
  mini_map: boolean;
}

export function defaultRoadbookSettings(): RoadbookSettings {
  const visible = {} as Record<SectionKind, boolean>;
  for (const s of ALL_SECTIONS) visible[s] = true;
  visible.sponsor = false;
  return {
    primary_color: "#2563eb",
    header_text: "",
    footer_text: "",
    section_order: [...ALL_SECTIONS],
    section_visible: visible,
    mini_map: false,
  };
}

export interface GenerateResponse {
  volunteer_pdfs: Array<{ volunteer_id: number; filename: string }>;
  master_pdf: string;
}

export interface PreviewResponse {
  filename: string;
}
