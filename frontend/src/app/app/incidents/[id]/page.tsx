"use client";

import { useParams } from "next/navigation";
import { IncidentView } from "@/components/views/IncidentView";

export default function IncidentPage() {
  const params = useParams<{ id: string }>();
  return <IncidentView id={params.id} />;
}
