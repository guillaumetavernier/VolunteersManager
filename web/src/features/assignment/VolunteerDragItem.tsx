import { useDraggable } from "@dnd-kit/core";
import type { Volunteer } from "@/features/volunteer/api";

interface Props {
  volunteer: Volunteer;
}

export function VolunteerDragItem({ volunteer }: Props) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `volunteer-${volunteer.id}`,
    data: { volunteerID: volunteer.id },
  });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  return (
    <button
      ref={setNodeRef}
      style={style}
      data-volunteer-id={volunteer.id}
      data-draggable-volunteer
      {...attributes}
      {...listeners}
      className={`flex w-full items-center justify-between rounded-md border border-slate-200 bg-white px-2 py-1 text-left text-xs ${
        isDragging ? "opacity-50" : ""
      }`}
    >
      <span className="font-medium">
        {volunteer.first_name} {volunteer.last_name}
      </span>
      <span className="text-[10px] text-slate-500">
        {volunteer.role_types.slice(0, 2).join(" · ")}
      </span>
    </button>
  );
}
