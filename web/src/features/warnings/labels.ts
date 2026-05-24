import type { WarningKind } from "./api";

export const KIND_LABEL: Record<WarningKind, string> = {
  double_booking: "Double affectation",
  role_mismatch: "Rôle non conforme",
  availability_violation: "Hors disponibilité",
  excessive_duty: "Service trop long",
  no_break: "Sans pause",
  understaffed: "Sous-staffé",
  overstaffed: "Sur-staffé",
  unassigned: "Sans mission",
  missing_phone_with_assignments: "Téléphone manquant",
  stranded: "Sans transport",
  insufficient_travel: "Temps de trajet insuffisant",
  capacity_exceeded: "Capacité dépassée",
  driver_double_book: "Conducteur occupé",
  passenger_double_book: "Passager occupé",
  board_without_alight: "Monte sans descendre",
  alight_before_board: "Descend avant de monter",
};
