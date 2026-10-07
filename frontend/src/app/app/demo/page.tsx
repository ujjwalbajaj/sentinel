import { notFound } from "next/navigation";
import { DemoConsole } from "@/components/views/DemoConsole";

export default function DemoPage() {
  if (process.env.NEXT_PUBLIC_DEMO !== "true") notFound();
  return <DemoConsole />;
}
