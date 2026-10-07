"use client";

import { useParams } from "next/navigation";
import { ProtocolDetailView } from "@/components/views/ProtocolDetailView";

export default function ProtocolPage() {
  const params = useParams<{ id: string }>();
  return <ProtocolDetailView id={params.id} />;
}
