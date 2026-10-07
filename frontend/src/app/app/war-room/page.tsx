import { Suspense } from "react";
import { WarRoomView } from "@/components/views/WarRoomView";

export default function WarRoomPage() {
  return (
    <Suspense fallback={null}>
      <WarRoomView />
    </Suspense>
  );
}
